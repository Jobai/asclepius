"""Centralized date-selection helpers.

Documents expose ``event_date`` for completed medical care and ``issued_date``
for paperwork. Administrative document types fall back to the issue date for
sorting and filing; clinical child-row dates still use event_date directly.
"""

from __future__ import annotations

from typing import Any


def _row_get(row: Any, key: str) -> Any:
    """Retrieve ``key`` from ``row``, which may be a dict, an aiosqlite.Row,
    or any mapping-like object. Returns None for missing keys without raising.
    """
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key)
    try:
        if key in row.keys():
            return row[key]
    except (AttributeError, TypeError):
        pass
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        return None


BEST_DATE_SQL = (
    "CASE WHEN d.doc_type IN ('referral', 'medical_order', 'insurance_document') "
    "THEN COALESCE(d.event_date, d.issued_date) ELSE d.event_date END"
)
"""Display/sort date, with issue-date fallback for administrative types only."""

BEST_DATE_SQL_WITH_CREATED = f"COALESCE({BEST_DATE_SQL}, d.created_at)"
"""Same as BEST_DATE_SQL with `created_at` as a last-resort fallback."""


def best_date(row: Any) -> str | None:
    """Return the filing date from a document-like row.

    Accepts dicts and aiosqlite.Row objects. Missing keys and empty strings
    are both treated as absent.
    """
    if row is None:
        return None
    value = _row_get(row, "event_date")
    if not value and _row_get(row, "doc_type") in (
        "referral",
        "medical_order",
        "insurance_document",
    ):
        value = _row_get(row, "issued_date")
    return value or None


def best_date_with_received(row: Any) -> str | None:
    """best_date() with `date_received` as a final fallback.

    Used by the file organizer, which needs *some* date to build a path even
    when no medical date was extracted.
    """
    value = best_date(row)
    if value:
        return value
    return _row_get(row, "date_received") or None
