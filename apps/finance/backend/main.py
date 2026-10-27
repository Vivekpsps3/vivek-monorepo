"""Finance names the site process and tests share.

Historical Finance fixtures publish app and engine here. Production composition uses
apps.server.main and never publishes ambient app/database state. Import opens nothing.
"""

from typing import cast

from fastapi import FastAPI
from sqlalchemy.engine import Engine

from apps.finance.backend.logging_config import uvicorn_log_config
from apps.finance.backend.models import Base
from apps.finance.backend.services.market_data import market_data

app = cast(FastAPI, None)
engine = cast(Engine, None)

__all__ = ["Base", "app", "engine", "market_data", "uvicorn_log_config"]
