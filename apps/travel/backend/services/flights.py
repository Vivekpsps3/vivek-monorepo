"""FlightAware AeroAPI lookup.

Manual flight entry always works. One lookup is one GET inside a 20-second
timeout, with ``max_pages=1`` and no cached body. The API key stays on the
server. Advance dates use the schedules route selected by TUX-01; near
departure keeps ``GET /flights/{ident}``; older dates use history.
"""

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx

AEROAPI_ROOT = "https://aeroapi.flightaware.com/aeroapi"
AEROAPI_URL = AEROAPI_ROOT + "/flights/{ident}"
# GET /flights/{ident} rejects a start or end outside this window.
LOOKUP_PAST_DAYS = 10
LOOKUP_FUTURE_DAYS = 2
HISTORY_START = date(2011, 1, 1)
FA_IDENT_LIMIT = 20
SCHEDULE_UNAVAILABLE = "FlightAware has no schedule for that date. Type the times yourself."
SCHEDULE_IDENT = (
    "Future schedules need an airline flight number such as UA 837. Type the times yourself."
)
TIMEOUT_MESSAGE = "FlightAware took too long. Type the times yourself."
UNAVAILABLE_MESSAGE = "FlightAware could not look up that flight. Type the times yourself."
AUTH_MESSAGE = (
    "FlightAware rejected the API key. Type the times yourself. "
    "This is not a suite sign-in failure."
)
THROTTLE_MESSAGE = "FlightAware rate limit reached. Try again shortly."
ENTITLEMENT_MESSAGE = (
    "This FlightAware account does not include historical flights. Type the times yourself."
)
SCHEDULE_CHANGED = "The scheduled departure changed. Your edited time is unchanged."
_SCHEDULE_IDENT = re.compile(r"([A-Z]{2,3})(\d+)")


class FlightAwareError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str,
        retry_after: int | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.retry_after = retry_after


@dataclass(frozen=True)
class LookupResult:
    flights: list[dict]
    incomplete: bool


@dataclass(frozen=True)
class SavedLeg:
    """Identity stored for one saved flight occurrence."""

    ident: str | None
    operating_ident: str | None
    origin: str | None
    destination: str | None
    scheduled_out: str | None
    fa_flight_id: str | None


@dataclass(frozen=True)
class RefreshResolution:
    action: str
    index: int | None = None
    explanation: str | None = None


def normalize_ident(raw: str) -> str:
    text = "".join((raw or "").upper().split())
    if not re.fullmatch(r"[A-Z0-9]{2,12}", text or ""):
        raise ValueError("Enter a flight number such as UA 837.")
    return text


def split_schedule_ident(ident: str) -> tuple[str, int] | None:
    """Airline designator plus an integer flight number. Leading zeros drop."""
    match = _SCHEDULE_IDENT.fullmatch(ident or "")
    if match is None:
        return None
    return match.group(1), int(match.group(2))


def calendar_year_end(today: date) -> date:
    """The last exclusive schedules end: the same month and day next year."""
    try:
        return today.replace(year=today.year + 1)
    except ValueError:
        return date(today.year + 1, 2, 28)


def lookup_route(depart_on: date, today: date) -> str:
    """Which single call serves this UTC departure date.

    Raises ``schedule_unavailable`` before any provider call when the date
    is outside history and the one-year schedules ceiling.
    """
    if depart_on < HISTORY_START:
        raise FlightAwareError(422, SCHEDULE_UNAVAILABLE, code="schedule_unavailable")
    earliest = today - timedelta(days=LOOKUP_PAST_DAYS)
    latest_operational = today + timedelta(days=1)
    if depart_on < earliest:
        return "history"
    if depart_on <= latest_operational:
        return "flights"
    end = depart_on + timedelta(days=1)
    if end > calendar_year_end(today):
        raise FlightAwareError(422, SCHEDULE_UNAVAILABLE, code="schedule_unavailable")
    return "schedules"


def _text(value) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    return text or None


def _token(value) -> str:
    return "".join((_text(value) or "").upper().split())


def _bool(value):
    if isinstance(value, bool):
        return value
    return None


def _strings(value) -> list[str]:
    if not isinstance(value, list):
        return []
    found = []
    for item in value:
        text = _text(item)
        if text:
            found.append(text)
    return found


def _airport(node) -> dict:
    if not isinstance(node, dict):
        return {"iata": None, "icao": None, "city": None, "name": None, "timezone": None}
    iata = _text(node.get("code_iata"))
    icao = _text(node.get("code_icao"))
    code = _text(node.get("code"))
    if not icao and code and code != iata:
        icao = code
    return {
        "iata": iata,
        "icao": icao,
        "city": _text(node.get("city")),
        "name": _text(node.get("name")),
        "timezone": _text(node.get("timezone")),
    }


def _delay(value) -> int | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _fit_ident(value) -> str | None:
    text = _text(value)
    if text is None or len(text) > FA_IDENT_LIMIT:
        return None
    return text


def _candidate(flight: dict, source: str) -> dict | None:
    if not isinstance(flight, dict):
        return None
    ident = _text(flight.get("ident")) or _text(flight.get("ident_iata")) or ""
    if not ident:
        return None
    schedules = source == "schedules"
    if schedules:
        origin = {
            "iata": _text(flight.get("origin_iata")),
            "icao": _text(flight.get("origin_icao")),
            "city": None,
            "name": None,
            "timezone": None,
        }
        destination = {
            "iata": _text(flight.get("destination_iata")),
            "icao": _text(flight.get("destination_icao")),
            "city": None,
            "name": None,
            "timezone": None,
        }
        actual_ident = _text(flight.get("actual_ident"))
        actual_icao = _text(flight.get("actual_ident_icao"))
        actual_iata = _text(flight.get("actual_ident_iata"))
        codeshares: list[str] = []
        codeshares_iata: list[str] = []
        operator = operator_iata = flight_number = None
        status = None
        estimated_out = actual_out = estimated_in = actual_in = None
        gate_origin = gate_destination = None
        terminal_origin = terminal_destination = baggage = None
        departure_delay = arrival_delay = None
        cancelled = diverted = None
    else:
        origin = _airport(flight.get("origin"))
        destination = _airport(flight.get("destination"))
        actual_ident = actual_icao = actual_iata = None
        codeshares = _strings(flight.get("codeshares"))
        codeshares_iata = _strings(flight.get("codeshares_iata"))
        operator = _text(flight.get("operator"))
        operator_iata = _text(flight.get("operator_iata"))
        flight_number = _text(flight.get("flight_number"))
        status = _text(flight.get("status"))
        estimated_out = _text(flight.get("estimated_out"))
        actual_out = _text(flight.get("actual_out"))
        estimated_in = _text(flight.get("estimated_in"))
        actual_in = _text(flight.get("actual_in"))
        gate_origin = _text(flight.get("gate_origin"))
        gate_destination = _text(flight.get("gate_destination"))
        terminal_origin = _text(flight.get("terminal_origin"))
        terminal_destination = _text(flight.get("terminal_destination"))
        baggage = _text(flight.get("baggage_claim"))
        departure_delay = _delay(flight.get("departure_delay"))
        arrival_delay = _delay(flight.get("arrival_delay"))
        cancelled = _bool(flight.get("cancelled"))
        diverted = _bool(flight.get("diverted"))
    return {
        "source": source,
        "fa_flight_id": _text(flight.get("fa_flight_id")),
        "ident": _text(flight.get("ident")) or ident,
        "ident_icao": _text(flight.get("ident_icao")),
        "ident_iata": _text(flight.get("ident_iata")),
        "actual_ident": actual_ident,
        "actual_ident_icao": actual_icao,
        "actual_ident_iata": actual_iata,
        "codeshares": codeshares,
        "codeshares_iata": codeshares_iata,
        "operator": operator,
        "operator_iata": operator_iata,
        "flight_number": flight_number,
        "status": status,
        "aircraft_type": _text(flight.get("aircraft_type")),
        "origin_iata": origin["iata"],
        "origin_icao": origin["icao"],
        "origin_city": origin["city"],
        "origin_name": origin["name"],
        "origin_timezone": origin["timezone"],
        "destination_iata": destination["iata"],
        "destination_icao": destination["icao"],
        "destination_city": destination["city"],
        "destination_name": destination["name"],
        "destination_timezone": destination["timezone"],
        "scheduled_out": _text(flight.get("scheduled_out")),
        "estimated_out": estimated_out,
        "actual_out": actual_out,
        "scheduled_in": _text(flight.get("scheduled_in")),
        "estimated_in": estimated_in,
        "actual_in": actual_in,
        "gate_origin": gate_origin,
        "gate_destination": gate_destination,
        "terminal_origin": terminal_origin,
        "terminal_destination": terminal_destination,
        "baggage_claim": baggage,
        "departure_delay_seconds": departure_delay,
        "arrival_delay_seconds": arrival_delay,
        "cancelled": cancelled,
        "diverted": diverted,
    }


def designator_tokens(candidate: dict) -> set[str]:
    found = set()
    for key in (
        "ident",
        "ident_icao",
        "ident_iata",
        "actual_ident",
        "actual_ident_icao",
        "actual_ident_iata",
    ):
        token = _token(candidate.get(key))
        if token:
            found.add(token)
    for key in ("codeshares", "codeshares_iata"):
        for item in candidate.get(key) or []:
            token = _token(item)
            if token:
                found.add(token)
    return found


def _match_tokens(typed: str) -> set[str]:
    found = {typed}
    parts = split_schedule_ident(typed)
    if parts is not None:
        airline, number = parts
        found.add(f"{airline}{number}")
    return found


def _matches(candidate: dict, typed: str) -> bool:
    return bool(designator_tokens(candidate) & _match_tokens(typed))


def _operating_tokens(candidate: dict) -> set[str]:
    actuals = {
        token
        for token in (
            _token(candidate.get("actual_ident")),
            _token(candidate.get("actual_ident_icao")),
            _token(candidate.get("actual_ident_iata")),
        )
        if token
    }
    if actuals:
        return actuals
    return {
        token
        for token in (
            _token(candidate.get("ident")),
            _token(candidate.get("ident_icao")),
            _token(candidate.get("ident_iata")),
        )
        if token
    } or designator_tokens(candidate)


def _place_tokens(candidate: dict, iata_key: str, icao_key: str) -> set[str]:
    return {
        token
        for token in (_token(candidate.get(iata_key)), _token(candidate.get(icao_key)))
        if token
    }


def parse_flights(
    payload: dict, *, source: str = "flights", typed: str | None = None
) -> list[dict]:
    key = "scheduled" if source == "schedules" else "flights"
    flights = payload.get(key) if isinstance(payload, dict) else None
    if not isinstance(flights, list):
        return []
    parsed = []
    for flight in flights:
        item = _candidate(flight, source)
        if item is None:
            continue
        if typed is not None and not _matches(item, typed):
            continue
        parsed.append(item)
    parsed.sort(key=lambda item: item.get("scheduled_out") or "")
    return parsed


def _incomplete(payload: dict) -> bool:
    links = payload.get("links") if isinstance(payload, dict) else None
    if not isinstance(links, dict):
        return False
    return bool(_text(links.get("next")))


def lookup_bounds(depart_on: date, today: date) -> tuple[date, date]:
    """Inclusive start and exclusive end that the operational flights call accepts.

    End cannot be later than two days ahead, so a departure on that last day
    has no window. Callers use schedules for that date instead.
    """
    earliest = today - timedelta(days=LOOKUP_PAST_DAYS)
    latest = today + timedelta(days=LOOKUP_FUTURE_DAYS)
    if depart_on < earliest or depart_on > latest:
        raise FlightAwareError(422, SCHEDULE_UNAVAILABLE, code="schedule_unavailable")
    end = depart_on + timedelta(days=2)
    if end > latest:
        end = latest
    if end <= depart_on:
        raise FlightAwareError(422, SCHEDULE_UNAVAILABLE, code="schedule_unavailable")
    return depart_on, end


def _request_for(route: str, ident: str, depart_on: date, today: date) -> tuple[str, dict, bool]:
    if route == "schedules":
        parts = split_schedule_ident(ident)
        if parts is None:
            raise ValueError(SCHEDULE_IDENT)
        airline, number = parts
        end = depart_on + timedelta(days=1)
        url = f"{AEROAPI_ROOT}/schedules/{depart_on.isoformat()}/{end.isoformat()}"
        params = {
            "airline": airline,
            "flight_number": str(number),
            "include_codeshares": "true",
            "include_regional": "true",
            "max_pages": "1",
        }
        return url, params, end == calendar_year_end(today)
    if route == "history":
        end = depart_on + timedelta(days=1)
        url = f"{AEROAPI_ROOT}/history/flights/{ident}"
        params = {
            "ident_type": "designator",
            "start": f"{depart_on.isoformat()}T00:00:00Z",
            "end": f"{end.isoformat()}T00:00:00Z",
            "max_pages": "1",
        }
        return url, params, False
    start, end = lookup_bounds(depart_on, today)
    params = {
        "ident_type": "designator",
        "start": f"{start.isoformat()}T00:00:00Z",
        "end": f"{end.isoformat()}T00:00:00Z",
        "max_pages": "1",
    }
    return AEROAPI_URL.format(ident=ident), params, False


def _interpret(response: httpx.Response, route: str, typed: str, anniversary: bool) -> LookupResult:
    status = response.status_code
    if status == 401:
        raise FlightAwareError(502, AUTH_MESSAGE, code="provider_auth")
    if status == 404:
        return LookupResult([], False)
    if status == 429:
        raise FlightAwareError(
            429,
            THROTTLE_MESSAGE,
            code="provider_throttled",
            retry_after=_retry_after(response),
        )
    if status == 400 and route == "schedules" and not anniversary:
        return LookupResult([], False)
    if status == 400 and (route == "history" or anniversary):
        raise FlightAwareError(422, SCHEDULE_UNAVAILABLE, code="schedule_unavailable")
    if route == "history" and status != 200:
        raise FlightAwareError(502, ENTITLEMENT_MESSAGE, code="provider_entitlement")
    if status >= 400:
        raise FlightAwareError(502, UNAVAILABLE_MESSAGE, code="provider_unavailable")
    try:
        payload = response.json()
    except ValueError as exc:
        raise FlightAwareError(502, UNAVAILABLE_MESSAGE, code="provider_unavailable") from exc
    if not isinstance(payload, dict):
        raise FlightAwareError(502, UNAVAILABLE_MESSAGE, code="provider_unavailable")
    source = {"schedules": "schedules", "history": "history"}.get(route, "flights")
    rows = payload.get("scheduled" if source == "schedules" else "flights")
    if rows is None:
        rows = []
    if not isinstance(rows, list):
        raise FlightAwareError(502, UNAVAILABLE_MESSAGE, code="provider_unavailable")
    return LookupResult(parse_flights(payload, source=source, typed=typed), _incomplete(payload))


def lookup_flights(
    ident: str,
    depart_on: date,
    api_key: str,
    client: httpx.Client | None = None,
    *,
    today: date | None = None,
) -> LookupResult:
    """Return one page of candidates. Raises FlightAwareError on provider failure."""
    normalized = normalize_ident(ident)
    current = today or datetime.now(UTC).date()
    route = lookup_route(depart_on, current)
    url, params, anniversary = _request_for(route, normalized, depart_on, current)
    headers = {"x-apikey": api_key, "Accept": "application/json"}
    owns_client = client is None
    client = client or httpx.Client(timeout=20.0)
    try:
        response = client.get(url, params=params, headers=headers)
    except httpx.TimeoutException as exc:
        raise FlightAwareError(504, TIMEOUT_MESSAGE, code="provider_timeout") from exc
    except httpx.HTTPError as exc:
        raise FlightAwareError(502, UNAVAILABLE_MESSAGE, code="provider_unavailable") from exc
    finally:
        if owns_client:
            client.close()
    return _interpret(response, route, normalized, anniversary)


def _retry_after(response: httpx.Response) -> int | None:
    raw = response.headers.get("retry-after")
    if raw is None:
        return None
    try:
        seconds = int(raw)
    except ValueError:
        return None
    if seconds < 0 or seconds > 86400:
        return None
    return seconds


def _key_match(saved: SavedLeg, candidate: dict) -> bool:
    chosen = _token(saved.ident)
    if not chosen or chosen not in designator_tokens(candidate):
        return False
    operating = _token(saved.operating_ident or saved.ident)
    if not operating or operating not in _operating_tokens(candidate):
        return False
    origin = _token(saved.origin)
    destination = _token(saved.destination)
    if origin not in _place_tokens(candidate, "origin_iata", "origin_icao"):
        return False
    if destination not in _place_tokens(candidate, "destination_iata", "destination_icao"):
        return False
    scheduled = _text(saved.scheduled_out)
    return bool(scheduled) and scheduled == _text(candidate.get("scheduled_out"))


def same_occurrence(saved: SavedLeg, candidate: dict) -> bool:
    """One leg occurrence, including a codeshare and a null future flight id."""
    saved_id = _text(saved.fa_flight_id)
    cand_id = _text(candidate.get("fa_flight_id"))
    if saved_id and cand_id:
        return saved_id == cand_id
    return _key_match(saved, candidate)


def resolve_refresh(saved: list[SavedLeg], candidates: list[dict]) -> RefreshResolution:
    """Match one operational page to one saved leg. Never inserts a row."""
    if len(candidates) != 1:
        return RefreshResolution("ambiguous" if candidates else "none")
    hits = [index for index, leg in enumerate(saved) if same_occurrence(leg, candidates[0])]
    if len(hits) != 1:
        return RefreshResolution("ambiguous" if len(hits) > 1 else "none")
    index = hits[0]
    previous = _text(saved[index].scheduled_out)
    current = _text(candidates[0].get("scheduled_out"))
    explanation = SCHEDULE_CHANGED if previous and current and previous != current else None
    return RefreshResolution("update", index, explanation)


def provider_patch(candidate: dict) -> dict:
    """Provider fields only. Departure and arrival edits stay with the caller."""
    ident = _fit_ident(candidate.get("actual_ident") or candidate.get("ident"))
    return {
        "fa_ident": ident,
        "fa_flight_id": _text(candidate.get("fa_flight_id")),
        "fa_status": _text(candidate.get("status")),
        "fa_aircraft": _text(candidate.get("aircraft_type")),
        "fa_gate_origin": _text(candidate.get("gate_origin")),
        "fa_gate_destination": _text(candidate.get("gate_destination")),
        "fa_terminal_origin": _text(candidate.get("terminal_origin")),
        "fa_terminal_destination": _text(candidate.get("terminal_destination")),
        "fa_baggage_claim": _text(candidate.get("baggage_claim")),
        "fa_delay_departure_seconds": candidate.get("departure_delay_seconds"),
        "fa_delay_arrival_seconds": candidate.get("arrival_delay_seconds"),
        "fa_scheduled_out": _text(candidate.get("scheduled_out")),
        "fa_estimated_out": _text(candidate.get("estimated_out")),
        "fa_actual_out": _text(candidate.get("actual_out")),
        "fa_scheduled_in": _text(candidate.get("scheduled_in")),
        "fa_estimated_in": _text(candidate.get("estimated_in")),
        "fa_actual_in": _text(candidate.get("actual_in")),
    }


def refresh_saved_leg(existing: dict, candidate: dict) -> dict:
    """Update provider fields on the same leg. User times stay as saved."""
    updated = dict(existing)
    for key, value in provider_patch(candidate).items():
        if value is None:
            continue
        updated[key] = value
    updated["depart_at"] = existing.get("depart_at")
    updated["arrive_at"] = existing.get("arrive_at")
    return updated
