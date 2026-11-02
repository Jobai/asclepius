"""Ingest raster-only imaging exports without OCR or invented DICOM metadata."""

import hashlib
import shutil
from pathlib import Path

import aiosqlite
from PIL import Image

from asclepius.config import AppConfig
from asclepius.util.paths import safe_filename, safe_vault_join


async def process_image_frame(
    path: Path, meta: dict, config: AppConfig, db: aiosqlite.Connection
) -> int:
    # Decode before creating records or moving the source. A corrupt image
    # must remain available for retry, rather than becoming an invisible file.
    with Image.open(path) as image:
        image.load()

    patient_id = int(Path(str(path) + ".patient_hint").read_text().strip())
    row = await (
        await db.execute("SELECT slug FROM patients WHERE id = ?", (patient_id,))
    ).fetchone()
    if not row:
        raise ValueError("Image archive patient no longer exists")

    key = meta["image_study_key"]
    base = f"patients/{row[0]}/unknown/images-{key[:20]}"
    series_name = meta.get("image_series") or "Images"
    series_key = hashlib.sha256(series_name.encode()).hexdigest()[:12]
    folder = f"{base}/series-{series_key}"
    name = safe_filename(meta["original_name"])
    relative_path = f"{folder}/{name}"
    dest = safe_vault_join(Path(config.vault.root_path), relative_path)
    dest.parent.mkdir(parents=True, exist_ok=True)

    event_hint = Path(str(path) + ".event_hint")
    event_id = int(event_hint.read_text().strip()) if event_hint.exists() else None
    # The parent document can change when a report is attached. Identify the
    # study by its stable folder so a later re-upload keeps that report.
    cursor = await db.execute(
        "SELECT id, document_id FROM imaging_studies WHERE patient_id = ? AND folder_path = ?",
        (patient_id, base),
    )
    row = await cursor.fetchone()
    if row:
        study_id, doc_id = row
    else:
        cursor = await db.execute(
            """INSERT INTO documents
               (patient_id, event_id, file_path, original_filename, doc_type,
                file_hash, status, ocr_engine, ocr_text)
               VALUES (?, ?, '', ?, 'imaging_report', ?, 'done', 'image', '')""",
            (patient_id, event_id, f"{meta['zip_stem']} (report pending)", key),
        )
        doc_id = cursor.lastrowid
        cursor = await db.execute(
            """INSERT INTO imaging_studies
               (document_id, patient_id, modality, study_description, folder_path)
               VALUES (?, ?, 'OT', ?, ?)""",
            (doc_id, patient_id, meta["zip_stem"], base),
        )
        study_id = cursor.lastrowid

    cursor = await db.execute(
        "SELECT id FROM imaging_series WHERE study_id = ? AND folder_path = ?",
        (study_id, folder),
    )
    row = await cursor.fetchone()
    if row:
        series_id = row[0]
    else:
        cursor = await db.execute(
            """INSERT INTO imaging_series
               (study_id, series_description, modality, folder_path)
               VALUES (?, ?, 'OT', ?)""",
            (study_id, series_name, folder),
        )
        series_id = cursor.lastrowid

    if not dest.exists():
        shutil.copy2(path, dest)
    # Derive counts from stored files so re-upload and crash recovery are
    # idempotent, including a crash between copying and committing the DB.
    from asclepius.imaging.frames import _sorted_frames

    await db.execute(
        "UPDATE imaging_series SET num_images = ? WHERE id = ?",
        (len(_sorted_frames(dest.parent)), series_id),
    )
    await db.execute(
        """UPDATE imaging_studies SET
           num_images = (SELECT COALESCE(SUM(num_images), 0) FROM imaging_series WHERE study_id = ?),
           num_series = (SELECT COUNT(*) FROM imaging_series WHERE study_id = ?)
           WHERE id = ?""",
        (study_id, study_id, study_id),
    )
    await db.commit()
    path.unlink(missing_ok=True)
    for suffix in (".zip_member", ".patient_hint", ".event_hint", ".user_hint"):
        Path(str(path) + suffix).unlink(missing_ok=True)
    return doc_id
