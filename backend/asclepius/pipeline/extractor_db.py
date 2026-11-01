"""Database resolvers for normalized reference tables.

Legacy callers use the same original-text matcher as the main extraction
pipeline. Model-emitted canonical codes and mapping flags are not evidence
that two terms are equivalent.
"""

import aiosqlite

from asclepius.normalization.resolver import (
    AliasCache,
    resolve_diagnosis,
    resolve_lab_test,
    resolve_medication,
    resolve_specialty,
)


async def _resolve_specialty_from_data(
    db: aiosqlite.Connection, specialty_data: dict
) -> int | None:
    """Resolve original wording; never accept an LLM-generated canonical code."""
    return await resolve_specialty(
        db, AliasCache(), specialty_data.get("original") or specialty_data.get("name") or ""
    )


async def _resolve_lab_test(db: aiosqlite.Connection, lab: dict) -> int | None:
    """Resolve lab test to norm_lab_tests ID, creating if needed."""
    return await resolve_lab_test(db, AliasCache(), lab.get("test_name_original") or "")


async def _resolve_diagnosis(db: aiosqlite.Connection, diag: dict) -> int | None:
    """Resolve diagnosis to norm_diagnoses ID."""
    return await resolve_diagnosis(
        db,
        AliasCache(),
        diag.get("diagnosis_original") or "",
        icd10_code=diag.get("icd10_code"),
    )


async def _resolve_medication(db: aiosqlite.Connection, med: dict) -> int | None:
    """Resolve medication to norm_medications ID."""
    return await resolve_medication(db, AliasCache(), med.get("active_ingredient_original") or "")
