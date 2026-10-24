"""Temporary Finance API for the hub username Playwright tests.

The database is a new file under /tmp. Nothing here reads or writes a
production database. Signup is open so the tests can create a second
synthetic account. The process is not part of the production server.
"""

from __future__ import annotations

import os
from pathlib import Path


def main() -> None:
    port = int(os.environ.get("USERNAME_E2E_PORT", "8098"))
    root = Path(os.environ.get("USERNAME_E2E_ROOT", f"/tmp/hub-username-e2e-{port}"))
    root.mkdir(parents=True, exist_ok=True)
    database = root / "username.db"
    for extra in (database, Path(f"{database}-wal"), Path(f"{database}-shm")):
        extra.unlink(missing_ok=True)

    os.environ["DATABASE_URL"] = f"sqlite:///{database}"
    os.environ["AUTH_SIGNUP_MODE"] = "open"
    os.environ["SESSION_COOKIE_SECURE"] = "0"
    os.environ["LOCAL_DEV_AUTH"] = "0"
    os.environ["DISABLE_OPENAPI"] = "1"
    os.environ.pop("API_KEY", None)
    os.environ.pop("FINANCE_API_KEY", None)
    os.environ.pop("SITE_DATABASE_URL", None)

    import uvicorn

    from apps.finance.backend.app import app

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
