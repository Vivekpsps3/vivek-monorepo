"""Central logging setup for the Finance Tracker API."""

from __future__ import annotations

import logging
import os
import sys
from typing import Any, Dict, Optional

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_ACCESS_HEALTH = os.getenv("LOG_HEALTH", "").lower() in ("1", "true", "yes")

DEFAULT_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: Optional[str] = None) -> None:
    """Configure root and noisy third-party loggers once at process start."""
    lvl = getattr(logging, (level or LOG_LEVEL).upper(), logging.INFO)

    root = logging.getLogger()
    if root.handlers:
        root.setLevel(lvl)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(DEFAULT_FORMAT, datefmt=DATE_FORMAT))
    root.addHandler(handler)
    root.setLevel(lvl)

    # Quieter libraries unless DEBUG
    for name, default in (
        ("uvicorn.access", logging.WARNING),
        ("uvicorn.error", logging.INFO),
        ("httpx", logging.WARNING),
        ("httpcore", logging.WARNING),
        (
            "yfinance",
            logging.CRITICAL,
        ),  # yfinance can be noisy for bad symbols; we skip most via heuristic
        ("peewee", logging.WARNING),
    ):
        logging.getLogger(name).setLevel(logging.DEBUG if lvl <= logging.DEBUG else default)

    logging.getLogger("finance_api").setLevel(lvl)


def get_logger(name: str = "finance_api") -> logging.Logger:
    return logging.getLogger(name)


def uvicorn_log_config() -> Dict[str, Any]:
    """Pass to uvicorn.run(..., log_config=...) for consistent formatting."""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": DEFAULT_FORMAT,
                "datefmt": DATE_FORMAT,
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "uvicorn": {"handlers": ["default"], "level": LOG_LEVEL},
            "uvicorn.error": {"handlers": ["default"], "level": LOG_LEVEL, "propagate": False},
            "uvicorn.access": {"handlers": ["default"], "level": "WARNING", "propagate": False},
            "finance_api": {"handlers": ["default"], "level": LOG_LEVEL, "propagate": False},
        },
        "root": {"handlers": ["default"], "level": LOG_LEVEL},
    }


def redact_database_url(url: str) -> str:
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        if "@" in rest:
            creds, host = rest.rsplit("@", 1)
            return f"{scheme}://***@{host}"
    return url
