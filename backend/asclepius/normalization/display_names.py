"""Preferred UI names, separate from canonical identities and extraction aliases."""

import json
from pathlib import Path

import aiosqlite

from asclepius.pipeline.entity_matching import canonicalize_code

# SQL identifiers below are constants; callers cannot supply table names.
TERM_TABLES = {
    "lab_tests": ("norm_lab_tests", "norm_lab_test_labels", "norm_lab_test_id"),
    "specialties": ("norm_specialties", "norm_specialty_labels", "norm_specialty_id"),
    "diagnoses": ("norm_diagnoses", "norm_diagnosis_labels", "norm_diagnosis_id"),
    "medications": ("norm_medications", "norm_medication_labels", "norm_medication_id"),
}


async def attach_display_names(
    db: aiosqlite.Connection,
    items: list[dict],
    term_type: str,
    id_field: str = "id",
    output_field: str = "display_names",
) -> list[dict]:
    """Enrich only the supplied records; both languages travel in one response."""
    _, labels, fk = TERM_TABLES[term_type]
    ids = list({item[id_field] for item in items if item.get(id_field) is not None})
    names: dict[int, dict[str, str]] = {}
    # Stay below SQLite's variable limit even for large result lists.
    for start in range(0, len(ids), 500):
        chunk = ids[start : start + 500]
        cursor = await db.execute(
            f"SELECT {fk}, language, label FROM {labels} "
            f"WHERE {fk} IN ({','.join('?' for _ in chunk)})",
            chunk,
        )
        for row in await cursor.fetchall():
            names.setdefault(row[0], {})[row[1]] = row[2]
    for item in items:
        item[output_field] = names.get(item.get(id_field), {}).copy()
    return items


async def seed_display_names(db: aiosqlite.Connection, seeds_dirs: list[Path]) -> None:
    """Backfill known codes without replacing edited names or canonical data.

    Called through a versioned, one-shot migration after the initial seed load.
    Clearing a preferred name therefore survives subsequent application starts.
    Custom seed files can override the bundled preferred names per code.
    """
    for term_type, (main, labels, fk) in TERM_TABLES.items():
        entries = {}
        for directory in seeds_dirs:
            path = directory / f"{term_type}.json"
            if path.is_file():
                for item in json.loads(path.read_text(encoding="utf-8")):
                    if item.get("display_names"):
                        entries.setdefault(canonicalize_code(item["canonical_code"]), {}).update(
                            item["display_names"]
                        )
        cursor = await db.execute(f"SELECT id, canonical_code FROM {main}")
        values = []
        for row in await cursor.fetchall():
            for language, label in entries.get(canonicalize_code(row[1]), {}).items():
                if language in ("en", "de") and isinstance(label, str) and label.strip():
                    values.append((row[0], language, label.strip()))
        await db.executemany(
            f"INSERT OR IGNORE INTO {labels} ({fk}, language, label) VALUES (?, ?, ?)",
            values,
        )
