"""Document-purpose taxonomy, persistence, and clinical-record boundaries."""

import copy
import json
from types import SimpleNamespace

import aiosqlite
import pytest

from asclepius.config import AppConfig
from asclepius.documents.details import sanitize_document_details
from asclepius.llm.prompt_manager import get_all_prompts, get_default_prompt, set_prompt
from asclepius.pipeline.doc_types import _normalize_doc_type
from asclepius.pipeline.extraction_merge import (
    merge_extraction_dicts,
    merge_pair,
    merge_section_extractions,
)
from asclepius.pipeline.extractor import extract_and_store


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Überweisung", "referral"),
        ("referral", "referral"),
        ("referral_letter", "referral"),
        ("Rezept", "prescription"),
        ("Heilmittelverordnung", "medical_order"),
        ("Verordnung", "medical_order"),
        ("Untersuchungsbericht", "examination_report"),
        ("examination_report", "examination_report"),
        ("insurance_claim", "insurance_document"),
        ("insurance_approval", "insurance_document"),
        ("MRT", "other"),
        ("radiology_report", "imaging_report"),
    ],
)
def test_document_type_aliases(raw, expected):
    # Mentioning an examination in text is the classifier's job, not an
    # invitation for the code normalizer to reclassify arbitrary text.
    assert _normalize_doc_type(raw) == expected


@pytest.mark.parametrize("key", ["classification", "vision_extraction", "page_classification"])
def test_default_classifiers_include_new_types(key):
    prompt = get_default_prompt(key)
    for kind in ("referral", "medical_order", "examination_report", "insurance_document"):
        assert kind in prompt
    if key != "vision_extraction":
        prompt.format(
            patient_list="[]",
            facility_list="[]",
            doctor_list="[]",
            ocr_text="test",
            few_shot_examples="",
            pages_text="test",
        )


def test_invalid_llm_detail_does_not_discard_other_fields():
    assert sanitize_document_details(
        {
            "insurance_document": {
                "decision": "definitely approved",
                "valid_until": "2026-99-99",
                "coverage": "6 sessions",
                "reference_number": "ABC-1",
                "unexpected": "x",
            }
        }
    ) == {"insurance_document": {"coverage": "6 sessions", "reference_number": "ABC-1"}}


@pytest.mark.parametrize(
    "merge",
    [
        lambda rows: merge_extraction_dicts(rows),
        merge_section_extractions,
        lambda rows: merge_pair(rows[0], rows[1]),
    ],
)
def test_details_survive_all_merge_paths(merge):
    rows = [
        {
            "document_details": {
                "examination_report": {"examination": "Koloskopie", "findings": "Segment A normal"}
            }
        },
        {
            "document_details": {
                "examination_report": {"examination": None, "findings": "Segment B normal"},
                "insurance_document": {"decision": "approved"},
            }
        },
    ]
    result = merge(copy.deepcopy(rows))["document_details"]
    assert result["examination_report"]["examination"] == "Koloskopie"
    assert "Segment A normal" in result["examination_report"]["findings"]
    assert "Segment B normal" in result["examination_report"]["findings"]
    assert result["insurance_document"]["decision"] == "approved"


def test_later_exam_chunk_can_supply_missing_encounter_date():
    result = merge_pair(
        {
            "doc_type": "examination_report",
            "encounter": {"findings": "First finding"},
            "document_details": {"examination_report": {"findings": "First finding"}},
        },
        {
            "encounter": {"encounter_date": "2026-11-01"},
            "document_details": {"examination_report": {"findings": "Second finding"}},
        },
    )
    assert result["encounter"]["encounter_date"] == "2026-11-01"
    assert "First finding" in result["encounter"]["findings"]
    assert "Second finding" in result["encounter"]["findings"]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["referral", "medical_order", "insurance_document"])
async def test_administrative_documents_do_not_create_clinical_records(db, kind):
    patient = (
        await db.execute("INSERT INTO patients(slug, display_name) VALUES ('p', 'Patient')")
    ).lastrowid
    doc_id = (
        await db.execute(
            "INSERT INTO documents(patient_id, file_path, original_filename) VALUES (?, 'test.pdf', 'test.pdf')",
            (patient,),
        )
    ).lastrowid
    extraction = {
        "doc_type": kind,
        "event_date": "2026-11-02",
        "issued_date": "2026-11-01",
        "date_issued": "2026-11-01",
        "doctor": {"name": "Case worker"} if kind == "insurance_document" else {},
        "facility": {"name": "Insurer"} if kind == "insurance_document" else {},
        "diagnoses": [{"diagnosis_original": "Suspected condition"}],
        "encounter": {"encounter_date": "2026-11-02", "findings": "Planned exam"},
        "medications": [{"brand_name": "Not a prescription"}],
        "lab_results": [{"test_name_original": "Historical result", "value": 3}],
        "document_details": {kind: {"decision": "pending"} if kind == "insurance_document" else {}},
    }

    await extract_and_store(
        db,
        SimpleNamespace(provider_label="test"),
        doc_id,
        "text",
        AppConfig(),
        extraction_override=extraction,
    )
    for table in ("encounters", "medications", "lab_results"):
        assert (await (await db.execute(f"SELECT COUNT(*) FROM {table}")).fetchone())[0] == 0
    row = await (await db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))).fetchone()
    assert row["doc_type"] == kind
    assert row["event_date"] is None
    assert row["issued_date"] == "2026-11-01"
    if kind == "insurance_document":
        assert row["doctor_id"] is None and row["facility_id"] is None
        assert json.loads(row["document_details"])[kind]["decision"] == "pending"


@pytest.mark.parametrize(
    "kind", ["referral", "medical_order", "examination_report", "insurance_document"]
)
def test_type_specific_prompt_can_be_formatted(kind):
    prompt = get_default_prompt("extraction_" + kind).format(ocr_text="Document text")
    assert "document_details" in prompt and kind in prompt


@pytest.mark.asyncio
async def test_additive_migration_preserves_document_types(db, db_path):
    from asclepius.db.init import initialize_database

    await db.execute("ALTER TABLE documents DROP COLUMN document_details")
    kinds = [
        "referral",
        "medical_order",
        "examination_report",
        "insurance_document",
        "prescription",
    ]
    for kind in kinds:
        await db.execute(
            "INSERT INTO documents(file_path, original_filename, doc_type) VALUES (?, ?, ?)",
            (kind + ".pdf", kind + ".pdf", kind),
        )
    await db.commit()
    await initialize_database(db_path)
    await initialize_database(db_path)
    columns = await (await db.execute("PRAGMA table_info(documents)")).fetchall()
    assert "document_details" in {row[1] for row in columns}
    rows = await (await db.execute("SELECT doc_type FROM documents ORDER BY id")).fetchall()
    assert [row[0] for row in rows] == kinds


@pytest.mark.asyncio
async def test_scoped_detail_extraction_preserves_other_namespaces(db):
    existing = {"referral": {"recipient": "Clinic"}, "insurance_document": {"decision": "pending"}}
    doc_id = (
        await db.execute(
            "INSERT INTO documents(file_path, original_filename, doc_type, document_details) VALUES ('a.pdf', 'a.pdf', 'insurance_document', ?)",
            (json.dumps(existing),),
        )
    ).lastrowid
    await extract_and_store(
        db,
        SimpleNamespace(provider_label="test"),
        doc_id,
        "text",
        AppConfig(),
        extraction_override={"document_details": {"insurance_document": {"decision": "approved"}}},
        scope={"document_details"},
    )
    row = await (
        await db.execute("SELECT doc_type, document_details FROM documents WHERE id = ?", (doc_id,))
    ).fetchone()
    details = json.loads(row["document_details"])
    assert row["doc_type"] == "insurance_document"
    assert details["referral"] == existing["referral"]
    assert details["insurance_document"]["decision"] == "approved"


@pytest.mark.asyncio
async def test_exam_findings_without_diagnosis_or_date_are_preserved(db):
    patient = (
        await db.execute("INSERT INTO patients(slug, display_name) VALUES ('p', 'Patient')")
    ).lastrowid
    doc_id = (
        await db.execute(
            "INSERT INTO documents(patient_id, file_path, original_filename) VALUES (?, 'exam.pdf', 'exam.pdf')",
            (patient,),
        )
    ).lastrowid
    await extract_and_store(
        db,
        SimpleNamespace(provider_label="test"),
        doc_id,
        "text",
        AppConfig(),
        extraction_override={
            "doc_type": "examination_report",
            "diagnoses": [],
            "encounter": {"findings": "Normal ECG", "encounter_date": None},
            "document_details": {
                "examination_report": {"examination": "ECG", "findings": "Normal ECG"}
            },
        },
    )
    rows = await (
        await db.execute("SELECT * FROM encounters WHERE document_id = ?", (doc_id,))
    ).fetchall()
    assert len(rows) == 1
    assert rows[0]["findings"] == "Normal ECG"
    assert rows[0]["encounter_date"] is None


@pytest.mark.asyncio
async def test_custom_classifier_reports_missing_types_without_overwrite(db, db_path):
    await set_prompt(db_path, "classification", "My custom classification prompt: prescription")
    prompts = await get_all_prompts(db_path)
    classification = next(p for p in prompts if p["key"] == "classification")
    assert classification["is_custom"]
    assert classification["text"] == "My custom classification prompt: prescription"
    assert set(classification["missing_doc_types"]) == {
        "referral",
        "medical_order",
        "examination_report",
        "insurance_document",
    }


@pytest.mark.asyncio
async def test_document_details_patch_merges_validates_and_clears(client, db_path):
    async with aiosqlite.connect(db_path) as db:
        doc_id = (
            await db.execute(
                "INSERT INTO documents(file_path, original_filename, doc_type, document_details) VALUES ('a.pdf', 'a.pdf', 'insurance_document', ?)",
                (
                    json.dumps(
                        {
                            "insurance_document": {
                                "decision": "pending",
                                "reference_number": "ABC",
                            },
                            "referral": {"recipient": "Clinic"},
                        }
                    ),
                ),
            )
        ).lastrowid
        await db.commit()
    url = f"/api/documents/{doc_id}"
    response = await client.patch(
        url, json={"document_details": {"insurance_document": {"decision": "approved"}}}
    )
    assert response.status_code == 200
    details = response.json()["document_details"]
    assert details["insurance_document"] == {"decision": "approved", "reference_number": "ABC"}
    assert details["referral"]["recipient"] == "Clinic"
    listing = await client.get(
        "/api/documents", params={"doc_type": "insurance_document", "q": "ABC"}
    )
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [doc_id]
    for invalid in ({"decision": "yes"}, {"valid_until": "2026-02-31"}, {"unknown_field": "x"}):
        response = await client.patch(
            url, json={"document_details": {"insurance_document": invalid}}
        )
        assert response.status_code == 422
    response = await client.patch(
        url, json={"document_details": {"insurance_document": {"reference_number": None}}}
    )
    assert response.json()["document_details"]["insurance_document"]["reference_number"] is None
    response = await client.patch(url, json={"document_details": None})
    assert response.json()["document_details"] == {}


@pytest.mark.parametrize("kind", ["referral", "medical_order", "insurance_document"])
def test_administrative_filing_uses_issued_date(kind):
    from asclepius.util.dates import best_date_with_received

    assert (
        best_date_with_received(
            {
                "doc_type": kind,
                "event_date": None,
                "issued_date": "2023-01-02",
                "date_received": "2026-11-02",
            }
        )
        == "2023-01-02"
    )


@pytest.mark.asyncio
async def test_exam_findings_edits_stay_consistent(client, db_path):
    async with aiosqlite.connect(db_path) as db:
        patient_id = (
            await db.execute("INSERT INTO patients(slug, display_name) VALUES ('exam', 'Patient')")
        ).lastrowid
        doc_id = (
            await db.execute(
                "INSERT INTO documents(patient_id, file_path, original_filename, doc_type, document_details) VALUES (?, 'exam.pdf', 'exam.pdf', 'examination_report', ?)",
                (
                    patient_id,
                    json.dumps(
                        {"examination_report": {"findings": "Original", "assessment": "Normal"}}
                    ),
                ),
            )
        ).lastrowid
        encounter_id = (
            await db.execute(
                "INSERT INTO encounters(document_id, patient_id, findings) VALUES (?, ?, 'Original')",
                (doc_id, patient_id),
            )
        ).lastrowid
        await db.commit()
    response = await client.patch(
        f"/api/documents/{doc_id}",
        json={
            "document_details": {"examination_report": {"findings": "Corrected in document"}},
        },
    )
    assert response.status_code == 200
    detail = (await client.get(f"/api/documents/{doc_id}")).json()
    assert detail["encounters"][0]["findings"] == "Corrected in document"
    response = await client.patch(
        f"/api/encounters/{encounter_id}", json={"findings": "Corrected in encounter"}
    )
    assert response.status_code == 200
    detail = (await client.get(f"/api/documents/{doc_id}")).json()
    assert detail["document_details"]["examination_report"]["findings"] == "Corrected in encounter"
    assert detail["document_details"]["examination_report"]["assessment"] == "Normal"
