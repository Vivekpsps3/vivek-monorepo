"""Episode dates and movie follow-ups.

TVMaze is used only for a series already saved from TVMaze. TMDB seasons and
collections are used only when a key is set and the row is already a TMDB id.
Wikidata is the public fallback for sequels and spin-offs. Manual titles are
never guessed onto TVMaze. Lookups are cached and are not saved as library rows.
"""

import json
import os
from datetime import date, datetime, timezone

import httpx
from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, ProviderCache
from apps.media.backend.services import providers, records
from apps.media.backend.services.providers import plain_text

FETCH_LIMIT = 8
WIKIDATA_URL = "https://query.wikidata.org/sparql"


class Budget:
    def __init__(self, limit: int = FETCH_LIMIT):
        self.left = limit
        self.partial = False

    def allow(self) -> bool:
        if self.left <= 0:
            self.partial = True
            return False
        self.left -= 1
        return True

    def fail(self) -> None:
        self.partial = True


def norm_title(title: str) -> str:
    return " ".join(title.casefold().split())


def numeric_id(source_id: str | None, kind: str) -> str | None:
    if source_id is None:
        return None
    text = str(source_id).strip()
    prefix = f"{kind}:"
    if text.startswith(prefix):
        text = text[len(prefix) :]
    if text.isdigit() and int(text) > 0:
        return str(int(text))
    return None


def lookup(db: Session, key: str, job, budget: Budget):
    row = db.get(ProviderCache, key)
    if (
        row is not None
        and providers.as_utc(row.fetched_at) >= datetime.now(timezone.utc) - providers.TTL
    ):
        try:
            payload = json.loads(row.payload)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, list):
            return payload
    if not budget.allow():
        return None
    try:
        payload = providers.cached_call(db, key, job)
    except Exception:
        budget.fail()
        return None
    if isinstance(payload, list):
        return payload
    return None


def refresh_show(db: Session, catalog: CatalogItem, http: httpx.Client, budget: Budget) -> None:
    """Update stored episode rows from the provider this show was saved from."""
    if catalog.kind != "tv" or not catalog.source_id:
        return
    if catalog.source == "tvmaze":
        show_id = numeric_id(catalog.source_id, "tv") or numeric_id(catalog.source_id, "tvmaze")
        if show_id is None and str(catalog.source_id).strip().isdigit():
            show_id = str(int(str(catalog.source_id).strip()))
        if not show_id:
            return
        payload = lookup(
            db, f"tvmaze:episodes:{show_id}", lambda: tvmaze_episodes(http, show_id), budget
        )
    elif catalog.source == "tmdb" and os.getenv("TMDB_API_KEY", "").strip():
        show_id = numeric_id(catalog.source_id, "tv")
        if not show_id:
            return
        payload = lookup(
            db, f"tmdb:episodes:{show_id}", lambda: tmdb_episodes(http, show_id), budget
        )
    else:
        return
    if not payload:
        return
    for item in payload:
        cleaned = clean_episode(item)
        if cleaned is not None:
            records.upsert_episode(db, catalog, cleaned)


def follow_ups(db: Session, catalog: CatalogItem, http: httpx.Client, budget: Budget) -> list[dict]:
    """Sequels and spin-offs of one watched movie. Not written to the library."""
    if catalog.kind != "movie" or not (catalog.title or "").strip():
        return []
    found: list[dict] = []
    if catalog.source == "tmdb" and os.getenv("TMDB_API_KEY", "").strip():
        movie_id = numeric_id(catalog.source_id, "movie")
        if movie_id:
            parts = lookup(
                db,
                f"tmdb:collection:{movie_id}",
                lambda: tmdb_collection_parts(http, movie_id),
                budget,
            )
            if parts:
                found.extend(parts)
    year = catalog.year if isinstance(catalog.year, int) else None
    key = f"wikidata:related:{norm_title(catalog.title)}:{year if year is not None else '-'}"
    wiki = lookup(db, key, lambda: wikidata_related(http, catalog.title, year), budget)
    if wiki:
        found.extend(wiki)
    return dedupe_related(found, catalog.title, year)


def clean_episode(item) -> dict | None:
    if not isinstance(item, dict):
        return None
    try:
        season = int(item.get("season_number"))
        number = int(item.get("episode_number"))
    except (TypeError, ValueError):
        return None
    if season < 0 or season > 200 or number < 1 or number > 5000:
        return None
    payload = {"season_number": season, "episode_number": number}
    title = plain_text(item.get("title"), 300)
    if title:
        payload["title"] = title
    air = item.get("air_date")
    if isinstance(air, str) and len(air) >= 10:
        try:
            payload["air_date"] = date.fromisoformat(air[:10]).isoformat()
        except ValueError:
            pass
    overview = plain_text(item.get("overview"), 8000)
    if overview:
        payload["overview"] = overview
    source_id = item.get("source_id")
    if source_id is not None and str(source_id).strip():
        payload["source_id"] = str(source_id).strip()[:120]
    return payload


def tvmaze_episodes(http: httpx.Client, show_id: str) -> list[dict]:
    response = http.get(f"https://api.tvmaze.com/shows/{show_id}/episodes")
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, list):
        return []
    rows = []
    for item in body:
        if not isinstance(item, dict):
            continue
        number = item.get("number")
        season = item.get("season")
        if not isinstance(number, int) or not isinstance(season, int):
            continue
        airdate = item.get("airdate") if isinstance(item.get("airdate"), str) else None
        rows.append(
            {
                "season_number": season,
                "episode_number": number,
                "title": item.get("name") if isinstance(item.get("name"), str) else None,
                "air_date": airdate,
                "overview": item.get("summary") if isinstance(item.get("summary"), str) else None,
                "source_id": str(item.get("id")) if item.get("id") else None,
            }
        )
    return rows


def tmdb_episodes(http: httpx.Client, show_id: str) -> list[dict]:
    key = os.getenv("TMDB_API_KEY", "").strip()
    if not key:
        return []
    show = http.get(f"https://api.themoviedb.org/3/tv/{show_id}", params={"api_key": key})
    show.raise_for_status()
    seasons = show.json().get("seasons") if isinstance(show.json(), dict) else None
    if not isinstance(seasons, list):
        seasons = []
    rows = []
    for season in seasons[:40]:
        if not isinstance(season, dict) or not isinstance(season.get("season_number"), int):
            continue
        number = season["season_number"]
        if number < 0:
            continue
        response = http.get(
            f"https://api.themoviedb.org/3/tv/{show_id}/season/{number}",
            params={"api_key": key},
        )
        response.raise_for_status()
        episodes = response.json().get("episodes") if isinstance(response.json(), dict) else None
        if not isinstance(episodes, list):
            continue
        for item in episodes:
            if not isinstance(item, dict) or not isinstance(item.get("episode_number"), int):
                continue
            rows.append(
                {
                    "season_number": number,
                    "episode_number": item["episode_number"],
                    "title": item.get("name") if isinstance(item.get("name"), str) else None,
                    "air_date": item.get("air_date")
                    if isinstance(item.get("air_date"), str)
                    else None,
                    "overview": item.get("overview")
                    if isinstance(item.get("overview"), str)
                    else None,
                    "source_id": str(item.get("id")) if item.get("id") else None,
                }
            )
    return rows


def tmdb_collection_parts(http: httpx.Client, movie_id: str) -> list[dict]:
    key = os.getenv("TMDB_API_KEY", "").strip()
    if not key:
        return []
    movie = http.get(f"https://api.themoviedb.org/3/movie/{movie_id}", params={"api_key": key})
    movie.raise_for_status()
    body = movie.json() if isinstance(movie.json(), dict) else {}
    collection = (
        body.get("belongs_to_collection")
        if isinstance(body.get("belongs_to_collection"), dict)
        else {}
    )
    collection_id = collection.get("id")
    if not isinstance(collection_id, int) or collection_id <= 0:
        return []
    coll = http.get(
        f"https://api.themoviedb.org/3/collection/{collection_id}", params={"api_key": key}
    )
    coll.raise_for_status()
    parts = coll.json().get("parts") if isinstance(coll.json(), dict) else None
    if not isinstance(parts, list):
        return []
    rows = []
    for item in parts[:40]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        if str(item.get("id")) == str(movie_id):
            continue
        released = item.get("release_date") if isinstance(item.get("release_date"), str) else ""
        precision, released_on, year = classify_provider_date(released)
        title = item.get("title") if isinstance(item.get("title"), str) else ""
        if not title.strip():
            continue
        rows.append(
            {
                "relation": "sequel",
                "title": title.strip(),
                "year": year,
                "precision": precision,
                "released_on": released_on,
                "source": "tmdb",
                "source_id": f"movie:{item.get('id')}",
            }
        )
    return rows


def classify_provider_date(text: str) -> tuple[str, str | None, int | None]:
    raw = (text or "").strip()
    if len(raw) >= 10:
        try:
            parsed = date.fromisoformat(raw[:10])
        except ValueError:
            return "unknown", None, None
        return "day", parsed.isoformat(), parsed.year
    if len(raw) >= 7 and raw[4] == "-" and raw[:4].isdigit() and raw[5:7].isdigit():
        year = int(raw[:4])
        month = int(raw[5:7])
        if 1 <= month <= 12:
            return "month", date(year, month, 1).isoformat(), year
    if len(raw) >= 4 and raw[:4].isdigit():
        year = int(raw[:4])
        return "year", date(year, 1, 1).isoformat(), year
    return "unknown", None, None


def sparql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ")


def wikidata_query(title: str, year: int | None) -> str:
    escaped = sparql_string(title.strip())
    year_filter = ""
    if isinstance(year, int):
        year_filter = f"FILTER(!BOUND(?filmDate) || YEAR(?filmDate) = {year})"
    return f"""
SELECT DISTINCT ?related ?relatedLabel ?date ?precision ?rel WHERE {{
  {{
    SELECT ?film WHERE {{
      ?film rdfs:label "{escaped}"@en.
      ?film wdt:P31/wdt:P279* wd:Q11424.
      OPTIONAL {{ ?film wdt:P577 ?filmDate. }}
      {year_filter}
    }}
    LIMIT 3
  }}
  {{
    ?film wdt:P156 ?related.
    BIND("sequel" AS ?rel)
  }} UNION {{
    ?related wdt:P155 ?film.
    BIND("sequel" AS ?rel)
  }} UNION {{
    ?film wdt:P2512 ?related.
    BIND("spinoff" AS ?rel)
  }} UNION {{
    ?film wdt:P179 ?series.
    ?related wdt:P179 ?series.
    FILTER(?related != ?film)
    BIND("series" AS ?rel)
  }}
  OPTIONAL {{
    ?related p:P577 ?dateStatement.
    ?dateStatement psv:P577 ?dateValue.
    ?dateValue wikibase:timeValue ?date.
    ?dateValue wikibase:timePrecision ?precision.
  }}
  OPTIONAL {{
    ?related rdfs:label ?relatedLabel.
    FILTER(LANG(?relatedLabel) = "en")
  }}
}}
LIMIT 40
""".strip()


def wikidata_related(http: httpx.Client, title: str, year: int | None) -> list[dict]:
    if not (title or "").strip():
        return []
    response = http.get(
        WIKIDATA_URL,
        params={"query": wikidata_query(title, year), "format": "json"},
        headers={"Accept": "application/sparql-results+json", "User-Agent": providers.UA},
    )
    response.raise_for_status()
    body = response.json() if isinstance(response.json(), dict) else {}
    bindings = (
        body.get("results", {}).get("bindings", []) if isinstance(body.get("results"), dict) else []
    )
    if not isinstance(bindings, list):
        return []
    rows = []
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        relation = binding_value(binding, "rel")
        label = binding_value(binding, "relatedLabel")
        if (
            relation not in {"sequel", "spinoff", "series"}
            or not isinstance(label, str)
            or not label.strip()
        ):
            continue
        precision, released_on, item_year = release_from_wikidata(
            binding_value(binding, "date"),
            binding_value(binding, "precision"),
        )
        if relation == "series":
            if released_on is None:
                continue
            if isinstance(year, int) and isinstance(item_year, int) and item_year <= year:
                continue
            relation = "sequel"
        source_id = binding_value(binding, "related")
        rows.append(
            {
                "relation": relation,
                "title": label.strip(),
                "year": item_year,
                "precision": precision,
                "released_on": released_on,
                "source": "wikidata",
                "source_id": source_id if isinstance(source_id, str) else None,
            }
        )
    return dedupe_related(rows, title, year)


def binding_value(binding: dict, name: str):
    cell = binding.get(name)
    if isinstance(cell, dict):
        return cell.get("value")
    return None


def release_from_wikidata(value, precision) -> tuple[str, str | None, int | None]:
    """Wikidata precision 11 is a day, 10 is a month, 9 is a year. Month and year stay unpinned."""
    if not isinstance(value, str) or len(value) < 4:
        return "unknown", None, None
    text = value.lstrip("+")
    if not text[:4].isdigit():
        return "unknown", None, None
    year = int(text[:4])
    month = int(text[5:7]) if len(text) >= 7 and text[5:7].isdigit() else 0
    day = int(text[8:10]) if len(text) >= 10 and text[8:10].isdigit() else 0
    code = precision_code(precision)
    if code is None:
        if day >= 1:
            code = 11
        elif month >= 1:
            code = 10
        else:
            code = 9
    if code >= 11 and 1 <= month <= 12 and day >= 1:
        try:
            return "day", date(year, month, day).isoformat(), year
        except ValueError:
            return "unknown", None, None
    if code == 10 and 1 <= month <= 12:
        return "month", date(year, month, 1).isoformat(), year
    if 1000 <= year <= 3000:
        return "year", date(year, 1, 1).isoformat(), year
    return "unknown", None, None


def precision_code(value) -> int | None:
    if value is None:
        return None
    text = str(value).split(".", 1)[0]
    if text.lstrip("-").isdigit():
        return int(text)
    return None


def dedupe_related(rows: list[dict], title: str, year: int | None) -> list[dict]:
    self_key = (norm_title(title), year if isinstance(year, int) else None)
    rank = {"spinoff": 0, "sequel": 1}
    precision_rank = {"day": 0, "month": 1, "year": 2, "unknown": 3}
    chosen = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("relation") not in rank:
            continue
        name = row.get("title")
        if not isinstance(name, str) or not name.strip():
            continue
        item_year = row.get("year") if isinstance(row.get("year"), int) else None
        key = (norm_title(name), item_year)
        if key == self_key:
            continue
        current = chosen.get(key)
        if current is None:
            chosen[key] = row
            continue
        better_relation = rank[row["relation"]] < rank[current["relation"]]
        same = row["relation"] == current["relation"]
        better_date = same and precision_rank.get(row.get("precision"), 9) < precision_rank.get(
            current.get("precision"), 9
        )
        if better_relation or better_date:
            chosen[key] = row
    return list(chosen.values())
