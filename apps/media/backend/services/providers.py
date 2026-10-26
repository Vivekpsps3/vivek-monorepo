"""Public metadata adapters. Personal listening and watching history is never sent.

One search and one detail call per kind. Keys stay on the server. Search rows are
only enough to choose. Add loads detail by source id and does not copy arbitrary
browser fields into the shared catalog. MusicBrainz search, catalog, and detail
share MB_PACE (one request a second). A 429 pushes that pace by Retry-After and
is not retried immediately. Other calls use the per-request timeout.

| Kind | Search | Detail | Coverage |
| movie | TMDB /3/search/movie, or the public search page | /3/movie/{id}, or the public movie page | official with a key, otherwise extraction |
| movie | iTunes search, only when MEDIA_SCRAPE_MODE is on | iTunes lookup by track id | official |
| tv | TVMaze /search/shows | /shows/{id} and /episodes | official; lifecycle and episodes |
| tv | TMDB /3/search/tv when a key is set | /3/tv/{id} | official; no TMDB series call without a key |
| artist, album, track | MusicBrainz ws/2 search | lookup by MBID | official; cover art is a Cover Art Archive URL |
| book | Open Library search.json | works or editions JSON | official; a year is not stored as a day |
| game | RAWG /games when RAWG_API_KEY is set | /games/{id} | official |
| game | Steam storesearch when RAWG is unset | appdetails | keyless; no Metacritic score |

Search pages are capped at 8 rows. Detail is one id. Cached search rows expire
after TTL. A failed detail leaves the saved title in place with metadata_pending.
"""

import hashlib
import html
import json
import os
import re
import threading
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


def _monotonic() -> float:
    return time.monotonic()


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


class Pace:
    """The next allowed call time for one upstream. Shared by every request."""

    def __init__(self, gap: float):
        self.gap = gap
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        with self._lock:
            moment = _monotonic()
            delay = self._next - moment
            scheduled = moment if delay <= 0 else self._next
            self._next = scheduled + max(self.gap, 0.0)
        if delay > 0:
            _sleep(delay)

    def defer(self, retry_after: str | None) -> None:
        delay = self.gap
        if isinstance(retry_after, str) and retry_after.strip().isdigit():
            delay = min(float(retry_after.strip()), 30.0)
        with self._lock:
            moment = _monotonic()
            self._next = max(self._next, moment + max(delay, 0.0))


# MusicBrainz asks for about one request per second across the whole process.
MB_PACE = Pace(1.0)
DETAIL_TIMEOUT = 3.0

KIND_SOURCES = {
    "movie": frozenset({"tmdb", "itunes"}),
    "tv": frozenset({"tmdb", "tvmaze"}),
    "book": frozenset({"openlibrary"}),
    "game": frozenset({"rawg", "steam"}),
    "artist": frozenset({"musicbrainz"}),
    "album": frozenset({"musicbrainz"}),
    "track": frozenset({"musicbrainz"}),
}


def sources_for_kind(kind: str) -> frozenset[str]:
    return KIND_SOURCES.get(kind, frozenset())


def provenance(provider: str, coverage: str) -> dict:
    fetched = datetime.now(UTC).replace(microsecond=0).isoformat()
    return {"provider": provider, "coverage": coverage, "fetched_at": fetched}


def _with_provenance(rows, provider: str, coverage: str) -> list:
    mark = provenance(provider, coverage)
    stamped = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        item = dict(row)
        if not isinstance(item.get("provenance"), dict):
            item["provenance"] = dict(mark)
        stamped.append(item)
    return stamped


def mb_get(http: httpx.Client, url: str, params=None, headers=None):
    """One MusicBrainz call. 429 moves the shared pace and does not retry."""
    MB_PACE.wait()
    if headers is None:
        response = http.get(url, params=params)
    else:
        response = http.get(url, params=params, headers=headers)
    if getattr(response, "status_code", 200) == 429:
        header = getattr(response, "headers", {}).get("Retry-After")
        MB_PACE.defer(header if isinstance(header, str) else None)
        response.raise_for_status()
    return response


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
    """Search only the sources that cover this kind. Status names those sources."""
    results = []
    jobs = []
    status: dict[str, str] = {}
    tmdb_key = bool(os.getenv("TMDB_API_KEY", "").strip())
    rawg_key = bool(os.getenv("RAWG_API_KEY", "").strip())

    def add(name: str, coverage: str, job) -> None:
        jobs.append((name, coverage, job))
        status[name] = "ok"

    if tmdb_key and kind in (None, "", "movie", "tv"):
        add("tmdb", "official", lambda http: tmdb_search(http, query, kind))
    elif kind in (None, "", "movie"):
        add("tmdb", "extraction", lambda http: tmdb_public_search(http, query))
    if kind in (None, "", "tv"):
        add("tvmaze", "official", lambda http: tvmaze_search(http, query))
    if scrape_mode() and kind in (None, "", "movie"):
        add("itunes", "official", lambda http: itunes_search(http, query))
    if kind in (None, "", "track", "album", "artist"):
        add("musicbrainz", "official", lambda http: musicbrainz_search(http, query, kind))
    if kind in (None, "", "book"):
        add("openlibrary", "official", lambda http: openlibrary_search(http, query))
    if kind in (None, "", "game"):
        if rawg_key:
            add("rawg", "official", lambda http: rawg_search(http, query))
        else:
            status["rawg"] = "unconfigured"
            add("steam", "keyless", lambda http: steam_search(http, query))
    pending = []
    for name, coverage, job in jobs:
        key = f"{name}:{kind or 'all'}:{query.lower()}"
        if name == "tmdb" and coverage == "extraction":
            key += ":page"
        if name == "musicbrainz":
            key += ":rg-cover"
        hit = None if client is not None else _cache_get(db, key)
        if hit is not None:
            results.extend(_with_provenance(hit, name, coverage))
            status[name] = sticky_status(name, "ok")
            continue
        pending.append((name, coverage, key, job))
    if client is not None:
        for name, coverage, key, job in pending:
            release_for_provider_io(db)
            try:
                payload = _with_provenance(job(client), name, coverage)
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
            futures = {
                pool.submit(_invoke, job): (name, coverage, key)
                for name, coverage, key, job in pending
            }
            try:
                for future in as_completed(futures, timeout=SEARCH_TIMEOUT + 0.5):
                    name, coverage, key = futures.pop(future)
                    try:
                        payload = _with_provenance(future.result(), name, coverage)
                        ready.append((name, key, payload))
                        status[name] = sticky_status(name, "ok")
                    except Exception:
                        status[name] = sticky_status(name, "error")
            except FuturesTimeout:
                for name, _coverage, _key in futures.values():
                    status[name] = sticky_status(name, "error")
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        for name, key, payload in ready:
            _cache_put(db, key, payload)
            payloads[name] = payload
        for name, _coverage, _key, _job in pending:
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
            response = mb_get(
                http,
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
            response = mb_get(
                http,
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
    response = mb_get(
        http,
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
    for _page in range(max_pages):
        response = mb_get(http, url, params={**params, "limit": 100, "offset": offset})
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
    response = mb_get(
        http,
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
    response = mb_get(
        http,
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


def _tvmaze_show(show: dict) -> dict | None:
    if not show.get("id"):
        return None
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
    releases = release_from_day(premiered) if len(premiered) >= 10 else []
    if not releases and year:
        releases = [{"released_on": f"{year}-01-01", "precision": "year", "status": "released"}]
    return {
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
        "releases": releases,
        "episodes": [],
    }


def tvmaze_search(http: httpx.Client, query: str) -> list[dict]:
    response = http.get("https://api.tvmaze.com/search/shows", params={"q": query})
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []
    found = []
    for row in payload[:8]:
        show = row.get("show") if isinstance(row, dict) else None
        if not isinstance(show, dict):
            continue
        item = _tvmaze_show(show)
        if item is not None:
            found.append(item)
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


def _positive_int(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text.isdigit():
        return None
    number = int(text)
    if number < 1:
        return None
    return str(number)


def _media_id(source_id: str, media: str) -> str | None:
    text = source_id.strip()
    prefix = f"{media}:"
    if text.startswith(prefix):
        text = text[len(prefix) :]
    return _positive_int(text)


def _loose_release(text: str | None) -> tuple[int | None, list]:
    """ISO day, ISO month, or a bare year. Anything else is not a date."""
    if not isinstance(text, str):
        return None, []
    label = text.strip()
    if len(label) >= 10 and label[:4].isdigit() and label[4] == "-" and label[7] == "-":
        day = label[:10]
        if day[5:7].isdigit() and day[8:10].isdigit():
            year = int(day[:4])
            return year, [{"released_on": day, "precision": "day", "status": "released"}]
    if len(label) == 7 and label[:4].isdigit() and label[4] == "-" and label[5:7].isdigit():
        year = int(label[:4])
        month = int(label[5:7])
        if 1 <= month <= 12:
            released = f"{year}-{month:02d}-01"
            return year, [{"released_on": released, "precision": "month", "status": "released"}]
    if len(label) == 4 and label.isdigit():
        year = int(label)
        return year, [{"released_on": f"{year}-01-01", "precision": "year", "status": "released"}]
    return None, []


def _https_artwork(value) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text.startswith("https://") or len(text) > 1000:
        return None
    return text


def _genre_names(items) -> list[str]:
    names = []
    for item in items or []:
        if isinstance(item, str) and item.strip():
            names.append(item.strip())
        elif isinstance(item, dict) and isinstance(item.get("name"), str) and item["name"].strip():
            names.append(item["name"].strip())
    return names[:12]


OG_META = re.compile(
    r"<meta\s+[^>]*property=[\"']og:([^\"']+)[\"'][^>]*content=[\"']([^\"']*)[\"']"
    r"|<meta\s+[^>]*content=[\"']([^\"']*)[\"'][^>]*property=[\"']og:([^\"']+)[\"']",
    re.I,
)
TITLE_YEAR = re.compile(r"\((\d{4})\)\s*$")


def _og(page: str) -> dict[str, str]:
    found: dict[str, str] = {}
    if not isinstance(page, str):
        return found
    for match in OG_META.finditer(page):
        if match.group(1):
            key, value = match.group(1), match.group(2)
        else:
            value, key = match.group(3), match.group(4)
        found.setdefault(key.lower(), html.unescape(value))
    return found


def parse_tmdb_public_detail(page: str, movie_id: str) -> dict | None:
    """Title, year, and poster from one public TMDB movie page. No score."""
    meta = _og(page)
    raw_title = (meta.get("title") or "").strip()
    if not raw_title or not _positive_int(movie_id):
        return None
    head = re.split(r"\s+[|—–]\s+", raw_title, maxsplit=1)[0].strip()
    year_match = TITLE_YEAR.search(head)
    year = int(year_match.group(1)) if year_match else None
    if year_match:
        head = head[: year_match.start()].strip()
    if not head:
        return None
    releases = []
    if year:
        releases = [{"released_on": f"{year}-01-01", "precision": "year", "status": "released"}]
    return {
        "source": "tmdb",
        "source_id": f"movie:{movie_id}",
        "kind": "movie",
        "title": head,
        "creator": None,
        "year": year,
        "overview": plain_text(meta.get("description"), 4000),
        "artwork_url": tmdb_poster_url(meta.get("image") or ""),
        "genres": [],
        "external_ratings": [],
        "extra": {},
        "releases": releases,
        "episodes": [],
        "provenance": provenance("tmdb", "extraction"),
    }


def _detail_base(source: str, source_id: str, kind: str, title: str, coverage: str) -> dict:
    return {
        "source": source,
        "source_id": source_id,
        "kind": kind,
        "title": title or "Untitled",
        "creator": None,
        "year": None,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": {},
        "releases": [],
        "episodes": [],
        "provenance": provenance(source, coverage),
    }


def tmdb_movie_detail(http: httpx.Client, source_id: str) -> dict | None:
    movie_id = _media_id(source_id, "movie")
    if not movie_id:
        return None
    key = os.getenv("TMDB_API_KEY", "").strip()
    if not key:
        response = http.get(
            f"https://www.themoviedb.org/movie/{movie_id}",
            headers={"Accept": "text/html", "User-Agent": UA},
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        row = parse_tmdb_public_detail(response.text, movie_id)
        if row is not None:
            row["source_id"] = source_id.strip()
        return row
    response = http.get(
        f"https://api.themoviedb.org/3/movie/{movie_id}",
        params={"api_key": key},
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict) or not item.get("id"):
        return None
    row = tmdb_media_hit(item, "movie")
    row["source_id"] = source_id.strip()
    row["overview"] = plain_text(item.get("overview"), 4000)
    row["genres"] = _genre_names(item.get("genres"))
    row["provenance"] = provenance("tmdb", "official")
    return row


def tmdb_tv_detail(http: httpx.Client, source_id: str) -> dict | None:
    show_id = _media_id(source_id, "tv")
    if not show_id or not os.getenv("TMDB_API_KEY", "").strip():
        return None
    key = os.getenv("TMDB_API_KEY", "").strip()
    response = http.get(f"https://api.themoviedb.org/3/tv/{show_id}", params={"api_key": key})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict) or not item.get("id"):
        return None
    row = tmdb_media_hit(item, "tv")
    row["source_id"] = source_id.strip()
    row["overview"] = plain_text(item.get("overview"), 4000)
    row["genres"] = _genre_names(item.get("genres"))
    networks = item.get("networks") if isinstance(item.get("networks"), list) else []
    if networks and isinstance(networks[0], dict):
        name = networks[0].get("name")
        if isinstance(name, str) and name.strip():
            row["creator"] = name.strip()
    extra = {}
    status = item.get("status")
    if isinstance(status, str) and status.strip():
        extra["lifecycle"] = status.strip()
    if isinstance(item.get("in_production"), bool):
        extra["in_production"] = item["in_production"]
    count = item.get("number_of_episodes")
    if isinstance(count, int) and count >= 0:
        extra["episode_count"] = count
    row["extra"] = extra
    row["provenance"] = provenance("tmdb", "official")
    return row


def tvmaze_detail(http: httpx.Client, source_id: str) -> dict | None:
    show_id = _positive_int(source_id)
    if not show_id:
        return None
    response = http.get(f"https://api.tvmaze.com/shows/{show_id}")
    if response.status_code == 404:
        return None
    response.raise_for_status()
    show = response.json()
    if not isinstance(show, dict):
        return None
    row = _tvmaze_show(show)
    if row is None:
        return None
    row["source_id"] = source_id.strip()
    status = show.get("status") if isinstance(show.get("status"), str) else ""
    if status.strip():
        row["extra"] = {"lifecycle": status.strip()}
    row["provenance"] = provenance("tvmaze", "official")
    try:
        from apps.media.backend.services.followups import tvmaze_episodes

        episodes = tvmaze_episodes(http, show_id)
    except Exception:
        episodes = []
    cleaned = []
    for item in episodes:
        if not isinstance(item, dict):
            continue
        try:
            season = int(item.get("season_number"))
            number = int(item.get("episode_number"))
        except (TypeError, ValueError):
            continue
        if season < 0 or number < 1:
            continue
        cleaned.append(
            {
                "season_number": season,
                "episode_number": number,
                "title": item.get("title") if isinstance(item.get("title"), str) else None,
                "air_date": item.get("air_date") if isinstance(item.get("air_date"), str) else None,
                "overview": plain_text(item.get("overview"), 4000),
                "source_id": item.get("source_id"),
            }
        )
    row["episodes"] = cleaned
    return row


def itunes_detail(http: httpx.Client, source_id: str) -> dict | None:
    track_id = _positive_int(source_id)
    if not track_id:
        return None
    response = http.get("https://itunes.apple.com/lookup", params={"id": track_id})
    response.raise_for_status()
    payload = response.json()
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list) or not results:
        return None
    item = results[0]
    if not isinstance(item, dict) or str(item.get("trackId")) != track_id:
        return None
    released = item.get("releaseDate") or ""
    year = int(released[:4]) if len(released) >= 4 and released[:4].isdigit() else None
    artwork = item.get("artworkUrl100") or ""
    if isinstance(artwork, str) and "100x100bb" in artwork:
        artwork = artwork.replace("100x100bb", "300x300bb")
    genre = item.get("primaryGenreName")
    return {
        "source": "itunes",
        "source_id": source_id.strip(),
        "kind": "movie",
        "title": item.get("trackName") or "Untitled",
        "creator": item.get("artistName") if isinstance(item.get("artistName"), str) else None,
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
        "provenance": provenance("itunes", "official"),
    }


def _openlibrary_record(source_id: str) -> tuple[str, str] | None:
    text = source_id.strip()
    if not text or "/" in text or len(text) > 40:
        return None
    if text.endswith("W"):
        return "work", f"https://openlibrary.org/works/{text}.json"
    if text.endswith("M"):
        return "edition", f"https://openlibrary.org/books/{text}.json"
    return None


def openlibrary_detail(http: httpx.Client, source_id: str) -> dict | None:
    located = _openlibrary_record(source_id)
    if located is None:
        return None
    record, url = located
    response = http.get(url)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict):
        return None
    title = item.get("title") if isinstance(item.get("title"), str) else ""
    if not title.strip():
        return None
    description = item.get("description")
    if isinstance(description, dict):
        description = description.get("value")
    authors = []
    for author in item.get("authors") or []:
        if isinstance(author, dict) and isinstance(author.get("name"), str):
            authors.append(author["name"])
        elif isinstance(author, str):
            authors.append(author)
    if not authors and isinstance(item.get("by_statement"), str):
        authors.append(item["by_statement"])
    dated = item.get("first_publish_date") or item.get("publish_date")
    year, releases = _loose_release(dated if isinstance(dated, str) else None)
    covers = item.get("covers") if isinstance(item.get("covers"), list) else []
    cover = covers[0] if covers and isinstance(covers[0], int) else None
    row = _detail_base("openlibrary", source_id.strip(), "book", title.strip(), "official")
    row["creator"] = authors[0] if authors else None
    row["year"] = year
    row["overview"] = plain_text(description, 4000) if isinstance(description, str) else None
    row["artwork_url"] = f"https://covers.openlibrary.org/b/id/{cover}-M.jpg" if cover else None
    row["releases"] = releases
    row["extra"] = {"record": record}
    return row


def rawg_detail(http: httpx.Client, source_id: str) -> dict | None:
    game_id = _positive_int(source_id)
    key = os.getenv("RAWG_API_KEY", "").strip()
    if not game_id or not key:
        return None
    response = http.get(f"https://api.rawg.io/api/games/{game_id}", params={"key": key})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict) or not item.get("id"):
        return None
    released = item.get("released") or ""
    year, releases = _loose_release(released if isinstance(released, str) else None)
    if not releases and isinstance(released, str) and len(released) >= 10:
        releases = release_from_day(released)
        if releases and year is None and released[:4].isdigit():
            year = int(released[:4])
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
    names = [name for name in platforms if isinstance(name, str) and name]
    row = _detail_base(
        "rawg", source_id.strip(), "game", item.get("name") or "Untitled", "official"
    )
    row["year"] = year
    description = item.get("description_raw") or item.get("description")
    row["overview"] = plain_text(description, 4000) if isinstance(description, str) else None
    row["artwork_url"] = _https_artwork(item.get("background_image"))
    row["genres"] = _genre_names(item.get("genres"))
    row["external_ratings"] = ratings
    row["extra"] = {"platforms": names} if names else {}
    row["releases"] = releases
    return row


def _steam_platforms(platforms: dict) -> list[str]:
    return [
        label
        for key, label in (("windows", "Windows"), ("mac", "Mac"), ("linux", "Linux"))
        if platforms.get(key) is True
    ]


def steam_detail(http: httpx.Client, source_id: str) -> dict | None:
    app_id = _positive_int(source_id)
    if not app_id:
        return None
    response = http.get(
        "https://store.steampowered.com/api/appdetails",
        params={"appids": app_id},
    )
    response.raise_for_status()
    payload = response.json()
    entry = payload.get(app_id) if isinstance(payload, dict) else None
    if not isinstance(entry, dict) or entry.get("success") is not True:
        return None
    item = entry.get("data") if isinstance(entry.get("data"), dict) else None
    if not item or not isinstance(item.get("name"), str) or not item["name"].strip():
        return None
    released = item.get("release_date") if isinstance(item.get("release_date"), dict) else {}
    coming = released.get("coming_soon") is True
    label = released.get("date") if isinstance(released.get("date"), str) else ""
    year = None
    releases: list = []
    parsed = None
    for fmt in ("%d %b, %Y", "%b %d, %Y"):
        try:
            parsed = datetime.strptime(label.strip(), fmt)
        except ValueError:
            continue
        break
    if parsed is not None:
        year = parsed.year
        releases = [
            {
                "released_on": parsed.date().isoformat(),
                "precision": "day",
                "status": "scheduled" if coming else "released",
            }
        ]
    else:
        year, releases = _loose_release(label)
        if coming and releases:
            releases = [{**releases[0], "status": "scheduled"}]
    names = _steam_platforms(
        item.get("platforms") if isinstance(item.get("platforms"), dict) else {}
    )
    row = _detail_base("steam", source_id.strip(), "game", item["name"].strip(), "keyless")
    row["year"] = year
    row["overview"] = plain_text(item.get("short_description"), 4000)
    row["artwork_url"] = _https_artwork(item.get("header_image"))
    row["extra"] = {"platforms": names} if names else {}
    row["releases"] = releases
    row["external_ratings"] = []
    return row


def musicbrainz_artist_detail(http: httpx.Client, source_id: str) -> dict | None:
    artist_id = mbid(source_id)
    if not artist_id:
        return None
    response = mb_get(
        http, f"https://musicbrainz.org/ws/2/artist/{artist_id}", params={"fmt": "json"}
    )
    if getattr(response, "status_code", 200) == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict) or not item.get("name"):
        return None
    span = item.get("life-span") if isinstance(item.get("life-span"), dict) else {}
    begin = span.get("begin") if isinstance(span.get("begin"), str) else ""
    year = int(begin[:4]) if len(begin) >= 4 and begin[:4].isdigit() else None
    note = item.get("disambiguation") if isinstance(item.get("disambiguation"), str) else None
    row = music_result("artist", source_id.strip(), item.get("name"), item.get("type"), None)
    row["year"] = year
    row["overview"] = (note or "")[:400] or None
    row["releases"] = []
    row["provenance"] = provenance("musicbrainz", "official")
    return row


def musicbrainz_album_detail(http: httpx.Client, source_id: str) -> dict | None:
    release_id = mbid(source_id)
    if not release_id:
        return None
    response = mb_get(
        http,
        f"https://musicbrainz.org/ws/2/release/{release_id}",
        params={"inc": "artists release-groups", "fmt": "json"},
    )
    if getattr(response, "status_code", 200) == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict) or not item.get("title"):
        return None
    group = item.get("release-group") if isinstance(item.get("release-group"), dict) else {}
    group_id = group.get("id") if isinstance(group.get("id"), str) else None
    row = music_result(
        "album",
        source_id.strip(),
        item.get("title"),
        artist_name(item.get("artist-credit")),
        item.get("date") if isinstance(item.get("date"), str) else None,
    )
    row["artwork_url"] = cover_art_url(release_id, group_id)
    extra = {}
    if mbid(group_id):
        extra["release_group_id"] = group_id
    if isinstance(group.get("primary-type"), str):
        extra["primary_type"] = group["primary-type"]
    row["extra"] = extra
    row["provenance"] = provenance("musicbrainz", "official")
    return row


def musicbrainz_track_detail(http: httpx.Client, source_id: str) -> dict | None:
    recording_id = mbid(source_id)
    if not recording_id:
        return None
    response = mb_get(
        http,
        f"https://musicbrainz.org/ws/2/recording/{recording_id}",
        params={"inc": "artist-credits", "fmt": "json"},
    )
    if getattr(response, "status_code", 200) == 404:
        return None
    response.raise_for_status()
    item = response.json()
    if not isinstance(item, dict) or not item.get("title"):
        return None
    released = (
        item.get("first-release-date") if isinstance(item.get("first-release-date"), str) else None
    )
    row = music_result(
        "track",
        source_id.strip(),
        item.get("title"),
        artist_name(item.get("artist-credit")),
        released,
    )
    row["provenance"] = provenance("musicbrainz", "official")
    return row


def lookup_detail(source: str, kind: str, source_id: str) -> dict | None:
    """Authoritative detail for one saved id. None means metadata stays pending."""
    if (
        source not in sources_for_kind(kind)
        or not isinstance(source_id, str)
        or not source_id.strip()
    ):
        return None
    http = httpx.Client(
        timeout=DETAIL_TIMEOUT,
        headers={"User-Agent": UA, "Accept": "application/json"},
        follow_redirects=True,
    )
    try:
        if source == "tmdb" and kind == "movie":
            return tmdb_movie_detail(http, source_id)
        if source == "tmdb" and kind == "tv":
            return tmdb_tv_detail(http, source_id)
        if source == "tvmaze" and kind == "tv":
            return tvmaze_detail(http, source_id)
        if source == "itunes" and kind == "movie":
            return itunes_detail(http, source_id)
        if source == "openlibrary" and kind == "book":
            return openlibrary_detail(http, source_id)
        if source == "rawg" and kind == "game":
            return rawg_detail(http, source_id)
        if source == "steam" and kind == "game":
            return steam_detail(http, source_id)
        if source == "musicbrainz" and kind == "artist":
            return musicbrainz_artist_detail(http, source_id)
        if source == "musicbrainz" and kind == "album":
            return musicbrainz_album_detail(http, source_id)
        if source == "musicbrainz" and kind == "track":
            return musicbrainz_track_detail(http, source_id)
        return None
    except Exception:
        return None
    finally:
        http.close()
