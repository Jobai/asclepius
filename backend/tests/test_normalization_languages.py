"""Regression tests with independently invented examples, not clinical cases."""

import json
import os
from pathlib import Path
import pytest
import yaml
from asclepius.config import get_config, load_config
from asclepius.normalization.alias_lookup import find_matching_alias
from asclepius.normalization.auto_merge import _fetch_entries
from asclepius.normalization.display_names import TERM_TABLES
from asclepius.normalization.knowledge_base import get_knowledge_base
from asclepius.normalization.resolver import AliasCache, resolve_diagnosis
from asclepius.pipeline.extractor_db import _resolve_diagnosis


def set_policy(monkeypatch, languages, include_unlabeled=True):
    config = get_config().normalization
    monkeypatch.setattr(config, "matching_languages", languages)
    monkeypatch.setattr(config, "include_unlabeled_aliases", include_unlabeled)


@pytest.mark.asyncio
async def test_unrelated_synthetic_term_does_not_use_disabled_language(db, monkeypatch):
    set_policy(monkeypatch, ["de", "en"])
    phrase = "Langer synthetischer Platzhalter links"
    before = await (
        await db.execute("SELECT COUNT(*) FROM norm_diagnosis_aliases WHERE language = 'fr'")
    ).fetchone()
    norm_id = await resolve_diagnosis(db, AliasCache(), phrase)
    row = await (
        await db.execute(
            "SELECT canonical_code, canonical_display FROM norm_diagnoses WHERE id = ?", (norm_id,)
        )
    ).fetchone()
    assert row[0] != "synthetic-language"
    assert row[1] == phrase
    after = await (
        await db.execute("SELECT COUNT(*) FROM norm_diagnosis_aliases WHERE language = 'fr'")
    ).fetchone()
    assert after[0] == before[0] > 0


@pytest.mark.asyncio
async def test_selecting_french_does_not_restore_the_old_false_match(db, monkeypatch):
    set_policy(monkeypatch, ["de", "en", "fr"])
    norm_id = await resolve_diagnosis(db, AliasCache(), "Langer synthetischer Platzhalter links")
    row = await (
        await db.execute("SELECT canonical_code FROM norm_diagnoses WHERE id = ?", (norm_id,))
    ).fetchone()
    assert row[0] != "synthetic-language"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "term_type,entity",
    [
        ("lab_tests", "lab_test"),
        ("diagnoses", "diagnosis"),
        ("medications", "medication"),
        ("specialties", "specialty"),
    ],
)
async def test_exact_and_fuzzy_candidate_pools_follow_languages(db, monkeypatch, term_type, entity):
    main, _, fk = TERM_TABLES[term_type]
    aliases = {
        "lab_tests": "norm_lab_test_aliases",
        "diagnoses": "norm_diagnosis_aliases",
        "medications": "norm_medication_aliases",
        "specialties": "norm_specialty_aliases",
    }[term_type]
    parent = (await (await db.execute(f"SELECT id FROM {main} LIMIT 1")).fetchone())[0]
    values = [
        (parent, "only-dutch-example", "nl"),
        (parent, "regional-german-example", "DE_de"),
        (parent, "untagged-example", None),
    ]
    await db.executemany(
        f"INSERT INTO {aliases} ({fk}, alias, language, auto_mapped) VALUES (?, ?, ?, 0)", values
    )
    set_policy(monkeypatch, ["de", "en"])
    cache = AliasCache()
    await cache.ensure_loaded(db, entity)
    assert cache.exact(entity, "only-dutch-example") is None
    assert "only-dutch-example" not in {alias for alias, _ in cache.all_aliases(entity)}
    assert cache.exact(entity, "regional-german-example") == parent
    assert cache.exact(entity, "untagged-example") == parent
    assert await find_matching_alias(db, aliases, fk, "only-dutch-example") is None
    set_policy(monkeypatch, ["de", "en", "nl"])
    enabled = AliasCache()
    await enabled.ensure_loaded(db, entity)
    assert enabled.exact(entity, "only-dutch-example") == parent
    assert await find_matching_alias(db, aliases, fk, "only-dutch-example") == parent
    assert (
        await (
            await db.execute(f"SELECT COUNT(*) FROM {aliases} WHERE alias = 'only-dutch-example'")
        ).fetchone()
    )[0] == 1


@pytest.mark.asyncio
async def test_unlabeled_aliases_remain_enabled_as_requested(db, monkeypatch):
    parent = (
        await (
            await db.execute(
                "SELECT id FROM norm_diagnoses WHERE canonical_code = 'synthetic-language'"
            )
        ).fetchone()
    )[0]
    phrase = "unlabeled verified alphaword"
    await db.execute(
        "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, auto_mapped) VALUES (?, ?, 0)",
        (parent, phrase),
    )
    set_policy(monkeypatch, ["de", "en"], True)
    assert await resolve_diagnosis(db, AliasCache(), phrase) == parent
    set_policy(monkeypatch, ["de", "en"], False)
    cache = AliasCache()
    await cache.ensure_loaded(db, "diagnosis")
    assert cache.exact("diagnosis", phrase) is None
    cache.remember("diagnosis", phrase, parent)
    assert cache.exact("diagnosis", phrase) is None
    assert (
        await (
            await db.execute(
                "SELECT COUNT(*) FROM norm_diagnosis_aliases WHERE alias = ?", (phrase,)
            )
        ).fetchone()
    )[0] == 1


@pytest.mark.asyncio
async def test_legacy_fallback_and_merge_candidates_cannot_use_disabled_aliases(db, monkeypatch):
    set_policy(monkeypatch, ["de", "en"])
    assert (
        await find_matching_alias(
            db, "norm_diagnosis_aliases", "norm_diagnosis_id", "Francais Alphawort"
        )
        is None
    )
    entries = await _fetch_entries(
        db, "norm_diagnoses", "norm_diagnosis_aliases", "norm_diagnosis_id"
    )
    rhinitis = next((e for e in entries if e["canonical_code"] == "synthetic-language"))
    assert "Francais Alphawort" not in rhinitis["aliases"]
    assert "Deutsch Alphawort" in rhinitis["aliases"]
    set_policy(monkeypatch, ["fr"])
    assert (
        await _resolve_diagnosis(db, {"diagnosis_original": "Francais Alphawort"}) == rhinitis["id"]
    )


def test_knowledge_base_cache_reloads_when_languages_change(monkeypatch, tmp_path):
    from asclepius.normalization.knowledge_base import KnowledgeBase, reset_cache

    path = tmp_path / "knowledge.json"
    path.write_text(
        json.dumps(
            [
                {
                    "canonical_display": "Canonical",
                    "external_code": "TEST",
                    "aliases": [
                        {"alias": "Knochen", "language": "de"},
                        {"alias": "os-inactif", "language": "fr"},
                        {"alias": "anonymous", "language": None},
                    ],
                }
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(KnowledgeBase, "_resolve_path", lambda self: path)
    reset_cache()
    try:
        set_policy(monkeypatch, ["de", "en"])
        first = get_knowledge_base("diagnoses")
        assert first.resolve("Knochen") == "TEST"
        assert first.resolve("os-inactif") is None
        assert first.resolve("anonymous") == "TEST"
        set_policy(monkeypatch, ["fr"], False)
        second = get_knowledge_base("diagnoses")
        assert second is not first
        assert second.resolve("os-inactif") == "TEST"
        assert second.resolve("Knochen") is None
        assert second.resolve("anonymous") is None
    finally:
        reset_cache()


@pytest.mark.asyncio
async def test_settings_persist_and_inventory_keeps_all_aliases(client):
    before = (await client.get("/api/normalization/matching-languages")).json()
    assert before["matching_languages"] == ["de", "en"]
    assert before["include_unlabeled_aliases"] is True
    assert {"de", "en", "nl", "fr", "it", "es"} <= set(before["available_languages"])
    response = await client.patch(
        "/api/settings",
        json={
            "normalization_matching_languages": [" DE ", "en", "nl", "DE"],
            "normalization_include_unlabeled_aliases": True,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["changes"]["normalization_matching_languages"] == ["de", "en", "nl"]
    settings = (await client.get("/api/settings")).json()["normalization"]
    assert settings == {"matching_languages": ["de", "en", "nl"], "include_unlabeled_aliases": True}
    path = Path(os.environ["ASCLEPIUS_CONFIG_PATH"])
    assert yaml.safe_load(path.read_text(encoding="utf-8"))["normalization"] == settings
    assert load_config().normalization.matching_languages == ["de", "en", "nl"]
    rhinitis = next(
        (
            i
            for i in (await client.get("/api/normalization/diagnoses")).json()
            if i["canonical_code"] == "synthetic-language"
        )
    )
    detail = (await client.get(f"/api/normalization/diagnoses/{rhinitis['id']}")).json()
    assert any((a["alias"] == "Francais Alphawort" for a in detail["aliases"]))


@pytest.mark.asyncio
@pytest.mark.parametrize("languages", [[], ["German"], ["de-DE"], ["de", 3]])
async def test_invalid_language_settings_are_rejected(client, languages):
    before = (await client.get("/api/settings")).json()["normalization"]
    response = await client.patch(
        "/api/settings", json={"normalization_matching_languages": languages}
    )
    assert response.status_code == 422
    assert (await client.get("/api/settings")).json()["normalization"] == before


@pytest.mark.asyncio
async def test_matching_policy_permissions(client, unauthed_client, make_user_client):
    assert (await unauthed_client.get("/api/normalization/matching-languages")).status_code == 401
    editor, _ = await make_user_client("language-editor", role="editor")
    assert (await editor.get("/api/normalization/matching-languages")).json()["can_edit"] is False
    response = await editor.patch(
        "/api/settings", json={"normalization_matching_languages": ["fr"]}
    )
    assert response.status_code == 403


@pytest.fixture(autouse=True)
async def synthetic_language_reference(db):
    cursor = await db.execute(
        "INSERT INTO norm_diagnoses (canonical_code, canonical_display) VALUES (?, ?)",
        ("synthetic-language", "Synthetic Language Reference"),
    )
    for alias, language in [("Francais Alphawort", "fr"), ("Deutsch Alphawort", "de")]:
        await db.execute(
            "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, language, auto_mapped) VALUES (?, ?, ?, 0)",
            (cursor.lastrowid, alias, language),
        )
    await db.commit()
