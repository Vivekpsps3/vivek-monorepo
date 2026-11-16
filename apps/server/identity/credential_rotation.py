"""Signing wrap persistence and its shared compare-and-set revision."""

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.server.identity.models import User
from apps.server.identity.schemas import AuthPrivateKeyWrap


def store_auth_wrap(user: User, auth: AuthPrivateKeyWrap) -> None:
    user.auth_kdf_salt_b64 = auth.kdf_salt_b64
    user.auth_kdf_iterations = auth.kdf_iterations
    user.auth_wrapped_private_key_b64 = auth.wrapped_private_key_b64
    incoming_recovery = auth.recovery_wrapped_private_key_b64 or ""
    # Automatic KDF upgrades must preserve unused legacy recovery material.
    if incoming_recovery or not user.auth_recovery_wrapped_private_key_b64:
        user.auth_recovery_wrapped_private_key_b64 = incoming_recovery


def advance_wrap_revision(db: Session, user_id: int, expected: int) -> None:
    changed = db.execute(
        update(User)
        .where(User.id == user_id, User.credential_wrap_revision == expected)
        .values(credential_wrap_revision=expected + 1)
    )
    if getattr(changed, "rowcount", 0) != 1:
        raise HTTPException(409, "Credential wraps changed. Reload and try again.")
