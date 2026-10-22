"""Plain screen URLs enter the hash router."""

from fastapi.testclient import TestClient


def test_media_screens_redirect_to_the_hash(client):
    with TestClient(client.app, root_path="/media") as mounted:
        library = mounted.get("/library", follow_redirects=False)
        assert library.status_code == 302
        assert library.headers["location"] == "/media/#/library"

        head = mounted.head("/library", follow_redirects=False)
        assert head.status_code == 302
        assert head.headers["location"] == "/media/#/library"

        search = mounted.get("/search", params={"q": "dune"}, follow_redirects=False)
        assert search.status_code == 302
        assert search.headers["location"] == "/media/#/search?q=dune"

        calendar = mounted.get("/calendar/", follow_redirects=False)
        assert calendar.status_code == 302
        assert calendar.headers["location"] == "/media/#/calendar"

        added = mounted.get("/new", follow_redirects=False)
        assert added.status_code == 302
        assert added.headers["location"] == "/media/#/new"

        missing = mounted.get("/not-a-screen", follow_redirects=False)
        assert missing.status_code == 302
        assert missing.headers["location"] == "/media/#/not-a-screen"


def test_screen_redirect_without_a_mount_stays_on_this_host(client):
    response = client.get("/library", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/#/library"
