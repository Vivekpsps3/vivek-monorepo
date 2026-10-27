"""Change the signed-in account's username without touching wrapped keys.

Login, the vault, and sessions already key off the numeric user id. The
username is only the lookup label and, for passwordless accounts, the
``{username}@pending.local`` mailbox. A rename updates those labels in the
caller's open transaction. It does not re-wrap the signing key or the vault
DEK, and it does not revoke sessions.
"""

from __future__ import annotations

import json

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.identity.challenge_auth import PURPOSE_USERNAME_CHANGE, verify_challenge
from apps.server.identity.models import User
from apps.server.identity.schemas import UsernameChangeRequest
from apps.server.identity.session import audit_event, utc_now_naive
from apps.server.identity.username_policy import InvalidUsername, stored_username
from apps.server.rate_limit import (
    enforce_login_pair_limit,
    failed_verify_blocked,
    note_failed_verify,
)

_RATE_DETAIL = "Rate limit exceeded; retry later"
_PROOF_DETAIL = "Invalid or expired vault authentication challenge"
_CONFLICT_DETAIL = "Username already exists"


def _as_str(value: object) -> str:
    return value if isinstance(value, str) else ""


def _audit_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = "".join(char for char in value if char.isprintable())
    return cleaned[:64]


def _write_audit(
    db: Session,
    user_id: int,
    old_name: object,
    new_name: object,
    *,
    success: bool,
    reason: str | None,
) -> None:
    payload: dict[str, object] = {
        "old_username": _audit_name(old_name),
        "new_username": _audit_name(new_name),
        "success": success,
    }
    if reason:
        payload["reason"] = reason
    audit_event(
        db,
        "username_changed",
        actor_user_id=user_id,
        target_user_id=user_id,
        detail=json.dumps(payload, separators=(",", ":")),
    )


def _fail(
    db: Session,
    user_id: int,
    old_name: object,
    new_name: object,
    reason: str,
) -> None:
    """Persist the failure audit, then let the request abort the rename."""
    _write_audit(db, user_id, old_name, new_name, success=False, reason=reason)
    db.commit()


def _synthetic_email(username: str) -> str:
    return f"{username}@pending.local"


def _email_follows_username(user: User) -> bool:
    current = _as_str(user.username).strip().lower()
    email = _as_str(user.email).strip().lower()
    return bool(current) and email == _synthetic_email(current)


def _replacement_email(user: User, new_name: str) -> str | None:
    """Move ``{old}@pending.local`` with the username. Leave a real mailbox put."""
    if not _email_follows_username(user):
        return None
    return _synthetic_email(new_name)


def _request_origin(request: Request) -> str:
    return request.headers.get("origin") or str(request.base_url).rstrip("/")


def _taken(
    db: Session, user_id: int, *, username: str | None = None, email: str | None = None
) -> bool:
    """Stored names and mailboxes are lowercase, so equality uses the unique indexes."""
    query = db.query(User.id).filter(User.id != user_id)
    if username is not None and email is not None:
        query = query.filter((User.username == username) | (User.email == email))
    elif username is not None:
        query = query.filter(User.username == username)
    elif email is not None:
        query = query.filter(User.email == email)
    else:
        return False
    return query.first() is not None


def _set(user: User, field: str, value: object) -> None:
    setattr(user, field, value)


def apply_username(db: Session, user: User, new_name: str, new_email: str | None) -> None:
    """Point the account at the new label. Wrapped keys stay on this row."""
    _set(user, "username", new_name)
    if new_email is not None:
        _set(user, "email", new_email)
    _set(user, "updated_at", utc_now_naive())
    db.flush()


def change_username(db: Session, user: User, body: UsernameChangeRequest, request: Request) -> User:
    user_id = int(user.id)
    old_name = _as_str(user.username) or None
    account = _as_str(user.username).strip().lower() or f"id:{user_id}"
    attempted = body.username

    try:
        enforce_login_pair_limit(account, request)
    except HTTPException as exc:
        if exc.status_code == 429:
            _fail(db, user_id, old_name, attempted, "rate_limit")
        raise

    if not verify_challenge(
        db,
        user,
        body.challenge_id,
        body.challenge,
        body.message,
        body.signature_b64,
        _request_origin(request),
        PURPOSE_USERNAME_CHANGE,
    ):
        if failed_verify_blocked(account):
            _fail(db, user_id, old_name, attempted, "rate_limit")
            raise HTTPException(status_code=429, detail=_RATE_DETAIL)
        note_failed_verify(account)
        _fail(db, user_id, old_name, attempted, "passphrase")
        raise HTTPException(status_code=401, detail=_PROOF_DETAIL)

    try:
        new_name = stored_username(body.username)
    except InvalidUsername:
        _fail(db, user_id, old_name, attempted, "invalid")
        raise HTTPException(status_code=400, detail="Invalid username") from None

    if _as_str(user.username).strip().lower() == new_name:
        _write_audit(db, user_id, old_name, new_name, success=True, reason=None)
        return user

    new_email = _replacement_email(user, new_name)
    if _taken(db, user_id, username=new_name) or (
        new_email is not None and _taken(db, user_id, email=new_email)
    ):
        _fail(db, user_id, old_name, new_name, "collision")
        raise HTTPException(status_code=409, detail=_CONFLICT_DETAIL)

    try:
        # The savepoint rolls the rename back and leaves the challenge spend in
        # the outer transaction. A full rollback here would make the proof reusable.
        with db.begin_nested():
            apply_username(db, user, new_name, new_email)
    except IntegrityError:
        _fail(db, user_id, old_name, new_name, "collision")
        raise HTTPException(status_code=409, detail=_CONFLICT_DETAIL) from None

    _write_audit(db, user_id, old_name, new_name, success=True, reason=None)
    return user
