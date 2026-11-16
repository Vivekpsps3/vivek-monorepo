"""Synthetic ciphertext staging: isolation, resume and atomic activation boundaries."""

import base64
import hashlib
from datetime import timedelta

import pytest
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.models import (
    EncryptedRecord,
    EncryptedRecordIndex,
    VaultRestoreStage,
    utc_now,
)
from apps.finance.backend.services import encrypted_storage as store
from apps.finance.backend.services import vault_restore as restore
from apps.finance.backend.tests.conftest import SessionLocal, authenticated_client


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def b64(value=b"synthetic ciphertext" * 4):
    return base64.b64encode(value).decode()


def client(email="restore@example.com"):
    result = authenticated_client(app, email=email)
    response = result.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": b64(b"s" * 16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": b64(b"w" * 48),
            "key_version": 1,
        },
    )
    assert response.status_code == 200
    return result


def wire(collection, client_id=None, ciphertext=None):
    return {
        "collection": collection,
        "client_id": client_id or f"restore_{collection}",
        "ciphertext_b64": ciphertext or b64(),
        "schema_version": 2,
        "key_version": 1,
        "expected_revision": None,
        "indexes": [],
    }


def snapshot(c):
    response = c.get("/api/vault/recovery-snapshot")
    assert response.status_code == 200, response.text
    return response.json()


def create(c, records, mode="merge", batches=1):
    base = snapshot(c)
    counts = {
        row["collection"]: sum(record["collection"] == row["collection"] for record in records)
        for row in base["collections"]
    }
    payload = {
        "source_hash": hashlib.sha256(b"synthetic recovery file").hexdigest(),
        "base_fingerprint": base["fingerprint"],
        "mode": mode,
        "key_version": 1,
        "expected_counts": counts,
        "batch_count": batches,
    }
    response = c.post("/api/vault/restore/stages", json=payload)
    assert response.status_code == 200, response.text
    return response.json(), payload


def upload(c, stage, index, records):
    return c.put(
        f"/api/vault/restore/stages/{stage['id']}/batches",
        json={"batch_index": index, "records": records},
    )


def activate(c, stage, confirmation=""):
    return c.post(
        f"/api/vault/restore/stages/{stage['id']}/activate", json={"confirmation": confirmation}
    )


def test_all_collections_stay_inert_until_atomic_activation_and_retry_is_idempotent():
    c = client()
    records = [wire(name) for name in sorted(store.ALLOWED_COLLECTIONS)]
    stage, payload = create(c, records)
    assert c.post("/api/vault/restore/stages", json=payload).json()["id"] == stage["id"]
    assert activate(c, stage).status_code == 409
    assert upload(c, stage, 0, records).status_code == 200
    assert upload(c, stage, 0, records).status_code == 200
    assert snapshot(c)["records"] == []
    result = activate(c, stage)
    assert result.status_code == 200, result.text
    assert result.json() == {"restored": len(records), "removed": 0, "mode": "merge"}
    after = snapshot(c)
    assert {row["collection"] for row in after["records"]} == store.ALLOWED_COLLECTIONS
    assert activate(c, stage).json() == result.json()
    assert snapshot(c) == after
    assert upload(c, stage, 0, records).status_code == 409


def test_replace_requires_typed_confirmation_and_deletes_only_this_owner_after_complete_stage():
    c = client()
    foreign = client("foreign@example.com")
    old = wire("assets", "old_asset_1")
    assert c.post("/api/vault/records/upsert", json={"records": [old]}).status_code == 200
    foreign.post("/api/vault/records/upsert", json={"records": [old]})
    foreign_before = snapshot(foreign)
    records = [wire("health_stats")]
    before = snapshot(c)
    stage, _ = create(c, records, "replace")
    assert upload(c, stage, 0, records).status_code == 200
    assert activate(c, stage).status_code == 422
    assert snapshot(c) == before
    assert activate(c, stage, "REPLACE").json() == {"restored": 1, "removed": 1, "mode": "replace"}
    assert [row["collection"] for row in snapshot(c)["records"]] == ["health_stats"]
    assert snapshot(foreign) == foreign_before


def test_cross_owner_read_write_activate_and_discard_are_refused():
    c = client()
    other = client("other@example.com")
    records = [wire("transactions")]
    stage, _ = create(c, records)
    url = f"/api/vault/restore/stages/{stage['id']}"
    assert other.get(url).status_code == 404
    assert other.delete(url).status_code == 404
    assert upload(other, stage, 0, records).status_code == 404
    assert activate(other, stage).status_code == 404
    assert other.get("/api/vault/restore/stages").json() == []
    assert snapshot(c)["records"] == snapshot(other)["records"] == []


def test_stage_refuses_duplicates_changed_batches_unknown_schema_limits_and_bad_counts(monkeypatch):
    c = client()
    records = [wire("transactions", "record_001"), wire("transactions", "record_002")]
    stage, _ = create(c, records, batches=2)
    assert upload(c, stage, 0, [records[0]]).status_code == 200
    assert upload(c, stage, 1, [records[0]]).status_code == 422
    assert upload(c, stage, 0, [records[1]]).status_code == 409
    changes: list[dict[str, object]] = [
        {"schema_version": 3},
        {"key_version": 2},
        {"collection": "unknown_collection"},
        {"client_id": "bad/id"},
        {"ciphertext_b64": "%%%"},
    ]
    for change in changes:
        assert upload(c, stage, 1, [{**records[1], **change}]).status_code in (400, 422)
    monkeypatch.setattr(restore, "MAX_BATCH_CHARS", 1)
    assert upload(c, stage, 1, [records[1]]).status_code == 413
    assert snapshot(c)["records"] == []
    assert c.get(f"/api/vault/restore/stages/{stage['id']}").json()["received_batches"] == [0]


def test_conflict_and_delete_recreate_aba_leave_old_active_records_safe():
    c = client()
    old = wire("assets", "old_asset_1")
    c.post("/api/vault/records/upsert", json={"records": [old]})
    records = [wire("health_stats")]
    stage, _ = create(c, records, "replace")
    upload(c, stage, 0, records)
    c.post(
        "/api/vault/records/delete",
        json={
            "records": [
                {"collection": "assets", "client_id": "old_asset_1", "expected_revision": 1}
            ]
        },
    )
    c.post(
        "/api/vault/records/upsert",
        json={"records": [{**old, "ciphertext_b64": b64(b"different ciphertext" * 4)}]},
    )
    changed = snapshot(c)
    assert activate(c, stage, "REPLACE").status_code == 409
    assert snapshot(c) == changed


@pytest.mark.parametrize("boundary", ["delete", "first_upsert", "later_upsert", "commit"])
def test_failure_at_each_activation_boundary_rolls_back_records_indexes_and_job(
    monkeypatch, boundary
):
    c = client()
    old = wire("transactions", "old_transaction")
    old["indexes"] = [{"index_name": "dedupe_key", "index_value_b64": b64(b"old index" * 4)}]
    c.post("/api/vault/records/upsert", json={"records": [old]})
    records = [wire("transactions", f"incoming_{index:04d}") for index in range(201)]
    for index, record in enumerate(records):
        record["indexes"] = [
            {
                "index_name": "dedupe_key",
                "index_value_b64": b64(
                    hashlib.sha256(f"synthetic index {index}".encode()).digest()
                ),
            }
        ]
    stage, _ = create(c, records, "replace", batches=2)
    assert upload(c, stage, 0, records[:200]).status_code == 200
    assert upload(c, stage, 1, records[200:]).status_code == 200
    before = snapshot(c)
    owner = c.get("/api/auth/me").json()["user"]["id"]
    original_upsert = store.upsert_records
    original_delete = store.delete_records
    calls = 0

    def upsert(db, user, items):
        nonlocal calls
        result = original_upsert(db, user, items)
        calls += 1
        if (boundary == "first_upsert" and calls == 1) or (
            boundary == "later_upsert" and calls == 2
        ):
            raise RuntimeError("synthetic interrupted activation")
        return result

    def remove(db, user, items):
        result = original_delete(db, user, items)
        if boundary == "delete":
            raise RuntimeError("synthetic interrupted deletion")
        return result

    monkeypatch.setattr(store, "upsert_records", upsert)
    monkeypatch.setattr(store, "delete_records", remove)
    with SessionLocal() as db, pytest.raises(RuntimeError):
        try:
            restore.activate(db, owner, stage["id"], "REPLACE")
            if boundary == "commit":
                raise RuntimeError("synthetic commit failure")
            db.commit()
        except Exception:
            db.rollback()
            raise
    assert snapshot(c) == before
    with SessionLocal() as db:
        saved = db.get(VaultRestoreStage, stage["id"])
        assert saved is not None
        assert saved.status == "pending"
        indexes = db.query(EncryptedRecordIndex).all()
        assert [(row.client_id, row.index_value_b64) for row in indexes] == [
            ("old_transaction", b64(b"old index" * 4))
        ]
    monkeypatch.setattr(store, "upsert_records", original_upsert)
    monkeypatch.setattr(store, "delete_records", original_delete)
    assert activate(c, stage, "REPLACE").status_code == 200
    assert len(snapshot(c)["records"]) == 201
    with SessionLocal() as db:
        assert db.query(EncryptedRecordIndex).count() == 201


def test_discard_expiry_and_owner_reset_clear_only_inert_stages():
    c = client()
    records = [wire("transactions")]
    stage, _ = create(c, records)
    upload(c, stage, 0, records)
    assert c.delete(f"/api/vault/restore/stages/{stage['id']}").status_code == 200
    assert snapshot(c)["records"] == []
    stage, _ = create(c, records)
    with SessionLocal() as db:
        saved = db.get(VaultRestoreStage, stage["id"])
        assert saved is not None
        saved.created_at = utc_now() - timedelta(hours=25)
        db.commit()
    assert c.get("/api/vault/restore/stages").json() == []
    stage, _ = create(c, records)
    owner = c.get("/api/auth/me").json()["user"]["id"]
    with SessionLocal() as db:
        store.wipe_encrypted_user_data(db, owner)
        db.commit()
        assert db.query(VaultRestoreStage).count() == 0


def test_real_commit_failure_returns_error_and_preserves_active_data(monkeypatch):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    c = client()
    c.post("/api/vault/records/upsert", json={"records": [wire("assets", "old_asset_1")]})
    records = [wire("transactions")]
    stage, _ = create(c, records, "replace")
    upload(c, stage, 0, records)
    before = snapshot(c)
    original_activate = restore.activate
    original_commit = Session.commit

    def mark(db, *args):
        result = original_activate(db, *args)
        db.info["reject_restore_commit"] = True
        return result

    def reject(db):
        if db.info.pop("reject_restore_commit", False):
            raise RuntimeError("synthetic restore commit failure")
        return original_commit(db)

    monkeypatch.setattr(restore, "activate", mark)
    monkeypatch.setattr(Session, "commit", reject)
    with TestClient(app, raise_server_exceptions=False) as request:
        request.cookies.update(c.cookies)
        request.headers.update(c.headers)
        response = activate(request, stage, "REPLACE")
        assert response.status_code == 500
    assert snapshot(c) == before
    with SessionLocal() as db:
        saved = db.get(VaultRestoreStage, stage["id"])
        assert saved is not None
        assert saved.status == "pending"


def test_reset_or_rewrapped_vault_cannot_activate_an_old_stage(monkeypatch):
    from apps.finance.backend.tests.test_change_username import _open_signup, _signup
    from apps.finance.backend.tests.test_credential_rotation import ENDPOINT, _rotation

    _open_signup(monkeypatch)
    c, key, _auth, _vault, _dek = _signup("owner.name")
    records = [wire("health_stats")]
    stage, _ = create(c, records)
    upload(c, stage, 0, records)
    rotation = _rotation(c, key)
    rotation["vault"]["wrapped_dek_b64"] = b64(b"new wrapped vault" * 4)
    changed = c.post(ENDPOINT, json=rotation)
    assert changed.status_code == 200, changed.text
    before = snapshot(c)
    assert activate(c, stage).status_code == 409
    assert snapshot(c) == before
    fresh, _ = create(c, records)
    assert fresh["id"] != stage["id"]


def test_empty_replace_is_explicit_and_merge_rejects_existing_ids():
    c = client()
    old = wire("assets", "old_asset_1")
    c.post("/api/vault/records/upsert", json={"records": [old]})
    merge, _ = create(c, [old])
    upload(c, merge, 0, [old])
    before = snapshot(c)
    assert activate(c, merge).status_code == 409
    assert snapshot(c) == before
    empty, _ = create(c, [], "replace", batches=0)
    assert activate(c, empty).status_code == 422
    assert activate(c, empty, "REPLACE").json() == {"restored": 0, "removed": 1, "mode": "replace"}
    assert snapshot(c)["records"] == []


def test_stage_total_limit_quota_and_csrf_refuse_without_active_mutation(monkeypatch):
    c = client()
    records = [wire("transactions", "record_001"), wire("transactions", "record_002")]
    stage, payload = create(c, records, batches=2)
    assert upload(c, stage, 0, [records[0]]).status_code == 200
    monkeypatch.setattr(
        store, "MAX_RECOVERY_CIPHERTEXT_CHARS", len(records[0]["ciphertext_b64"]) + 1
    )
    assert upload(c, stage, 1, [records[1]]).status_code == 413
    second = c.post(
        "/api/vault/restore/stages",
        json={**payload, "source_hash": hashlib.sha256(b"second file").hexdigest()},
    )
    assert second.status_code == 200
    assert (
        c.post(
            "/api/vault/restore/stages",
            json={**payload, "source_hash": hashlib.sha256(b"third file").hexdigest()},
        ).status_code
        == 409
    )
    token = c.headers.pop("X-CSRF-Token")
    assert c.delete(f"/api/vault/restore/stages/{stage['id']}").status_code == 403
    c.headers["X-CSRF-Token"] = token
    assert c.post("/api/vault/restore/stages", json={**payload, "user_id": 999}).status_code == 422
    assert snapshot(c)["records"] == []


def test_competing_activation_commits_once_on_sqlite_file(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from apps.server.database import open_database
    from apps.server.identity.session import create_user

    database = open_database(f"sqlite:///{tmp_path / 'restore-race.db'}")
    Base.metadata.create_all(database.engine)
    with database.sessionmaker() as db:
        user = create_user(
            db,
            email="race@example.invalid",
            display_name="Race",
        )
        db.flush()
        owner = int(user.id)
        store.create_vault(
            db,
            owner,
            kdf_algorithm="PBKDF2",
            kdf_salt_b64=b64(b"s" * 16),
            kdf_iterations=600000,
            wrapped_dek_b64=b64(b"w" * 48),
        )
        db.commit()
        counts = {name: int(name == "health_stats") for name in store.COLLECTION_POLICY.recovery}
        stage = restore.create_stage(
            db,
            owner,
            {
                "source_hash": hashlib.sha256(b"race file").hexdigest(),
                "base_fingerprint": store.recovery_snapshot(db, owner)["fingerprint"],
                "mode": "merge",
                "key_version": 1,
                "expected_counts": counts,
                "batch_count": 1,
            },
        )
        restore.put_batch(db, owner, stage["id"], 0, [wire("health_stats")])
        db.commit()
    barrier = Barrier(2)

    def commit():
        with database.sessionmaker() as db:
            barrier.wait(timeout=10)
            result = restore.activate(db, owner, stage["id"], "")
            db.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as workers:
        first = workers.submit(commit)
        second = workers.submit(commit)
        assert (
            first.result(timeout=20)
            == second.result(timeout=20)
            == {"restored": 1, "removed": 0, "mode": "merge"}
        )
    with database.sessionmaker() as db:
        rows = store.list_records(db, owner)
        assert len(rows) == 1 and rows[0].revision == 1
    database.engine.dispose()


def test_late_update_cannot_resurrect_a_record_removed_by_replace():
    c = client()
    old = wire("assets", "old_asset_1")
    c.post("/api/vault/records/upsert", json={"records": [old]})
    stage, _ = create(c, [wire("health_stats")], "replace")
    upload(c, stage, 0, [wire("health_stats")])
    assert activate(c, stage, "REPLACE").status_code == 200
    before = snapshot(c)
    response = c.post(
        "/api/vault/records/upsert", json={"records": [{**old, "expected_revision": 1}]}
    )
    assert response.status_code == 409
    assert snapshot(c) == before
    # An explicit new create still uses the original null-revision contract.
    assert c.post("/api/vault/records/upsert", json={"records": [old]}).status_code == 200


def test_new_registered_collection_restores_without_another_membership_list(monkeypatch):
    policy = store.CollectionPolicy(
        finance=store.COLLECTION_POLICY.finance,
        health=store.COLLECTION_POLICY.health | {"future_review"},
    )
    monkeypatch.setattr(store, "COLLECTION_POLICY", policy)
    monkeypatch.setattr(store, "ALLOWED_COLLECTIONS", policy.recovery)
    store.assert_collection_contract(store.ALLOWED_COLLECTIONS, policy)
    c = client()
    records = [wire("future_review")]
    stage, _ = create(c, records)
    assert upload(c, stage, 0, records).status_code == 200
    assert activate(c, stage).status_code == 200
    assert snapshot(c)["records"][0]["collection"] == "future_review"


@pytest.mark.parametrize("operation", ["upsert", "reindex"])
def test_read_held_before_activation_cannot_overwrite_the_restored_revision(operation):
    from fastapi import HTTPException

    c = client()
    old = wire("assets", "same_asset_1")
    c.post("/api/vault/records/upsert", json={"records": [old]})
    incoming = {**old, "ciphertext_b64": b64(b"restored synthetic ciphertext" * 3)}
    stage, _ = create(c, [incoming], "replace")
    upload(c, stage, 0, [incoming])
    owner = c.get("/api/auth/me").json()["user"]["id"]
    with SessionLocal() as db:
        stale = db.query(EncryptedRecord).filter_by(user_id=owner, client_id=old["client_id"]).one()
        db.commit()  # Retain the ORM identity while the other request commits.
        assert stale.revision == 1
        assert activate(c, stage, "REPLACE").status_code == 200
        after = snapshot(c)
        assert stale.revision == 1
        try:
            with pytest.raises(HTTPException) as error:
                if operation == "upsert":
                    store.upsert_records(db, owner, [{**old, "expected_revision": 1}])
                else:
                    store.reindex_records(db, owner, [{**old, "expected_revision": 1}])
            assert error.value.status_code == 409
        finally:
            db.rollback()
        assert snapshot(c) == after
