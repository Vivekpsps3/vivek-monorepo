"""Private journal rules. These tests do not call live metadata providers."""

import httpx

from apps.server.auth import require_principal


def test_private_routes_reject_a_signed_out_browser(client):
    client.app.dependency_overrides.pop(require_principal, None)
    assert client.get("/api/health").status_code == 200
    denied = client.get("/api/library")
    assert denied.status_code == 401
    assert denied.json()["detail"] == "Login required"
    assert client.get("/api/summary").status_code == 401
    assert client.get("/api/calendar").status_code == 401
    assert client.post("/api/library", json={"kind": "movie", "title": "Nope"}).status_code == 401


def test_manual_entry_rating_and_review_round_trip(client):
    created = client.post(
        "/api/library",
        json={
            "kind": "movie",
            "title": "Local Film",
            "creator": "A Director",
            "year": 2024,
            "status": "completed",
            "rating": 8.5,
            "review": "A complete thought.",
        },
    )
    assert created.status_code == 200
    entry_id = created.json()["id"]
    assert created.json()["rating"] == 8.5
    assert created.json()["review"] == "A complete thought."
    assert created.json()["catalog"]["source"] == "manual"

    edited = client.patch(f"/api/entries/{entry_id}", json={"rating": 9, "review": "Revised."})
    assert edited.status_code == 200
    assert edited.json()["rating"] == 9
    assert edited.json()["review"] == "Revised."

    cleared = client.patch(f"/api/entries/{entry_id}", json={"rating": None})
    assert cleared.json()["rating"] is None
    assert cleared.json()["review"] == "Revised."

    zero = client.patch(f"/api/entries/{entry_id}", json={"rating": 0})
    assert zero.json()["rating"] == 0
    assert client.patch(f"/api/entries/{entry_id}", json={"rating": 7.2}).status_code == 422

    again = client.get(f"/api/entries/{entry_id}")
    assert again.json()["rating"] == 0
    assert again.json()["review"] == "Revised."


def test_episode_progress_survives_reload(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-15")
    show = client.post(
        "/api/library", json={"kind": "tv", "title": "Serial", "status": "in_progress"}
    ).json()
    assert (
        client.post(
            f"/api/entries/{show['id']}/episodes",
            json={
                "season_number": 1,
                "episode_number": 1,
                "title": "Pilot",
                "air_date": "2026-09-01",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/entries/{show['id']}/episodes",
            json={
                "season_number": 1,
                "episode_number": 2,
                "title": "Next",
                "air_date": "2026-10-20",
            },
        ).status_code
        == 200
    )
    stepped = client.post(f"/api/entries/{show['id']}/episodes/next")
    assert stepped.status_code == 200
    state = stepped.json()["show"]
    assert state["watched_count"] == 1
    assert state["next_episode"] is None
    assert state["upcoming_episodes"][0]["episode_number"] == 2
    assert state["caught_up"] is True
    assert client.post(f"/api/entries/{show['id']}/episodes/next").status_code == 409
    reloaded = client.get(f"/api/entries/{show['id']}").json()["show"]
    assert reloaded["episodes"][0]["watched"] is True
    assert reloaded["episodes"][1]["watched"] is False


def test_watched_episode_can_be_marked_unwatched(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-15")
    show = client.post(
        "/api/library", json={"kind": "tv", "title": "Serial", "status": "in_progress"}
    ).json()
    added = client.post(
        f"/api/entries/{show['id']}/episodes",
        json={
            "season_number": 1,
            "episode_number": 1,
            "title": "Pilot",
            "air_date": "2026-10-01",
        },
    )
    assert added.status_code == 200
    episode = added.json()["show"]["episodes"][0]
    marked = client.post(
        f"/api/entries/{show['id']}/episodes/{episode['id']}/watched",
        json={"watched": True, "watched_on": "2026-10-02"},
    )
    assert marked.status_code == 200
    assert marked.json()["show"]["episodes"][0]["watched"] is True
    assert marked.json()["show"]["watched_count"] == 1
    cleared = client.post(
        f"/api/entries/{show['id']}/episodes/{episode['id']}/watched",
        json={"watched": False},
    )
    assert cleared.status_code == 200
    row = cleared.json()["show"]["episodes"][0]
    assert row["watched"] is False
    assert row["watched_on"] is None
    assert cleared.json()["show"]["watched_count"] == 0
    assert cleared.json()["show"]["next_episode"]["id"] == episode["id"]
    again = client.get(f"/api/entries/{show['id']}").json()["show"]
    assert again["episodes"][0]["watched"] is False
    assert again["episodes"][0]["watched_on"] is None
    assert again["watched_count"] == 0


def test_future_episode_cannot_be_marked_watched(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-15")
    show = client.post(
        "/api/library", json={"kind": "tv", "title": "Serial", "status": "in_progress"}
    ).json()

    def add(number, title, air_date):
        body = {"season_number": 1, "episode_number": number, "title": title}
        if air_date is not None:
            body["air_date"] = air_date
        added = client.post(f"/api/entries/{show['id']}/episodes", json=body)
        assert added.status_code == 200
        return next(
            row for row in added.json()["show"]["episodes"] if row["episode_number"] == number
        )

    future = add(1, "Later", "2026-10-16")
    today = add(2, "Today", "2026-10-15")
    aired = add(3, "Aired", "2026-10-14")
    undated = add(4, "Undated", None)
    blocked = client.post(
        f"/api/entries/{show['id']}/episodes/{future['id']}/watched",
        json={"watched": True},
    )
    assert blocked.status_code == 422
    assert "not aired" in blocked.json()["detail"].lower()
    kept = client.get(f"/api/entries/{show['id']}").json()["show"]["episodes"]
    assert next(row for row in kept if row["id"] == future["id"])["watched"] is False
    for episode in (today, aired, undated):
        marked = client.post(
            f"/api/entries/{show['id']}/episodes/{episode['id']}/watched",
            json={"watched": True},
        )
        assert marked.status_code == 200
        row = next(
            item for item in marked.json()["show"]["episodes"] if item["id"] == episode["id"]
        )
        assert row["watched"] is True
    cleared = client.post(
        f"/api/entries/{show['id']}/episodes/{future['id']}/watched",
        json={"watched": False},
    )
    assert cleared.status_code == 200


def test_release_awareness_uses_the_test_clock_and_date_precision(client, monkeypatch):
    from datetime import date

    from apps.media.backend.models import Release
    from apps.media.backend.services.summary import classify_release

    current = date(2026, 10, 15)

    def row(day, precision, status):
        released = date.fromisoformat(day) if day else None
        if released and precision == "month":
            released = released.replace(day=1)
        if released and precision == "year":
            released = date(released.year, 1, 1)
        return Release(catalog_id=1, released_on=released, precision=precision, status=status)

    expected = {
        ("2026-10-15", "day", "scheduled"): "today",
        ("2026-10-16", "day", "scheduled"): "tomorrow",
        ("2026-10-20", "day", "scheduled"): "this_week",
        ("2026-10-20", "month", "scheduled"): "this_month",
        ("2026-12-02", "day", "scheduled"): "upcoming",
        ("2027-05-02", "year", "scheduled"): "upcoming",
        ("2026-10-10", "day", "released"): "recent",
        ("2026-09-01", "day", "postponed"): "postponed",
        (None, "unknown", "unknown"): "unknown",
    }
    for key, label in expected.items():
        assert classify_release(row(*key), current) == label
    assert classify_release(row("2026-01-01", "year", "scheduled"), date(2026, 1, 1)) == "upcoming"

    monkeypatch.setenv("MEDIA_TODAY", "2026-10-15")
    assert (
        client.post(
            "/api/library",
            json={
                "kind": "movie",
                "title": "Month",
                "status": "anticipating",
                "anticipated": True,
                "release_on": "2026-10-20",
                "release_precision": "month",
                "release_status": "scheduled",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/library",
            json={
                "kind": "game",
                "title": "Today",
                "status": "anticipating",
                "anticipated": True,
                "release_on": "2026-10-15",
                "release_precision": "day",
            },
        ).status_code
        == 200
    )
    upcoming = {item["title"]: item for item in client.get("/api/summary").json()["upcoming"]}
    assert upcoming["Month"]["when"] == "this_month"
    assert upcoming["Month"]["release_on"] == "2026-10-01"
    assert upcoming["Today"]["when"] == "today"


def test_library_filters_and_owner_isolation(client):
    from apps.server.auth import Principal, require_principal

    movie = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Secret",
            "creator": "Ada",
            "status": "completed",
            "rating": 10,
        },
    ).json()
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.get(f"/api/entries/{movie['id']}").status_code == 404
    assert client.get("/api/library").json()["items"] == []
    assert client.get("/api/summary").json()["counts"]["library"] == 0
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    listed = client.get("/api/library", params={"kind": "album", "sort": "rating"}).json()["items"]
    assert [item["title"] for item in listed] == ["Secret"]
    page = client.get("/")
    assert page.status_code == 200
    assert "Secret" not in page.text


def test_provider_metadata_cannot_overwrite_a_review_and_outages_keep_saved_rows(
    client, monkeypatch
):
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL1W",
            "kind": "book",
            "title": "Original",
            "creator": "Author",
            "external_ratings": [
                {"provider": "openlibrary", "label": "Open Library", "value": 4.2, "scale": "0–5"}
            ],
            "review": "Mine.",
            "rating": 7,
        },
    ).json()
    assert saved["already_saved"] is False
    again = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL1W",
            "kind": "book",
            "title": "Original",
            "review": "Should not replace.",
            "rating": 1,
        },
    ).json()
    assert again["already_saved"] is True
    assert again["review"] == "Mine."
    assert again["rating"] == 7
    patched = client.patch(
        f"/api/entries/{saved['id']}", json={"title": "Changed", "overview": "Filled blank"}
    ).json()
    assert patched["catalog"]["title"] == "Original"
    assert patched["catalog"]["overview"] == "Filled blank"
    assert patched["catalog"]["external_ratings"] == []
    assert patched["catalog"]["extra"]["metadata_pending"] is True

    def boom(*_args, **_kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr("apps.media.backend.services.providers.openlibrary_search", boom)
    found = client.get("/api/search", params={"q": "original", "kind": "book"})
    assert found.status_code == 200
    assert found.json()["providers"]["openlibrary"] == "error"
    assert client.get("/api/library").json()["items"][0]["title"] == "Original"


def test_search_uses_a_cache_and_marks_saved_items(client, monkeypatch):
    calls = {"n": 0}

    def once(*_args, **_kwargs):
        calls["n"] += 1
        return [
            {
                "source": "musicbrainz",
                "source_id": "mb-1",
                "kind": "track",
                "title": "Song",
                "creator": "Artist",
                "year": 2020,
                "overview": None,
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [
                    {"released_on": "2020-01-01", "precision": "year", "status": "released"}
                ],
                "episodes": [],
            }
        ]

    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_search", once)
    first = client.get("/api/search", params={"q": "song", "kind": "track"}).json()
    second = client.get("/api/search", params={"q": "song", "kind": "track"}).json()
    assert calls["n"] == 1
    assert second["results"][0]["title"] == "Song"
    assert first["results"][0]["already_saved"] is False
    added = client.post(
        "/api/library/from-provider",
        json={**first["results"][0], "status": "completed", "rating": 10},
    ).json()
    assert added["releases"] == []
    assert added["catalog"]["extra"]["metadata_pending"] is True
    assert added["catalog"]["title"] == "Song"
    marked = client.get("/api/search", params={"q": "song", "kind": "track"}).json()
    assert marked["results"][0]["already_saved"] is True


def test_movie_search_reads_the_public_page_without_a_key(client, monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("keyed catalog was called")

    def public(_http, query):
        assert query == "inception"
        return [
            {
                "source": "tmdb",
                "source_id": "movie:27205",
                "kind": "movie",
                "title": "Inception",
                "creator": None,
                "year": 2010,
                "overview": "A dream.",
                "artwork_url": "https://image.tmdb.org/t/p/w342/poster.jpg",
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        ]

    monkeypatch.setattr("apps.media.backend.services.providers.tmdb_search", forbidden)
    monkeypatch.setattr("apps.media.backend.services.providers.itunes_search", forbidden)
    monkeypatch.setattr("apps.media.backend.services.providers.tvmaze_search", forbidden)
    monkeypatch.setattr("apps.media.backend.services.providers.tmdb_public_search", public)
    found = client.get("/api/search", params={"q": "inception", "kind": "movie"})
    assert found.status_code == 200
    body = found.json()
    assert body["results"][0]["title"] == "Inception"
    assert body["results"][0]["artwork_url"].endswith("/poster.jpg")
    assert body["providers"]["tmdb"] == "ok"
    assert body["results"][0]["provenance"]["coverage"] == "extraction"
    assert "itunes" not in body["providers"]
    saved = client.post(
        "/api/library/from-provider", json={**body["results"][0], "status": "want"}
    ).json()
    assert saved["catalog"]["source"] == "tmdb"
    assert saved["catalog"]["title"] == "Inception"


def test_scrape_mode_reads_public_catalogs_and_keeps_tmdb_when_both_match(client, monkeypatch):
    monkeypatch.setenv("MEDIA_SCRAPE_MODE", "1")
    monkeypatch.setenv("TMDB_API_KEY", "test-key")

    def tmdb(*_args, **_kwargs):
        return [
            {
                "source": "tmdb",
                "source_id": "movie:27205",
                "kind": "movie",
                "title": "Inception",
                "creator": None,
                "year": 2010,
                "overview": "A dream.",
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [
                    {"released_on": "2010-07-16", "precision": "day", "status": "released"}
                ],
                "episodes": [],
            }
        ]

    def itunes(*_args, **_kwargs):
        return [
            {
                "source": "itunes",
                "source_id": "413416",
                "kind": "movie",
                "title": "Inception",
                "creator": "Christopher Nolan",
                "year": 2010,
                "overview": "From the store.",
                "artwork_url": None,
                "genres": ["Action"],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            },
            {
                "source": "itunes",
                "source_id": "99",
                "kind": "movie",
                "title": "Inception: The App",
                "creator": None,
                "year": 2010,
                "overview": None,
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            },
        ]

    monkeypatch.setattr("apps.media.backend.services.providers.tmdb_search", tmdb)
    monkeypatch.setattr("apps.media.backend.services.providers.itunes_search", itunes)
    found = client.get("/api/search", params={"q": "inception", "kind": "movie"}).json()
    assert [item["source"] for item in found["results"]] == ["tmdb", "itunes"]
    assert found["results"][0]["provenance"]["coverage"] == "official"
    assert found["results"][1]["provenance"]["provider"] == "itunes"
    assert found["results"][1]["title"] == "Inception: The App"
    assert found["providers"]["itunes"] == "ok"
    saved = client.post(
        "/api/library/from-provider", json={**found["results"][1], "status": "want"}
    ).json()
    assert saved["catalog"]["source"] == "itunes"
    assert saved["catalog"]["title"] == "Inception: The App"


def test_tvmaze_summary_is_plain_text():
    from apps.media.backend.services.providers import tvmaze_search

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.tvmaze.com"
        return httpx.Response(
            200,
            json=[
                {
                    "show": {
                        "id": 169,
                        "name": "Breaking Bad",
                        "premiered": "2008-01-20",
                        "summary": "<p>A <b>teacher</b> &amp; a student.</p>",
                        "image": {
                            "medium": "https://static.tvmaze.com/uploads/images/medium_portrait/0/2400.jpg"
                        },
                        "genres": ["Drama"],
                        "rating": {"average": 9.2},
                        "network": {"name": "AMC"},
                    }
                }
            ],
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        rows = tvmaze_search(http, "breaking bad")
    assert rows[0]["overview"] == "A teacher & a student."
    assert rows[0]["external_ratings"][0]["label"] == "TVMaze"
    assert rows[0]["external_ratings"][0]["scale"] == "0–10"
    assert rows[0]["creator"] == "AMC"
    assert rows[0]["artwork_url"].startswith("https://")


def test_series_and_games_search_without_keys(client, monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("keyed catalog was called")

    def shows(_http, query):
        assert query == "breaking bad"
        return [
            {
                "source": "tvmaze",
                "source_id": "169",
                "kind": "tv",
                "title": "Breaking Bad",
                "creator": "AMC",
                "year": 2008,
                "overview": "A teacher.",
                "artwork_url": "https://static.tvmaze.com/uploads/images/medium_portrait/0/2400.jpg",
                "genres": ["Drama"],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        ]

    def games(_http, query):
        assert query == "hades"
        return [
            {
                "source": "steam",
                "source_id": "1145360",
                "kind": "game",
                "title": "Hades",
                "creator": None,
                "year": None,
                "overview": None,
                "artwork_url": (
                    "https://shared.akamai.steamstatic.com/store_item_assets/"
                    "steam/apps/1145360/capsule_231x87.jpg"
                ),
                "genres": [],
                "external_ratings": [],
                "extra": {"platforms": ["Windows"]},
                "releases": [],
                "episodes": [],
            }
        ]

    monkeypatch.setattr("apps.media.backend.services.providers.tmdb_search", forbidden)
    monkeypatch.setattr("apps.media.backend.services.providers.rawg_search", forbidden)
    monkeypatch.setattr("apps.media.backend.services.providers.tvmaze_search", shows)
    monkeypatch.setattr("apps.media.backend.services.providers.steam_search", games)
    series = client.get("/api/search", params={"q": "breaking bad", "kind": "tv"}).json()
    assert series["results"][0]["title"] == "Breaking Bad"
    assert series["results"][0]["artwork_url"].startswith("https://static.tvmaze.com/")
    assert series["providers"]["tvmaze"] == "ok"
    assert "tmdb" not in series["providers"]
    assert series["results"][0]["provenance"]["provider"] == "tvmaze"
    game = client.get("/api/search", params={"q": "hades", "kind": "game"}).json()
    assert game["results"][0]["source"] == "steam"
    assert game["results"][0]["artwork_url"].startswith("https://shared.akamai.steamstatic.com/")
    assert game["providers"]["steam"] == "ok"
    assert game["providers"]["rawg"] == "unconfigured"
    saved = client.post(
        "/api/library/from-provider", json={**game["results"][0], "status": "want"}
    ).json()
    assert saved["catalog"]["source"] == "steam"
    assert saved["catalog"]["title"] == "Hades"


def test_steam_search_keeps_title_and_capsule():
    from apps.media.backend.services.providers import steam_search

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "store.steampowered.com"
        assert request.url.params["term"] == "hades"
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "type": "app",
                        "name": "Hades",
                        "id": 1145360,
                        "tiny_image": (
                            "https://shared.akamai.steamstatic.com/store_item_assets/"
                            "steam/apps/1145360/capsule_231x87.jpg?t=1"
                        ),
                        "metascore": "93",
                        "platforms": {"windows": True, "mac": True, "linux": False},
                    },
                    {"type": "bundle", "name": "Skip", "id": 1},
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        rows = steam_search(http, "hades")
    assert rows[0]["title"] == "Hades"
    assert rows[0]["source_id"] == "1145360"
    assert rows[0]["artwork_url"].endswith("capsule_231x87.jpg")
    assert "?" not in rows[0]["artwork_url"]
    assert rows[0]["external_ratings"] == []
    assert rows[0]["extra"]["platforms"] == ["Windows", "Mac"]
    assert len(rows) == 1


def test_home_page_and_tokens_render_without_private_rows(client):
    html = client.get("/").text
    assert "Media" in html
    assert "media-theme" in html
    assert 'href="#/calendar"' in html
    assert client.get("/tokens.css").status_code == 200
    assert "controls.css" in html
    assert client.get("/controls.css").status_code == 200
    assert client.get("/favicon.svg").status_code == 200
