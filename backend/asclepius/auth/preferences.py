"""Personal interface preferences, independent of document language settings."""

from typing import Literal

import aiosqlite
from pydantic import BaseModel, ConfigDict

UiLanguage = Literal["auto", "en", "de"]


class UiPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ui_language: UiLanguage


async def get_ui_language(db: aiosqlite.Connection, user_id: int) -> UiLanguage | None:
    cursor = await db.execute(
        "SELECT ui_language FROM user_ui_preferences WHERE user_id = ?", (user_id,)
    )
    row = await cursor.fetchone()
    return row[0] if row else None


async def save_ui_language(db: aiosqlite.Connection, user_id: int, language: UiLanguage) -> None:
    await db.execute(
        """INSERT INTO user_ui_preferences (user_id, ui_language) VALUES (?, ?)
           ON CONFLICT(user_id) DO UPDATE SET ui_language = excluded.ui_language,
           updated_at = CURRENT_TIMESTAMP""",
        (user_id, language),
    )
    await db.commit()
