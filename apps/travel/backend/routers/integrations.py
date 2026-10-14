"""FlightAware lookup, map search, and local settings."""

import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from database import get_db
from deps import access_token, flightaware_key, get_flight_lookup, get_geocoder
from models import Setting
from schemas import FlightAwareKeyIn, FlightLookupIn, SessionIn
from services.flights import FlightAwareError, normalize_ident
from services.places import cached_search

router = APIRouter()


def _last4(value: str | None) -> str | None:
    if not value:
        return None
    return value[-4:]


@router.get("/settings")
def read_settings(db: Session = Depends(get_db)):
    key, source = flightaware_key(db)
    return {
        "flightaware": {
            "configured": key is not None,
            "source": source,
            "last4": _last4(key),
        },
        "access_locked": bool(access_token()),
        "map": {
            "provider": "openstreetmap",
            "search": "nominatim",
        },
    }


@router.put("/settings/flightaware")
def save_flightaware(body: FlightAwareKeyIn, db: Session = Depends(get_db)):
    text = body.api_key.strip()
    row = db.get(Setting, "flightaware_api_key")
    if not text:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(Setting(key="flightaware_api_key", value=text))
    else:
        row.value = text
    db.flush()
    key, source = flightaware_key(db)
    return {"configured": key is not None, "source": source, "last4": _last4(key)}


@router.delete("/settings/flightaware", status_code=204)
def clear_flightaware(db: Session = Depends(get_db)):
    row = db.get(Setting, "flightaware_api_key")
    if row is not None:
        db.delete(row)


@router.post("/flights/lookup")
def lookup_flight(
    body: FlightLookupIn,
    db: Session = Depends(get_db),
    lookup=Depends(get_flight_lookup),
):
    key, _source = flightaware_key(db)
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Add a FlightAware AeroAPI key in Settings. You can still type the flight yourself.",
        )
    try:
        ident = normalize_ident(body.ident)
        flights = lookup(ident, body.depart_on, key)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FlightAwareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {"ident": body.ident, "depart_on": body.depart_on, "flights": flights}


@router.get("/places/search")
def search_places(q: str, db: Session = Depends(get_db), fetch=Depends(get_geocoder)):
    try:
        results = cached_search(db, q, fetch)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"results": results}


def _match(got: str, expected: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(got.encode("utf-8")).digest(),
        hashlib.sha256(expected.encode("utf-8")).digest(),
    )


@router.post("/session")
def open_session(body: SessionIn, response: Response):
    expected = access_token()
    if not expected:
        return {"ok": True, "locked": False}
    if not _match(body.token, expected):
        raise HTTPException(status_code=401, detail="That passphrase does not match.")
    response.set_cookie(
        "travel_access",
        expected,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=_cookie_secure(),
    )
    return {"ok": True, "locked": True}


@router.post("/session/logout", status_code=204)
def close_session(response: Response):
    response.delete_cookie("travel_access")


def _cookie_secure() -> bool:
    import os

    return os.getenv("TRAVEL_COOKIE_SECURE", "").lower() in ("1", "true", "yes")
