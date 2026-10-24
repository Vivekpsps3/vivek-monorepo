"""Temporary Finance API for the hub username Playwright tests.

The database is a new file under /tmp. Nothing here reads or writes a
production database. Signup is open so the tests can create a second
synthetic account. The process is not part of the production server.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import HTTPException, Request


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
    from fastapi import Depends

    from apps.finance.backend.app import app
    from apps.finance.backend.auth import get_current_user
    from apps.finance.backend.database import get_db
    from apps.finance.backend.models import User

    @app.post("/api/e2e/legacy-email-username")
    async def adopt_legacy_email_username(
        request: Request,
        db=Depends(get_db),
        user=Depends(get_current_user),
    ) -> dict[str, str]:
        """Test-only rewrite. This process uses a temp database and is not production."""
        payload = await request.json()
        username = payload.get("username") if isinstance(payload, dict) else None
        if username != "legacy.user@example.com":
            raise HTTPException(status_code=400, detail="unsupported legacy username")
        db.query(User).filter(User.id == user.id).update(
            {"username": username}, synchronize_session=False
        )
        return {"username": username}

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
