from __future__ import annotations

import base64
import binascii
import hashlib
import logging
import secrets
from datetime import timedelta

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.finance.backend.admin_tools import admin_metrics, delete_user_account, reset_user_contents
from apps.finance.backend.auth import (
    audit_event,
    clear_session_cookie,
    complete_migration_session,
    create_session,
    create_user,
    current_session_id,
    get_current_admin,
    get_current_migration_user,
    get_current_user,
    normalize_email,
    public_user,
    repair_csrf_cookie,
    revoke_user_sessions,
    utc_now_naive,
    verify_password,
)
from apps.finance.backend.database import get_db
from apps.finance.backend.models import AuthEnrollment, User, UserRole, UserSession
from apps.finance.backend.rate_limit import (
    enforce_account_rate_limit,
    enforce_login_pair_limit,
    failed_verify_blocked,
    note_failed_verify,
)
from apps.finance.backend.schemas_auth import (
    AdminInvitationResponse,
    AdminUserContentReset,
    AdminUserCreate,
    AdminUserUpdate,
    AuthPrivateKeyWrap,
    BootstrapStatusResponse,
    InvitationEnrollRequest,
    InvitationPreview,
    LoginRequest,
    LoginResponse,
    MeResponse,
    PasswordlessBootstrapRequest,
    PasswordlessChallengeRequest,
    PasswordlessChallengeResponse,
    PasswordlessEnrollRequest,
    PasswordlessSignupRequest,
    PasswordlessVerifyRequest,
    SelfDataResetRequest,
    SignupPolicyResponse,
    UserPublic,
)
from apps.finance.backend.services import encrypted_storage as vault_store
from apps.finance.backend.services.auth_decoy import decoy_passwordless_material
from apps.finance.backend.services.challenge_auth import (
    CHALLENGE_TTL,
    PROTOCOL,
    PURPOSE_LOGIN,
    issue_challenge,
    verify_challenge,
)
from apps.finance.backend.services.signup_gate import (
    SIGNUP_UNAVAILABLE,
    invite_code_matches,
    signup_mode,
    signup_policy,
    username_allowlisted,
)
from apps.finance.backend.services.username_policy import stored_username

router = APIRouter(tags=["auth"])
logger = logging.getLogger("finance.auth")


def _origin(request: Request) -> str:
    return request.headers.get("origin") or str(request.base_url).rstrip("/")


def _find_passwordless_user(db: Session, identifier: str) -> User | None:
    """Resolve passwordless login by username only.

    The mailbox is not an alias. ``alice@pending.local`` does not select the
    account whose username is ``alice``. A legacy username that itself contains
    ``@`` matches that username column, exactly and then in lowercase form.
    """
    raw = identifier.strip()
    key = normalize_email(identifier)
    if not raw:
        return None
    if "@" in raw:
        exact = db.query(User).filter(User.username == raw).first()
        if exact is not None:
            return exact
        if not key:
            return None
        # Login lowercases first. A legacy username may still be mixed case.
        return db.query(User).filter(func.lower(User.username) == key).first()
    if not key:
        return None
    return db.query(User).filter(User.username == key).first()


def _user_response(user: User) -> UserPublic:
    return UserPublic.model_validate(public_user(user))


def _require_p256_public_key(public_key_b64: str) -> None:
    try:
        key = serialization.load_der_public_key(base64.b64decode(public_key_b64, validate=True))
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Invalid public key") from exc
    if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
        raise HTTPException(status_code=400, detail="A P-256 public key is required")


def _store_auth_wrap(user: User, auth: AuthPrivateKeyWrap) -> None:
    user.auth_kdf_salt_b64 = auth.kdf_salt_b64
    user.auth_kdf_iterations = auth.kdf_iterations
    user.auth_wrapped_private_key_b64 = auth.wrapped_private_key_b64
    incoming_recovery = auth.recovery_wrapped_private_key_b64 or ""
    # An empty update must not wipe a stored recovery wrap. The column is unused
    # by current clients, and KDF re-wrap sends an empty string.
    if incoming_recovery or not user.auth_recovery_wrapped_private_key_b64:
        user.auth_recovery_wrapped_private_key_b64 = incoming_recovery


def _auth_material(user: User) -> dict:
    """Signing-key wrap only. The vault DEK stays on the authenticated status route."""
    return {
        "auth": {
            "kdf_salt_b64": user.auth_kdf_salt_b64,
            "kdf_iterations": user.auth_kdf_iterations,
            "wrapped_private_key_b64": user.auth_wrapped_private_key_b64,
            "recovery_wrapped_private_key_b64": "",
        },
    }


def _passwordless_record_complete(user: User | None, vault: object | None) -> bool:
    return not (
        not user
        or not user.is_active
        or not user.auth_public_key_b64
        or not user.auth_wrapped_private_key_b64
        or not user.auth_kdf_salt_b64
        or not user.auth_kdf_iterations
        or vault is None
    )


def _user_and_vault(db: Session, identifier: str) -> tuple[User | None, object | None]:
    """Load the account and always query the vault table.

    A miss used to return before ``get_vault``. That extra query on a hit was a
    repeatable timing difference. Unknown identifiers still run the vault read.
    """
    user = _find_passwordless_user(db, identifier)
    vault = vault_store.get_vault(db, user.id if user is not None else 0)
    return user, vault


def _decoy_challenge(request: Request, purpose: str) -> dict:
    expires_at = utc_now_naive() + CHALLENGE_TTL
    challenge_id = secrets.token_urlsafe(24)
    return {
        "challenge_id": challenge_id,
        "challenge": secrets.token_urlsafe(32),
        "message": "\n".join(
            [PROTOCOL, _origin(request), challenge_id, purpose, expires_at.isoformat()]
        ),
        "expires_at": expires_at,
    }


@router.get("/auth/bootstrap-status", response_model=BootstrapStatusResponse)
def bootstrap_status(db: Session = Depends(get_db)):
    return {"needs_setup": db.query(User).count() == 0}


@router.get("/auth/signup-policy", response_model=SignupPolicyResponse)
def passwordless_signup_policy():
    return signup_policy()


@router.post("/auth/bootstrap/passwordless", response_model=LoginResponse)
def passwordless_bootstrap_first_admin(
    body: PasswordlessBootstrapRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    enforce_account_rate_limit(body.username)
    if db.query(User).count() != 0:
        raise HTTPException(status_code=409, detail="Setup is already complete")
    username = stored_username(body.username)
    _require_p256_public_key(body.public_key_b64)
    user = create_user(
        db,
        email=f"{username}@pending.local",
        display_name=body.display_name,
        role=UserRole.admin,
        must_change_password=False,
    )
    user.username = username
    user.auth_public_key_b64 = body.public_key_b64
    user.auth_algorithm = "ECDSA_P256_SHA256"
    user.auth_key_version = 1
    _store_auth_wrap(user, body.auth)
    user.passwordless_enrolled_at = utc_now_naive()
    vault_store.create_vault(
        db,
        user.id,
        **body.vault.model_dump(),
    )
    csrf = create_session(db, user, request, response)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/signup/passwordless", response_model=LoginResponse)
def passwordless_signup(
    body: PasswordlessSignupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Create an account when signup policy allows it. Closed by default."""
    enforce_account_rate_limit(body.username)
    mode = signup_mode()
    username = stored_username(body.username)
    if mode == "closed":
        raise HTTPException(status_code=403, detail=SIGNUP_UNAVAILABLE)
    if mode == "invite" and not invite_code_matches(body.invite_code):
        raise HTTPException(status_code=403, detail=SIGNUP_UNAVAILABLE)
    if mode == "allowlist" and not username_allowlisted(username):
        raise HTTPException(status_code=403, detail=SIGNUP_UNAVAILABLE)
    if mode not in {"open", "invite", "allowlist"}:
        raise HTTPException(status_code=403, detail=SIGNUP_UNAVAILABLE)
    if "@" in username:
        raise HTTPException(status_code=422, detail="Username cannot be an email address")
    if db.query(User).filter(User.username == username).first():
        if mode != "open":
            raise HTTPException(status_code=403, detail=SIGNUP_UNAVAILABLE)
        raise HTTPException(status_code=409, detail="Username already exists")
    _require_p256_public_key(body.public_key_b64)
    display = (body.display_name or "").strip() or username
    is_first = db.query(User).count() == 0
    user = create_user(
        db,
        email=f"{username}@pending.local",
        display_name=display,
        role=UserRole.admin if is_first else UserRole.user,
        must_change_password=False,
    )
    user.username = username
    user.auth_public_key_b64 = body.public_key_b64
    user.auth_algorithm = "ECDSA_P256_SHA256"
    user.auth_key_version = 1
    _store_auth_wrap(user, body.auth)
    user.passwordless_enrolled_at = utc_now_naive()
    vault_store.create_vault(db, user.id, **body.vault.model_dump())
    audit_event(db, "passwordless_signup", actor_user_id=user.id, target_user_id=user.id)
    csrf = create_session(db, user, request, response)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/login/migrate", response_model=LoginResponse)
def login_migrate(
    body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == normalize_email(body.email)).first()
    if (
        not user
        or user.auth_public_key_b64
        or not user.is_active
        or not verify_password(body.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    csrf = create_session(db, user, request, response, migration_only=True)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/passwordless/enroll")
def enroll_passwordless(
    body: PasswordlessEnrollRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_migration_user),
):
    username = stored_username(body.username)
    if db.query(User).filter(User.username == username, User.id != current_user.id).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    if vault_store.get_vault(db, current_user.id):
        raise HTTPException(status_code=409, detail="Vault already exists for this account")
    _require_p256_public_key(body.public_key_b64)
    current_user.username = username
    current_user.auth_public_key_b64 = body.public_key_b64
    current_user.auth_algorithm = "ECDSA_P256_SHA256"
    current_user.auth_key_version = 1
    _store_auth_wrap(current_user, body.auth)
    current_user.passwordless_enrolled_at = utc_now_naive()
    current_user.password_hash = None
    current_user.must_change_password = False
    vault_store.create_vault(db, current_user.id, **body.vault.model_dump())
    complete_migration_session(db, request)
    audit_event(
        db, "passwordless_enrolled", actor_user_id=current_user.id, target_user_id=current_user.id
    )
    db.commit()
    return {"ok": True}


@router.post("/auth/passwordless/lookup")
def passwordless_lookup(body: PasswordlessChallengeRequest, db: Session = Depends(get_db)):
    # No per-account limit. The response is deterministic, and sharing a budget
    # with verify let one IP hold the owner's login at 429. The IP limiter still applies.
    decoy = decoy_passwordless_material(body.username)
    user, vault = _user_and_vault(db, body.username)
    if not _passwordless_record_complete(user, vault):
        return decoy
    assert user is not None
    return _auth_material(user)


@router.post("/auth/passwordless/challenge", response_model=PasswordlessChallengeResponse)
def passwordless_challenge(
    body: PasswordlessChallengeRequest, request: Request, db: Session = Depends(get_db)
):
    enforce_login_pair_limit(body.username, request)
    user = _find_passwordless_user(db, body.username)
    if not user or not user.is_active or not user.auth_public_key_b64:
        return _decoy_challenge(request, body.purpose)
    challenge, raw, message = issue_challenge(db, user, _origin(request), body.purpose)
    db.commit()
    return {
        "challenge_id": challenge.challenge_id,
        "challenge": raw,
        "message": message,
        "expires_at": challenge.expires_at,
    }


@router.get("/auth/passwordless/wraps")
def read_passwordless_wraps(current_user: User = Depends(get_current_user)):
    """Signing-key wrap for the signed-in account. Unlock uses this when the browser has no cached wrap."""
    if (
        not current_user.auth_wrapped_private_key_b64
        or not current_user.auth_kdf_salt_b64
        or not current_user.auth_kdf_iterations
    ):
        raise HTTPException(status_code=404, detail="Authentication key is not enrolled")
    return _auth_material(current_user)


@router.put("/auth/passwordless/wraps")
def update_passwordless_wraps(
    body: AuthPrivateKeyWrap,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Session cookie plus CSRF. Not counted against the login IP or account budgets.
    previous = current_user.auth_kdf_iterations
    _store_auth_wrap(current_user, body)
    if previous is not None and body.kdf_iterations > previous:
        logger.info(
            "signing-key wrap KDF iterations raised user_id=%s from=%s to=%s",
            current_user.id,
            previous,
            body.kdf_iterations,
        )
    db.commit()
    return {"ok": True}


@router.post("/auth/passwordless/verify", response_model=LoginResponse)
def passwordless_verify(
    body: PasswordlessVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    enforce_login_pair_limit(body.username, request)
    user = _find_passwordless_user(db, body.username)
    # The challenge row is checked before ECDSA, so a forged id is a lookup, not a signature.
    # A correct signature is never turned into a 429. The failed-verify cap applies only after a failure.
    if (
        user
        and user.is_active
        and verify_challenge(
            db,
            user,
            body.challenge_id,
            body.challenge,
            body.message,
            body.signature_b64,
            _origin(request),
            PURPOSE_LOGIN,
        )
    ):
        csrf = create_session(db, user, request, response)
        db.refresh(user)
        return {"user": _user_response(user), "csrf_token": csrf}
    if failed_verify_blocked(body.username):
        raise HTTPException(status_code=429, detail="Rate limit exceeded; retry later")
    note_failed_verify(body.username)
    raise HTTPException(status_code=401, detail="Invalid or expired vault authentication challenge")


def _invitation_for_token(db: Session, token: str) -> tuple[AuthEnrollment, User]:
    enrollment = (
        db.query(AuthEnrollment)
        .filter(AuthEnrollment.token_hash == hashlib.sha256(token.encode()).hexdigest())
        .first()
    )
    if not enrollment or enrollment.consumed_at or enrollment.expires_at <= utc_now_naive():
        raise HTTPException(status_code=401, detail="Authentication failed")
    user = db.get(User, enrollment.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Authentication failed")
    return enrollment, user


@router.get("/auth/invitations/{token}", response_model=InvitationPreview)
def preview_invitation(token: str, db: Session = Depends(get_db)):
    _enrollment, user = _invitation_for_token(db, token)
    if user.auth_public_key_b64:
        raise HTTPException(status_code=401, detail="Authentication failed")
    return {
        "username": user.username or "",
        "display_name": user.display_name,
        "expires_at": _enrollment.expires_at,
    }


@router.post("/auth/invitations/{token}/enroll", response_model=LoginResponse)
def enroll_invitation(
    token: str,
    body: InvitationEnrollRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    enrollment, user = _invitation_for_token(db, token)
    _require_p256_public_key(body.public_key_b64)
    if vault_store.get_vault(db, user.id):
        raise HTTPException(status_code=409, detail="Enrollment is already complete")
    vault_store.create_vault(db, user.id, **body.vault.model_dump())
    enrollment.consumed_at = utc_now_naive()
    user.auth_public_key_b64 = body.public_key_b64
    user.auth_algorithm = "ECDSA_P256_SHA256"
    user.auth_key_version = 1
    _store_auth_wrap(user, body.auth)
    user.passwordless_enrolled_at = utc_now_naive()
    audit_event(db, "passwordless_enrolled", actor_user_id=user.id, target_user_id=user.id)
    csrf = create_session(db, user, request, response)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = request.cookies.get("finance_session")
    if token:
        from apps.finance.backend.auth import _hash_secret

        session = (
            db.query(UserSession).filter(UserSession.token_hash == _hash_secret(token)).first()
        )
        if session and session.revoked_at is None:
            session.revoked_at = utc_now_naive()
    audit_event(db, "logout", actor_user_id=current_user.id, target_user_id=current_user.id)
    db.commit()
    clear_session_cookie(response)
    return {"ok": True}


def _me_body(request: Request, user: User) -> dict:
    from apps.finance.backend.local_dev import is_local_dev_identity, local_dev_override_active

    return {
        "user": _user_response(user),
        "csrf_token": None,
        "local_dev": bool(local_dev_override_active(request) and is_local_dev_identity(user)),
    }


@router.get("/auth/me", response_model=MeResponse)
def me(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repair_csrf_cookie(db, request, response)
    return _me_body(request, current_user)


@router.get("/auth/local-dev/vault")
def local_dev_vault(request: Request, current_user: User = Depends(get_current_user)):
    """Passphrase for the local-dev user's vault. 404 for every other account and when the bypass is off."""
    from apps.finance.backend.local_dev import (
        is_local_dev_identity,
        local_dev_override_active,
        local_dev_vault_passphrase,
    )

    if not local_dev_override_active(request) or not is_local_dev_identity(current_user):
        raise HTTPException(status_code=404, detail="Not found")
    return {"passphrase": local_dev_vault_passphrase()}


@router.post("/auth/session", response_model=MeResponse)
def confirm_session(request: Request, current_user: User = Depends(get_current_user)):
    """Same-origin check for Travel writes. CSRF is required; this does not mint a session."""
    return _me_body(request, current_user)


@router.post("/auth/reset-data")
def reset_my_data(
    body: SelfDataResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.confirm != "CLEAR MY DATA":
        raise HTTPException(
            status_code=400, detail='Confirm with "CLEAR MY DATA" to reset your data'
        )
    reset_user_contents(db, current_user, actor_user_id=current_user.id, revoke_sessions=False)
    db.commit()
    return {"ok": True}


@router.get("/admin/users", response_model=list[UserPublic])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    users = db.query(User).order_by(User.email.asc()).all()
    return [_user_response(user) for user in users]


@router.post("/admin/users", response_model=AdminInvitationResponse)
def admin_create_user(
    body: AdminUserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    username = stored_username(body.username)
    user = create_user(
        db,
        email=f"{username}@pending.local",
        display_name=body.display_name,
        role=UserRole(body.role),
        must_change_password=False,
        actor_user_id=admin.id,
    )
    user.username = username
    token = _issue_enrollment(db, user, admin)
    db.commit()
    db.refresh(user)
    return {**_user_response(user).model_dump(), "enrollment_token": token}


def _role_value(role: UserRole | str) -> str:
    if hasattr(role, "value"):
        return role.value
    return str(role).split(".")[-1]


def _active_admin_count(db: Session, *, exclude_user_id: int | None = None) -> int:
    query = db.query(User).filter(User.is_active.is_(True))
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return sum(1 for user in query.all() if _role_value(user.role) == UserRole.admin.value)


def _ensure_not_last_admin(
    db: Session, target: User, new_role: str | None, new_active: bool | None
) -> None:
    target_role = _role_value(target.role)
    target_is_active = bool(target.is_active)
    will_stop_being_active_admin = (
        target_role == UserRole.admin.value
        and target_is_active
        and (new_role == UserRole.user.value or new_active is False)
    )
    if will_stop_being_active_admin and _active_admin_count(db, exclude_user_id=target.id) == 0:
        raise HTTPException(status_code=400, detail="Cannot remove the final active admin")


@router.patch("/admin/users/{user_id}", response_model=UserPublic)
def admin_update_user(
    user_id: int,
    body: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id and body.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    _ensure_not_last_admin(db, target, body.role, body.is_active)
    if body.display_name is not None:
        target.display_name = body.display_name.strip()
    if body.role is not None:
        target.role = UserRole(body.role)
    if body.is_active is not None:
        target.is_active = body.is_active
        if not body.is_active:
            revoke_user_sessions(db, target.id)
    target.updated_at = utc_now_naive()
    audit_event(db, "user_updated", actor_user_id=admin.id, target_user_id=target.id)
    db.commit()
    db.refresh(target)
    return _user_response(target)


@router.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    _ensure_not_last_admin(db, target, "user", False)
    delete_user_account(db, target, actor_user_id=admin.id)
    db.commit()
    return {"ok": True}


@router.post("/admin/users/{user_id}/reset-contents")
def admin_reset_user_contents(
    user_id: int,
    body: AdminUserContentReset,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    handle = target.username or target.email
    expected = f"RESET {handle}"
    if body.confirm.strip() != expected:
        raise HTTPException(status_code=400, detail=f'Type "{expected}" to reset this user')
    reset_user_contents(db, target, actor_user_id=admin.id)
    db.commit()
    return {"ok": True}


def _issue_enrollment(db: Session, user: User, admin: User) -> str:
    now = utc_now_naive()
    db.query(AuthEnrollment).filter(
        AuthEnrollment.user_id == user.id,
        AuthEnrollment.consumed_at.is_(None),
    ).update({AuthEnrollment.consumed_at: now}, synchronize_session=False)
    token = secrets.token_urlsafe(32)
    db.add(
        AuthEnrollment(
            user_id=user.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=now + timedelta(hours=24),
            created_by_user_id=admin.id,
        )
    )
    return token


@router.post("/admin/users/{user_id}/revoke-sessions")
def admin_revoke_sessions(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    keep = current_session_id(db, request) if target.id == admin.id else None
    revoked = revoke_user_sessions(db, target.id, keep_session_id=keep)
    audit_event(
        db,
        "sessions_revoked",
        actor_user_id=admin.id,
        target_user_id=target.id,
        detail=f"revoked={revoked}",
    )
    db.commit()
    return {"ok": True, "revoked": revoked}


@router.post("/admin/users/{user_id}/enrollment", response_model=AdminInvitationResponse)
def admin_reissue_enrollment(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if (
        target.auth_public_key_b64
        or target.passwordless_enrolled_at
        or vault_store.get_vault(db, target.id)
    ):
        raise HTTPException(status_code=409, detail="Enrollment is already complete")
    token = _issue_enrollment(db, target, admin)
    audit_event(db, "enrollment_reissued", actor_user_id=admin.id, target_user_id=target.id)
    db.commit()
    db.refresh(target)
    return {**_user_response(target).model_dump(), "enrollment_token": token}


@router.get("/admin/metrics")
def get_admin_metrics(db: Session = Depends(get_db), _: User = Depends(get_current_admin)):
    return admin_metrics(db)
