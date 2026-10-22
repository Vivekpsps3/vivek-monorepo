"""Public metadata adapters. Personal listening and watching history is never sent."""

import html
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from apps.media.backend.models import ProviderCache, utc_now

UA = "VivekMedia/1.0 (personal media journal)"
TTL = timedelta(hours=24)
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")


def scrape_mode() -> bool:
    return os.getenv("MEDIA_SCRAPE_MODE", "").strip().lower() in {"1", "true", "yes", "on"}


def provider_status() -> dict[str, str]:
    status = {
        "tmdb": "ok" if os.getenv("TMDB_API_KEY", "").strip() else "unconfigured",
        "musicbrainz": "ok",
        "openlibrary": "ok",
        "rawg": "ok" if os.getenv("RAWG_API_KEY", "").strip() else "unconfigured",
    }
    if scrape_mode():
        status["tvmaze"] = "ok"
        status["itunes"] = "ok"
    return status


SEARCH_TIMEOUT = 3.0
HEALTH_TTL = 60.0
_HEALTH: dict[str, tuple[float, str]] = {}
_HEALTH_TEST = ""


def sticky_status(name: str, state: str) -> str:
    """Keep the last provider status for a minute so a flap doesn't change the line."""
    global _HEALTH_TEST
    current = os.environ.get("PYTEST_CURRENT_TEST", "")
    if current != _HEALTH_TEST:
        _HEALTH.clear()
        _HEALTH_TEST = current
    now = time.monotonic()
    row = _HEALTH.get(name)
    if row is not None and now - row[0] < HEALTH_TTL:
        return row[1]
    _HEALTH[name] = (now, state)
    return state


def _cache_get(db: Session, key: str):
    row = db.get(ProviderCache, key)
    if row is not None and as_utc(row.fetched_at) >= datetime.now(UTC) - TTL:
        return json.loads(row.payload)
    return None


def _cache_put(db: Session, key: str, payload) -> None:
    row = db.get(ProviderCache, key)
    if row is None:
        db.add(ProviderCache(cache_key=key, payload=json.dumps(payload), fetched_at=utc_now()))
    else:
        row.payload = json.dumps(payload)
        row.fetched_at = utc_now()
    db.flush()


def _now() -> float:
    return time.monotonic()


def _invoke(job):
    http = httpx.Client(
        timeout=SEARCH_TIMEOUT, headers={"User-Agent": UA, "Accept": "application/json"}
    )
    started = _now()
    try:
        payload = job(http)
    finally:
        http.close()
    # The pool's wait is a backstop. A job that returns after its own budget
    # is still a timeout, so tests can advance a fake clock instead of sleeping.
    if _now() - started > SEARCH_TIMEOUT + 0.5:
        raise FuturesTimeout()
    return payload


def search(db: Session, query: str, kind: str | None, client: httpx.Client | None = None) -> dict:
    status = provider_status()
    results = []
    jobs = []
    if kind in (None, "", "movie", "tv"):
        jobs.append(("tmdb", lambda http: tmdb_search(http, query, kind)))
        if scrape_mode() and kind in (None, "", "tv"):
            jobs.append(("tvmaze", lambda http: tvmaze_search(http, query)))
        if scrape_mode() and kind in (None, "", "movie"):
            jobs.append(("itunes", lambda http: itunes_search(http, query)))
    if kind in (None, "", "track", "album", "artist"):

        def music(http):
            try:
                return musicbrainz_search(http, query, kind)
            except Exception:
                return musicbrainz_search(http, query, kind)

        jobs.append(("musicbrainz", music))
    if kind in (None, "", "book"):
        jobs.append(("openlibrary", lambda http: openlibrary_search(http, query)))
    if kind in (None, "", "game"):
        jobs.append(("rawg", lambda http: rawg_search(http, query)))
    pending = []
    for name, job in jobs:
        if status.get(name) == "unconfigured":
            continue
        key = f"{name}:{kind or 'all'}:{query.lower()}"
        hit = None if client is not None else _cache_get(db, key)
        if hit is not None:
            results.extend(hit)
            status[name] = sticky_status(name, "ok")
            continue
        pending.append((name, key, job))
    if client is not None:
        for name, key, job in pending:
            try:
                payload = job(client)
                _cache_put(db, key, payload)
                results.extend(payload)
                status[name] = sticky_status(name, "ok")
            except Exception:
                status[name] = sticky_status(name, "error")
    elif pending:
        pool = ThreadPoolExecutor(max_workers=len(pending))
        payloads: dict[str, list] = {}
        try:
            futures = {pool.submit(_invoke, job): (name, key) for name, key, job in pending}
            try:
                for future in as_completed(futures, timeout=SEARCH_TIMEOUT + 0.5):
                    name, key = futures.pop(future)
                    try:
                        payload = future.result()
                        _cache_put(db, key, payload)
                        payloads[name] = payload
                        status[name] = sticky_status(name, "ok")
                    except Exception:
                        status[name] = sticky_status(name, "error")
            except FuturesTimeout:
                for name, _key in futures.values():
                    status[name] = sticky_status(name, "error")
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        for name, _key, _job in pending:
            results.extend(payloads.get(name, []))
    return {"query": query, "results": prefer_unique(results)[:40], "providers": status}


def prefer_unique(results: list[dict]) -> list[dict]:
    seen = set()
    unique = []
    for item in results:
        title = " ".join((item.get("title") or "").casefold().split())
        year = item.get("year")
        creator = " ".join((item.get("creator") or "").casefold().split())
        key = (item.get("kind"), title, year if isinstance(year, int) else creator)
        if title and key in seen:
            continue
        if title:
            seen.add(key)
        unique.append(item)
    return unique


def plain_text(value, limit: int = 400) -> str | None:
    if not isinstance(value, str):
        return None
    text = SPACE.sub(" ", html.unescape(TAG.sub(" ", value))).strip()
    return text[:limit] or None


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def cached_call(db: Session, key: str, job):
    row = db.get(ProviderCache, key)
    if row is not None and as_utc(row.fetched_at) >= datetime.now(UTC) - TTL:
        return json.loads(row.payload)
    payload = job()
    if row is None:
        row = ProviderCache(cache_key=key, payload=json.dumps(payload), fetched_at=utc_now())
        db.add(row)
    else:
        row.payload = json.dumps(payload)
        row.fetched_at = utc_now()
    db.flush()
    return payload


def tmdb_search(http: httpx.Client, query: str, kind: str | None) -> list[dict]:
    key = os.getenv("TMDB_API_KEY", "").strip()
    if not key:
        return []
    kinds = ["movie", "tv"] if kind in (None, "") else [kind]
    found = []
    for media in kinds:
        response = http.get(
            f"https://api.themoviedb.org/3/search/{media}",
            params={"query": query, "include_adult": "false", "api_key": key},
        )
        response.raise_for_status()
        for item in response.json().get("results", [])[:8]:
            poster = item.get("poster_path")
            date_text = item.get("release_date") or item.get("first_air_date") or ""
            year = int(date_text[:4]) if len(date_text) >= 4 and date_text[:4].isdigit() else None
            creator = item.get("name") if media == "tv" else None
            found.append(
                {
                    "source": "tmdb",
                    "source_id": f"{media}:{item.get('id')}",
                    "kind": media,
                    "title": item.get("title") or item.get("name") or "Untitled",
                    "creator": creator,
                    "year": year,
                    "overview": (item.get("overview") or "")[:400],
                    "artwork_url": f"https://image.tmdb.org/t/p/w342{poster}" if poster else None,
                    "genres": [],
                    "external_ratings": tmdb_rating(item),
                    "extra": {},
                    "releases": release_from_day(date_text),
                    "episodes": [],
                }
            )
    return found


def tmdb_rating(item: dict) -> list[dict]:
    value = item.get("vote_average")
    if not isinstance(value, (int, float)) or value <= 0:
        return []
    return [
        {
            "provider": "tmdb",
            "label": "TMDB",
            "value": round(float(value), 1),
            "scale": "0–10",
            "votes": item.get("vote_count") if isinstance(item.get("vote_count"), int) else None,
        }
    ]


def release_from_day(text: str) -> list[dict]:
    if len(text) >= 10:
        return [{"released_on": text[:10], "precision": "day", "status": "scheduled"}]
    return []


SKIPPED_ALBUM_TYPES = {
    "compilation",
    "live",
    "remix",
    "soundtrack",
    "dj-mix",
    "mixtape/street",
    "demo",
    "audiobook",
    "audio drama",
}


def musicbrainz_search(http: httpx.Client, query: str, kind: str | None) -> list[dict]:
    found = []
    failed = False

    def attempt(load):
        nonlocal failed
        try:
            found.extend(load())
        except Exception:
            failed = True

    if kind in (None, "", "track"):

        def recordings():
            response = http.get(
                "https://musicbrainz.org/ws/2/recording",
                params={"query": query, "fmt": "json", "limit": 8},
            )
            response.raise_for_status()
            rows = []
            for item in response.json().get("recordings", []):
                artist = artist_name(item.get("artist-credit"))
                rows.append(
                    music_result(
                        "track",
                        item.get("id"),
                        item.get("title"),
                        artist,
                        item.get("first-release-date"),
                    )
                )
            return rows

        attempt(recordings)
    if kind in (None, "", "album"):

        def albums():
            response = http.get(
                "https://musicbrainz.org/ws/2/release",
                params={"query": f"{query} AND primarytype:album", "fmt": "json", "limit": 8},
            )
            response.raise_for_status()
            rows = []
            for item in response.json().get("releases", []):
                artist = artist_name(item.get("artist-credit"))
                mbid = item.get("id")
                result = music_result("album", mbid, item.get("title"), artist, item.get("date"))
                result["artwork_url"] = (
                    f"https://coverartarchive.org/release/{mbid}/front-250" if mbid else None
                )
                rows.append(result)
            return rows

        attempt(albums)
    if kind in (None, "", "artist"):
        attempt(lambda: musicbrainz_artists(http, query))
    if not found and failed:
        raise RuntimeError("MusicBrainz search failed")
    return found


def musicbrainz_artists(http: httpx.Client, query: str) -> list[dict]:
    response = http.get(
        "https://musicbrainz.org/ws/2/artist",
        params={"query": query, "fmt": "json", "limit": 8},
    )
    response.raise_for_status()
    found = []
    for item in response.json().get("artists", []):
        if not isinstance(item, dict) or not item.get("id"):
            continue
        span = item.get("life-span") if isinstance(item.get("life-span"), dict) else {}
        begin = span.get("begin") or ""
        year = (
            int(begin[:4])
            if isinstance(begin, str) and len(begin) >= 4 and begin[:4].isdigit()
            else None
        )
        disambiguation = (
            item.get("disambiguation") if isinstance(item.get("disambiguation"), str) else None
        )
        found.append(
            music_result(
                "artist",
                item.get("id"),
                item.get("name"),
                item.get("type"),
                begin if year else None,
            )
        )
        found[-1]["overview"] = (disambiguation or "")[:400] or None
        found[-1]["releases"] = []
    return found


def musicbrainz_artist_catalog(
    http: httpx.Client,
    artist_id: str,
    group_offset: int = 0,
    release_offset: int = 0,
) -> dict:
    """Official studio albums and the songs on them. No personal ratings.

    Offsets continue a previous page. Callers look up songs for albums that
    arrived without a track list, a few at a time, so a long discography can
    finish on a later view.
    """
    groups, groups_partial, group_next = _mb_pages(
        http,
        "https://musicbrainz.org/ws/2/release-group",
        {"artist": artist_id, "type": "album", "fmt": "json"},
        "release-groups",
        "release-group-count",
        start_offset=group_offset,
    )
    releases, releases_partial, release_next = _mb_pages(
        http,
        "https://musicbrainz.org/ws/2/release",
        {
            "artist": artist_id,
            "type": "album",
            "status": "official",
            "inc": "recordings release-groups",
            "fmt": "json",
        },
        "releases",
        "release-count",
        start_offset=release_offset,
    )
    tracks_by_group: dict[str, list[dict]] = {}
    for release in releases:
        if not isinstance(release, dict):
            continue
        group = (
            release.get("release-group") if isinstance(release.get("release-group"), dict) else {}
        )
        group_id = group.get("id")
        if not isinstance(group_id, str):
            continue
        tracks = _tracks_from_release(release)
        current = tracks_by_group.get(group_id)
        if current is None or len(tracks) > len(current):
            tracks_by_group[group_id] = tracks
    albums = []
    seen = set()
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("id"), str):
            continue
        if group["id"] in seen or _skipped_album(group):
            continue
        seen.add(group["id"])
        released = group.get("first-release-date") or ""
        year = (
            int(released[:4])
            if isinstance(released, str) and len(released) >= 4 and released[:4].isdigit()
            else None
        )
        albums.append(
            {
                "source_id": group["id"],
                "title": group.get("title") or "Untitled",
                "year": year,
                "artwork_url": f"https://coverartarchive.org/release-group/{group['id']}/front-250",
                "tracks": list(tracks_by_group.get(group["id"]) or []),
            }
        )
    albums.sort(key=lambda row: ((row.get("year") or 9999), str(row.get("title") or "").casefold()))
    return {
        "albums": albums,
        "partial": bool(groups_partial or releases_partial),
        "group_offset": group_next if groups_partial else 0,
        "release_offset": release_next if releases_partial else 0,
    }


def _skipped_album(group: dict) -> bool:
    primary = str(group.get("primary-type") or "Album").casefold()
    if primary != "album":
        return True
    secondary = group.get("secondary-types") or []
    if not isinstance(secondary, list):
        return False
    return any(str(item).casefold() in SKIPPED_ALBUM_TYPES for item in secondary)


def _mb_pages(
    http: httpx.Client,
    url: str,
    params: dict,
    key: str,
    count_key: str,
    max_pages: int = 4,
    start_offset: int = 0,
):
    found = []
    offset = start_offset if isinstance(start_offset, int) and start_offset > 0 else 0
    total = None
    partial = False
    for page in range(max_pages):
        if page:
            time.sleep(1.05)
        response = http.get(url, params={**params, "limit": 100, "offset": offset})
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            break
        chunk = body.get(key) or []
        if not isinstance(chunk, list) or not chunk:
            break
        found.extend(chunk)
        total = body.get(count_key)
        if isinstance(total, str) and total.isdigit():
            total = int(total)
        offset += len(chunk)
        if len(chunk) < 100 or (isinstance(total, int) and offset >= total):
            break
    else:
        partial = not (isinstance(total, int) and offset >= total)
    return found, partial, offset if partial else 0


def _tracks_from_release(release: dict) -> list[dict]:
    tracks = []
    seen = set()
    for medium in release.get("media") or []:
        if not isinstance(medium, dict):
            continue
        for track in medium.get("tracks") or []:
            if not isinstance(track, dict):
                continue
            recording = track.get("recording") if isinstance(track.get("recording"), dict) else {}
            title = track.get("title") or recording.get("title")
            if not isinstance(title, str) or not title.strip():
                continue
            source_id = recording.get("id") or track.get("id")
            if isinstance(source_id, str) and source_id in seen:
                continue
            if isinstance(source_id, str):
                seen.add(source_id)
            tracks.append(
                {
                    "title": title.strip(),
                    "position": len(tracks) + 1,
                    "source_id": source_id if isinstance(source_id, str) else None,
                }
            )
    return tracks


def musicbrainz_collaborators(http: httpx.Client, artist_id: str) -> list[dict]:
    """People and groups linked to this artist. Cached by the journal, not scored."""
    response = http.get(
        f"https://musicbrainz.org/ws/2/artist/{artist_id}",
        params={"inc": "artist-rels", "fmt": "json"},
    )
    response.raise_for_status()
    body = response.json()
    found = []
    seen = set()
    allowed = {
        "collaboration",
        "member of band",
        "supporting musician",
        "vocal supporting musician",
        "instrumental supporting musician",
        "tribute to",
        "is person",
    }
    for rel in body.get("relations") or []:
        if not isinstance(rel, dict):
            continue
        kind = str(rel.get("type") or "").casefold()
        if kind not in allowed:
            continue
        artist = rel.get("artist") if isinstance(rel.get("artist"), dict) else None
        if not artist:
            continue
        name = artist.get("name")
        source_id = artist.get("id")
        if not isinstance(name, str) or not name.strip():
            continue
        if not isinstance(source_id, str) or source_id in seen or source_id == artist_id:
            continue
        seen.add(source_id)
        found.append({"source_id": source_id, "name": name.strip(), "relation": kind})
        if len(found) >= 16:
            break
    return found


def release_group_tracks(http: httpx.Client, group_id: str) -> list[dict]:
    return _release_group_tracks(http, group_id)


def _release_group_tracks(http: httpx.Client, group_id: str) -> list[dict]:
    response = http.get(
        "https://musicbrainz.org/ws/2/release",
        params={"release-group": group_id, "inc": "recordings", "fmt": "json", "limit": 25},
    )
    response.raise_for_status()
    best: list[dict] = []
    for release in response.json().get("releases") or []:
        if not isinstance(release, dict):
            continue
        tracks = _tracks_from_release(release)
        if len(tracks) > len(best):
            best = tracks
    return best


def artist_name(credit) -> str | None:
    if not isinstance(credit, list) or not credit:
        return None
    name = credit[0].get("name") or (credit[0].get("artist") or {}).get("name")
    return name or None


def music_result(
    kind: str, source_id: str | None, title: str | None, artist: str | None, released: str | None
) -> dict:
    year = (
        int(released[:4])
        if isinstance(released, str) and len(released) >= 4 and released[:4].isdigit()
        else None
    )
    precision = (
        "day"
        if isinstance(released, str) and len(released) >= 10
        else "year"
        if year
        else "unknown"
    )
    releases = []
    if year:
        releases.append(
            {
                "released_on": released[:10] if precision == "day" else f"{year}-01-01",
                "precision": precision,
                "status": "released",
            }
        )
    return {
        "source": "musicbrainz",
        "source_id": source_id,
        "kind": kind,
        "title": title or "Untitled",
        "creator": artist,
        "year": year,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": {},
        "releases": releases,
        "episodes": [],
    }


def openlibrary_search(http: httpx.Client, query: str) -> list[dict]:
    response = http.get("https://openlibrary.org/search.json", params={"q": query, "limit": 8})
    response.raise_for_status()
    found = []
    for item in response.json().get("docs", []):
        work = (item.get("key") or "").removeprefix("/works/")
        cover = item.get("cover_i")
        year = item.get("first_publish_year")
        authors = item.get("author_name") or []
        found.append(
            {
                "source": "openlibrary",
                "source_id": work or item.get("cover_edition_key"),
                "kind": "book",
                "title": item.get("title") or "Untitled",
                "creator": authors[0] if authors else None,
                "year": year if isinstance(year, int) else None,
                "overview": None,
                "artwork_url": f"https://covers.openlibrary.org/b/id/{cover}-M.jpg"
                if cover
                else None,
                "genres": [],
                "external_ratings": [],
                "extra": {"pages": item.get("number_of_pages_median")},
                "releases": [
                    {"released_on": f"{year}-01-01", "precision": "year", "status": "released"}
                ]
                if isinstance(year, int)
                else [],
                "episodes": [],
            }
        )
    return [item for item in found if item["source_id"]]


def tvmaze_search(http: httpx.Client, query: str) -> list[dict]:
    response = http.get("https://api.tvmaze.com/search/shows", params={"q": query})
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []
    found = []
    for row in payload[:8]:
        show = row.get("show") if isinstance(row, dict) else None
        if not isinstance(show, dict) or not show.get("id"):
            continue
        premiered = show.get("premiered") or ""
        year = int(premiered[:4]) if len(premiered) >= 4 and premiered[:4].isdigit() else None
        image = show.get("image") if isinstance(show.get("image"), dict) else {}
        artwork = image.get("medium") or image.get("original")
        rating = show.get("rating") if isinstance(show.get("rating"), dict) else {}
        average = rating.get("average")
        ratings = []
        if isinstance(average, (int, float)) and average > 0:
            ratings.append(
                {
                    "provider": "tvmaze",
                    "label": "TVMaze",
                    "value": round(float(average), 1),
                    "scale": "0–10",
                    "votes": None,
                }
            )
        channel = (
            show.get("network") if isinstance(show.get("network"), dict) else show.get("webChannel")
        )
        creator = channel.get("name") if isinstance(channel, dict) else None
        found.append(
            {
                "source": "tvmaze",
                "source_id": str(show.get("id")),
                "kind": "tv",
                "title": show.get("name") or "Untitled",
                "creator": creator,
                "year": year,
                "overview": plain_text(show.get("summary")),
                "artwork_url": artwork
                if isinstance(artwork, str) and artwork.startswith("https://")
                else None,
                "genres": [genre for genre in show.get("genres") or [] if isinstance(genre, str)],
                "external_ratings": ratings,
                "extra": {},
                "releases": release_from_day(premiered)
                if len(premiered) >= 10
                else (
                    [{"released_on": f"{year}-01-01", "precision": "year", "status": "released"}]
                    if year
                    else []
                ),
                "episodes": [],
            }
        )
    return found


def itunes_search(http: httpx.Client, query: str) -> list[dict]:
    response = http.get(
        "https://itunes.apple.com/search",
        params={"term": query, "media": "movie", "entity": "movie", "limit": 8},
    )
    response.raise_for_status()
    found = []
    for item in response.json().get("results", [])[:8]:
        track_id = item.get("trackId")
        if not track_id:
            continue
        released = item.get("releaseDate") or ""
        year = int(released[:4]) if len(released) >= 4 and released[:4].isdigit() else None
        artwork = item.get("artworkUrl100") or ""
        if isinstance(artwork, str) and "100x100bb" in artwork:
            artwork = artwork.replace("100x100bb", "300x300bb")
        genre = item.get("primaryGenreName")
        found.append(
            {
                "source": "itunes",
                "source_id": str(track_id),
                "kind": "movie",
                "title": item.get("trackName") or "Untitled",
                "creator": item.get("artistName"),
                "year": year,
                "overview": plain_text(item.get("longDescription") or item.get("shortDescription")),
                "artwork_url": artwork
                if isinstance(artwork, str) and artwork.startswith("https://")
                else None,
                "genres": [genre] if isinstance(genre, str) and genre else [],
                "external_ratings": [],
                "extra": {},
                "releases": release_from_day(released[:10]) if len(released) >= 10 else [],
                "episodes": [],
            }
        )
    return found


def rawg_search(http: httpx.Client, query: str) -> list[dict]:
    key = os.getenv("RAWG_API_KEY", "").strip()
    if not key:
        return []
    response = http.get(
        "https://api.rawg.io/api/games", params={"key": key, "search": query, "page_size": 8}
    )
    response.raise_for_status()
    found = []
    for item in response.json().get("results", []):
        released = item.get("released") or ""
        year = int(released[:4]) if len(released) >= 4 and released[:4].isdigit() else None
        rating = item.get("rating")
        ratings = []
        if isinstance(rating, (int, float)) and rating > 0:
            ratings.append(
                {
                    "provider": "rawg",
                    "label": "RAWG",
                    "value": round(float(rating), 2),
                    "scale": "0–5",
                    "votes": item.get("ratings_count")
                    if isinstance(item.get("ratings_count"), int)
                    else None,
                }
            )
        platforms = [
            row.get("platform", {}).get("name")
            for row in item.get("platforms") or []
            if isinstance(row, dict)
        ]
        found.append(
            {
                "source": "rawg",
                "source_id": str(item.get("id")),
                "kind": "game",
                "title": item.get("name") or "Untitled",
                "creator": None,
                "year": year,
                "overview": None,
                "artwork_url": item.get("background_image"),
                "genres": [
                    genre.get("name")
                    for genre in item.get("genres") or []
                    if isinstance(genre, dict) and genre.get("name")
                ],
                "external_ratings": ratings,
                "extra": {"platforms": [name for name in platforms if name]},
                "releases": release_from_day(released) if len(released) >= 10 else [],
                "episodes": [],
            }
        )
    return found
