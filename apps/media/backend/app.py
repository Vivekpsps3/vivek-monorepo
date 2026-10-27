"""Media API routes. The root application owns frontend delivery."""

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.media.backend.routers import journal
from apps.server.database import get_db


def register_media(application: FastAPI) -> None:
    @application.get("/media/api/health")
    def health(db: Session = Depends(get_db, scope="function")):
        try:
            db.execute(text("SELECT id FROM user_entries LIMIT 1"))
        except Exception:
            db.rollback()
            return JSONResponse(status_code=503, content={"status": "unavailable", "app": "media"})
        return {"status": "ok", "app": "media"}

    application.include_router(journal.router, prefix="/media/api")
