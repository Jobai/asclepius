"""Regression tests with independently invented examples, not clinical cases."""

import logging
from unittest.mock import AsyncMock
import pytest
from asclepius.db.connection import open_db
from asclepius.normalization.auto_merge import _fetch_entries
from asclepius.normalization.resolver import (
    AliasCache,
    _resolve_one,
    resolve_diagnosis,
    resolve_extraction,
)
from asclepius.pipeline.extractor_db import (
    _resolve_diagnosis,
    _resolve_lab_test,
    _resolve_medication,
    _resolve_specialty_from_data,
)
from asclepius.pipeline.entity_matching import _resolve_specialty_from_doctor
from asclepius.pipeline.extractor_writers import (
    write_encounters,
    write_lab_results,
    write_medications,
)

LONG_TERM = "synthetischer Alphabegriff mit mehreren umfangreichen zusaetzlichen Bezeichnungen"


async def norm_code(db, norm_id):
    row = await (
        await db.execute(
            "SELECT canonical_code, canonical_display FROM norm_diagnoses WHERE id = ?", (norm_id,)
        )
    ).fetchone()
    return tuple(row) if row else None


@pytest.mark.asyncio
async def test_poisoned_synthetic_aliases_stay_fixed_even_with_old_bad_aliases(db):
    dystonia = (
        await db.execute(
            "INSERT INTO norm_diagnoses (canonical_code, canonical_display) VALUES ('synthetic-long', ?)",
            (LONG_TERM,),
        )
    ).lastrowid
    await db.execute(
        "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, auto_mapped) VALUES (?, ?, 1)",
        (dystonia, LONG_TERM),
    )
    examples = [
        ("TARQXALANGE D", "synthetic-alpha"),
        ("ALPHABETASYSTEM", "synthetic-delta"),
        ("Zetafunktiom", "synthetic-epsilon"),
        ("Objekt Alpha mit Gammafaktor", "synthetic-long"),
    ]
    for phrase, wrong_code in examples:
        wrong = (
            await (
                await db.execute(
                    "SELECT id FROM norm_diagnoses WHERE canonical_code = ?", (wrong_code,)
                )
            ).fetchone()
        )[0]
        await db.execute(
            "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, auto_mapped) VALUES (?, ?, 1)",
            (wrong, phrase),
        )
        new_id = await resolve_diagnosis(db, AliasCache(), phrase)
        assert new_id != wrong
        assert (await norm_code(db, new_id))[1] == phrase
        assert await resolve_diagnosis(db, AliasCache(), phrase) == new_id
        assert (
            await (
                await db.execute(
                    "SELECT COUNT(*) FROM norm_diagnosis_aliases WHERE norm_diagnosis_id = ? AND alias = ?",
                    (wrong, phrase),
                )
            ).fetchone()
        )[0] == 1
    entries = await _fetch_entries(
        db, "norm_diagnoses", "norm_diagnosis_aliases", "norm_diagnosis_id"
    )
    assert (
        "TARQXALANGE D"
        not in next((e for e in entries if e["canonical_code"] == "synthetic-alpha"))["aliases"]
    )


@pytest.mark.asyncio
async def test_successful_spelling_matches_do_not_create_new_synonyms(db):
    before = (await (await db.execute("SELECT COUNT(*) FROM norm_diagnosis_aliases")).fetchone())[0]
    matched = await resolve_diagnosis(db, AliasCache(), "Alphafunktiom")
    assert (await norm_code(db, matched))[0] == "synthetic-beta"
    assert (await (await db.execute("SELECT COUNT(*) FROM norm_diagnosis_aliases")).fetchone())[
        0
    ] == before
    assert (
        await _resolve_one(db, AliasCache(), "diagnosis", "Alphafunktiom", auto_create=False)
        == matched
    )
    assert (await (await db.execute("SELECT COUNT(*) FROM norm_diagnosis_aliases")).fetchone())[
        0
    ] == before


@pytest.mark.asyncio
async def test_qualified_synthetic_term_preserves_original_text(db):
    parent = (
        await (
            await db.execute(
                "SELECT id FROM norm_diagnoses WHERE canonical_code = 'synthetic-gamma'"
            )
        ).fetchone()
    )[0]
    await db.execute(
        "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, language, auto_mapped) VALUES (?, 'Objekt Alpha', 'de', 0)",
        (parent,),
    )
    extraction = {
        "diagnoses": [
            {"diagnosis_original": "Objekt Alpha mit Gammafaktor", "norm_diagnosis_id": -99}
        ]
    }
    await resolve_extraction(db, extraction)
    assert extraction["diagnoses"][0]["norm_diagnosis_id"] == parent
    assert extraction["diagnoses"][0]["diagnosis_original"] == "Objekt Alpha mit Gammafaktor"
    assert (
        await (
            await db.execute(
                "SELECT COUNT(*) FROM norm_diagnosis_aliases WHERE alias = 'Objekt Alpha mit Gammafaktor'"
            )
        ).fetchone()
    )[0] == 0


@pytest.mark.asyncio
async def test_duplicate_aliases_are_ambiguous_and_model_ids_are_cleared(db):
    ids = [
        row[0]
        for row in await (await db.execute("SELECT id FROM norm_diagnoses LIMIT 2")).fetchall()
    ]
    for parent in ids:
        await db.execute(
            "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, language, auto_mapped) VALUES (?, 'ambiguous diagnosis', 'en', 0)",
            (parent,),
        )
    assert await resolve_diagnosis(db, AliasCache(), "ambiguous diagnosis") is None
    extraction = {
        "diagnoses": [
            {"diagnosis_original": "ambiguous diagnosis", "norm_diagnosis_id": ids[0]},
            {"norm_diagnosis_id": ids[0]},
        ],
        "lab_results": [{"norm_lab_test_id": 1}],
        "medications": [{"norm_medication_id": 1}],
        "doctor": {"norm_specialty_id": 1},
        "specialty": {"norm_specialty_id": 1},
        "encounter": {"norm_specialty_id": 1},
    }
    await resolve_extraction(db, extraction)
    assert all((d["norm_diagnosis_id"] is None for d in extraction["diagnoses"]))
    assert extraction["lab_results"][0]["norm_lab_test_id"] is None
    assert extraction["medications"][0]["norm_medication_id"] is None
    assert all(
        (
            extraction[key]["norm_specialty_id"] is None
            for key in ("doctor", "specialty", "encounter")
        )
    )


@pytest.mark.asyncio
async def test_slug_collisions_do_not_conflate_distinct_terms(db):
    first = await resolve_diagnosis(db, AliasCache(), "A-B")
    second = await resolve_diagnosis(db, AliasCache(), "A+B")
    assert first != second
    assert (await norm_code(db, first))[1] == "A-B"
    assert (await norm_code(db, second))[1] == "A+B"
    assert await resolve_diagnosis(db, AliasCache(), "A+B") == second


@pytest.mark.asyncio
async def test_legacy_resolvers_ignore_incorrect_model_canonical_codes(db):
    diagnosis = await _resolve_diagnosis(
        db, {"diagnosis_original": "TARQXALANGE D", "diagnosis_canonical": "synthetic-alpha"}
    )
    assert (await norm_code(db, diagnosis))[0] != "synthetic-alpha"
    assert await _resolve_specialty_from_data(db, {"canonical": "synthetic-specialty"}) is None
    assert (
        await _resolve_specialty_from_doctor(db, {"specialty_canonical": "synthetic-specialty"})
        is None
    )
    lab = await _resolve_lab_test(
        db,
        {
            "test_name_original": "Marker X1",
            "test_name_canonical": "synthetic-lab-x12",
            "test_mapped": True,
        },
    )
    assert (
        await (
            await db.execute("SELECT canonical_code FROM norm_lab_tests WHERE id = ?", (lab,))
        ).fetchone()
    )[0] != "synthetic-lab-x12"
    med = await _resolve_medication(
        db,
        {
            "active_ingredient_original": "a completely different medicine",
            "active_ingredient_canonical": "synthetic-medication",
        },
    )
    assert (
        await (
            await db.execute("SELECT canonical_code FROM norm_medications WHERE id = ?", (med,))
        ).fetchone()
    )[0] != "synthetic-medication"


@pytest.mark.asyncio
async def test_child_writers_revalidate_direct_model_ids_on_partial_paths(db):
    patient = (
        await db.execute(
            "INSERT INTO patients (slug, display_name) VALUES ('matching-patient', 'Test')"
        )
    ).lastrowid
    doc = (
        await db.execute(
            "INSERT INTO documents (patient_id, file_path, original_filename) VALUES (?, 'test.pdf', 'test.pdf')",
            (patient,),
        )
    ).lastrowid
    wrong = (
        await (
            await db.execute(
                "SELECT id FROM norm_diagnoses WHERE canonical_code = 'synthetic-epsilon'"
            )
        ).fetchone()
    )[0]
    extraction = {
        "diagnoses": [{"diagnosis_original": "Zetafunktiom", "norm_diagnosis_id": wrong}],
        "lab_results": [
            {"test_name_original": "Marker X1", "norm_lab_test_id": 1, "value_text": "<0.1"}
        ],
        "medications": [
            {
                "active_ingredient_original": "a completely different medicine",
                "norm_medication_id": 1,
            }
        ],
    }
    await write_encounters(db, doc, patient, extraction, None, None, {}, None)
    await write_lab_results(db, doc, patient, extraction, None, logging.getLogger(__name__))
    await write_medications(db, doc, patient, extraction, None)
    encounter = await (
        await db.execute(
            "SELECT diagnosis_original, norm_diagnosis_id FROM encounters WHERE document_id = ?",
            (doc,),
        )
    ).fetchone()
    assert encounter[0] == "Zetafunktiom" and encounter[1] != wrong
    lab = await (
        await db.execute(
            "SELECT value_text, norm_lab_test_id FROM lab_results WHERE document_id = ?", (doc,)
        )
    ).fetchone()
    assert lab[0] == "<0.1" and lab[1] != 1
    med = await (
        await db.execute("SELECT norm_medication_id FROM medications WHERE document_id = ?", (doc,))
    ).fetchone()
    assert med[0] != 1


@pytest.mark.asyncio
async def test_manual_diagnosis_and_code_changes_use_the_same_matcher(client, db_path):
    from tests.test_lab_results import _create_patient_with_labs

    await _create_patient_with_labs(db_path)
    async with open_db(db_path) as db:
        document, patient = await (
            await db.execute("SELECT id, patient_id FROM documents LIMIT 1")
        ).fetchone()
        wrong = (
            await (
                await db.execute(
                    "SELECT id FROM norm_diagnoses WHERE canonical_code = 'synthetic-alpha'"
                )
            ).fetchone()
        )[0]
        encounter = (
            await db.execute(
                "INSERT INTO encounters (document_id, patient_id, diagnosis_original, norm_diagnosis_id) VALUES (?, ?, 'old text', ?)",
                (document, patient, wrong),
            )
        ).lastrowid
        await db.commit()
    response = await client.patch(
        f"/api/encounters/{encounter}", json={"diagnosis_original": "Alphafunktiom"}
    )
    assert response.status_code == 200
    async with open_db(db_path) as db:
        record = await (
            await db.execute(
                "SELECT diagnosis_original, norm_diagnosis_id FROM encounters WHERE id = ?",
                (encounter,),
            )
        ).fetchone()
        assert record[0] == "Alphafunktiom"
        assert (await norm_code(db, record[1]))[0] == "synthetic-beta"
    response = await client.patch(
        f"/api/encounters/{encounter}", json={"diagnosis_code": "TEST.B2"}
    )
    assert response.status_code == 200
    async with open_db(db_path) as db:
        record = await (
            await db.execute("SELECT norm_diagnosis_id FROM encounters WHERE id = ?", (encounter,))
        ).fetchone()
        assert (await norm_code(db, record[0]))[0] != "synthetic-beta"


@pytest.mark.asyncio
async def test_document_specialty_revalidates_when_bulk_resolution_failed(db, monkeypatch):
    from asclepius.config import get_config
    from asclepius.pipeline.extractor import extract_and_store

    patient = (
        await db.execute(
            "INSERT INTO patients (slug, display_name) VALUES ('fallback-patient', 'Test')"
        )
    ).lastrowid
    document = (
        await db.execute(
            "INSERT INTO documents (patient_id, file_path, original_filename) VALUES (?, 'test.pdf', 'test.pdf')",
            (patient,),
        )
    ).lastrowid
    wrong = (
        await (
            await db.execute(
                "SELECT id FROM norm_specialties WHERE canonical_code = 'synthetic-specialty'"
            )
        ).fetchone()
    )[0]
    monkeypatch.setattr(
        "asclepius.normalization.resolver.resolve_extraction",
        AsyncMock(side_effect=RuntimeError("bulk resolution interrupted")),
    )
    await extract_and_store(
        db,
        None,
        document,
        "",
        get_config(),
        extraction_override={
            "specialty": {
                "original": "a completely different specialty",
                "canonical": "synthetic-specialty",
                "norm_specialty_id": wrong,
            }
        },
    )
    row = await (
        await db.execute(
            "SELECT specialty_original, norm_specialty_id FROM documents WHERE id = ?", (document,)
        )
    ).fetchone()
    assert row[0] == "a completely different specialty" and row[1] != wrong


@pytest.fixture(autouse=True)
async def synthetic_reference_terms(db):
    rows = [
        ("synthetic-alpha", "Alpha Reference", "TEST.B2", "QX"),
        ("synthetic-delta", "Delta Reference", None, "BE"),
        ("synthetic-epsilon", "Epsilon Reference", None, "FU"),
        ("synthetic-beta", "Beta Reference", "TEST.A1", "Alphafunktion"),
        ("synthetic-gamma", "Gamma Reference", None, "Gammaobjekt"),
    ]
    for code, display, external, alias in rows:
        cursor = await db.execute(
            "INSERT INTO norm_diagnoses (canonical_code, canonical_display, icd10_code) VALUES (?, ?, ?)",
            (code, display, external),
        )
        await db.execute(
            "INSERT INTO norm_diagnosis_aliases (norm_diagnosis_id, alias, language, auto_mapped) VALUES (?, ?, ?, 0)",
            (cursor.lastrowid, alias, "de"),
        )
    for table, code, display in (
        ("norm_lab_tests", "synthetic-lab-x12", "Marker X12"),
        ("norm_medications", "synthetic-medication", "Reference Ingredient"),
        ("norm_specialties", "synthetic-specialty", "Reference Specialty"),
    ):
        await db.execute(
            f"INSERT INTO {table} (canonical_code, canonical_display) VALUES (?, ?)",
            (code, display),
        )
    await db.commit()
