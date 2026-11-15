"""Library tag filter: Unicode whole strings, owner scope, and SQL pagination."""

from apps.media.backend.models import UserEntry
from apps.media.backend.services.tag_filter import tags_clause

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
                .filter(UserEntry.user_id == 1, tags_clause(tags, db))
                .order_by(UserEntry.id)
                .all()
            ]

    assert matched(["SCI-FI", "comfort"]) == [both["id"]]
    assert matched(["rock"]) == []
    assert matched(["a_b"]) == [literal["id"]]


def test_tags_filter_owner_scoped(client):
    from apps.server.auth import Principal, require_principal

    _add(client, "Mine", ["shared", "only-mine", "CAFÉ"])
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    _add(client, "Theirs", ["shared", "only-theirs", "café"])
    theirs = _library(client, {"tags": "shared", "sort": "title"})
    assert _titles(theirs) == ["Theirs"]
    assert theirs["total"] == 1
    assert theirs["available_tags"] == ["café", "only-theirs", "shared"]
    assert _titles(_library(client, {"tags": "CAFÉ"})) == ["Theirs"]
    hidden = _library(client, {"tags": "only-mine"})
    assert hidden["items"] == []
    assert hidden["total"] == 0
    assert "only-mine" not in hidden["available_tags"]
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    mine = _library(client, {"tags": "shared", "sort": "title"})
    assert _titles(mine) == ["Mine"]
    assert mine["total"] == 1
    assert mine["available_tags"] == ["CAFÉ", "only-mine", "shared"]
    assert _titles(_library(client, {"tags": "café"})) == ["Mine"]
    assert "only-theirs" not in mine["available_tags"]
