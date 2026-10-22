from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.finance.backend.auth import get_current_user
from apps.finance.backend.rate_limit import enforce_account_rate_limit
from apps.finance.backend.database import get_db
from apps.finance.backend.models import User
from apps.finance.backend.schemas_vault import (
    BlindIndexLookupRequest,
    EncryptedRecordBatchDelete,
    EncryptedRecordBatchUpsert,
    EncryptedRecordResponse,
    VaultCreateRequest,
    VaultResponse,
    VaultUpdateRequest,
)
from apps.finance.backend.services import encrypted_storage as store

router = APIRouter(prefix="/vault", tags=["vault"])


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
def vault_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _vault_response(db, current_user.id)


@router.post("/setup", response_model=VaultResponse)
def vault_setup(
    body: VaultCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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


@router.put("/wraps", response_model=VaultResponse)
def vault_update_wraps(
    body: VaultUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    enforce_account_rate_limit(current_user.username or current_user.email)
    store.update_vault_wraps(
        db,
        current_user.id,
        kdf_salt_b64=body.kdf_salt_b64,
        kdf_iterations=body.kdf_iterations,
        wrapped_dek_b64=body.wrapped_dek_b64,
        recovery_wrapped_dek_b64=body.recovery_wrapped_dek_b64,
        key_version=body.key_version,
    )
    db.commit()
    return _vault_response(db, current_user.id)


@router.get("/records", response_model=list[EncryptedRecordResponse])
def list_encrypted_records(
    collection: str | None = Query(default=None),
    since_revision: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
    db: Session = Depends(get_db),
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


@router.post("/records/delete")
def delete_encrypted_records(
    body: EncryptedRecordBatchDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
    db: Session = Depends(get_db),
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
    db: Session = Depends(get_db),
):
    return {"counts": store.collection_counts(db, current_user.id)}
