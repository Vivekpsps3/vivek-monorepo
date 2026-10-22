"""Local-only auth bypass. Off unless LOCAL_DEV_AUTH is explicitly enabled.

Activating the flag is not enough. The request host must be loopback, or
`apps/finance/backend/.env.development` must exist and set LOCAL_DEV_AUTH
itself. Production does not load that file and does not set the flag.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from apps.finance.backend.models import User, UserRole

LOCAL_DEV_USERNAME = "local-dev"
LOCAL_DEV_EMAIL = "local-dev@localhost"
LOCAL_DEV_DISPLAY_NAME = "Local Dev"

_ON = frozenset({"1", "true", "yes", "on"})
_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

BACKEND_DIR = Path(__file__).resolve().parent


def dev_env_file() -> Path:
    return BACKEND_DIR / ".env.development"


def passphrase_file() -> Path:
    return BACKEND_DIR / ".local-dev" / "vault-passphrase"


def _flag_on(value: str | None) -> bool:
    return (value or "").strip().strip('"').strip("'").lower() in _ON


def local_dev_auth_requested() -> bool:
    return _flag_on(os.getenv("LOCAL_DEV_AUTH"))


def _file_enables_local_dev(path: Path) -> bool:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "LOCAL_DEV_AUTH" and _flag_on(value):
            return True
    return False


def load_dev_env_file() -> None:
    """Load the gitignored dev env file without overriding variables already set."""
    path = dev_env_file()
    if not path.is_file() or not _file_enables_local_dev(path):
        return
    from dotenv import load_dotenv

    load_dotenv(path, override=False)
    os.environ["FINANCE_DEV_ENV_FILE"] = str(path.resolve())


def dev_env_file_in_use() -> bool:
    marker = os.getenv("FINANCE_DEV_ENV_FILE", "").strip()
    if not marker:
        return False
    expected = dev_env_file()
    try:
        marker_path = Path(marker).resolve()
        expected_path = expected.resolve()
    except OSError:
        return False
    return (
        marker_path == expected_path
        and expected_path.is_file()
        and _file_enables_local_dev(expected_path)
    )


def hostname_from_host_header(value: str) -> str:
    host = value.strip().lower().rstrip(".")
    if host.startswith("["):
        end = host.find("]")
        return host[1:end] if end > 1 else ""
    if host == "::1":
        return host
    if host.count(":") == 1:
        return host.split(":", 1)[0]
    return host


def request_host_is_local(request: Request) -> bool:
    return hostname_from_host_header(request.headers.get("host") or "") in _LOCAL_HOSTS


def local_dev_override_active(request: Request) -> bool:
    if not local_dev_auth_requested():
        return False
    return request_host_is_local(request) or dev_env_file_in_use()


def is_local_dev_identity(user: User) -> bool:
    return user.email == LOCAL_DEV_EMAIL and user.username == LOCAL_DEV_USERNAME


def ensure_local_dev_user(db: Session) -> User:
    from apps.finance.backend.auth import create_user

    existing = db.query(User).filter(User.email == LOCAL_DEV_EMAIL).one_or_none()
    if existing:
        changed = False
        if existing.username != LOCAL_DEV_USERNAME:
            taken = (
                db.query(User)
                .filter(User.username == LOCAL_DEV_USERNAME, User.id != existing.id)
                .first()
            )
            if taken:
                raise HTTPException(
                    status_code=409,
                    detail="The local dev username is already used by another account",
                )
            existing.username = LOCAL_DEV_USERNAME
            changed = True
        if not existing.is_active:
            existing.is_active = True
            changed = True
        if existing.must_change_password:
            existing.must_change_password = False
            changed = True
        if existing.display_name != LOCAL_DEV_DISPLAY_NAME:
            existing.display_name = LOCAL_DEV_DISPLAY_NAME
            changed = True
        if existing.role != UserRole.admin:
            existing.role = UserRole.admin
            changed = True
        if changed:
            db.commit()
            db.refresh(existing)
        return existing
    taken = db.query(User).filter(User.username == LOCAL_DEV_USERNAME).one_or_none()
    if taken:
        raise HTTPException(
            status_code=409, detail="The local dev username is already used by another account"
        )
    user = create_user(
        db,
        email=LOCAL_DEV_EMAIL,
        display_name=LOCAL_DEV_DISPLAY_NAME,
        password=None,
        role=UserRole.admin,
        must_change_password=False,
    )
    user.username = LOCAL_DEV_USERNAME
    db.commit()
    db.refresh(user)
    return user


def open_local_dev_session(db: Session, request: Request, response: Response) -> User:
    """Mint a session for the deterministic local dev user.

    Mutations still need the CSRF cookie from an earlier GET, so the normal
    double-submit check stays in place.
    """
    from apps.finance.backend.auth import create_session

    if request.method not in ("GET", "HEAD", "OPTIONS"):
        raise HTTPException(status_code=401, detail="Login required")
    user = ensure_local_dev_user(db)
    create_session(db, user, request, response)
    return user


def local_dev_vault_passphrase() -> str:
    """Passphrase for the local-dev vault only. Generated on this machine, never committed."""
    path = passphrase_file()
    try:
        if path.is_file():
            current = path.read_text(encoding="utf-8").strip()
            if len(current) >= 12:
                return current
    except OSError:
        pass
    path.parent.mkdir(mode=0o700, exist_ok=True)
    generated = secrets.token_urlsafe(32)
    path.write_text(generated + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    return generated
