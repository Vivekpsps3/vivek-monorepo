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


def test_saved_library_and_detail_do_not_fill_missing_portraits(client, monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("Ordinary reads must be database-only")

    monkeypatch.setattr("apps.media.backend.services.providers.wikidata_artist_images", forbidden)
    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_artist_image", forbidden)
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": ARIANA,
            "kind": "artist",
            "title": "Ariana Grande",
        },
    ).json()
    assert client.get("/api/library").json()["items"][0]["artwork_url"] is None
    assert client.get(f"/api/entries/{saved['id']}").json()["artwork_url"] is None
