"""Travel API routes. The root application owns frontend delivery."""

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.server.database import get_db
from apps.travel.backend.routers import board, integrations, pto, trips


def validation_response(exc: RequestValidationError) -> JSONResponse:
    messages = []
    for err in exc.errors():
        msg = err.get("msg", "Check this field.")
        prefix = "Value error, "
        if isinstance(msg, str) and msg.startswith(prefix):
            msg = msg[len(prefix) :]
        loc = [str(item) for item in err.get("loc", []) if item not in ("body", "query")]
        messages.append(f"{' / '.join(loc)}: {msg}" if loc else str(msg))
    detail = " ".join(messages) or "Check the form and try again."
    return JSONResponse(status_code=422, content={"detail": detail})


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
    application.include_router(integrations.router, prefix="/travel/api")
