"""Language policy for medical-term aliases; stored aliases are never removed."""

import re

from asclepius.config import get_config

_LANGUAGE = re.compile(r"^[a-z]{2,3}$")


def alias_language(value: str | None) -> str | None:
    """Use the base language of ISO-style tags, e.g. DE_de → de."""
    if not value or not value.strip():
        return None
    return value.strip().lower().replace("_", "-").split("-", 1)[0]


def matching_policy() -> tuple[frozenset[str], bool]:
    config = get_config().normalization
    return frozenset(config.matching_languages), config.include_unlabeled_aliases


def alias_is_enabled(language: str | None, policy: tuple[frozenset[str], bool]) -> bool:
    code = alias_language(language)
    allowed, include_unlabeled = policy
    return include_unlabeled if code is None else code in allowed


def selectable_language(value: str | None) -> str | None:
    code = alias_language(value)
    return code if code and _LANGUAGE.fullmatch(code) else None
