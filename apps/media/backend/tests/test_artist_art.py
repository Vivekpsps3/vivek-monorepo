"""Artist portraits are image URLs the browser loads. Album covers stay on albums."""

from apps.media.backend.services.providers import image_from_relations, portrait_url

ARIANA = "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387"
PORTRAIT = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/"
    "Ariana_Grande_%2832426961944%29_%28cropped%29.jpg/"
    "500px-Ariana_Grande_%2832426961944%29_%28cropped%29.jpg"
)


def test_commons_file_page_becomes_a_browser_thumb():
    page = "https://commons.wikimedia.org/wiki/File:Ariana_Grande_(32426961944)_(cropped).jpg"
    spaced = (
        "http://commons.wikimedia.org/wiki/Special:FilePath/"
        "Ariana Grande (32426961944) (cropped).jpg"
    )
    assert portrait_url(page) == PORTRAIT
    assert portrait_url(spaced) == PORTRAIT
    assert portrait_url("javascript:alert(1)") is None
    assert portrait_url("https://evil.example/portrait.jpg") is None


def test_image_relation_prefers_the_commons_portrait():
    relations = [
        {
            "type": "image",
            "url": {
                "resource": "https://lastfm.freetls.fastly.net/i/u/770x0/de9f397daeb863166674622ae87a7a45.jpg"
            },
        },
        {
            "type": "image",
            "url": {
                "resource": "https://commons.wikimedia.org/wiki/File:Ariana_Grande_(32426961944)_(cropped).jpg"
            },
        },
        {"type": "official homepage", "url": {"resource": "https://www.arianagrande.com/"}},
    ]
    assert image_from_relations(relations) == PORTRAIT


def test_lastfm_portrait_is_kept_when_it_is_the_only_image():
    direct = "https://lastfm.freetls.fastly.net/i/u/770x0/abc.jpg"
    assert portrait_url(direct) == direct
    assert image_from_relations([{"type": "image", "url": {"resource": direct}}]) == direct


def test_library_fills_a_saved_artist_that_had_no_image(client, monkeypatch):
    monkeypatch.setattr(
        "apps.media.backend.services.providers.wikidata_artist_images",
        lambda _http, ids: {ids[0].lower(): PORTRAIT},
    )
    created = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": ARIANA,
            "kind": "artist",
            "title": "Ariana Grande",
        },
    )
    assert created.status_code == 200
    assert created.json()["artwork_url"] is None
    listed = client.get("/api/library", params={"kind": "artist"})
    assert listed.status_code == 200
    assert listed.json()["items"][0]["artwork_url"] == PORTRAIT
    assert listed.json()["items"][0]["title"] == "Ariana Grande"


def test_opening_an_artist_uses_musicbrainz_when_wikidata_has_no_image(client, monkeypatch):
    monkeypatch.setattr(
        "apps.media.backend.services.providers.wikidata_artist_images",
        lambda _http, _ids: {},
    )
    direct = "https://lastfm.freetls.fastly.net/i/u/770x0/abc.jpg"
    monkeypatch.setattr(
        "apps.media.backend.services.providers.musicbrainz_artist_image",
        lambda _http, artist_id: direct if artist_id.lower() == ARIANA else None,
    )
    created = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": ARIANA,
            "kind": "artist",
            "title": "Ariana Grande",
        },
    ).json()
    listed = client.get("/api/library", params={"kind": "artist"}).json()
    assert listed["items"][0]["artwork_url"] is None
    detail = client.get(f"/api/entries/{created['id']}")
    assert detail.status_code == 200
    assert detail.json()["artwork_url"] == direct


def test_search_attaches_an_artist_portrait(client, monkeypatch):
    monkeypatch.setattr(
        "apps.media.backend.services.providers.musicbrainz_search",
        lambda *_args, **_kwargs: [
            {
                "source": "musicbrainz",
                "source_id": ARIANA,
                "kind": "artist",
                "title": "Ariana Grande",
                "creator": "Person",
                "year": 1993,
                "overview": None,
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        ],
    )
    monkeypatch.setattr(
        "apps.media.backend.services.providers.wikidata_artist_images",
        lambda _http, ids: {ids[0].lower(): PORTRAIT},
    )
    found = client.get("/api/search", params={"q": "ariana", "kind": "artist"})
    assert found.status_code == 200
    assert found.json()["results"][0]["artwork_url"] == PORTRAIT
