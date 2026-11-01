"""Shared read-helpers for the ``norm_*_aliases`` tables.

Both :mod:`resolver` (one-shot alias cache used during extraction) and
:mod:`auto_merge` (bulk entry listing for the merge-proposal prompt)
need to pull rows out of the alias tables. They used to roll that
SELECT by hand; centralising it here means there is exactly one SQL
shape to audit when the schema changes.
"""

import aiosqlite

from .languages import alias_is_enabled, matching_policy


async def load_aliases_flat(
    db: aiosqlite.Connection,
    alias_table: str,
    fk_col: str,
    *,
    policy: tuple[frozenset[str], bool] | None = None,
) -> list[tuple[str, int]]:
    """Return enabled aliases as ``(alias_lower_stripped, parent_id)``.

    Disabled languages, blank aliases and null parent ids are dropped. Duplicates are
    preserved — callers that need uniqueness should feed the result into
    a dict or set.
    """
    policy = matching_policy() if policy is None else policy
    cursor = await db.execute(f"SELECT alias, {fk_col}, language FROM {alias_table}")
    rows = await cursor.fetchall()
    out: list[tuple[str, int]] = []
    for r in rows:
        alias, parent = r[0], r[1]
        if not alias or parent is None or not alias_is_enabled(r[2], policy):
            continue
        out.append((str(alias).strip().lower(), int(parent)))
    return out


async def load_aliases_by_parent(
    db: aiosqlite.Connection,
    alias_table: str,
    fk_col: str,
    *,
    policy: tuple[frozenset[str], bool] | None = None,
) -> dict[int, list[str]]:
    """Return ``{parent_id: [alias, alias, ...]}`` keeping the raw casing.

    With a policy, only enabled languages are returned; without one this
    helper retains the unfiltered view for proper-name aliases.
    Aliases are returned in whatever order the DB yields them — callers
    that care about stability should sort themselves.
    """
    cursor = await db.execute(f"SELECT {fk_col} AS parent_id, alias, language FROM {alias_table}")
    out: dict[int, list[str]] = {}
    for r in await cursor.fetchall():
        parent = r[0]
        alias = r[1]
        if (
            parent is None
            or not alias
            or (policy is not None and not alias_is_enabled(r[2], policy))
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
    policy = matching_policy()
    cursor = await db.execute(
        f"SELECT {fk_col}, language FROM {alias_table} WHERE alias = ? COLLATE NOCASE",
        (original,),
    )
    for row in await cursor.fetchall():
        if alias_is_enabled(row[1], policy):
            return row[0]
    return None
