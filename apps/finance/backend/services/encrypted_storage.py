from __future__ import annotations

import base64
import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from apps.finance.backend.kdf_policy import MAX_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS
from apps.finance.backend.models import EncryptedRecord, EncryptedRecordIndex, UserVault, utc_now

# Any future DEK rotation must re-encrypt every collection here, including health_stats and health_prs (Town Health).
ALLOWED_COLLECTIONS = frozenset(
    {
        "transactions",
        "bank_accounts",
        "import_batches",
        "assets",
        "liabilities",
        "holdings",
        "brokerage_accounts",
        "job_incomes",
        "fixed_expenses",
        "subscriptions",
        "planning_profiles",
        "stock_lab_scenarios",
        "health_stats",
        "health_prs",
    }
)

CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,128}$")
MAX_CIPHERTEXT_BYTES = 512_000
MAX_BATCH = 200
CURRENT_RECORD_SCHEMA_VERSION = 2


def _b64_decode(value: str) -> bytes:
    """Decode non-empty RFC 4648 base64 without normalizing client input."""
    raw = value or ""
    if not raw:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")
    try:
        decoded = base64.b64decode(raw, altchars=b"-_", validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 payload") from exc
    if not decoded:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")
    return decoded


def _b64_len(value: str) -> int:
    return len(_b64_decode(value))


def validate_collection(collection: str) -> str:
    if collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {collection}")
    return collection


def validate_client_id(client_id: str) -> str:
    if not CLIENT_ID_RE.match(client_id or ""):
        raise HTTPException(status_code=400, detail="Invalid client_id")
    return client_id


def get_vault(db: Session, user_id: int) -> UserVault | None:
    return db.query(UserVault).filter(UserVault.user_id == user_id).one_or_none()


def create_vault(
    db: Session,
    user_id: int,
    *,
    kdf_algorithm: str,
    kdf_salt_b64: str,
    kdf_iterations: int,
    wrapped_dek_b64: str,
    recovery_wrapped_dek_b64: str = "",
    key_version: int = 1,
) -> UserVault:
    if get_vault(db, user_id):
        raise HTTPException(status_code=409, detail="Vault already exists")
    if kdf_algorithm != "PBKDF2":
        raise HTTPException(status_code=400, detail="Only PBKDF2 is supported")
    if kdf_iterations < MIN_PBKDF2_ITERATIONS or kdf_iterations > MAX_PBKDF2_ITERATIONS:
        raise HTTPException(status_code=400, detail="Invalid KDF iterations")
    if _b64_len(kdf_salt_b64) < 16:
        raise HTTPException(status_code=400, detail="KDF salt too short")
    if _b64_len(wrapped_dek_b64) < 32:
        raise HTTPException(status_code=400, detail="Wrapped DEK too short")
    vault = UserVault(
        user_id=user_id,
        kdf_algorithm=kdf_algorithm,
        kdf_salt_b64=kdf_salt_b64,
        kdf_iterations=kdf_iterations,
        wrapped_dek_b64=wrapped_dek_b64,
        recovery_wrapped_dek_b64=recovery_wrapped_dek_b64 or "",
        key_version=key_version,
    )
    db.add(vault)
    return vault


def update_vault_wraps(
    db: Session,
    user_id: int,
    *,
    kdf_salt_b64: str | None = None,
    kdf_iterations: int | None = None,
    wrapped_dek_b64: str | None = None,
    recovery_wrapped_dek_b64: str | None = None,
    key_version: int | None = None,
) -> UserVault:
    vault = get_vault(db, user_id)
    if not vault:
        raise HTTPException(status_code=404, detail="Vault not found")
    if kdf_salt_b64 is not None:
        if _b64_len(kdf_salt_b64) < 16:
            raise HTTPException(status_code=400, detail="KDF salt too short")
        vault.kdf_salt_b64 = kdf_salt_b64
    if kdf_iterations is not None:
        if kdf_iterations < MIN_PBKDF2_ITERATIONS or kdf_iterations > MAX_PBKDF2_ITERATIONS:
            raise HTTPException(status_code=400, detail="Invalid KDF iterations")
        vault.kdf_iterations = kdf_iterations
    if wrapped_dek_b64 is not None:
        if _b64_len(wrapped_dek_b64) < 32:
            raise HTTPException(status_code=400, detail="Wrapped DEK too short")
        vault.wrapped_dek_b64 = wrapped_dek_b64
    if recovery_wrapped_dek_b64 is not None:
        vault.recovery_wrapped_dek_b64 = recovery_wrapped_dek_b64
    if key_version is not None:
        if key_version < vault.key_version:
            raise HTTPException(status_code=400, detail="key_version cannot decrease")
        vault.key_version = key_version
    vault.updated_at = utc_now()
    return vault


def list_records(
    db: Session,
    user_id: int,
    *,
    collection: str | None = None,
    since_revision: int | None = None,
) -> list[EncryptedRecord]:
    q = db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user_id)
    if collection:
        validate_collection(collection)
        q = q.filter(EncryptedRecord.collection == collection)
    if since_revision is not None:
        q = q.filter(EncryptedRecord.revision > since_revision)
    return q.order_by(EncryptedRecord.revision.asc(), EncryptedRecord.id.asc()).all()


def upsert_records(db: Session, user_id: int, items: list[dict[str, Any]]) -> list[EncryptedRecord]:
    if not items:
        raise HTTPException(status_code=400, detail="No records provided")
    if len(items) > MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Batch too large (max {MAX_BATCH})")
    out: list[EncryptedRecord] = []
    for item in items:
        collection = validate_collection(str(item.get("collection", "")))
        client_id = validate_client_id(str(item.get("client_id", "")))
        ciphertext_b64 = str(item.get("ciphertext_b64", ""))
        if not ciphertext_b64 or _b64_len(ciphertext_b64) > MAX_CIPHERTEXT_BYTES:
            raise HTTPException(status_code=400, detail="Invalid ciphertext")
        schema_version = int(item.get("schema_version", 1))
        key_version = int(item.get("key_version", 1))
        if schema_version not in {1, CURRENT_RECORD_SCHEMA_VERSION} or key_version < 1:
            raise HTTPException(status_code=400, detail="Invalid version fields")
        row = (
            db.query(EncryptedRecord)
            .filter(
                EncryptedRecord.user_id == user_id,
                EncryptedRecord.collection == collection,
                EncryptedRecord.client_id == client_id,
            )
            .one_or_none()
        )
        if row:
            expected_revision = item.get("expected_revision")
            if expected_revision is None:
                raise HTTPException(
                    status_code=400, detail="expected_revision is required for updates"
                )
            expected = int(expected_revision)
            if expected != row.revision:
                raise HTTPException(
                    status_code=409,
                    detail=f"Revision conflict for {collection}/{client_id}",
                )
            row.ciphertext_b64 = ciphertext_b64
            row.schema_version = schema_version
            row.key_version = key_version
            row.revision = row.revision + 1
            row.updated_at = utc_now()
        else:
            row = EncryptedRecord(
                user_id=user_id,
                collection=collection,
                client_id=client_id,
                ciphertext_b64=ciphertext_b64,
                schema_version=schema_version,
                key_version=key_version,
                revision=1,
            )
            db.add(row)
        indexes = item.get("indexes") or []
        if not isinstance(indexes, list):
            raise HTTPException(status_code=400, detail="indexes must be a list")
        db.query(EncryptedRecordIndex).filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.client_id == client_id,
        ).delete(synchronize_session=False)
        for idx in indexes:
            name = str(idx.get("index_name", ""))
            value = str(idx.get("index_value_b64", ""))
            if not name or not value:
                raise HTTPException(status_code=400, detail="Invalid blind index")
            if _b64_len(value) > 128:
                raise HTTPException(status_code=400, detail="Blind index too long")
            db.add(
                EncryptedRecordIndex(
                    user_id=user_id,
                    collection=collection,
                    client_id=client_id,
                    index_name=name[:64],
                    index_value_b64=value,
                )
            )
        out.append(row)
    db.flush()
    return out


def reindex_records(
    db: Session, user_id: int, items: list[dict[str, Any]]
) -> tuple[list[EncryptedRecord], list[str]]:
    """Update blind indexes in place. A missing row is skipped and never inserted."""
    if not items:
        raise HTTPException(status_code=400, detail="No records provided")
    if len(items) > MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Batch too large (max {MAX_BATCH})")
    updated: list[EncryptedRecord] = []
    skipped: list[str] = []
    for item in items:
        collection = validate_collection(str(item.get("collection", "")))
        client_id = validate_client_id(str(item.get("client_id", "")))
        ciphertext_b64 = str(item.get("ciphertext_b64", ""))
        if not ciphertext_b64 or _b64_len(ciphertext_b64) > MAX_CIPHERTEXT_BYTES:
            raise HTTPException(status_code=400, detail="Invalid ciphertext")
        schema_version = int(item.get("schema_version", 1))
        key_version = int(item.get("key_version", 1))
        if schema_version not in {1, CURRENT_RECORD_SCHEMA_VERSION} or key_version < 1:
            raise HTTPException(status_code=400, detail="Invalid version fields")
        row = (
            db.query(EncryptedRecord)
            .filter(
                EncryptedRecord.user_id == user_id,
                EncryptedRecord.collection == collection,
                EncryptedRecord.client_id == client_id,
            )
            .one_or_none()
        )
        if row is None:
            skipped.append(client_id)
            continue
        expected_revision = item.get("expected_revision")
        if expected_revision is None:
            raise HTTPException(status_code=400, detail="expected_revision is required for updates")
        expected = int(expected_revision)
        if expected != row.revision:
            raise HTTPException(
                status_code=409,
                detail=f"Revision conflict for {collection}/{client_id}",
            )
        row.ciphertext_b64 = ciphertext_b64
        row.schema_version = schema_version
        row.key_version = key_version
        row.revision = row.revision + 1
        row.updated_at = utc_now()
        indexes = item.get("indexes") or []
        if not isinstance(indexes, list):
            raise HTTPException(status_code=400, detail="indexes must be a list")
        db.query(EncryptedRecordIndex).filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.client_id == client_id,
        ).delete(synchronize_session=False)
        for idx in indexes:
            name = str(idx.get("index_name", ""))
            value = str(idx.get("index_value_b64", ""))
            if not name or not value:
                raise HTTPException(status_code=400, detail="Invalid blind index")
            if _b64_len(value) > 128:
                raise HTTPException(status_code=400, detail="Blind index too long")
            db.add(
                EncryptedRecordIndex(
                    user_id=user_id,
                    collection=collection,
                    client_id=client_id,
                    index_name=name[:64],
                    index_value_b64=value,
                )
            )
        updated.append(row)
    db.flush()
    return updated, skipped


def delete_records(db: Session, user_id: int, items: list[dict[str, Any]]) -> int:
    if len(items) > MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Batch too large (max {MAX_BATCH})")
    deleted = 0
    for item in items:
        collection = validate_collection(str(item.get("collection", "")))
        client_id = validate_client_id(str(item.get("client_id", "")))
        expected_revision = int(item["expected_revision"])
        deleted_count = (
            db.query(EncryptedRecord)
            .filter(
                EncryptedRecord.user_id == user_id,
                EncryptedRecord.collection == collection,
                EncryptedRecord.client_id == client_id,
                EncryptedRecord.revision == expected_revision,
            )
            .delete(synchronize_session=False)
        )
        if not deleted_count:
            existing = (
                db.query(EncryptedRecord.id)
                .filter(
                    EncryptedRecord.user_id == user_id,
                    EncryptedRecord.collection == collection,
                    EncryptedRecord.client_id == client_id,
                )
                .one_or_none()
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Revision conflict for {collection}/{client_id}",
                )
            continue
        deleted += deleted_count
        db.query(EncryptedRecordIndex).filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.client_id == client_id,
        ).delete(synchronize_session=False)
    return deleted


def lookup_blind_index(
    db: Session, user_id: int, *, collection: str, index_name: str, index_value_b64: str
) -> list[str]:
    validate_collection(collection)
    rows = (
        db.query(EncryptedRecordIndex)
        .filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.index_name == index_name,
            EncryptedRecordIndex.index_value_b64 == index_value_b64,
        )
        .all()
    )
    return [r.client_id for r in rows]


def collection_counts(db: Session, user_id: int) -> dict[str, int]:
    counts = {name: 0 for name in sorted(ALLOWED_COLLECTIONS)}
    rows = (
        db.query(EncryptedRecord.collection, EncryptedRecord.id)
        .filter(EncryptedRecord.user_id == user_id)
        .all()
    )
    for collection, _ in rows:
        if collection in counts:
            counts[collection] += 1
    return counts


def wipe_encrypted_user_data(db: Session, user_id: int) -> None:
    db.query(EncryptedRecordIndex).filter(EncryptedRecordIndex.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(UserVault).filter(UserVault.user_id == user_id).delete(synchronize_session=False)
