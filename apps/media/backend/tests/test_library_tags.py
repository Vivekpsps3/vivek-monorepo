"""Library tag filter: anchored JSON tokens, owner scope, and available_tags."""

import pytest
from fastapi import HTTPException

from apps.media.backend.models import UserEntry
from apps.media.backend.services.tag_filter import available_tags, parse_tag_params, tags_clause

_TOO_MANY = "Choose at most 10 tags."
_TOO_LONG = "That tag is too long to filter by."


def _add(client, title, tags=None, **fields):
    body = {"kind": "movie", "title": title, "status": "want"}
    body.update(fields)
    created = client.post("/api/library", json=body)
    assert created.status_code == 200, created.text
    entry = created.json()
    if tags is not None:
        patched = client.patch(f"/api/entries/{entry['id']}", json={"tags": tags})
        assert patched.status_code == 200, patched.text
        entry = patched.json()
    return entry


def _library(client, params=None):
    response = client.get("/api/library", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _titles(payload):
    return [item["title"] for item in payload["items"]]


def test_parse_tag_params_trims_dedupes_and_limits():
    assert parse_tag_params([" sci-fi ", "Comfort", "comfort", "", "   ", " " * 101]) == [
        "sci-fi",
        "Comfort",
    ]
    assert parse_tag_params([]) == []
    assert parse_tag_params(["a" * 100]) == ["a" * 100]
    assert parse_tag_params([f"t{i}" for i in range(10)] + ["T0"]) == [f"t{i}" for i in range(10)]

    with pytest.raises(HTTPException) as too_many:
        parse_tag_params([f"t{i}" for i in range(11)])
    assert too_many.value.status_code == 422
    assert too_many.value.detail == _TOO_MANY

    with pytest.raises(HTTPException) as too_long:
        parse_tag_params(["ok", "a" * 101])
    assert too_long.value.status_code == 422
    assert too_long.value.detail == _TOO_LONG


def test_tags_clause_matches_anchored_tokens(client):
    both = _add(client, "Both", ["Sci-Fi", "Comfort"])
    _add(client, "One", ["sci-fi"])
    _add(client, "Hard", ["hard rock"])
    literal = _add(client, "Literal", ["a_b"])
    _add(client, "Wild", ["axb"])

    def matched(tags):
        with client.app.state.database.sessionmaker() as db:
            return [
                row.id
                for row in db.query(UserEntry.id)
                .filter(UserEntry.user_id == 1, tags_clause(tags))
                .order_by(UserEntry.id)
                .all()
            ]

    assert matched(["SCI-FI", "comfort"]) == [both["id"]]
    assert matched(["rock"]) == []
    assert matched(["a_b"]) == [literal["id"]]


def test_available_tags_keeps_first_spelling_and_skips_bad_json(client):
    _add(client, "Early", ["Comfort", "sci-fi"])
    _add(client, "Later", ["comfort", "zeta"])
    _add(client, "Empty", [])
    _add(client, "Bare")
    bad = _add(client, "Bad", ["temp"])
    blob = _add(client, "Blob", ["temp"])
    mixed = _add(client, "Mixed", ["temp"])
    with client.app.state.database.sessionmaker() as db:
        for entry_id, raw in (
            (bad["id"], "{not-json"),
            (blob["id"], '{"a":1}'),
            (mixed["id"], '["keep", 1, "Keep"]'),
        ):
            row = db.get(UserEntry, entry_id)
            assert row is not None
            row.tags = raw
        db.commit()
        assert available_tags(db, 1) == ["Comfort", "keep", "sci-fi", "zeta"]
        assert available_tags(db, 2) == []


