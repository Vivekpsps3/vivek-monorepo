import os

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.finance.backend.database import get_db
from apps.finance.backend.services.market_data import market_data

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db, scope="function")):
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
    overall = "ok" if db_status == "ok" else "degraded"
    body = {
        "status": overall,
        "database": db_status,
        "version": "2.0.0",
    }
    if os.getenv("DEBUG_HEALTH", "").lower() in ("1", "true", "yes"):
        body["cache_size"] = len(market_data._memory)
    if overall != "ok":
        return JSONResponse(status_code=503, content=body)
    return body
