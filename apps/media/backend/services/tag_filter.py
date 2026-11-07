"""Owner-scoped tag filter over the JSON text stored on UserEntry.tags.

Tags stay compact JSON (``json.dumps`` with the default ``ensure_ascii``).
SQLite compares decoded, casefolded whole strings through a deterministic
connection-local function. Escaped and literal Unicode have identical matching
semantics without rewriting existing records. SQL still owns filtering and paging.
"""

import json
import sqlite3

from fastapi import HTTPException
from sqlalchemy import func, true
from sqlalchemy.orm import Session

from apps.media.backend.models import UserEntry
from apps.media.backend.services.records import loads

_MAX_FILTER_TAGS = 10
_MAX_TAG_LENGTH = 100
_MAX_AVAILABLE_TAGS = 200
_TOO_MANY = "Choose at most 10 tags."
_TOO_LONG = "That tag is too long to filter by."


def parse_tag_params(values: list[str]) -> list[str]:
    """Trim, drop blanks, and de-dupe with casefold, keeping the first spelling.

    An empty result means the caller did not ask for a tag filter.
    """
    chosen: list[str] = []
    seen: set[str] = set()
    for raw in values:
        text = raw.strip()
        if not text:
            continue
        if len(text) > _MAX_TAG_LENGTH:
            raise HTTPException(status_code=422, detail=_TOO_LONG)
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        chosen.append(text)
    if len(chosen) > _MAX_FILTER_TAGS:
        raise HTTPException(status_code=422, detail=_TOO_MANY)
    return chosen


def _tag_keys(raw: object) -> set[str] | None:
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except (ValueError, RecursionError):
        return None
    if not isinstance(parsed, list):
        return None
    return {tag.casefold() for tag in parsed if isinstance(tag, str)}


def _media_tags_match(stored_json: object, requested_json: object) -> int:
    """Pure SQLite callback: malformed rows do not abort an owner-scoped query."""
    stored = _tag_keys(stored_json)
    requested = _tag_keys(requested_json)
    return int(stored is not None and requested is not None and requested <= stored)


def tags_clause(tags: list[str], db: Session):
    """AND of casefolded whole tags; ``%`` and ``_`` are ordinary characters."""
    if not tags:
        return true()
    connection = db.connection()
    if not connection.info.get("media_tags_match_registered"):
        driver = connection.connection.driver_connection
        if not isinstance(driver, sqlite3.Connection):
            raise RuntimeError("Media tag filtering requires SQLite")
        driver.create_function("media_tags_match", 2, _media_tags_match, deterministic=True)
        connection.info["media_tags_match_registered"] = True
    requested = json.dumps([tag.casefold() for tag in tags], separators=(",", ":"))
    return func.media_tags_match(UserEntry.tags, requested) == 1


def available_tags(db: Session, user_id: int) -> list[str]:
    """Distinct tags on this user's entries, ignoring every other library filter.

    Rows are scanned by id ascending so the first spelling wins. The result
    is ordered with ``str.casefold`` and capped at 200.
    """
    rows = (
        db.query(UserEntry.tags)
        .filter(UserEntry.user_id == user_id, UserEntry.tags.isnot(None))
        .order_by(UserEntry.id.asc())
        .all()
    )
    seen: dict[str, str] = {}
    for row in rows:
        parsed = loads(row[0], [])
        if not isinstance(parsed, list):
            continue
        for tag in parsed:
            if not isinstance(tag, str):
                continue
            key = tag.casefold()
            if key not in seen:
                seen[key] = tag
    return sorted(seen.values(), key=str.casefold)[:_MAX_AVAILABLE_TAGS]
