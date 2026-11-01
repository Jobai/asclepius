"""Resolve medical terms using reviewed synonyms and guarded whole-word matching.

Unmatched text keeps its original wording in a separate canonical entry.
Automatic spelling matches never become new authoritative synonyms.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import aiosqlite

from .alias_lookup import load_matching_candidates
from .languages import matching_policy
from .matching import Candidate, Match, TermMatcher, text_key

logger = logging.getLogger(__name__)
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    return _SLUG_RE.sub("-", text.lower()).strip("-")


@dataclass
class _EntityTables:
    canonical: str  # e.g. norm_lab_tests
    aliases: str  # e.g. norm_lab_test_aliases
    alias_fk: str  # e.g. norm_lab_test_id
    # Extra columns to preserve when inserting a new canonical row.
    extra_cols: list[str] = field(default_factory=list)


_ENTITIES = {
    "lab_test": _EntityTables(
        canonical="norm_lab_tests",
        aliases="norm_lab_test_aliases",
        alias_fk="norm_lab_test_id",
    ),
    "medication": _EntityTables(
        canonical="norm_medications",
        aliases="norm_medication_aliases",
        alias_fk="norm_medication_id",
    ),
    "diagnosis": _EntityTables(
        canonical="norm_diagnoses",
        aliases="norm_diagnosis_aliases",
        alias_fk="norm_diagnosis_id",
        extra_cols=["icd10_code"],
    ),
    "specialty": _EntityTables(
        canonical="norm_specialties",
        aliases="norm_specialty_aliases",
        alias_fk="norm_specialty_id",
    ),
}


@dataclass
class AliasCache:
    """One language-policy snapshot and spelling index per extraction."""

    policy: tuple[frozenset[str], bool] = field(default_factory=matching_policy)
    _matchers: dict[str, TermMatcher] = field(default_factory=dict)
    _memo: dict[tuple[str, str, str | None], int] = field(default_factory=dict)
    decisions: dict[tuple[str, str], Match] = field(default_factory=dict)

    async def ensure_loaded(self, db: aiosqlite.Connection, entity: str) -> None:
        if entity not in self._matchers:
            tables = _ENTITIES[entity]
            candidates = await load_matching_candidates(
                db,
                tables.aliases,
                tables.alias_fk,
                policy=self.policy,
            )
            self._matchers[entity] = TermMatcher(candidates, allow_qualifiers=entity == "diagnosis")

    def exact(self, entity: str, text: str) -> int | None:
        matcher = self._matchers.get(entity)
        return matcher.exact_match(text).norm_id if matcher else None

    def all_aliases(self, entity: str) -> list[tuple[str, int]]:
        matcher = self._matchers.get(entity)
        return (
            [(item.alias.strip().casefold(), item.norm_id) for item in matcher.candidates]
            if matcher
            else []
        )

    def remember(self, entity: str, alias: str, norm_id: int) -> None:
        # Kept for compatibility: remembering a guess must never expand the
        # spelling vocabulary or make an unrelated old alias authoritative.
        matcher = self._matchers.get(entity)
        if matcher and self.policy[1]:
            for candidate in list(matcher.candidates):
                if candidate.norm_id == norm_id and text_key(alias) == text_key(
                    candidate.canonical
                ):
                    matcher.add_identity(
                        Candidate(norm_id, alias, candidate.canonical, False, code=candidate.code)
                    )
                    break


async def _resolve_one(
    db: aiosqlite.Connection,
    cache: AliasCache,
    entity: str,
    original: str,
    *,
    extra: dict[str, Any] | None = None,
    auto_create: bool = True,
) -> int | None:
    if not isinstance(original, str) or not original.strip() or not text_key(original):
        return None
    cleaned = original.strip()
    extra = dict(extra or {})
    code = extra.get("icd10_code")
    code = code.strip() if isinstance(code, str) and code.strip() else None
    if entity == "diagnosis":
        extra["icd10_code"] = code
    key = text_key(cleaned)
    memo_key = entity, key, code
    if memo_key in cache._memo:
        return cache._memo[memo_key]
    await cache.ensure_loaded(db, entity)
    decision = cache._matchers[entity].match(cleaned, code=code)
    cache.decisions[entity, key] = decision
    logger.debug(
        "Normalizer entity=%s method=%s target=%s alias=%s score=%.3f",
        entity,
        decision.method,
        decision.norm_id,
        decision.alias_id,
        decision.score,
    )
    if decision.norm_id is not None:
        cache._memo[memo_key] = decision.norm_id
        return decision.norm_id
    if decision.method == "ambiguous" or not auto_create:
        return None

    # Literal identity creation is deliberately separate from synonym matching.
    # A slug collision is not evidence that two medical terms are equivalent.
    tables = _ENTITIES[entity]
    digest = hashlib.sha256(f"{key}|{code or ''}".encode()).hexdigest()[:12]
    base = _slugify(cleaned) or f"auto-{digest}"
    canonical_code = base
    suffix = 0
    while True:
        code_column = "icd10_code" if entity == "diagnosis" else "NULL"
        cursor = await db.execute(
            f"SELECT id, canonical_display, {code_column} FROM {tables.canonical} WHERE canonical_code = ?",
            (canonical_code,),
        )
        row = await cursor.fetchone()
        if row:
            same_code = (
                not (code and row[2])
                or code.replace(".", "").casefold() == row[2].replace(".", "").casefold()
            )
            if text_key(row[1]) == key and same_code:
                norm_id = row[0]
                break
            suffix += 1
            canonical_code = f"{base}-{digest}" + (f"-{suffix}" if suffix > 1 else "")
            continue
        columns = ["canonical_code", "canonical_display", *tables.extra_cols]
        await db.execute(
            f"INSERT OR IGNORE INTO {tables.canonical} ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})",
            [canonical_code, cleaned, *(extra.get(column) for column in tables.extra_cols)],
        )
        # Always reselect, including after INSERT OR IGNORE. lastrowid can
        # still contain a previous insert's id when a concurrent insert wins.

    await _add_alias(db, entity, norm_id, cleaned, auto_mapped=True)
    if cache.policy[1]:
        cache._matchers[entity].add_identity(Candidate(norm_id, cleaned, cleaned, False, code=code))
    cache._memo[memo_key] = norm_id
    cache.decisions[entity, key] = Match(norm_id, "literal")
    return norm_id


async def _add_alias(
    db: aiosqlite.Connection,
    entity: str,
    norm_id: int,
    alias: str,
    *,
    auto_mapped: bool,
) -> None:
    tables = _ENTITIES[entity]
    cursor = await db.execute(
        f"SELECT alias FROM {tables.aliases} WHERE {tables.alias_fk} = ?",
        (norm_id,),
    )
    if any(text_key(row[0]) == text_key(alias) for row in await cursor.fetchall()):
        return
    await db.execute(
        f"INSERT INTO {tables.aliases} ({tables.alias_fk}, alias, auto_mapped) VALUES (?, ?, ?)",
        (norm_id, alias, int(auto_mapped)),
    )


async def resolve_lab_test(
    db: aiosqlite.Connection,
    cache: AliasCache,
    original: str,
) -> int | None:
    return await _resolve_one(db, cache, "lab_test", original)


async def resolve_medication(
    db: aiosqlite.Connection,
    cache: AliasCache,
    original: str,
) -> int | None:
    return await _resolve_one(db, cache, "medication", original)


async def resolve_diagnosis(
    db: aiosqlite.Connection,
    cache: AliasCache,
    original: str,
    *,
    icd10_code: str | None = None,
) -> int | None:
    return await _resolve_one(
        db,
        cache,
        "diagnosis",
        original,
        extra={"icd10_code": icd10_code},
    )


async def resolve_specialty(
    db: aiosqlite.Connection,
    cache: AliasCache,
    original: str,
) -> int | None:
    return await _resolve_one(db, cache, "specialty", original)


async def resolve_extraction(
    db: aiosqlite.Connection,
    extraction: dict,
) -> dict:
    """Walk an extraction dict and fill in every ``norm_*_id`` field by
    resolving the corresponding ``*_original`` text. Returns the same
    dict, mutated in place.

    The LLM may omit ``norm_*_id`` fields entirely (we no longer send the
    mapping table as context); this helper populates them from Python.
    The LLM's hallucinated ``*_canonical`` / ``*_mapped`` fields are
    ignored.
    """
    cache = AliasCache()

    # Lab results.
    for lab in extraction.get("lab_results") or []:
        if not isinstance(lab, dict):
            continue
        lab["norm_lab_test_id"] = None
        original = lab.get("test_name_original") or lab.get("test_name") or ""
        if not original:
            continue
        norm_id = await resolve_lab_test(db, cache, original)
        if norm_id is not None:
            lab["norm_lab_test_id"] = norm_id

    # Medications.
    for med in extraction.get("medications") or []:
        if not isinstance(med, dict):
            continue
        med["norm_medication_id"] = None
        original = med.get("active_ingredient_original") or med.get("brand_name") or ""
        if not original:
            continue
        norm_id = await resolve_medication(db, cache, original)
        if norm_id is not None:
            med["norm_medication_id"] = norm_id

    # Diagnoses.
    for diag in extraction.get("diagnoses") or []:
        if not isinstance(diag, dict):
            continue
        diag["norm_diagnosis_id"] = None
        original = diag.get("diagnosis_original") or ""
        if not original:
            continue
        norm_id = await resolve_diagnosis(
            db,
            cache,
            original,
            icd10_code=diag.get("icd10_code"),
        )
        if norm_id is not None:
            diag["norm_diagnosis_id"] = norm_id

    # Specialty — on the top-level extraction ("specialty" dict) and on
    # per-encounter encounter.specialty_original when present.
    spec_block = extraction.get("specialty")
    if isinstance(spec_block, dict):
        spec_block["norm_specialty_id"] = None
        original = spec_block.get("original") or spec_block.get("name") or ""
        if original:
            norm_id = await resolve_specialty(db, cache, original)
            if norm_id is not None:
                spec_block["norm_specialty_id"] = norm_id

    encounter = extraction.get("encounter")
    if isinstance(encounter, dict):
        encounter["norm_specialty_id"] = None
        original = encounter.get("specialty_original") or ""
        if original:
            norm_id = await resolve_specialty(db, cache, original)
            if norm_id is not None:
                encounter["norm_specialty_id"] = norm_id

    # Specialty on doctor extraction.
    doctor = extraction.get("doctor")
    if isinstance(doctor, dict):
        doctor["norm_specialty_id"] = None
        original = doctor.get("specialty_original") or ""
        if original:
            norm_id = await resolve_specialty(db, cache, original)
            if norm_id is not None:
                doctor["norm_specialty_id"] = norm_id

    await db.commit()
    return extraction
