import httpx

from apps.media.backend.services import providers


def test_saved_details_and_reviews_survive_transient_cache_loss_and_provider_outage(
    client, monkeypatch
):
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387",
            "kind": "artist",
            "title": "Saved artist",
            "review": "Keep this review",
        },
    ).json()
    providers.SEARCH_CACHE.clear()

    def forbidden(*_args, **_kwargs):
        raise AssertionError("A saved read made an outbound call")

    monkeypatch.setattr(httpx, "Client", forbidden)
    detail = client.get(f"/api/entries/{saved['id']}")
    assert detail.status_code == 200
    assert detail.json()["review"] == "Keep this review"
    assert client.get("/api/library").json()["items"][0]["title"] == "Saved artist"
