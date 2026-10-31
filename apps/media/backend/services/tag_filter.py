"""Owner-scoped tag filter over the JSON text stored on UserEntry.tags.

Tags stay compact JSON (``json.dumps`` with the default ``ensure_ascii``).
Each requested tag is matched as a whole JSON string, anchored on the
brackets and commas around it, so a shorter tag cannot hit a neighbour
and LIKE wildcards stay literal.
"""

import json

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
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


def tags_clause(tags: list[str]):
    """AND of anchored JSON tokens. ASCII case is folded; ``%`` and ``_`` are literal."""
    clauses = []
    for tag in tags:
        tok = json.dumps(tag.lower())
        clauses.append(
            or_(
                *(
                    func.lower(UserEntry.tags).contains(pattern, autoescape=True)
                    for pattern in (
                        "[" + tok + "]",
                        "[" + tok + ",",
                        "," + tok + ",",
                        "," + tok + "]",
                    )
                )
            )
        )
    return and_(*clauses)


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
