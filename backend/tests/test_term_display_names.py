"""Preferred names survive upgrades, edits, merges and scoped API reads."""

import json
from pathlib import Path

import pytest

from asclepius.db.connection import open_db
from asclepius.db.init import initialize_database
from asclepius.normalization.display_names import TERM_TABLES


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "term_type,code,german",
    [
        ("lab_tests", "aptt", "Aktivierte partielle Thromboplastinzeit"),
        ("specialties", "cardiology", "Kardiologie"),
        ("diagnoses", "essential-hypertension", "Essentielle Hypertonie"),
        ("medications", "aspirin", "Acetylsalicylsäure"),
    ],
)
async def test_names_round_trip_and_search(client, term_type, code, german):
    items = (await client.get(f"/api/normalization/{term_type}")).json()
    item = next(x for x in items if x["canonical_code"] == code)
    assert item["display_names"] == {"en": item["canonical_display"], "de": german}
    endpoint = f"/api/normalization/{term_type}/{item['id']}"
    before = (await client.get(endpoint)).json()
    edited = await client.patch(endpoint, json={"display_names": {"de": "  Eigener Begriff  "}})
    assert edited.status_code == 200
    after = edited.json()
    assert after["display_names"]["de"] == "Eigener Begriff"
    assert after["display_names"]["en"] == item["canonical_display"]
    assert after["canonical_code"] == before["canonical_code"]
    assert after["canonical_display"] == before["canonical_display"]
    assert after["aliases"] == before["aliases"]
    matches = (
        await client.get(f"/api/normalization/{term_type}", params={"search": "Eigener Begriff"})
    ).json()
    assert [x["id"] for x in matches] == [item["id"]]
    cleared = (await client.patch(endpoint, json={"display_names": {"de": None}})).json()
    assert "de" not in cleared["display_names"]
    assert cleared["canonical_display"] == item["canonical_display"]


@pytest.mark.asyncio
async def test_existing_database_backfill_is_once_and_keeps_user_edits(db_path):
    # Recreate the state immediately before this upgrade: populated canonical
    # tables, no preferred names, and a legacy underscore spelling of a code.
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        for _, labels, _ in TERM_TABLES.values():
            await db.execute(f"DELETE FROM {labels}")
        await db.execute(
            "DELETE FROM schema_migrations WHERE key = 'preferred_term_display_names_v1'"
        )
        await db.execute(
            "UPDATE norm_lab_tests SET canonical_code = 'glucose_fasting' WHERE canonical_code = 'glucose-fasting'"
        )
        await db.execute(
            "UPDATE norm_lab_tests SET canonical_display = 'My canonical name' WHERE canonical_code = 'hemoglobin'"
        )
        await db.execute(
            "INSERT INTO norm_lab_test_labels SELECT id, 'en', 'My preferred name' "
            "FROM norm_lab_tests WHERE canonical_code = 'hemoglobin'"
        )
        await db.commit()
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        rows = await (
            await db.execute(
                "SELECT n.canonical_code, n.canonical_display, l.label FROM norm_lab_tests n JOIN norm_lab_test_labels l ON l.norm_lab_test_id = n.id WHERE l.language = 'de'"
            )
        ).fetchall()
        names = {r[0]: (r[1], r[2]) for r in rows}
        assert names["glucose_fasting"][1] == "Nüchternglukose"
        assert names["hemoglobin"] == ("My canonical name", "Hämoglobin")
        preferred = await (
            await db.execute(
                "SELECT label FROM norm_lab_test_labels l JOIN norm_lab_tests n ON n.id = l.norm_lab_test_id "
                "WHERE n.canonical_code = 'hemoglobin' AND l.language = 'en'"
            )
        ).fetchone()
        assert preferred[0] == "My preferred name"
        await db.execute(
            "UPDATE norm_lab_test_labels SET label = 'Mein Hämoglobin' WHERE language = 'de'"
        )
        await db.execute("DELETE FROM norm_lab_test_labels WHERE language = 'en'")
        await db.commit()
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        assert (
            await (
                await db.execute("SELECT COUNT(*) FROM norm_lab_test_labels WHERE language = 'en'")
            ).fetchone()
        )[0] == 0

        assert (
            await (
                await db.execute(
                    "SELECT COUNT(*) FROM norm_lab_test_labels WHERE label <> 'Mein Hämoglobin'"
                )
            ).fetchone()
        )[0] == 0


@pytest.mark.asyncio
async def test_custom_seed_can_override_one_language_without_losing_bundled_names(
    db_path, tmp_path, monkeypatch
):
    from asclepius.db import init

    await initialize_database(db_path)
    async with open_db(db_path) as db:
        await db.execute("DELETE FROM norm_medication_labels")
        await db.execute(
            "DELETE FROM schema_migrations WHERE key = 'preferred_term_display_names_v1'"
        )
        await db.commit()
    seeds = tmp_path / "custom-seeds"
    seeds.mkdir()
    (seeds / "medications.json").write_text(
        json.dumps([{"canonical_code": "aspirin", "display_names": {"de": "Mein ASS"}}]),
        encoding="utf-8",
    )
    monkeypatch.setattr(init, "SEEDS_DIR", seeds)
    await initialize_database(db_path)
    async with open_db(db_path) as db:
        rows = await (
            await db.execute(
                "SELECT language, label FROM norm_medication_labels l JOIN norm_medications n "
                "ON n.id = l.norm_medication_id WHERE n.canonical_code = 'aspirin'"
            )
        ).fetchall()
    assert dict(rows) == {"de": "Mein ASS", "en": "Acetylsalicylic Acid"}


@pytest.mark.asyncio
async def test_merge_keeps_target_names_and_preserves_source_search(client, db_path):
    async with open_db(db_path) as db:
        ids = []
        for code in ("source-term", "target-term"):
            cursor = await db.execute(
                "INSERT INTO norm_lab_tests (canonical_code, canonical_display) VALUES (?, ?)",
                (code, code),
            )
            ids.append(cursor.lastrowid)
        source, target = ids
        await db.executemany(
            "INSERT INTO norm_lab_test_labels VALUES (?, ?, ?)",
            [
                (source, "de", "Quellname"),
                (source, "en", "Source name"),
                (target, "de", "Zielname"),
            ],
        )
        await db.commit()
    response = await client.post(
        "/api/normalization/lab_tests/merge-batch",
        json={"source_ids": [source], "target_id": target},
    )
    assert response.status_code == 200
    item = (await client.get(f"/api/normalization/lab_tests/{target}")).json()
    assert item["display_names"] == {"de": "Zielname", "en": "Source name"}
    found = (
        await client.get("/api/normalization/lab_tests", params={"search": "Quellname"})
    ).json()
    assert [x["id"] for x in found] == [target]
    async with open_db(db_path) as db:
        assert (
            await (
                await db.execute(
                    "SELECT COUNT(*) FROM norm_lab_test_labels WHERE norm_lab_test_id = ?",
                    (source,),
                )
            ).fetchone()
        )[0] == 0
    assert (await client.delete(f"/api/normalization/lab_tests/{target}")).status_code == 200
    async with open_db(db_path) as db:
        assert (
            await (
                await db.execute(
                    "SELECT COUNT(*) FROM norm_lab_test_labels WHERE norm_lab_test_id = ?",
                    (target,),
                )
            ).fetchone()
        )[0] == 0


@pytest.mark.asyncio
async def test_label_validation_and_permissions(client, unauthed_client, make_user_client):
    items = (await client.get("/api/normalization/lab_tests")).json()
    endpoint = f"/api/normalization/lab_tests/{items[0]['id']}"
    for labels in ({"fr": "Test"}, {"de": "x" * 251}):
        assert (await client.patch(endpoint, json={"display_names": labels})).status_code == 422
    assert (
        await unauthed_client.patch(endpoint, json={"display_names": {"de": "Test"}})
    ).status_code in (401, 403)
    viewer, _ = await make_user_client("term-viewer", role="viewer")
    assert (await viewer.patch(endpoint, json={"display_names": {"de": "Test"}})).status_code == 403
    assert (
        await client.patch(
            "/api/normalization/lab_tests/999999", json={"display_names": {"de": "Test"}}
        )
    ).status_code == 404
    assert (
        await client.patch("/api/normalization/doctors/1", json={"display_names": {"de": "Arzt"}})
    ).status_code == 422


@pytest.mark.asyncio
async def test_lab_and_document_responses_include_names_without_changing_values(client, db_path):
    from tests.test_lab_results import _create_patient_with_labs

    patient = await _create_patient_with_labs(db_path)
    async with open_db(db_path) as db:
        await db.execute(
            "UPDATE lab_results SET norm_lab_test_id = (SELECT id FROM norm_lab_tests WHERE canonical_code = 'hemoglobin'), value_text = '14.50' WHERE test_name_original = 'Hemoglobin'"
        )
        doc_id = (
            await (await db.execute("SELECT document_id FROM lab_results LIMIT 1")).fetchone()
        )[0]
        await db.execute(
            "UPDATE documents SET norm_specialty_id = (SELECT id FROM norm_specialties WHERE canonical_code = 'cardiology') WHERE id = ?",
            (doc_id,),
        )
        await db.commit()
    response = await client.get(
        "/api/lab-results", params={"patient_id": patient, "test_name": "HÄMOGLOBIN"}
    )
    assert response.status_code == 200
    rows = response.json()["items"]
    assert len(rows) == 3
    assert all(row["test_display_names"]["de"] == "Hämoglobin" for row in rows)
    assert all(
        row["test_name_original"] == "Hemoglobin" and row["value_text"] == "14.50" for row in rows
    )
    timeline = await client.get(
        "/api/lab-results/timeline", params={"patient_id": patient, "test_name": "HÄMOGLOBIN"}
    )
    assert len(timeline.json()["data"]) == 3
    document = (await client.get(f"/api/documents/{doc_id}")).json()
    assert document["specialty_display_names"]["de"] == "Kardiologie"
    assert document["lab_results"][0]["test_display_names"]["en"] == "Hemoglobin"


def test_shared_names_are_scoped_to_authorized_documents(share_app):
    import sqlite3

    from fastapi.testclient import TestClient
    from tests.test_share_e2e import _seed

    app, vault, db_path = share_app
    with TestClient(app) as client:
        seed = _seed(db_path, vault)
        with sqlite3.connect(db_path) as db:
            specialty = db.execute(
                "SELECT id FROM norm_specialties WHERE canonical_code = 'cardiology'"
            ).fetchone()[0]
            lab = db.execute(
                "SELECT id FROM norm_lab_tests WHERE canonical_code = 'hemoglobin'"
            ).fetchone()[0]
            db.execute(
                "UPDATE documents SET norm_specialty_id = ? WHERE id = ?",
                (specialty, seed["doc_id"]),
            )
            db.execute(
                "INSERT INTO lab_results (document_id, patient_id, test_name_original, norm_lab_test_id, value_text) VALUES (?, ?, 'Hb original', ?, '<0.1')",
                (seed["doc_id"], seed["patient_id"], lab),
            )
            private = db.execute(
                "INSERT INTO documents (patient_id, original_filename, file_path, status) VALUES (?, 'private.pdf', 'private.pdf', 'done')",
                (seed["patient_id"],),
            ).lastrowid
        headers = {"X-Requested-With": "XMLHttpRequest"}
        cookies = {"asclepius_session": seed["admin_cookie"]}
        response = client.post(
            "/api/shares",
            json={
                "patient_id": seed["patient_id"],
                "document_ids": [seed["doc_id"]],
                "recipient_label": "Dr. Test",
                "recipient_contact": "phone",
                "expires_in_days": 7,
            },
            headers=headers,
            cookies=cookies,
        )
        assert response.status_code == 200, response.text
        share = response.json()
        token = share["share_url"].rsplit("/", 1)[-1]
        assert client.post(f"/api/share/{token}/request-otp", headers=headers).status_code == 204
        code = client.get(
            f"/api/shares/{share['share_id']}/audit",
            params={"include_active_otp": True},
            cookies=cookies,
        ).json()["active_otp"]["code"]
        assert (
            client.post(
                f"/api/share/{token}/verify-otp", json={"code": code}, headers=headers
            ).status_code
            == 200
        )
        docs = client.get("/api/share/me").json()["documents"]
        assert len(docs) == 1
        assert docs[0]["specialty_display_names"] == {"en": "Cardiology", "de": "Kardiologie"}
        detail = client.get(f"/api/share/documents/{seed['doc_id']}").json()
        assert detail["specialty_display_names"] == docs[0]["specialty_display_names"]
        assert "norm_specialty_id" not in detail
        assert "file_path" not in detail
        assert detail["lab_results"][0]["test_display_names"]["de"] == "Hämoglobin"
        assert detail["lab_results"][0]["test_name_original"] == "Hb original"
        assert detail["lab_results"][0]["value_text"] == "<0.1"
        assert client.get(f"/api/share/documents/{private}").status_code == 410
        assert client.get("/api/normalization/lab_tests").status_code == 401


def test_all_seed_entries_have_explicit_bilingual_names():
    directory = Path(__file__).resolve().parents[2] / "config" / "seeds"
    for term_type in TERM_TABLES:
        for entry in json.loads((directory / f"{term_type}.json").read_text(encoding="utf-8")):
            assert set(entry["display_names"]) == {"en", "de"}
            assert all(0 < len(name) <= 250 for name in entry["display_names"].values())
