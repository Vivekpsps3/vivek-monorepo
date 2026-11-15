"""Season watched marks and ratings stay off the show's written opinion."""

import sqlite3

from apps.server.auth import Principal, require_principal


def _seasons(payload):
    return {row["season_number"]: row for row in payload["show"]["seasons"]}


def _show(client, **extra):
    body = {
        "kind": "tv",
        "title": "Serial",
        "status": "in_progress",
        "rating": 6,
        "review": "The whole show.",
        "summary": "One line.",
    }
    body.update(extra)
    created = client.post("/api/library", json=body)
    assert created.status_code == 200
    return created.json()


def test_seasons_belong_to_the_owner_even_on_a_shared_catalog(client, tmp_path):
    payload = {
        "source": "tvmaze",
        "source_id": "9001",
        "kind": "tv",
        "title": "Shared Show",
        "status": "in_progress",
        "rating": 6,
        "review": "Mine.",
    }
    first = client.post("/api/library/from-provider", json=payload)
    assert first.status_code == 200
    first_id = first.json()["id"]
    for episode in (
        {"season_number": 1, "episode_number": 1, "title": "Pilot"},
        {"season_number": 2, "episode_number": 1, "title": "Return"},
    ):
        added = client.post(f"/api/entries/{first_id}/episodes", json=episode)
        assert added.status_code == 200
    assert (
        client.post(
            f"/api/entries/{first_id}/seasons",
            json={
                "season_number": 2,
                "watched": True,
                "rating": 9.5,
            },
        ).status_code
        == 200
    )

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.get(f"/api/entries/{first_id}").status_code == 404
    assert (
        client.post(
            f"/api/entries/{first_id}/seasons",
            json={
                "season_number": 1,
                "watched": True,
                "rating": 1,
            },
        ).status_code
        == 404
    )
    second = client.post(
        "/api/library/from-provider", json={**payload, "rating": 4, "review": "Theirs."}
    ).json()
    assert second["already_saved"] is False
    assert second["id"] != first_id
    seasons = _seasons(second)
    assert seasons[1]["watched"] is False
    assert seasons[1]["rating"] is None
    assert seasons[2]["rating"] is None
    assert seasons[1]["episode_count"] == 1
    theirs = client.post(
        f"/api/entries/{second['id']}/seasons",
        json={
            "season_number": 1,
            "watched": True,
            "rating": 3,
        },
    ).json()
    assert _seasons(theirs)[1]["rating"] == 3
    assert theirs["review"] == "Theirs."

    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    owner = client.get(f"/api/entries/{first_id}").json()
    assert owner["review"] == "Mine."
    assert owner["rating"] == 6
    assert _seasons(owner)[2]["rating"] == 9.5
    assert _seasons(owner)[1]["rating"] is None

    movie = client.post(
        "/api/library",
        json={
            "kind": "movie",
            "title": "Film",
            "rating": 8,
            "review": "Keep.",
        },
    ).json()
    denied = client.post(
        f"/api/entries/{movie['id']}/seasons",
        json={
            "season_number": 1,
            "watched": True,
            "rating": 1,
        },
    )
    assert denied.status_code == 422
    assert denied.json()["detail"] == "Seasons belong on a show."
    assert client.get(f"/api/entries/{movie['id']}").json()["review"] == "Keep."
    assert (
        client.post(
            f"/api/entries/{first_id}/seasons",
            json={
                "season_number": 201,
                "watched": True,
                "rating": 1,
            },
        ).status_code
        == 422
    )

    assert client.delete(f"/api/entries/{first_id}").status_code == 200
    rows = (
        sqlite3.connect(tmp_path / "media.db")
        .execute("select user_id, season_number, rating from season_progress")
        .fetchall()
    )
    assert rows == [(2, 1, 3.0)]
