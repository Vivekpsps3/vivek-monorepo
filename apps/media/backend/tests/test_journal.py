"""Private journal rules. These tests do not call live metadata providers."""

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


def test_release_awareness_uses_the_test_clock_and_date_precision(client, monkeypatch):
    from datetime import date

    from apps.media.backend.models import Release
    from apps.media.backend.services.when import classify_release

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
        release = row(*key)
        assert (
            classify_release(release.precision, release.released_on, release.status, current)
            == label
        )
    year = row("2026-01-01", "year", "scheduled")
    assert classify_release(year.precision, year.released_on, year.status, date(2026, 1, 1)) == (
        "upcoming"
    )

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
    assert upcoming["Month"]["release_on"] == "2026-10"
    assert upcoming["Month"]["precision"] == "month"
    assert "2026-10-01" not in upcoming["Month"]["release_on"]
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


def test_home_page_loads_one_suite_bundle_without_private_rows(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "<app-root ngCspNonce=" in response.text
    assert 'src="/main.js"' in response.text
    assert "media-theme" not in response.text
    assert client.get("/api/library").json()["items"] == []
