"""FlightAware lookup, map search, and local settings."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import release_for_provider_io
from apps.server.errors import APIError
from apps.travel.backend.database import get_db
from apps.travel.backend.deps import (
    flightaware_key,
    get_flight_lookup,
    get_geocoder,
    settings_key,
)
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
def read_settings(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    key, source = flightaware_key(db, principal.id)
    person = principal
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
def save_flightaware(
    body: FlightAwareKeyIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    text = body.api_key.strip()
    key_name = settings_key(principal.id, "flightaware_api_key")
    row = db.get(Setting, key_name)
    if not text:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(Setting(key=key_name, value=text))
    else:
        row.value = text
    db.flush()
    key, source = flightaware_key(db, principal.id)
    return {"configured": key is not None, "source": source, "last4": _last4(key)}


@router.delete("/settings/flightaware", status_code=204)
def clear_flightaware(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    row = db.get(Setting, settings_key(principal.id, "flightaware_api_key"))
    if row is not None:
        db.delete(row)


@router.post("/flights/lookup")
def lookup_flight(
    body: FlightLookupIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    lookup=Depends(get_flight_lookup),
):
    key, _source = flightaware_key(db, principal.id)
    if not key:
        raise APIError(
            503,
            "provider_unconfigured",
            "Add a FlightAware AeroAPI key in Settings. You can still type the flight yourself.",
        )
    release_for_provider_io(db)
    try:
        ident = normalize_ident(body.ident)
        flights = lookup(ident, body.depart_on, key)
    except ValueError as exc:
        raise APIError(422, "invalid", str(exc), field_errors={"ident": str(exc)}) from exc
    except FlightAwareError as exc:
        raise APIError(
            exc.status_code,
            exc.code,
            exc.message,
            retry_after=exc.retry_after,
        ) from exc
    return {"ident": body.ident, "depart_on": body.depart_on, "flights": flights}


@router.get("/places/search")
def search_places(
    q: str,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    fetch=Depends(get_geocoder),
):
    try:
        results = cached_search(db, q, fetch)
    except ValueError as exc:
        raise APIError(422, "invalid", str(exc), field_errors={"q": str(exc)}) from exc
    return {"results": results}
