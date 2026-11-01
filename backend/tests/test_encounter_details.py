"""Document encounter details expose provider names without losing clinical fields."""

import pytest

from asclepius.documents.service import get_related_records


@pytest.mark.asyncio
async def test_encounter_details_include_provider_names_and_missing_providers(db):
    patient = await db.execute(
        "INSERT INTO patients (slug, display_name) VALUES ('enc-details', 'Patient')"
    )
    document = await db.execute(
        "INSERT INTO documents (patient_id, file_path, original_filename) VALUES (?, '', 'visit.pdf')",
        (patient.lastrowid,),
    )
    doctor = await db.execute("INSERT INTO doctors (name, slug) VALUES ('Dr Example', 'dr-example')")
    facility = await db.execute(
        "INSERT INTO facilities (name, slug) VALUES ('Example Clinic', 'example-clinic')"
    )
    await db.execute(
        """INSERT INTO encounters
           (document_id, patient_id, doctor_id, facility_id, encounter_date,
            admission_date, discharge_date, findings, follow_up_date, follow_up_instructions)
           VALUES (?, ?, ?, ?, '2026-10-01', '2026-10-02', '2026-10-03',
                   'Clinical findings', '2026-10-08', 'Follow-up instructions')""",
        (document.lastrowid, patient.lastrowid, doctor.lastrowid, facility.lastrowid),
    )
    await db.execute(
        "INSERT INTO encounters (document_id, patient_id) VALUES (?, ?)",
        (document.lastrowid, patient.lastrowid),
    )

    records = await get_related_records(db, "encounters", document.lastrowid)

    assert len(records) == 2
    assert records[0]["doctor_name"] == "Dr Example"
    assert records[0]["facility_name"] == "Example Clinic"
    assert records[0]["encounter_date"] == "2026-10-01"
    assert records[0]["admission_date"] == "2026-10-02"
    assert records[0]["discharge_date"] == "2026-10-03"
    assert records[0]["findings"] == "Clinical findings"
    assert records[0]["follow_up_date"] == "2026-10-08"
    assert records[0]["follow_up_instructions"] == "Follow-up instructions"
    assert records[1]["doctor_name"] is None
    assert records[1]["facility_name"] is None
