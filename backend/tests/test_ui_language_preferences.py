"""Account isolation, persistence, and validation for personal UI language."""

import sqlite3

import pytest
from httpx import ASGITransport, AsyncClient

from asclepius.auth.preferences import get_ui_language, save_ui_language
from asclepius.db.connection import open_db
from asclepius.db.init import initialize_database

PREFERENCES_URL = "/api/auth/me/preferences"


async def test_unset_preference_preserves_existing_me_fields(client):
    patient = (await client.post("/api/patients", json={"display_name": "Test Patient"})).json()
    response = await client.get("/api/auth/me")
    assert response.status_code == 200
    me = response.json()
    assert me["ui_language"] is None
    assert me["username"] == "admin"
    assert me["display_name"] == "Administrator"
    assert me["role"] == "admin"
    assert me["patients"] == [
        {
            "id": patient["id"],
            "slug": patient["slug"],
            "display_name": "Test Patient",
            "role": "owner",
        }
    ]
    assert not any(key.startswith("_") for key in me)


@pytest.mark.parametrize("role", ["viewer", "editor", "admin"])
async def test_every_role_can_save_and_replace_own_preference(client, make_user_client, role):
    actor, uid = await make_user_client(f"language-{role}", role=role)
    assert (await actor.get("/api/auth/me")).json()["ui_language"] is None
    for language in ("de", "en", "auto"):
        response = await actor.patch(PREFERENCES_URL, json={"ui_language": language})
        assert response.status_code == 200
        assert response.json() == {"ui_language": language}
        me = (await actor.get("/api/auth/me")).json()
        assert me["id"] == uid
        assert me["ui_language"] == language
    # Auto must remain explicit; the unrelated admin account stays unset.
    assert (await client.get("/api/auth/me")).json()["ui_language"] is None


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"ui_language": None},
        {"ui_language": "fr"},
        {"ui_language": "DE"},
        {"ui_language": "de-DE"},
        {"ui_language": 1},
        {"ui_language": ["de"]},
        {"ui_language": "en", "unexpected": True},
    ],
)
async def test_invalid_payload_is_rejected_without_changing_preference(client, body):
    assert (await client.patch(PREFERENCES_URL, json={"ui_language": "de"})).status_code == 200
    assert (await client.patch(PREFERENCES_URL, json=body)).status_code == 422
    assert (await client.get("/api/auth/me")).json()["ui_language"] == "de"


async def test_user_id_cannot_be_supplied_to_change_another_account(client, make_user_client):
    alice, alice_id = await make_user_client("alice", role="viewer")
    bob, bob_id = await make_user_client("bob", role="editor")
    await alice.patch(PREFERENCES_URL, json={"ui_language": "de"})
    response = await bob.patch(PREFERENCES_URL, json={"ui_language": "en", "user_id": alice_id})
    assert response.status_code == 422
    assert (await alice.get("/api/auth/me")).json()["ui_language"] == "de"
    assert (await bob.get("/api/auth/me")).json()["ui_language"] is None
    assert (await bob.patch(PREFERENCES_URL, json={"ui_language": "en"})).status_code == 200
    assert (await bob.get("/api/auth/me")).json()["id"] == bob_id
    assert (await alice.get("/api/auth/me")).json()["ui_language"] == "de"


async def test_anonymous_cannot_read_or_write_preferences(unauthed_client):
    assert (await unauthed_client.get("/api/auth/me")).status_code == 401
    assert (
        await unauthed_client.patch(PREFERENCES_URL, json={"ui_language": "de"})
    ).status_code == 401


async def test_preferences_require_csrf_header(client):
    del client.headers["X-Requested-With"]
    assert (await client.patch(PREFERENCES_URL, json={"ui_language": "de"})).status_code == 403
    assert (await client.get("/api/auth/me")).json()["ui_language"] is None


async def test_preference_survives_reinitialization_and_a_new_session(client, app, db_path):
    await client.patch(PREFERENCES_URL, json={"ui_language": "de"})
    await client.post("/api/auth/logout")
    await initialize_database(db_path)
    await initialize_database(db_path)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Requested-With": "XMLHttpRequest"},
    ) as fresh:
        assert (
            await fresh.post(
                "/api/auth/login",
                json={
                    "username": "admin",
                    "password": "admin-password",
                },
            )
        ).status_code == 200
        assert (await fresh.get("/api/auth/me")).json()["ui_language"] == "de"


async def test_existing_database_gains_table_without_backfilling_accounts(db_path):
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        await db.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (1, 'legacy', 'hash')"
        )
        await db.execute("DROP TABLE user_ui_preferences")
        await db.commit()
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        assert await get_ui_language(db, 1) is None
        assert (await (await db.execute("SELECT username FROM users WHERE id = 1")).fetchone())[
            0
        ] == "legacy"
        await save_ui_language(db, 1, "auto")
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        assert await get_ui_language(db, 1) == "auto"
        row = await (
            await db.execute("SELECT updated_at FROM user_ui_preferences WHERE user_id = 1")
        ).fetchone()
        assert row[0]


async def test_database_enforces_values_foreign_keys_and_delete_cascade(db_path):
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        with pytest.raises(sqlite3.IntegrityError):
            await save_ui_language(db, 999, "de")
        await db.rollback()
        await db.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (1, 'test', 'hash')"
        )
        await db.commit()
        with pytest.raises(sqlite3.IntegrityError):
            await db.execute(
                "INSERT INTO user_ui_preferences (user_id, ui_language) VALUES (1, 'fr')"
            )
        await db.rollback()
        await save_ui_language(db, 1, "de")
        await db.execute("DELETE FROM users WHERE id = 1")
        await db.commit()
        assert await get_ui_language(db, 1) is None


def test_preference_endpoint_is_core_only(monkeypatch):
    from asclepius.main import create_app

    monkeypatch.setenv("ASCLEPIUS_MODE", "core")
    core = create_app().openapi()
    assert "patch" in core["paths"][PREFERENCES_URL]
    # /me publishes the nullable enum for generated clients too.
    assert "ui_language" in core["components"]["schemas"]["CurrentUserResponse"]["properties"]
    monkeypatch.setenv("ASCLEPIUS_MODE", "share")
    share = create_app().openapi()
    assert PREFERENCES_URL not in share["paths"]
    assert "/api/auth/me" not in share["paths"]
