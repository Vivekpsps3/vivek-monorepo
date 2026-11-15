"""Private photos are selected explicitly; saved reads never enrich."""

from apps.media.backend.services import portraits, providers
from apps.server.auth import Principal, require_principal

ARTIST = {
    "source": "musicbrainz",
    "source_id": "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387",
    "kind": "artist",
    "title": "Ariana Grande",
}
PHOTO = {
    "source_id": "42",
    "title": "File:Portrait.jpg",
    "thumbnail": "https://upload.wikimedia.org/wikipedia/commons/1/12/Portrait.jpg",
    "source_url": "https://commons.wikimedia.org/wiki/File:Portrait.jpg",
    "creator": "Photographer",
    "license": "CC BY-SA 4.0",
}


def test_select_reset_is_private_and_does_not_touch_catalog_or_reviews(client, monkeypatch):
    def detail(*_args):
        return {
            **ARTIST,
            "artwork_url": "https://upload.wikimedia.org/wikipedia/commons/default.jpg",
        }

    monkeypatch.setattr(providers, "lookup_detail", detail)
    monkeypatch.setattr(portraits, "_fetch", lambda _params: [dict(PHOTO)])
    first = client.post(
        "/api/library/from-provider", json={**ARTIST, "review": "My review", "rating": 0}
    ).json()
    found = client.get(f"/api/entries/{first['id']}/portraits", params={"q": "Ariana"}).json()
    assert found["results"] == [PHOTO]
    selected = client.put(
        f"/api/entries/{first['id']}/portrait",
        json={"source_id": "42", "crop": [25, 70], "thumbnail": "https://evil.example/fake"},
    ).json()
    assert selected["artwork_url"] == PHOTO["thumbnail"]
    assert selected["portrait"]["creator"] == "Photographer"
    assert selected["portrait"]["license"] == "CC BY-SA 4.0"
    assert selected["portrait"]["crop"] == [25, 70]
    assert selected["rating"] == 0 and selected["review"] == "My review"
    assert selected["catalog"]["artwork_url"] != PHOTO["thumbnail"]
    monkeypatch.setattr(
        providers, "musicbrainz_search", lambda *_args: [{**ARTIST, "artwork_url": None}]
    )
    found = client.get("/api/search", params={"q": "ariana", "kind": "artist"}).json()["results"][0]
    assert found["artwork_url"] == PHOTO["thumbnail"]

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    other = client.post("/api/library/from-provider", json=ARTIST).json()
    assert other["artwork_url"] == first["artwork_url"]
    other_search = client.get("/api/search", params={"q": "ariana", "kind": "artist"}).json()[
        "results"
    ][0]
    assert other_search["artwork_url"] is None

    assert (
        client.put(f"/api/entries/{first['id']}/portrait", json={"source_id": "42"}).status_code
        == 404
    )
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    reset = client.delete(f"/api/entries/{first['id']}/portrait").json()
    assert reset["artwork_url"] == first["artwork_url"]
    assert reset["portrait"] is None
    assert reset["review"] == "My review"
