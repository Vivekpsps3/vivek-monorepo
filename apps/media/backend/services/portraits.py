"""Explicit Commons metadata lookup. No image bytes or user-supplied URLs are fetched."""

import json
from urllib.parse import urlsplit

import httpx
from sqlalchemy.orm import Session

from apps.media.backend.models import UserEntry, utc_now
from apps.media.backend.services import providers
from apps.media.backend.services.validate import clean_text, fail
from apps.server.database import release_for_provider_io
from apps.server.errors import APIError

API = "https://commons.wikimedia.org/w/api.php"


def _url(value, host: str) -> str | None:
    if not isinstance(value, str) or len(value) > 2000:
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.netloc != host:
        return None
    return value


def _candidate(page: dict) -> dict | None:
    images = page.get("imageinfo")
    image = images[0] if isinstance(images, list) and images else None
    if not isinstance(image, dict) or image.get("mime") not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        return None
    thumbnail = _url(image.get("thumburl"), "upload.wikimedia.org")
    source = _url(image.get("descriptionurl"), "commons.wikimedia.org")
    if not thumbnail or not source or not isinstance(page.get("pageid"), int):
        return None
    meta = image.get("extmetadata") or {}

    def field(name):
        item = meta.get(name) if isinstance(meta, dict) else None
        return providers.plain_text(item.get("value"), 500) if isinstance(item, dict) else None

    # Require an explicit license/usage statement rather than inventing a permission.
    license_name = field("LicenseShortName") or field("UsageTerms")
    if not license_name:
        return None
    return {
        "source_id": str(page["pageid"]),
        "title": providers.plain_text(page.get("title"), 300),
        "thumbnail": thumbnail,
        "source_url": source,
        "creator": field("Artist") or field("Credit"),
        "license": license_name,
    }


def _fetch(params: dict) -> list[dict]:
    with httpx.Client(
        timeout=3.0, headers={"User-Agent": providers.UA}, follow_redirects=False
    ) as http:
        response = http.get(
            API,
            params={
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "imageinfo",
                "iiprop": "url|mime|extmetadata",
                "iiurlwidth": 500,
                "iiextmetadatafilter": "Artist|Credit|LicenseShortName|UsageTerms",
                **params,
            },
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict) or "error" in payload:
        raise ValueError("Invalid Commons metadata")
    pages = payload.get("query", {}).get("pages", [])
    return [
        candidate for page in pages if isinstance(page, dict) and (candidate := _candidate(page))
    ]


def _cached(key: str, params: dict) -> list[dict]:
    result = providers.SEARCH_CACHE.run(key, lambda: _fetch(params))
    if result.state != "ok":
        code = result.state
        raise APIError(
            504 if code == "timeout" else 429 if code == "throttled" else 502,
            code,
            "Photos could not load. Your saved photo is unchanged. Try again.",
        )
    return result.rows


def search(db: Session, entry: UserEntry, query: str) -> list[dict]:
    if entry.catalog.kind != "artist":
        fail("Photos belong on an artist.")
    text = clean_text(query, 200, "Photo search", required=True)
    if not text or len(text) < 2:
        fail("Enter at least two characters.")
    release_for_provider_io(db)
    return _cached(
        f"commons:search:{text.casefold()}",
        {
            "generator": "search",
            "gsrsearch": text,
            "gsrnamespace": 6,
            "gsrlimit": 8,
        },
    )


def select(db: Session, entry: UserEntry, body: dict) -> None:
    if entry.catalog.kind != "artist":
        fail("Photos belong on an artist.")
    identity = body.get("source_id")
    if not isinstance(identity, str) or not identity.isdigit() or len(identity) > 15:
        fail("Choose a Commons photo from the results.")
    crop = body.get("crop")
    if crop is not None and (
        not isinstance(crop, list)
        or len(crop) != 2
        or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 100
            for v in crop
        )
    ):
        fail("Photo position must be two percentages from 0 to 100.")
    release_for_provider_io(db)
    rows = _cached(f"commons:page:{identity}", {"pageids": identity})
    chosen = next((row for row in rows if row["source_id"] == identity), None)
    if chosen is None:
        raise APIError(
            422, "invalid_photo", "That photo is no longer available. Choose another photo."
        )
    entry.portrait_url = chosen["thumbnail"]
    entry.portrait_source_url = chosen["source_url"]
    entry.portrait_source_id = identity
    entry.portrait_crop = json.dumps(crop) if crop is not None else None
    entry.portrait_attribution = json.dumps(
        {key: chosen[key] for key in ("creator", "license", "title")}
    )
    entry.updated_at = utc_now()
    db.flush()


def reset(db: Session, entry: UserEntry) -> None:
    if entry.catalog.kind != "artist":
        fail("Photos belong on an artist.")
    entry.portrait_url = entry.portrait_source_url = entry.portrait_source_id = None
    entry.portrait_crop = entry.portrait_attribution = None
    entry.updated_at = utc_now()
    db.flush()


def attribution(entry: UserEntry) -> dict | None:
    if not entry.portrait_url:
        return None
    return {
        "source_id": entry.portrait_source_id,
        "source_url": entry.portrait_source_url,
        "crop": json.loads(entry.portrait_crop) if entry.portrait_crop else None,
        **(json.loads(entry.portrait_attribution) if entry.portrait_attribution else {}),
    }
