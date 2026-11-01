import base64
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import delete

from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.tests.conftest import authenticated_client


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _b64(n: int = 32) -> str:
    return base64.b64encode(b"x" * n).decode("ascii")


def test_legacy_finance_api_unmounted():
    client = authenticated_client(app, email="legacy-gone@example.com")
    retired_gets = [
        "/api/assets/",
        "/api/holdings/",
        "/api/imports/banks",
        "/api/transactions/",
        "/api/planning/v1/inputs",
        "/api/admin/sql",
    ]
    for path in retired_gets:
        res = client.get(path)
        assert res.status_code == 404, path


def test_vault_setup_and_record_roundtrip():
    client = authenticated_client(app, email="vault@example.com")
    status = client.get("/api/vault/status")
    assert status.status_code == 200
    body = status.json()
    assert body["exists"] is False

    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text
    assert setup.json()["exists"] is True

    upsert = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                    "indexes": [
                        {
                            "index_name": "dedupe",
                            "index_value_b64": _b64(32),
                        }
                    ],
                }
            ]
        },
    )
    assert upsert.status_code == 200, upsert.text
    rows = upsert.json()
    assert len(rows) == 1
    assert rows[0]["client_id"] == "asset-001"
    assert rows[0]["revision"] == 1

    listed = client.get("/api/vault/records?collection=assets")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "ciphertext_b64" in listed.json()[0]

    conflict = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "expected_revision": 99,
                }
            ]
        },
    )
    assert conflict.status_code == 409

    ok = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(80),
                    "expected_revision": 1,
                }
            ]
        },
    )
    assert ok.status_code == 200
    assert ok.json()[0]["revision"] == 2

    counts = client.get("/api/vault/counts")
    assert counts.status_code == 200
    assert counts.json()["counts"]["assets"] == 1


def test_vault_setup_accepts_browser_packed_recovery_wrap():
    """Browser packs recovery as base64(salt).base64(iv||ciphertext)."""
    client = authenticated_client(app, email="vault-packed@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": "r9qDiTPiAKP3Ouf3/61xzQ==",
            "kdf_iterations": 600000,
            "wrapped_dek_b64": "LqGH7LVNXPcZ5h9kpbk1wRSWCAV/DlqD0LQ5AHn4UlRh7/qKd6EllAwQH7GbW3qevfadFIKzgBQgo7TA",
            "recovery_wrapped_dek_b64": (
                "bPvdPISm7G3VfHBXCUT+JQ==."
                "+JiKGYsPusAELZcxOlkK+0Ukn0FVo+urQM5/Xwb6/SU3a52qdE2YVWa3cZrX+6oOsHBY9LEC9Ca88n4o"
            ),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text
    assert setup.json()["exists"] is True


def test_vault_rejects_malformed_base64():
    client = authenticated_client(app, email="vault-invalid-base64@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16) + "!",
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 400
    assert setup.json()["detail"] == "Invalid base64 payload"


def test_vault_rejects_urlsafe_or_unpadded_base64():
    client = authenticated_client(app, email="vault-strict-base64@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16).rstrip("="),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 400
    assert setup.json()["detail"] == "Invalid base64 payload"


def test_vault_upsert_requires_explicit_revision_and_preserves_key_version():
    client = authenticated_client(app, email="vault-revision@example.com")
    assert (
        client.post(
            "/api/vault/setup",
            json={
                "kdf_salt_b64": _b64(16),
                "wrapped_dek_b64": _b64(48),
                "recovery_wrapped_dek_b64": _b64(48),
            },
        ).status_code
        == 200
    )
    created = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 7,
                }
            ]
        },
    )
    assert created.status_code == 200

    missing_revision = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 2,
                    "key_version": 7,
                }
            ]
        },
    )
    assert missing_revision.status_code == 400

    rewritten = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 2,
                    "key_version": 7,
                    "expected_revision": 1,
                }
            ]
        },
    )
    assert rewritten.status_code == 200
    assert rewritten.json()[0]["key_version"] == 7


def test_vault_wrap_update_rejects_a_weaker_kdf():
    client = authenticated_client(app, email="vault-kdf@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": "",
        },
    )
    assert setup.status_code == 200, setup.text
    weaker = client.put(
        "/api/vault/wraps",
        json={"kdf_iterations": 310000, "wrapped_dek_b64": _b64(48)},
    )
    assert weaker.status_code == 422


def test_plaintext_migration_endpoints_are_retired():
    client = authenticated_client(app, email="retired-migration@example.com")
    assert client.get("/api/vault/migration/export").status_code == 404
    assert (
        client.post("/api/vault/migration/complete", json={"counts": {}, "records": []}).status_code
        == 404
    )


def test_vault_rejects_stale_record_delete():
    client = authenticated_client(app, email="vault-stale-delete@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text
    upsert = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                }
            ]
        },
    )
    assert upsert.status_code == 200, upsert.text

    stale_delete = client.post(
        "/api/vault/records/delete",
        json={
            "records": [{"collection": "assets", "client_id": "asset-001", "expected_revision": 0}]
        },
    )
    assert stale_delete.status_code == 409


def test_vault_accepts_stock_lab_scenarios_collection():
    client = authenticated_client(app, email="stock-lab-vault@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text

    upsert = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "stock_lab_scenarios",
                    "client_id": "scenario-001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                }
            ]
        },
    )
    assert upsert.status_code == 200, upsert.text
    assert upsert.json()[0]["client_id"] == "scenario-001"

    listed = client.get("/api/vault/records?collection=stock_lab_scenarios")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    counts = client.get("/api/vault/counts")
    assert counts.status_code == 200
    assert counts.json()["counts"]["stock_lab_scenarios"] == 1


def test_reindex_updates_existing_rows_and_skips_missing_ids():
    client = authenticated_client(app, email="vault-reindex@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": "",
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text
    created = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": "txn_keep0001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                },
                {
                    "collection": "transactions",
                    "client_id": "txn_drop0001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                },
            ]
        },
    )
    assert created.status_code == 200, created.text
    deleted = client.post(
        "/api/vault/records/delete",
        json={
            "records": [
                {"collection": "transactions", "client_id": "txn_drop0001", "expected_revision": 1}
            ]
        },
    )
    assert deleted.status_code == 200, deleted.text
    reindexed = client.post(
        "/api/vault/records/reindex",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": "txn_keep0001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                    "expected_revision": 1,
                    "indexes": [{"index_name": "dedupe_key", "index_value_b64": _b64(32)}],
                },
                {
                    "collection": "transactions",
                    "client_id": "txn_drop0001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                    "expected_revision": 1,
                },
                {
                    "collection": "transactions",
                    "client_id": "txn_gone0001",
                    "ciphertext_b64": _b64(64),
                    "expected_revision": 1,
                },
            ]
        },
    )
    assert reindexed.status_code == 200, reindexed.text
    body = reindexed.json()
    assert [row["client_id"] for row in body["records"]] == ["txn_keep0001"]
    assert body["records"][0]["revision"] == 2
    assert body["skipped"] == ["txn_drop0001", "txn_gone0001"]
    listed = client.get("/api/vault/records?collection=transactions")
    assert listed.status_code == 200
    rows = listed.json()
    assert [row["client_id"] for row in rows] == ["txn_keep0001"]
    assert rows[0]["revision"] == 2
    conflict = client.post(
        "/api/vault/records/reindex",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": "txn_keep0001",
                    "ciphertext_b64": _b64(64),
                    "expected_revision": 1,
                }
            ]
        },
    )
    assert conflict.status_code == 409
    again = client.get("/api/vault/records?collection=transactions")
    assert [row["revision"] for row in again.json()] == [2]


def _setup_vault(client) -> None:
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 600000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": "",
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text


def _upsert_txn(client, client_id: str) -> str:
    ciphertext = _b64(64)
    created = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "transactions",
                    "client_id": client_id,
                    "ciphertext_b64": ciphertext,
                    "schema_version": 1,
                    "key_version": 1,
                }
            ]
        },
    )
    assert created.status_code == 200, created.text
    return ciphertext


def _reindex_txn(client_id: str, ciphertext: str, index_value: str) -> dict:
    return {
        "collection": "transactions",
        "client_id": client_id,
        "ciphertext_b64": ciphertext,
        "schema_version": 1,
        "key_version": 1,
        "expected_revision": 1,
        "indexes": [{"index_name": "dedupe_key", "index_value_b64": index_value}],
    }


def test_reindex_does_not_change_another_users_row():
    owner = authenticated_client(app, email="vault-owner@example.com")
    other = authenticated_client(app, email="vault-other@example.com")
    _setup_vault(owner)
    _setup_vault(other)
    original = _upsert_txn(owner, "txn_keep0001")
    reindexed = other.post(
        "/api/vault/records/reindex",
        json={"records": [_reindex_txn("txn_keep0001", _b64(80), _b64(32))]},
    )
    assert reindexed.status_code == 200, reindexed.text
    body = reindexed.json()
    assert body["records"] == []
    assert body["skipped"] == ["txn_keep0001"]
    listed = owner.get("/api/vault/records?collection=transactions")
    assert listed.status_code == 200, listed.text
    row = listed.json()[0]
    assert row["client_id"] == "txn_keep0001"
    assert row["revision"] == 1
    assert row["ciphertext_b64"] == original


def test_reindex_skips_a_duplicate_blind_index():
    client = authenticated_client(app, email="vault-dup-index@example.com")
    _setup_vault(client)
    first_original = _upsert_txn(client, "txn_dup000001")
    second_original = _upsert_txn(client, "txn_dup000002")
    shared = _b64(32)
    reindexed = client.post(
        "/api/vault/records/reindex",
        json={
            "records": [
                _reindex_txn("txn_dup000001", _b64(72), shared),
                _reindex_txn("txn_dup000002", _b64(80), shared),
            ]
        },
    )
    assert reindexed.status_code == 200, reindexed.text
    body = reindexed.json()
    assert [row["client_id"] for row in body["records"]] == ["txn_dup000001"]
    assert body["records"][0]["revision"] == 2
    assert body["skipped"] == ["txn_dup000002"]
    listed = client.get("/api/vault/records?collection=transactions")
    rows = {row["client_id"]: row for row in listed.json()}
    assert rows["txn_dup000001"]["revision"] == 2
    assert rows["txn_dup000001"]["ciphertext_b64"] != first_original
    assert rows["txn_dup000002"]["revision"] == 1
    assert rows["txn_dup000002"]["ciphertext_b64"] == second_original
    lookup = client.post(
        "/api/vault/indexes/lookup",
        json={
            "collection": "transactions",
            "index_name": "dedupe_key",
            "index_value_b64": shared,
        },
    )
    assert lookup.status_code == 200, lookup.text
    assert lookup.json()["client_ids"] == ["txn_dup000001"]
