from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.finance.backend.database import get_db
from apps.finance.backend.schemas_vault import (
    BlindIndexLookupRequest,
    EncryptedRecordBatchDelete,
    EncryptedRecordBatchUpsert,
    EncryptedRecordReindexResponse,
    EncryptedRecordResponse,
    RestoreActivateRequest,
    RestoreBatchRequest,
    RestoreCreateRequest,
    VaultCreateRequest,
    VaultResponse,
)
from apps.finance.backend.services import encrypted_storage as store
from apps.server.identity.models import User
from apps.server.identity.session import get_current_user

router = APIRouter(prefix="/vault", tags=["vault"])


def _user_id(user: User) -> int:
    """Primary key of a loaded user. mypy types the column as Column[int]."""
    return int(user.id)


def _iso(dt) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


def _vault_response(db: Session, user_id: int) -> VaultResponse:
    vault = store.get_vault(db, user_id)
    if not vault:
        return VaultResponse(exists=False)
    return VaultResponse(
        exists=True,
        kdf_algorithm=vault.kdf_algorithm,
        kdf_salt_b64=vault.kdf_salt_b64,
        kdf_iterations=vault.kdf_iterations,
        wrapped_dek_b64=vault.wrapped_dek_b64,
        recovery_wrapped_dek_b64=vault.recovery_wrapped_dek_b64,
        key_version=vault.key_version,
    )


@router.get("/status", response_model=VaultResponse)
def vault_status(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db, scope="function")
):
    return _vault_response(db, current_user.id)


@router.post("/setup", response_model=VaultResponse)
def vault_setup(
    body: VaultCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    store.create_vault(
        db,
        current_user.id,
        kdf_algorithm=body.kdf_algorithm,
        kdf_salt_b64=body.kdf_salt_b64,
        kdf_iterations=body.kdf_iterations,
        wrapped_dek_b64=body.wrapped_dek_b64,
        recovery_wrapped_dek_b64=body.recovery_wrapped_dek_b64,
        key_version=body.key_version,
    )
    db.commit()
    return _vault_response(db, current_user.id)


@router.put("/wraps")
def retired_vault_wrap_update(_user: User = Depends(get_current_user)):
    raise HTTPException(410, "Reload the app to update both credential wraps atomically.")


@router.get("/records", response_model=list[EncryptedRecordResponse])
def list_encrypted_records(
    collection: str | None = Query(default=None),
    since_revision: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    rows = store.list_records(
        db, current_user.id, collection=collection, since_revision=since_revision
    )
    return [
        EncryptedRecordResponse(
            collection=r.collection,
            client_id=r.client_id,
            ciphertext_b64=r.ciphertext_b64,
            schema_version=r.schema_version,
            key_version=r.key_version,
            revision=r.revision,
            updated_at=_iso(r.updated_at) or "",
        )
        for r in rows
    ]


@router.post("/records/upsert", response_model=list[EncryptedRecordResponse])
def upsert_encrypted_records(
    body: EncryptedRecordBatchUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    if not store.get_vault(db, current_user.id):
        raise HTTPException(status_code=400, detail="Vault required before storing records")
    rows = store.upsert_records(
        db,
        current_user.id,
        [item.model_dump() for item in body.records],
    )
    db.commit()
    for row in rows:
        db.refresh(row)
    return [
        EncryptedRecordResponse(
            collection=r.collection,
            client_id=r.client_id,
            ciphertext_b64=r.ciphertext_b64,
            schema_version=r.schema_version,
            key_version=r.key_version,
            revision=r.revision,
            updated_at=_iso(r.updated_at) or "",
        )
        for r in rows
    ]


def _record_response(row: store.EncryptedRecord) -> EncryptedRecordResponse:
    return EncryptedRecordResponse(
        collection=row.collection,
        client_id=row.client_id,
        ciphertext_b64=row.ciphertext_b64,
        schema_version=row.schema_version,
        key_version=row.key_version,
        revision=row.revision,
        updated_at=_iso(row.updated_at) or "",
    )


@router.post("/records/reindex", response_model=EncryptedRecordReindexResponse)
def reindex_encrypted_records(
    body: EncryptedRecordBatchUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    if not store.get_vault(db, current_user.id):
        raise HTTPException(status_code=400, detail="Vault required before storing records")
    rows, skipped = store.reindex_records(
        db,
        current_user.id,
        [item.model_dump() for item in body.records],
    )
    db.commit()
    for row in rows:
        db.refresh(row)
    return EncryptedRecordReindexResponse(
        records=[_record_response(row) for row in rows],
        skipped=skipped,
    )


@router.post("/records/delete")
def delete_encrypted_records(
    body: EncryptedRecordBatchDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    deleted = store.delete_records(
        db, current_user.id, [item.model_dump() for item in body.records]
    )
    db.commit()
    return {"deleted": deleted}


@router.post("/indexes/lookup")
def lookup_index(
    body: BlindIndexLookupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    client_ids = store.lookup_blind_index(
        db,
        current_user.id,
        collection=body.collection,
        index_name=body.index_name,
        index_value_b64=body.index_value_b64,
    )
    return {"client_ids": client_ids}


@router.get("/counts")
def encrypted_counts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    return {"counts": store.collection_counts(db, current_user.id)}


@router.get("/recovery-snapshot")
def encrypted_recovery_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    return store.recovery_snapshot(db, _user_id(current_user))


@router.get("/restore/stages")
def restore_stages(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db, scope="function")
):
    from apps.finance.backend.services import vault_restore

    result = vault_restore.list_stages(db, _user_id(current_user))
    db.commit()
    return result


@router.post("/restore/stages")
def create_restore_stage(
    body: RestoreCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    from apps.finance.backend.services import vault_restore

    result = vault_restore.create_stage(db, _user_id(current_user), body.model_dump())
    db.commit()
    return result


@router.get("/restore/stages/{stage_id}")
def get_restore_stage(
    stage_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    from apps.finance.backend.services import vault_restore

    return vault_restore.describe(db, vault_restore.get_stage(db, _user_id(current_user), stage_id))


@router.put("/restore/stages/{stage_id}/batches")
def put_restore_batch(
    stage_id: str,
    body: RestoreBatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    from apps.finance.backend.services import vault_restore

    try:
        result = vault_restore.put_batch(
            db,
            _user_id(current_user),
            stage_id,
            body.batch_index,
            [record.model_dump() for record in body.records],
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.post("/restore/stages/{stage_id}/activate")
def activate_restore_stage(
    stage_id: str,
    body: RestoreActivateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    from apps.finance.backend.services import vault_restore

    try:
        result = vault_restore.activate(db, _user_id(current_user), stage_id, body.confirmation)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Restore conflicts with current record indexes. Active data was not changed."
        ) from None
    except Exception:
        db.rollback()
        raise


@router.delete("/restore/stages/{stage_id}")
def discard_restore_stage(
    stage_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db, scope="function"),
):
    from apps.finance.backend.services import vault_restore

    vault_restore.discard(db, _user_id(current_user), stage_id)
    db.commit()
    return {"discarded": True}
