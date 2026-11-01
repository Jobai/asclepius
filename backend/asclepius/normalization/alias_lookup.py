"""Shared read-helpers for the ``norm_*_aliases`` tables.

Both :mod:`resolver` (one-shot alias cache used during extraction) and
:mod:`auto_merge` (bulk entry listing for the merge-proposal prompt)
need to pull rows out of the alias tables. They used to roll that
SELECT by hand; centralising it here means there is exactly one SQL
shape to audit when the schema changes.
"""

import aiosqlite

from .languages import alias_is_enabled, matching_policy
from .matching import Candidate, TermMatcher, text_key

MEDICAL_ALIAS_TABLES = {
    "norm_lab_test_aliases": ("norm_lab_tests", "norm_lab_test_id"),
    "norm_diagnosis_aliases": ("norm_diagnoses", "norm_diagnosis_id"),
    "norm_medication_aliases": ("norm_medications", "norm_medication_id"),
    "norm_specialty_aliases": ("norm_specialties", "norm_specialty_id"),
}


async def load_matching_candidates(
    db: aiosqlite.Connection,
    alias_table: str,
    fk_col: str,
    *,
    policy: tuple[frozenset[str], bool] | None = None,
) -> list[Candidate]:
    """Separate reviewed synonyms from literal identities and old learned aliases.

    Nothing is deleted or relabelled. An unreviewed alias pointing to a different
    canonical name cannot make an old fuzzy error authoritative on the next run.
    """
    main, expected_fk = MEDICAL_ALIAS_TABLES[alias_table]
    if fk_col != expected_fk:
        raise ValueError("Invalid normalization foreign key")
    policy = matching_policy() if policy is None else policy
    code_column = "icd10_code" if main == "norm_diagnoses" else "NULL"
    cursor = await db.execute(f"SELECT id, canonical_display, {code_column} FROM {main}")
    parents = {row[0]: (row[1], row[2]) for row in await cursor.fetchall()}
    cursor = await db.execute(
        f"SELECT id, alias, {fk_col}, language, auto_mapped FROM {alias_table}"
    )
    candidates = []
    for row in await cursor.fetchall():
        alias_id, alias, norm_id, language, auto_mapped = row
        if not alias or norm_id not in parents or not alias_is_enabled(language, policy):
            continue
        display, code = parents[norm_id]
        reviewed = auto_mapped == 0
        if reviewed or text_key(alias) == text_key(display):
            candidates.append(Candidate(norm_id, alias, display, reviewed, alias_id, code))
    # Canonical names have no language metadata. They can be reused literally
    # under the existing unlabeled-language setting, never used as learned
    # spelling references. Reviewed aliases supply the spelling vocabulary.
    if policy[1]:
        candidates.extend(
            Candidate(norm_id, display, display, False, code=code)
            for norm_id, (display, code) in parents.items()
            if display
        )
    return candidates


async def load_aliases_flat(
    db: aiosqlite.Connection,
    alias_table: str,
    fk_col: str,
    *,
    policy: tuple[frozenset[str], bool] | None = None,
) -> list[tuple[str, int]]:
    """Return safe candidates as ``(alias_lower_stripped, parent_id)``.

    Disabled languages and unreviewed learned synonyms are excluded. Literal
    canonical identities are included under the unlabeled-language policy.
    Duplicates are preserved; do not collapse different parents into a last-wins
    dictionary when making a matching decision.
    """
    candidates = await load_matching_candidates(db, alias_table, fk_col, policy=policy)
    return [(candidate.alias.strip().casefold(), candidate.norm_id) for candidate in candidates]


async def load_aliases_by_parent(
    db: aiosqlite.Connection,
    alias_table: str,
    fk_col: str,
    *,
    policy: tuple[frozenset[str], bool] | None = None,
    reviewed_only: bool = False,
) -> dict[int, list[str]]:
    """Return ``{parent_id: [alias, alias, ...]}`` keeping the raw casing.

    With a policy, only enabled languages are returned; without one this
    helper retains the unfiltered view for proper-name aliases.
    Aliases are returned in whatever order the DB yields them — callers
    that care about stability should sort themselves.
    """
    cursor = await db.execute(
        f"SELECT {fk_col} AS parent_id, alias, language, auto_mapped FROM {alias_table}"
    )
    out: dict[int, list[str]] = {}
    for r in await cursor.fetchall():
        parent = r[0]
        alias = r[1]
        if (
            parent is None
            or not alias
            or (policy is not None and not alias_is_enabled(r[2], policy))
            or (reviewed_only and r[3] != 0)
        ):
            continue
        out.setdefault(int(parent), []).append(alias)
    return out


async def find_matching_alias(
    db: aiosqlite.Connection,
    alias_table: str,
    fk_col: str,
    original: str,
) -> int | None:
    """Language-filtered exact lookup for the legacy extraction fallback."""
    candidates = await load_matching_candidates(db, alias_table, fk_col)
    return TermMatcher(candidates).exact_match(original).norm_id
