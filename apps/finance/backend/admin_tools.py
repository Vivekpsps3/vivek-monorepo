from __future__ import annotations

from typing import Any

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from auth import role_str, utc_now_naive
from models import (
    AuditEvent,
    AuthEnrollment,
    EncryptedRecord,
    User,
    UserSession,
    UserVault,
)
from services.encrypted_storage import wipe_encrypted_user_data


def _audit_summary(event: AuditEvent, names: dict[int, str]) -> str:
    actor = names.get(event.actor_user_id) or "Someone"
    target = names.get(event.target_user_id) or "an account"
    summaries = {
        "login": f"{actor} signed in",
        "user_created": f"{actor} created {target}",
        "user_updated": f"{actor} updated {target}",
        "user_deleted": f"{actor} deleted an account",
        "user_contents_reset": f"{actor} erased finance data for {target}",
        "sessions_revoked": (
            f"{actor} signed out other devices"
            if event.actor_user_id and event.actor_user_id == event.target_user_id
            else f"{actor} signed {target} out"
        ),
        "passwordless_enrolled": f"{target} finished enrollment",
        "enrollment_reissued": f"{actor} sent {target} a new enrollment link",
    }
    return summaries.get(event.event_type, f"{actor} · {event.event_type.replace('_', ' ')}")


def admin_metrics(db: Session) -> dict[str, Any]:
    now = utc_now_naive()
    users = db.query(User).all()
    names = {user.id: user.display_name or user.username or user.email for user in users}
    active_users = sum(1 for u in users if u.is_active)
    admins = sum(1 for u in users if role_str(u.role) == "admin")
    open_sessions = db.query(UserSession).filter(UserSession.revoked_at.is_(None), UserSession.expires_at > now).all()
    sessions_by_user: dict[int, int] = {}
    for session in open_sessions:
        sessions_by_user[session.user_id] = sessions_by_user.get(session.user_id, 0) + 1
    pending_by_user = {
        enrollment.user_id: enrollment.expires_at
        for enrollment in db.query(AuthEnrollment)
        .filter(AuthEnrollment.consumed_at.is_(None), AuthEnrollment.expires_at > now)
        .all()
    }
    vault_ids = {row[0] for row in db.query(UserVault.user_id).all()}
    record_counts = dict(
        db.query(EncryptedRecord.user_id, func.count(EncryptedRecord.id)).group_by(EncryptedRecord.user_id).all()
    )
    totals = {
        "users": len(users),
        "active_users": active_users,
        "admins": admins,
        "sessions": db.query(UserSession).count(),
        "active_sessions": len(open_sessions),
        "audit_events": db.query(AuditEvent).count(),
    }
    finance_rows = {
        "encrypted_records": db.query(EncryptedRecord).count(),
        "user_vaults": len(vault_ids),
    }
    per_user = []
    for user in users:
        per_user.append({
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": role_str(user.role),
            "is_active": user.is_active,
            "has_vault": user.id in vault_ids,
            "encrypted_records": record_counts.get(user.id, 0),
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "active_sessions": sessions_by_user.get(user.id, 0),
            "enrolled": bool(user.passwordless_enrolled_at or user.auth_public_key_b64),
            "enrollment_expires_at": pending_by_user[user.id].isoformat() if user.id in pending_by_user else None,
        })
    recent = []
    events = db.query(AuditEvent).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(8).all()
    for event in events:
        recent.append({
            "id": event.id,
            "event_type": event.event_type,
            "created_at": event.created_at.isoformat() if event.created_at else None,
            "summary": _audit_summary(event, names),
        })
    inspector = inspect(db.bind)
    tables = []
    for table in inspector.get_table_names():
        try:
            count = db.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        except Exception:
            count = None
        tables.append({"name": table, "rows": count})
    return {"totals": totals, "finance_rows": finance_rows, "per_user": per_user, "tables": tables, "recent": recent}


def reset_user_contents(db: Session, user: User, *, actor_user_id: int, revoke_sessions: bool = True) -> None:
    wipe_encrypted_user_data(db, user.id)
    if revoke_sessions:
        db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    audit = AuditEvent(
        actor_user_id=actor_user_id,
        target_user_id=user.id,
        event_type="user_contents_reset",
        detail=f"reset_user_email={user.email}",
    )
    db.add(audit)


def delete_user_account(db: Session, user: User, *, actor_user_id: int) -> None:
    wipe_encrypted_user_data(db, user.id)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    db.query(AuditEvent).filter(AuditEvent.actor_user_id == user.id).update(
        {AuditEvent.actor_user_id: None}, synchronize_session=False
    )
    db.query(AuditEvent).filter(AuditEvent.target_user_id == user.id).update(
        {AuditEvent.target_user_id: None}, synchronize_session=False
    )
    audit = AuditEvent(
        actor_user_id=actor_user_id,
        target_user_id=None,
        event_type="user_deleted",
        detail=f"deleted_user_email={user.email}",
    )
    db.add(audit)
    db.delete(user)
