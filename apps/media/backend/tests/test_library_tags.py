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


def test_tags_filter_and_semantics(client):
    _add(client, "Both", ["x", "y"])
    _add(client, "Only X", ["x"])
    _add(client, "Only Y", ["y"])
    _add(client, "Empty", [])
    _add(client, "Bare")
    both = _library(client, [("tags", "x"), ("tags", "y"), ("sort", "title")])
    assert _titles(both) == ["Both"]
    assert both["total"] == 1
    assert both["has_more"] is False
    only_x = _library(client, {"tags": "x", "sort": "title"})
    assert _titles(only_x) == ["Both", "Only X"]
    assert only_x["total"] == 2


def test_tags_filter_case_insensitive_ascii(client):
    _add(client, "Cozy", ["Comfort"])
    _add(client, "Other", ["sci-fi"])
    for value in ("comfort", "COMFORT", "Comfort", "  Comfort  "):
        payload = _library(client, {"tags": value, "sort": "title"})
        assert _titles(payload) == ["Cozy"]
        assert payload["total"] == 1
    repeated = _library(client, [("tags", "comfort"), ("tags", "COMFORT"), ("sort", "title")])
    assert _titles(repeated) == ["Cozy"]


def test_tags_filter_no_substring_or_wildcard_match(client):
    _add(client, "Rock", ["rock"])
    _add(client, "Hard", ["hard rock"])
    _add(client, "Rocky", ["rocky"])
    _add(client, "Underscore", ["a_b"])
    _add(client, "Any char", ["axb"])
    _add(client, "Percent", ["100%"])
    _add(client, "Percent wild", ["100X"])
    _add(client, "Hundred", ["100"])

    rock = _library(client, {"tags": "rock", "sort": "title"})
    assert _titles(rock) == ["Rock"]
    underscore = _library(client, {"tags": "a_b", "sort": "title"})
    assert _titles(underscore) == ["Underscore"]
    percent = _library(client, {"tags": "100%", "sort": "title"})
    assert _titles(percent) == ["Percent"]


def test_tags_filter_escaped_comma_tag(client):
    _add(client, "Joined", ["rock,roll"])
    _add(client, "Split", ["rock", "roll"])
    _add(client, "Reversed", ["roll", "rock"])
    payload = _library(client, {"tags": "rock,roll", "sort": "title"})
    assert _titles(payload) == ["Joined"]
    assert payload["total"] == 1
    with client.app.state.database.sessionmaker() as db:
        stored = db.query(UserEntry.tags).filter(UserEntry.tags.isnot(None)).all()
    assert any(row[0] == '["rock,roll"]' for row in stored)


def test_tags_filter_non_ascii_exact(client):
    # ensure_ascii stores É as \\u00c9. The filter lowercases in Python before
    # json.dumps, so a query looks for \\u00e9. Stored "café" matches both
    # spellings. Stored "CAFÉ" matches neither, because SQL lower() does not
    # fold the escape.
    exact = _add(client, "Exact", ["café"])
    upper = _add(client, "Upper", ["CAFÉ"])
    with client.app.state.database.sessionmaker() as db:
        exact_row = db.get(UserEntry, exact["id"])
        upper_row = db.get(UserEntry, upper["id"])
        assert exact_row is not None and upper_row is not None
        assert exact_row.tags == '["caf\\u00e9"]'
        assert upper_row.tags == '["CAF\\u00c9"]'
    for value in ("café", "CAFÉ"):
        payload = _library(client, {"tags": value, "sort": "title"})
        assert _titles(payload) == ["Exact"]
        assert "café" in payload["available_tags"]
        assert "CAFÉ" not in payload["available_tags"]


def test_tags_filter_combines_with_other_filters_and_paging(client):
    fields = {"status": "completed", "favorite": True}
    _add(client, "Alpha A", ["sci-fi", "Comfort"], **fields)
    _add(client, "Alpha B", ["sci-fi", "Comfort"], **fields)
    _add(client, "Alpha C", ["sci-fi", "Comfort"], **fields)
    _add(client, "Alpha Missing", ["sci-fi"], **fields)
    _add(client, "Alpha Want", ["sci-fi", "Comfort"], favorite=True, status="want")
    _add(client, "Alpha Plain", ["sci-fi", "Comfort"], status="completed")
    _add(
        client,
        "Alpha Book",
        ["sci-fi", "Comfort"],
        kind="book",
        status="completed",
        favorite=True,
    )
    _add(client, "Other Title", ["sci-fi", "Comfort"], **fields)
    _add(client, "Alpha Empty", [], **fields)
    _add(client, "Alpha Bare", **fields)

    common = {
        "kind": "movie",
        "status": "completed",
        "q": "Alpha",
        "favorite": True,
        "sort": "title",
        "tags": ["sci-fi", "Comfort"],
    }
    full = _library(client, {**common, "limit": 10})
    assert _titles(full) == ["Alpha A", "Alpha B", "Alpha C"]
    assert full["total"] == 3
    assert full["has_more"] is False
    page = _library(client, {**common, "offset": 1, "limit": 1})
    assert _titles(page) == ["Alpha B"]
    assert page["total"] == 3
    assert page["offset"] == 1
    assert page["limit"] == 1
    assert page["has_more"] is True
    last = _library(client, {**common, "offset": 2, "limit": 1})
    assert _titles(last) == ["Alpha C"]
    assert last["has_more"] is False


def test_tags_filter_validation(client):
    _add(client, "Kept", ["sci-fi"])
    token = "b" * 100
    _add(client, "Long", [token])

    too_many = client.get("/api/library", params=[("tags", f"t{index}") for index in range(11)])
    assert too_many.status_code == 422
    assert too_many.json()["detail"] == _TOO_MANY

    too_long = client.get("/api/library", params={"tags": "a" * 101})
    assert too_long.status_code == 422
    assert too_long.json()["detail"] == _TOO_LONG

    ignored = client.get("/api/library", params=[("tags", ""), ("tags", "   "), ("sort", "title")])
    assert ignored.status_code == 200, ignored.text
    assert _titles(ignored.json()) == ["Kept", "Long"]
    assert ignored.json()["total"] == 2

    collapsed = client.get("/api/library", params=[("tags", "sci-fi")] * 11 + [("sort", "title")])
    assert collapsed.status_code == 200, collapsed.text
    assert _titles(collapsed.json()) == ["Kept"]

    boundary = client.get("/api/library", params={"tags": token, "sort": "title"})
    assert boundary.status_code == 200, boundary.text
    assert _titles(boundary.json()) == ["Long"]

    ten = [("tags", token)] + [("tags", f"n{index}") for index in range(9)]
    accepted = client.get("/api/library", params=ten)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["items"] == []
    assert accepted.json()["total"] == 0


def test_available_tags_distinct_sorted_capped(client):
    _add(client, "Early", ["Comfort", "sci-fi"])
    _add(client, "Later", ["comfort", "SCI-FI", "zeta"])
    extras = [f"t{index:03d}" for index in range(202)]
    for start in range(0, 200, 20):
        _add(client, f"Batch {start}", extras[start : start + 20])
    _add(client, "Tail", extras[200:])
    payload = _library(client)
    found = payload["available_tags"]
    assert found == sorted(found, key=str.casefold)
    assert found[0] == "Comfort"
    assert found[1] == "sci-fi"
    assert found[2] == "t000"
    assert found[-1] == "t197"
    assert len(found) == 200
    assert "comfort" not in found
    assert "SCI-FI" not in found
    assert "zeta" not in found
    assert "t198" not in found
    assert payload["total"] == 13


def test_available_tags_ignores_other_filters(client):
    _add(
        client,
        "Alpha Movie",
        ["from-movie", "shared"],
        kind="movie",
        status="completed",
        favorite=True,
    )
    _add(client, "Beta Book", ["from-book"], kind="book", status="want")
    payload = _library(
        client,
        {
            "kind": "movie",
            "status": "completed",
            "q": "Alpha",
            "favorite": True,
            "sort": "title",
            "tags": ["from-movie"],
        },
    )
    assert _titles(payload) == ["Alpha Movie"]
    assert payload["total"] == 1
    assert payload["available_tags"] == ["from-book", "from-movie", "shared"]


def test_library_without_tags_unchanged(client):
    _add(client, "Bravo", ["sci-fi"])
    _add(client, "Alpha")
    _add(client, "Charlie", [])
    plain = _library(client, {"sort": "title"})
    blank = _library(client, [("sort", "title"), ("tags", ""), ("tags", "   ")])
    assert _titles(plain) == ["Alpha", "Bravo", "Charlie"]
    assert plain["total"] == 3
    assert plain["has_more"] is False
    assert _titles(blank) == _titles(plain)
    assert blank["total"] == plain["total"]
    assert [item["id"] for item in blank["items"]] == [item["id"] for item in plain["items"]]
    activity = _library(client)
    explicit = _library(client, {"sort": "activity"})
    assert [item["id"] for item in activity["items"]] == [item["id"] for item in explicit["items"]]
    assert activity["total"] == explicit["total"] == 3
    assert set(plain) == {"items", "total", "offset", "limit", "has_more", "available_tags"}


def test_tags_filter_owner_scoped(client):
    from apps.server.auth import Principal, require_principal

    _add(client, "Mine", ["shared", "only-mine"])
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    _add(client, "Theirs", ["shared", "only-theirs"])
    theirs = _library(client, {"tags": "shared", "sort": "title"})
    assert _titles(theirs) == ["Theirs"]
    assert theirs["total"] == 1
    assert theirs["available_tags"] == ["only-theirs", "shared"]
    hidden = _library(client, {"tags": "only-mine"})
    assert hidden["items"] == []
    assert hidden["total"] == 0
    assert "only-mine" not in hidden["available_tags"]
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    mine = _library(client, {"tags": "shared", "sort": "title"})
    assert _titles(mine) == ["Mine"]
    assert mine["total"] == 1
    assert mine["available_tags"] == ["only-mine", "shared"]
    assert "only-theirs" not in mine["available_tags"]
