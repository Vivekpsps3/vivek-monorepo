from __future__ import annotations

from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from auth import role_str
from models import (
    AuditEvent,
    EncryptedRecord,
    User,
    UserSession,
    UserVault,
)
from services.encrypted_storage import wipe_encrypted_user_data


def admin_metrics(db: Session) -> dict[str, Any]:
    users = db.query(User).all()
    active_users = sum(1 for u in users if u.is_active)
    admins = sum(1 for u in users if role_str(u.role) == "admin")
    totals = {
        "users": len(users),
        "active_users": active_users,
        "admins": admins,
        "sessions": db.query(UserSession).count(),
        "active_sessions": db.query(UserSession).filter(UserSession.revoked_at.is_(None)).count(),
        "audit_events": db.query(AuditEvent).count(),
    }
    finance_rows = {}
    finance_rows["encrypted_records"] = db.query(EncryptedRecord).count()
    finance_rows["user_vaults"] = db.query(UserVault).count()
    per_user = []
    for user in users:
        row = {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": role_str(user.role),
            "is_active": user.is_active,
            "has_vault": db.query(UserVault).filter(UserVault.user_id == user.id).count() > 0,
            "encrypted_records": db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user.id).count(),
        }
        per_user.append(row)
    inspector = inspect(db.bind)
    tables = []
    for table in inspector.get_table_names():
        try:
            count = db.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        except Exception:
            count = None
        tables.append({"name": table, "rows": count})
    return {"totals": totals, "finance_rows": finance_rows, "per_user": per_user, "tables": tables}


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
