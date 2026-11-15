"""Artist portraits are image URLs the browser loads. Album covers stay on albums."""

import httpx

ARIANA = "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387"
PORTRAIT = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/"
    "Ariana_Grande_%2832426961944%29_%28cropped%29.jpg/"
    "500px-Ariana_Grande_%2832426961944%29_%28cropped%29.jpg"
)


def test_saved_library_and_detail_do_not_fill_missing_portraits(client, monkeypatch):
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": ARIANA,
            "kind": "artist",
            "title": "Ariana Grande",
        },
    ).json()
    opened = []

    def forbidden(*_args, **_kwargs):
        opened.append(1)
        raise AssertionError("Ordinary reads must be database-only")

    monkeypatch.setattr(httpx, "Client", forbidden)
    library = client.get("/api/library").json()
    detail = client.get(f"/api/entries/{saved['id']}").json()
    assert library["items"][0]["artwork_url"] is None
    assert detail["artwork_url"] is None
    assert detail["catalog"]["artwork_url"] is None
    assert opened == []
