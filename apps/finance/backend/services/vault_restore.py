"""Owner-scoped inert ciphertext staging and one atomic activation transaction."""

from __future__ import annotations

import hashlib
import json
from datetime import timedelta
from typing import Any, cast
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from apps.finance.backend.models import VaultRestoreBatch, VaultRestoreStage, utc_now
from apps.finance.backend.services import encrypted_storage as store

MAX_STAGES = 2
MAX_BATCH_CHARS = 2 * 1024 * 1024


def _rows(db: Session, stage_id: str) -> list[VaultRestoreBatch]:
    return (
        db.query(VaultRestoreBatch)
        .filter_by(stage_id=stage_id)
        .order_by(VaultRestoreBatch.batch_index)
        .all()
    )


def _remove(db: Session, stage: VaultRestoreStage) -> None:
    db.query(VaultRestoreBatch).filter_by(stage_id=stage.id).delete(synchronize_session=False)
    db.delete(stage)


def _expire(db: Session, owner: int) -> None:
    cutoff = utc_now().replace(tzinfo=None) - timedelta(hours=24)
    for stage in (
        db.query(VaultRestoreStage)
        .filter(VaultRestoreStage.user_id == owner, VaultRestoreStage.created_at < cutoff)
        .all()
    ):
        _remove(db, stage)
    db.flush()


def get_stage(db: Session, owner: int, stage_id: str) -> VaultRestoreStage:
    stage = db.query(VaultRestoreStage).filter_by(id=stage_id, user_id=owner).one_or_none()
    if not stage or stage.created_at.replace(tzinfo=None) < utc_now().replace(
        tzinfo=None
    ) - timedelta(hours=24):
        raise HTTPException(404, "Restore stage not found or expired. Preview the file again.")
    return stage


def describe(db: Session, stage: VaultRestoreStage) -> dict[str, Any]:
    return {
        "id": stage.id,
        "source_hash": stage.source_hash,
        "base_fingerprint": stage.base_fingerprint,
        "mode": stage.mode,
        "key_version": stage.key_version,
        "status": stage.status,
        "expected_counts": json.loads(stage.expected_counts_json),
        "batch_count": stage.batch_count,
        "received_batches": [row.batch_index for row in _rows(db, stage.id)],
        "result": json.loads(stage.result_json),
    }


def list_stages(db: Session, owner: int) -> list[dict[str, Any]]:
    _expire(db, owner)
    return [
        describe(db, stage)
        for stage in db.query(VaultRestoreStage)
        .filter_by(user_id=owner)
        .order_by(VaultRestoreStage.created_at.desc())
        .all()
    ]


def create_stage(db: Session, owner: int, body: dict[str, Any]) -> dict[str, Any]:
    db.execute(
        update(VaultRestoreStage)
        .where(VaultRestoreStage.user_id == owner)
        .values(status=VaultRestoreStage.status)
    )
    _expire(db, owner)
    vault = store.get_vault(db, owner)
    if not vault or body["key_version"] != vault.key_version:
        raise HTTPException(409, "Vault key changed. Unlock and preview again.")
    counts = body["expected_counts"]
    if (
        set(counts) != store.COLLECTION_POLICY.recovery
        or any(type(n) is not int or n < 0 for n in counts.values())
        or sum(counts.values()) > store.MAX_RECOVERY_RECORDS
    ):
        raise HTTPException(422, "Invalid restore collection counts")
    for stage in db.query(VaultRestoreStage).filter_by(user_id=owner).all():
        if (
            stage.vault_wrap_hash == hashlib.sha256(vault.wrapped_dek_b64.encode()).hexdigest()
            and stage.status == "pending"
            and all(
                getattr(stage, key) == body[key]
                for key in ("source_hash", "base_fingerprint", "mode", "key_version", "batch_count")
            )
            and json.loads(stage.expected_counts_json) == counts
        ):
            return describe(db, stage)
    if store.recovery_snapshot(db, owner)["fingerprint"] != body["base_fingerprint"]:
        raise HTTPException(409, "Vault changed after preview. Preview the file again.")
    stages = db.query(VaultRestoreStage).filter_by(user_id=owner).all()
    for stage in stages:
        if stage.status == "committed":
            _remove(db, stage)
    if sum(stage.status == "pending" for stage in stages) >= MAX_STAGES:
        raise HTTPException(409, "Discard an unfinished restore before starting another.")
    stage = VaultRestoreStage(
        id=str(uuid4()),
        user_id=owner,
        vault_wrap_hash=hashlib.sha256(vault.wrapped_dek_b64.encode()).hexdigest(),
        source_hash=body["source_hash"],
        base_fingerprint=body["base_fingerprint"],
        mode=body["mode"],
        key_version=body["key_version"],
        expected_counts_json=json.dumps(counts),
        batch_count=body["batch_count"],
        status="pending",
        result_json="{}",
    )
    db.add(stage)
    db.flush()
    return describe(db, stage)


def put_batch(
    db: Session, owner: int, stage_id: str, batch_index: int, items: list[dict[str, Any]]
) -> dict[str, Any]:
    # First write serializes competing batches/activation before inspecting job state.
    changed = db.execute(
        update(VaultRestoreStage)
        .where(
            VaultRestoreStage.id == stage_id,
            VaultRestoreStage.user_id == owner,
            VaultRestoreStage.status == "pending",
        )
        .values(status="pending")
    )
    stage = get_stage(db, owner, stage_id)
    if cast(CursorResult[Any], changed).rowcount != 1 or stage.status != "pending":
        raise HTTPException(409, "Restore is already activated.")
    if not 0 <= batch_index < stage.batch_count or not 1 <= len(items) <= store.MAX_BATCH:
        raise HTTPException(422, "Invalid restore batch")
    if sum(len(str(item.get("ciphertext_b64", ""))) for item in items) > MAX_BATCH_CHARS:
        raise HTTPException(413, "Restore batch exceeds the size limit")
    normalized = [store.validate_record(item) for item in items]
    if any(
        item["schema_version"] != store.CURRENT_RECORD_SCHEMA_VERSION
        or item["key_version"] != stage.key_version
        for item in normalized
    ):
        raise HTTPException(422, "Restore records must use the current destination key and schema")
    serialized = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    batches = _rows(db, stage.id)
    previous = next((batch for batch in batches if batch.batch_index == batch_index), None)
    if previous:
        if previous.records_json != serialized:
            raise HTTPException(409, "A different batch already occupies this checkpoint")
        return describe(db, stage)
    staged = [record for batch in batches for record in json.loads(batch.records_json)] + normalized
    keys = [(record["collection"], record["client_id"]) for record in staged]
    if len(set(keys)) != len(keys) or len(staged) > store.MAX_RECOVERY_RECORDS:
        raise HTTPException(422, "Duplicate or excessive restore records")
    counts = json.loads(stage.expected_counts_json)
    for name, expected in counts.items():
        if sum(row["collection"] == name for row in staged) > expected:
            raise HTTPException(422, "Restore batch exceeds expected collection count")
    if (
        sum(len(record["ciphertext_b64"]) for record in staged)
        > store.MAX_RECOVERY_CIPHERTEXT_CHARS
    ):
        raise HTTPException(413, "Restore exceeds the portable size limit")
    db.add(VaultRestoreBatch(stage_id=stage.id, batch_index=batch_index, records_json=serialized))
    db.flush()
    return describe(db, stage)


def activate(db: Session, owner: int, stage_id: str, confirmation: str) -> dict[str, Any]:
    # SQLite's write lock precedes the active snapshot check. Concurrent writers
    # cannot pass the fingerprint check and then race this transaction's writes.
    changed = db.execute(
        update(VaultRestoreStage)
        .where(
            VaultRestoreStage.id == stage_id,
            VaultRestoreStage.user_id == owner,
            VaultRestoreStage.status == "pending",
        )
        .values(status="activating")
    )
    stage = get_stage(db, owner, stage_id)
    db.refresh(stage)
    if stage.status == "committed":
        return json.loads(stage.result_json)
    if cast(CursorResult[Any], changed).rowcount != 1:
        raise HTTPException(409, "Restore activation is already in progress")
    if stage.mode == "replace" and confirmation != "REPLACE":
        raise HTTPException(422, "Type REPLACE to confirm replacement")
    vault = store.get_vault(db, owner)
    if (
        not vault
        or vault.key_version != stage.key_version
        or hashlib.sha256(vault.wrapped_dek_b64.encode()).hexdigest() != stage.vault_wrap_hash
    ):
        raise HTTPException(409, "Vault key changed. Unlock and preview again.")
    snapshot = store.recovery_snapshot(db, owner)
    if snapshot["fingerprint"] != stage.base_fingerprint:
        raise HTTPException(409, "Vault changed after preview. Active data was not changed.")
    batches = _rows(db, stage.id)
    records = [row for batch in batches for row in json.loads(batch.records_json)]
    counts = json.loads(stage.expected_counts_json)
    if (
        len(batches) != stage.batch_count
        or set(counts) != store.COLLECTION_POLICY.recovery
        or any(
            sum(row["collection"] == name for row in records) != count
            for name, count in counts.items()
        )
    ):
        raise HTTPException(409, "Restore staging is incomplete. Resume upload before activation.")
    active = {(row["collection"], row["client_id"]): row for row in snapshot["records"]}
    imported = {(row["collection"], row["client_id"]) for row in records}
    if stage.mode == "merge" and imported & active.keys():
        raise HTTPException(409, "Merge staging contains existing IDs. Preview again.")
    removed = 0
    if stage.mode == "replace":
        deletes = [
            {
                "collection": row["collection"],
                "client_id": row["client_id"],
                "expected_revision": row["revision"],
            }
            for key, row in active.items()
            if key not in imported
        ]
        for start in range(0, len(deletes), store.MAX_BATCH):
            removed += store.delete_records(db, owner, deletes[start : start + store.MAX_BATCH])
    for row in records:
        prior = active.get((row["collection"], row["client_id"]))
        row["expected_revision"] = prior["revision"] if prior else None
    for start in range(0, len(records), store.MAX_BATCH):
        store.upsert_records(db, owner, records[start : start + store.MAX_BATCH])
    result = {"restored": len(records), "removed": removed, "mode": stage.mode}
    stage.status = "committed"
    stage.result_json = json.dumps(result)
    db.query(VaultRestoreBatch).filter_by(stage_id=stage.id).delete(synchronize_session=False)
    db.flush()
    return result


def discard(db: Session, owner: int, stage_id: str) -> None:
    changed = db.execute(
        update(VaultRestoreStage)
        .where(
            VaultRestoreStage.id == stage_id,
            VaultRestoreStage.user_id == owner,
            VaultRestoreStage.status == "pending",
        )
        .values(status="pending")
    )
    stage = get_stage(db, owner, stage_id)
    db.refresh(stage)
    if cast(CursorResult[Any], changed).rowcount != 1 or stage.status != "pending":
        raise HTTPException(409, "A completed restore cannot be discarded")
    _remove(db, stage)
    db.flush()
