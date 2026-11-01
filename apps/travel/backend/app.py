"""Travel API routes. The root application owns frontend delivery."""

from datetime import date

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.server.database import get_db
from apps.travel.backend.routers import board, integrations, leave, pto, trips
from apps.travel.backend.services.leave_math import (
    ACCRUAL_COPY,
    CADENCE_COPY,
    CAP_COPY,
    HPD_COPY,
    START_COPY,
    YEAR_COPY,
    as_of_copy,
)

_PAINTER = {
    "start_balance_hours": START_COPY,
    "accrual_hours": ACCRUAL_COPY,
    "accrual_cadence": CADENCE_COPY,
    "cap_hours": CAP_COPY,
    "year_start": YEAR_COPY,
    "hours_per_day": HPD_COPY,
}
_LOC_SKIP = ("body", "query", "path")


def _field_copy(field: str, msg: str) -> str:
    if field == "balance_as_of":
        return as_of_copy(date.today())
    return _PAINTER.get(field, msg)


def validation_response(exc: RequestValidationError) -> JSONResponse:
    messages = []
    field_errors: dict[str, str] = {}
    for err in exc.errors():
        msg = err.get("msg", "Check this field.")
        prefix = "Value error, "
        if isinstance(msg, str) and msg.startswith(prefix):
            msg = msg[len(prefix) :]
        loc = [str(item) for item in err.get("loc", []) if item not in _LOC_SKIP]
        messages.append(f"{' / '.join(loc)}: {msg}" if loc else str(msg))
        if loc:
            field_errors.setdefault(loc[0], _field_copy(loc[0], msg))
    detail = " ".join(messages) or "Check the form and try again."
    return JSONResponse(
        status_code=422,
        content={"detail": detail, "code": "validation_error", "field_errors": field_errors},
    )


def register_travel(application: FastAPI) -> None:
    @application.get("/travel/api/health")
    def health(db: Session = Depends(get_db, scope="function")):
        try:
            db.execute(text("SELECT id FROM trips LIMIT 1"))
        except Exception:
            db.rollback()
            return JSONResponse(status_code=503, content={"status": "unavailable", "app": "travel"})
        return {"status": "ok", "app": "travel"}

    application.include_router(board.router, prefix="/travel/api")
    application.include_router(trips.router, prefix="/travel/api")
    application.include_router(pto.router, prefix="/travel/api")
    application.include_router(leave.router, prefix="/travel/api")
    application.include_router(integrations.router, prefix="/travel/api")
