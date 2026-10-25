"""Plain screen URLs enter the hash router."""


def test_media_screens_redirect_to_the_hash(client):
    library = client.get("/library", follow_redirects=False)
    assert library.status_code == 302
    assert library.headers["location"] == "/media/#/library"

    head = client.head("/library", follow_redirects=False)
    assert head.status_code == 302
    assert head.headers["location"] == "/media/#/library"

    search = client.get("/search", params={"q": "dune"}, follow_redirects=False)
    assert search.status_code == 302
    assert search.headers["location"] == "/media/#/search?q=dune"

    calendar = client.get("/calendar/", follow_redirects=False)
    assert calendar.status_code == 302
    assert calendar.headers["location"] == "/media/#/calendar"

    added = client.get("/new", follow_redirects=False)
    assert added.status_code == 302
    assert added.headers["location"] == "/media/#/new"

    missing = client.get("/not-a-screen", follow_redirects=False)
    assert missing.status_code == 302
    assert missing.headers["location"] == "/media/#/not-a-screen"
