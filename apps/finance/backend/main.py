"""
ASGI entrypoint. Tests and uvicorn use: uvicorn main:app
"""
from apps.finance.backend.app import app, uvicorn_log_config
from apps.finance.backend.database import engine
from apps.finance.backend.models import Base
from apps.finance.backend.services.market_data import market_data

__all__ = ["app", "engine", "Base", "market_data"]

if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", os.getenv("API_PORT", "8000"))),
        log_config=uvicorn_log_config(),
    )