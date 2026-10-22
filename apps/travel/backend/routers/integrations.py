"""FlightAware lookup, map search, and local settings."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.travel.backend.database import get_db
from apps.travel.backend.deps import flightaware_key, get_flight_lookup, get_geocoder, require_actor, settings_key
from apps.travel.backend.models import Setting
from apps.travel.backend.schemas import FlightAwareKeyIn, FlightLookupIn
from apps.travel.backend.services.flights import FlightAwareError, normalize_ident
from apps.travel.backend.services.places import cached_search

router = APIRouter()


def _last4(value: str | None) -> str | None:
    if not value:
        return None
    return value[-4:]


@router.get("/settings")
def read_settings(db: Session = Depends(get_db)):
    key, source = flightaware_key(db)
    person = require_actor()
    return {
        "flightaware": {
            "configured": key is not None,
            "source": source,
            "last4": _last4(key),
        },
        "account": {
            "id": person.id,
            "name": person.display_name,
        },
        "map": {
            "provider": "openstreetmap",
            "search": "nominatim",
        },
    }


@router.put("/settings/flightaware")
def save_flightaware(body: FlightAwareKeyIn, db: Session = Depends(get_db)):
    text = body.api_key.strip()
    key_name = settings_key("flightaware_api_key")
    row = db.get(Setting, key_name)
    if not text:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(Setting(key=key_name, value=text))
    else:
        row.value = text
    db.flush()
    key, source = flightaware_key(db)
    return {"configured": key is not None, "source": source, "last4": _last4(key)}


@router.delete("/settings/flightaware", status_code=204)
def clear_flightaware(db: Session = Depends(get_db)):
    row = db.get(Setting, settings_key("flightaware_api_key"))
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



