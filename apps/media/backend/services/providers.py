"""Public metadata adapters. Personal listening and watching history is never sent."""

import hashlib
import html
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, unquote, urlparse

import httpx
from sqlalchemy.orm import Session

from apps.media.backend.models import ProviderCache, utc_now
from apps.server.database import release_for_provider_io

UA = "VivekMedia/1.0 (personal media journal)"
TTL = timedelta(hours=24)
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")
MBID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def scrape_mode() -> bool:
    return os.getenv("MEDIA_SCRAPE_MODE", "").strip().lower() in {"1", "true", "yes", "on"}


def provider_status() -> dict[str, str]:
    rawg_key = bool(os.getenv("RAWG_API_KEY", "").strip())
    status = {
        # Movie search uses the official API when a key is set, and TMDB's
        # public search page otherwise. Series search uses TVMaze either way.
        "tmdb": "ok",
        "musicbrainz": "ok",
        "openlibrary": "ok",
        "rawg": "ok" if rawg_key else "unconfigured",
        "tvmaze": "ok",
    }
    if not rawg_key:
        status["steam"] = "ok"
    if scrape_mode():
        status["itunes"] = "ok"
    return status


SEARCH_TIMEOUT = 3.0
HEALTH_TTL = 60.0
_HEALTH: dict[str, tuple[float, str]] = {}


def sticky_status(name: str, state: str, now: float | None = None) -> str:
    """Remember this provider's line, but never contradict the request in hand.

    The clock is an argument so tests can move time without reading the
    process environment. A cached error must not stay up once this call
    returned rows, and a cached ok must not stay up once this call failed.
    """
    moment = time.monotonic() if now is None else now
    previous = _HEALTH.get(name)
    if previous is not None and moment - previous[0] < HEALTH_TTL and previous[1] == state:
        _HEALTH[name] = (moment, state)
        return state
    _HEALTH[name] = (moment, state)
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
        timeout=SEARCH_TIMEOUT,
        headers={"User-Agent": UA, "Accept": "application/json"},
        follow_redirects=True,
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
    tmdb_key = bool(os.getenv("TMDB_API_KEY", "").strip())
    rawg_key = bool(os.getenv("RAWG_API_KEY", "").strip())
    if kind in (None, "", "movie", "tv"):
        if tmdb_key:
            jobs.append(("tmdb", lambda http: tmdb_search(http, query, kind)))
        elif kind in (None, "", "movie"):
            jobs.append(("tmdb", lambda http: tmdb_public_search(http, query)))
        if kind in (None, "", "tv"):
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
        if rawg_key:
            jobs.append(("rawg", lambda http: rawg_search(http, query)))
        else:
            jobs.append(("steam", lambda http: steam_search(http, query)))
    pending = []
    for name, job in jobs:
        if status.get(name) == "unconfigured":
            continue
        key = f"{name}:{kind or 'all'}:{query.lower()}"
        if name == "tmdb" and not tmdb_key:
            key += ":page"
        if name == "musicbrainz":
            key += ":rg-cover"
        hit = None if client is not None else _cache_get(db, key)
        if hit is not None:
            results.extend(hit)
            status[name] = sticky_status(name, "ok")
            continue
        pending.append((name, key, job))
    if client is not None:
        for name, key, job in pending:
            release_for_provider_io(db)
            try:
                payload = job(client)
                _cache_put(db, key, payload)
                results.extend(payload)
                status[name] = sticky_status(name, "ok")
            except Exception:
                status[name] = sticky_status(name, "error")
    elif pending:
        release_for_provider_io(db)
        pool = ThreadPoolExecutor(max_workers=len(pending))
        payloads: dict[str, list] = {}
        ready: list[tuple[str, str, list]] = []
        try:
            futures = {pool.submit(_invoke, job): (name, key) for name, key, job in pending}
            try:
                for future in as_completed(futures, timeout=SEARCH_TIMEOUT + 0.5):
                    name, key = futures.pop(future)
                    try:
                        payload = future.result()
                        ready.append((name, key, payload))
                        status[name] = sticky_status(name, "ok")
                    except Exception:
                        status[name] = sticky_status(name, "error")
            except FuturesTimeout:
                for name, _key in futures.values():
                    status[name] = sticky_status(name, "error")
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        for name, key, payload in ready:
            _cache_put(db, key, payload)
            payloads[name] = payload
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
    release_for_provider_io(db)
    payload = job()
    row = db.get(ProviderCache, key)
    if row is None:
        row = ProviderCache(cache_key=key, payload=json.dumps(payload), fetched_at=utc_now())
        db.add(row)
    else:
        row.payload = json.dumps(payload)
        row.fetched_at = utc_now()
    db.flush()
    return payload


def tmdb_media_hit(item: dict, media: str) -> dict:
    poster = item.get("poster_path")
    date_text = item.get("release_date") or item.get("first_air_date") or ""
    year = int(date_text[:4]) if len(date_text) >= 4 and date_text[:4].isdigit() else None
    creator = item.get("name") if media == "tv" else None
    return {
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
            if isinstance(item, dict):
                found.append(tmdb_media_hit(item, media))
    return found


POSTER_FILE = re.compile(r"/([A-Za-z0-9_-]+)\.(jpe?g|png|webp)", re.I)
YEAR_TEXT = re.compile(r"(?:19|20)\d{2}")
SEARCH_CARD = re.compile(
    r'data-media-adult="(true|false)"[^>]*'
    r'href="/(movie|tv)/(\d+)[^"]*"'
    r"([\s\S]{0,1800}?)"
    r"<h2[^>]*>\s*(?:<span[^>]*>)?\s*([^<]+?)\s*(?:</span>)?\s*</h2>"
    r"[\s\S]{0,400}?"
    r'class="release_date[^"]*"[^>]*>\s*([^<]*)'
)


def tmdb_poster_url(src: str) -> str | None:
    match = POSTER_FILE.search(src or "")
    if not match:
        return None
    ext = match.group(2).lower()
    if ext == "jpeg":
        ext = "jpg"
    return f"https://image.tmdb.org/t/p/w342/{match.group(1)}.{ext}"


def parse_tmdb_movie_page(page: str) -> list[dict]:
    """Titles and posters from TMDB's public popular or search page."""
    if not isinstance(page, str) or not page:
        return []
    start = page.find("media-list-results")
    chunk = page[start:] if start >= 0 else page
    found = []
    seen = set()
    for match in re.finditer(r"<h2[^>]*>\s*([^<]+?)\s*</h2>", chunk):
        title = html.unescape(match.group(1)).strip()
        if not title:
            continue
        before = chunk[max(0, match.start() - 900) : match.start()]
        after = chunk[match.end() : match.end() + 220]
        adult = re.search(r'data-media-adult="(true|false)"', before[-500:])
        if adult and adult.group(1) == "true":
            continue
        ids = list(re.finditer(r"/movie/(\d+)", before))
        if not ids:
            continue
        movie_id = ids[-1].group(1)
        if movie_id in seen:
            continue
        seen.add(movie_id)
        images = list(re.finditer(r'src="(https://[^"]+)"', before))
        released = re.search(r"release_date[^>]*>\s*([^<]+)", after)
        year_match = YEAR_TEXT.search(released.group(1) if released else "")
        found.append(
            {
                "source": "tmdb",
                "source_id": f"movie:{movie_id}",
                "kind": "movie",
                "title": title,
                "creator": None,
                "year": int(year_match.group(0)) if year_match else None,
                "overview": None,
                "artwork_url": tmdb_poster_url(images[-1].group(1) if images else ""),
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        )
        if len(found) >= 20:
            break
    return found


def parse_tmdb_search_page(page: str, media: str = "movie") -> list[dict]:
    """Titles and posters from TMDB's public movie or series search page."""
    if media not in {"movie", "tv"} or not isinstance(page, str) or not page:
        return []
    start = page.find(f'id="{media}_results"')
    if start < 0:
        return []
    chunk = page[start:]
    for other in ("movie_results", "tv_results", "person_results"):
        if other == f"{media}_results":
            continue
        later = chunk.find(f'id="{other}"', 20)
        if later > 0:
            chunk = chunk[:later]
    found: list[dict] = []
    seen: set[str] = set()
    for match in SEARCH_CARD.finditer(chunk):
        adult, kind, media_id, body, title, released = match.groups()
        title = html.unescape(title).strip()
        if kind != media or adult == "true" or not title or media_id in seen:
            continue
        seen.add(media_id)
        images = list(re.finditer(r'src="(https://[^"]+)"', body))
        year, releases = release_from_display(released)
        after = chunk[match.end() : match.end() + 900]
        paragraph = re.search(r"<p[^>]*>([\s\S]*?)</p>", after)
        overview = plain_text(paragraph.group(1)) if paragraph else None
        found.append(
            {
                "source": "tmdb",
                "source_id": f"{media}:{media_id}",
                "kind": media,
                "title": title,
                "creator": None,
                "year": year,
                "overview": overview,
                "artwork_url": tmdb_poster_url(images[-1].group(1) if images else ""),
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": releases,
                "episodes": [],
            }
        )
        if len(found) >= 8:
            break
    return found


def tmdb_public_search(http: httpx.Client, query: str) -> list[dict]:
    response = http.get(
        "https://www.themoviedb.org/search/movie",
        params={"query": query},
        headers={"Accept": "text/html", "User-Agent": UA},
    )
    response.raise_for_status()
    return parse_tmdb_search_page(response.text, "movie")


def tmdb_popular(http: httpx.Client) -> list[dict]:
    key = os.getenv("TMDB_API_KEY", "").strip()
    if key:
        response = http.get(
            "https://api.themoviedb.org/3/movie/popular",
            params={"api_key": key, "include_adult": "false", "language": "en-US"},
        )
        response.raise_for_status()
        rows = []
        for item in response.json().get("results", [])[:20]:
            if isinstance(item, dict) and not item.get("adult"):
                rows.append(tmdb_media_hit(item, "movie"))
        return rows
    response = http.get(
        "https://www.themoviedb.org/movie",
        headers={"Accept": "text/html", "User-Agent": UA},
    )
    response.raise_for_status()
    return parse_tmdb_movie_page(response.text)


def popular_movies(db: Session, http: httpx.Client) -> list[dict]:
    key = "tmdb:popular:movies"
    cached = _cache_get(db, key)
    if isinstance(cached, list) and cached:
        return cached
    release_for_provider_io(db)
    rows = tmdb_popular(http)
    if rows:
        _cache_put(db, key, rows)
    return rows


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


def release_from_display(text: str) -> tuple[int | None, list[dict]]:
    """A public-page date such as 'July 16, 2010'."""
    label = SPACE.sub(" ", html.unescape(text or "")).strip()
    if not label:
        return None, []
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            parsed = datetime.strptime(label, fmt)
        except ValueError:
            continue
        return parsed.year, [
            {
                "released_on": parsed.date().isoformat(),
                "precision": "day",
                "status": "released",
            }
        ]
    year_match = YEAR_TEXT.search(label)
    if not year_match:
        return None, []
    year = int(year_match.group(0))
    return year, [{"released_on": f"{year}-01-01", "precision": "year", "status": "released"}]


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
                release_id = item.get("id") if isinstance(item.get("id"), str) else None
                group = (
                    item.get("release-group") if isinstance(item.get("release-group"), dict) else {}
                )
                group_id = group.get("id") if isinstance(group.get("id"), str) else None
                result = music_result(
                    "album", release_id, item.get("title"), artist, item.get("date")
                )
                result["artwork_url"] = cover_art_url(release_id, group_id)
                if mbid(group_id):
                    result["extra"] = {"release_group_id": group_id}
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


_RELEASE_TYPES = {
    "single": "single",
    "ep": "ep",
    "live": "live",
    "remix": "remix",
    "compilation": "compilation",
}


def _mb_release_type(release_type: str | None) -> str:
    if not release_type or release_type == "studio":
        return "album"
    return _RELEASE_TYPES.get(release_type, "album")


def _keep_release_group(group: dict, release_type: str | None) -> bool:
    """Studio browse hides non-studio rows. Other filters keep only that type."""
    if not release_type or release_type == "studio":
        return not _skipped_album(group)
    wanted = release_type.casefold()
    primary = str(group.get("primary-type") or "").casefold()
    secondary = group.get("secondary-types") or []
    names = [primary] if primary else []
    if isinstance(secondary, list):
        names.extend(str(item).casefold() for item in secondary if item)
    if not names:
        return True
    return wanted in names


def musicbrainz_artist_catalog(
    http: httpx.Client,
    artist_id: str,
    group_offset: int = 0,
    release_offset: int = 0,
    max_pages: int = 1,
    release_type: str | None = None,
) -> dict:
    """One bounded page of public releases and songs. This saves nothing.

    The default is studio albums. Singles, EPs, live, remix, and compilation
    rows are a separate request so a studio page does not imply they are absent.
    Offsets continue a previous page. max_pages keeps one request bounded.
    """
    mb_type = _mb_release_type(release_type)
    groups, groups_partial, group_next = _mb_pages(
        http,
        "https://musicbrainz.org/ws/2/release-group",
        {"artist": artist_id, "type": mb_type, "fmt": "json"},
        "release-groups",
        "release-group-count",
        max_pages=max_pages,
        start_offset=group_offset,
    )
    releases, releases_partial, release_next = _mb_pages(
        http,
        "https://musicbrainz.org/ws/2/release",
        {
            "artist": artist_id,
            "type": mb_type,
            "status": "official",
            "inc": "recordings release-groups",
            "fmt": "json",
        },
        "releases",
        "release-count",
        max_pages=max_pages,
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
        if group["id"] in seen or not _keep_release_group(group, release_type):
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


def mbid(value) -> str | None:
    if isinstance(value, str) and MBID.fullmatch(value):
        return value
    return None


def cover_art_url(release_id: str | None, group_id: str | None = None) -> str | None:
    """HTTPS cover the browser can load. A release group usually has art when one pressing does not."""
    group = mbid(group_id)
    if group:
        return f"https://coverartarchive.org/release-group/{group}/front-250"
    release = mbid(release_id)
    if release:
        return f"https://coverartarchive.org/release/{release}/front-250"
    return None


_PORTRAIT_EXT = {"jpg", "jpeg", "png", "gif", "webp"}
_DIRECT_PORTRAIT_HOSTS = {"lastfm.freetls.fastly.net"}


def portrait_url(resource: str | None) -> str | None:
    """HTTPS portrait the browser can load. Image bytes stay on the image host."""
    if not isinstance(resource, str) or not resource.strip():
        return None
    parsed = urlparse(resource.strip())
    host = parsed.netloc.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    path = unquote(parsed.path or "")
    if host == "commons.wikimedia.org":
        name = _commons_file_name(path)
        return _commons_thumb(name) if name else None
    if parsed.scheme == "https" and host in _DIRECT_PORTRAIT_HOSTS:
        ext = path.lower().rsplit(".", 1)[-1]
        if ext in _PORTRAIT_EXT:
            return resource.strip().split("?", 1)[0][:1000]
    return None


def _commons_file_name(path: str) -> str | None:
    lowered = path.lower()
    name = None
    for marker in ("/wiki/special:filepath/", "/wiki/file:"):
        index = lowered.find(marker)
        if index == -1:
            continue
        name = path[index + len(marker) :].split("/", 1)[0]
        break
    if not name:
        return None
    name = name.replace(" ", "_").strip()
    if not name or len(name) > 240 or ".." in name or "/" in name:
        return None
    ext = name.lower().rsplit(".", 1)[-1]
    if ext not in _PORTRAIT_EXT:
        return None
    return name


def _commons_thumb(name: str) -> str:
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()
    quoted = quote(name, safe="")
    return (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/"
        f"{digest[0]}/{digest[:2]}/{quoted}/500px-{quoted}"
    )


def image_from_relations(relations) -> str | None:
    if not isinstance(relations, list):
        return None
    direct = None
    for rel in relations:
        if not isinstance(rel, dict) or str(rel.get("type") or "").casefold() != "image":
            continue
        url = rel.get("url") if isinstance(rel.get("url"), dict) else {}
        portrait = portrait_url(url.get("resource") if isinstance(url, dict) else None)
        if not portrait:
            continue
        if portrait.startswith("https://upload.wikimedia.org/"):
            return portrait
        direct = direct or portrait
    return direct


def musicbrainz_artist_image(http: httpx.Client, artist_id: str) -> str | None:
    """Portrait URL from the artist's image links. The browser loads the file."""
    artist = mbid(artist_id)
    if not artist:
        return None
    response = http.get(
        f"https://musicbrainz.org/ws/2/artist/{artist}",
        params={"inc": "url-rels", "fmt": "json"},
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict):
        return None
    return image_from_relations(body.get("relations"))


def wikidata_artist_images(http: httpx.Client, mbids: list[str]) -> dict[str, str]:
    """One lookup for many artists. Wikimedia is already linked from MusicBrainz."""
    clean = []
    seen = set()
    for raw in mbids:
        artist = mbid(raw if isinstance(raw, str) else "")
        if not artist:
            continue
        key = artist.lower()
        if key in seen:
            continue
        seen.add(key)
        clean.append(key)
    found: dict[str, str] = {}
    for start in range(0, len(clean), 40):
        chunk = clean[start : start + 40]
        values = " ".join(f'"{item}"' for item in chunk)
        query = (
            "SELECT ?mbid ?image WHERE { "
            f"VALUES ?mbid {{ {values} }} "
            "?artist wdt:P434 ?mbid. "
            "?artist wdt:P18 ?image. }"
        )
        response = http.get(
            "https://query.wikidata.org/sparql",
            params={"query": query, "format": "json"},
            headers={
                "Accept": "application/sparql-results+json",
                # Wikimedia refuses clients whose User-Agent has no contact URL.
                "User-Agent": "VivekMedia/1.0 (https://vivekpanchagnula.com; personal media journal)",
            },
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("results", {}).get("bindings", []) if isinstance(payload, dict) else []
        for row in rows:
            if not isinstance(row, dict):
                continue
            mbid_value = (row.get("mbid") or {}).get("value")
            image = (row.get("image") or {}).get("value")
            if not isinstance(mbid_value, str) or not isinstance(image, str):
                continue
            key = mbid_value.lower()
            if key in found:
                continue
            portrait = portrait_url(image)
            if portrait:
                found[key] = portrait
    return found


def cached_artist_portraits(
    db: Session, http: httpx.Client, mbids: list, *, deep: bool = False
) -> dict[str, str]:
    wanted = []
    seen = set()
    for raw in mbids:
        artist = mbid(raw if isinstance(raw, str) else "")
        if not artist:
            continue
        key = artist.lower()
        if key in seen:
            continue
        seen.add(key)
        wanted.append(key)
    resolved: dict[str, str] = {}
    need_wiki = []
    need_deep = []
    for artist_id in wanted:
        cached = _cache_get(db, f"artist-portrait:{artist_id}")
        url = cached.get("artwork_url") if isinstance(cached, dict) else None
        if isinstance(url, str) and url.startswith("https://"):
            resolved[artist_id] = url
            continue
        checked = cached.get("checked") if isinstance(cached, dict) else None
        if checked == "full":
            continue
        if checked == "wiki" and deep:
            need_deep.append(artist_id)
            continue
        if checked == "wiki":
            continue
        need_wiki.append(artist_id)
    if need_wiki:
        release_for_provider_io(db)
        try:
            found = wikidata_artist_images(http, need_wiki)
        except Exception:
            found = None
        if found is None:
            if deep:
                need_deep.extend(need_wiki)
        else:
            for artist_id in need_wiki:
                url = found.get(artist_id)
                if url:
                    _cache_put(
                        db, f"artist-portrait:{artist_id}", {"artwork_url": url, "checked": "wiki"}
                    )
                    resolved[artist_id] = url
                elif deep:
                    need_deep.append(artist_id)
                else:
                    _cache_put(
                        db,
                        f"artist-portrait:{artist_id}",
                        {"artwork_url": None, "checked": "wiki"},
                    )
    for artist_id in need_deep:
        release_for_provider_io(db)
        try:
            url = musicbrainz_artist_image(http, artist_id)
        except Exception:
            continue
        _cache_put(db, f"artist-portrait:{artist_id}", {"artwork_url": url, "checked": "full"})
        if url:
            resolved[artist_id] = url
    return resolved


def attach_artist_portraits(db: Session, results: list) -> None:
    pending = []
    for row in results or []:
        if not isinstance(row, dict):
            continue
        if row.get("kind") != "artist" or row.get("source") != "musicbrainz":
            continue
        if row.get("artwork_url") or not mbid(row.get("source_id") or ""):
            continue
        pending.append(row)
    if not pending:
        return
    http = httpx.Client(timeout=8.0, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        images = cached_artist_portraits(db, http, [row["source_id"] for row in pending])
    except Exception:
        return
    finally:
        http.close()
    for row in pending:
        url = images.get(str(row.get("source_id") or "").lower())
        if url:
            row["artwork_url"] = url


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


def steam_search(http: httpx.Client, query: str) -> list[dict]:
    """Steam's public store search. No key. Metadata and capsule art only."""
    response = http.get(
        "https://store.steampowered.com/api/storesearch/",
        params={"term": query, "l": "english", "cc": "US"},
    )
    response.raise_for_status()
    payload = response.json()
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    found: list[dict] = []
    for item in items[:8]:
        if not isinstance(item, dict) or item.get("type") not in {None, "app", "game"}:
            continue
        app_id = item.get("id")
        title = item.get("name")
        if not app_id or not isinstance(title, str) or not title.strip():
            continue
        image = item.get("tiny_image")
        artwork = None
        if isinstance(image, str) and image.startswith("https://"):
            artwork = image.split("?", 1)[0]
        raw_platforms = item.get("platforms")
        platforms = raw_platforms if isinstance(raw_platforms, dict) else {}
        names = [
            label
            for key, label in (("windows", "Windows"), ("mac", "Mac"), ("linux", "Linux"))
            if platforms.get(key) is True
        ]
        found.append(
            {
                "source": "steam",
                "source_id": str(app_id),
                "kind": "game",
                "title": title.strip(),
                "creator": None,
                "year": None,
                "overview": None,
                "artwork_url": artwork,
                "genres": [],
                "external_ratings": [],
                "extra": {"platforms": names} if names else {},
                "releases": [],
                "episodes": [],
            }
        )
    return found
