# OPS-03 — Add one opt-in encrypted off-host backup adapter with dry-run

- Stable key: `OPS-03`
- GitHub leaf: [#274](https://github.com/Vivekpsps3/vivek-monorepo/issues/274)
- Parents: [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `OPS-02`
- Conflict groups: `backup-core`, `monitoring`, `compose`
- Verification profiles: `ops`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A configured destination can receive authenticated encrypted verified backups; a dry-run proves behavior without real secrets or transfers.

Extend the existing verified backup pipeline with a bounded encrypted transfer adapter, not another scheduler/database.

## Requirements

- #125 settled off-host adapter scope and acceptance3/4 encryption/freshness/activation prerequisites.
- TD-34 off-host code support; actual activation owned OPS-06.

## Source paths

- `scripts/backup-site.py`
- `scripts/backup-site.sh`
- `compose.yml`
- `apps/server/monitor.py`
- `docs/OPERATIONS.md`
- `docs/BACKUP.md`

## Target paths

- `scripts/backup-site.py (small adapter seam)`
- `scripts/backup-site.sh`
- `compose.yml (opt-in existing scheduler wiring)`
- `apps/server/monitor.py`
- `docs/BACKUP.md`
- `docs/OPERATIONS.md`
- `scripts/ (focused adapter/tests)`

## Steps

1. Choose the minimal configured adapter contract for an owner-supplied existing destination; no paid vendor selection or embedded credentials.
2. Encrypt/checksum authenticated backup content using reviewed primitives and separately configured key custody; never copy plaintext or key material into logs/issues/artifacts.
3. Reuse existing backup trigger/manifests/retention with bounded retries/backoff, dry-run and freshness/failure status.
4. Prove synthetic encrypt-transfer-decrypt-verify roundtrip through a fake destination, including interruption/corruption and retry idempotence.
5. Document exact activation prerequisites and recovery-key custody; leave OPS-06 open until actual transfer/restore evidence exists.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Synthetic verified snapshot and fake destination | adapter runs in dry-run and fixture transfer modes | dry-run sends nothing; fixture ciphertext roundtrip restores valid source bytes and authenticated metadata | fake transport/encryption roundtrip tests |
| A02 | Network/corruption/authentication/key/config failure | transfer/retry runs | failure is explicit, retry bounded and last good local/remote verified state preserved | fault-injection adapter tests |
| A03 | Logs/manifests/errors contain marker secrets and private payload | failure/diagnostic path executes | tokens/key/plaintext markers are absent and freshness is honest | redaction/request/storage assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Independent off-host scheduler/controller or parallel backup implementation | Keep existing verified snapshot producer and add one bounded adapter; remove duplicated transfer/manifest code if present. | required | One producer and scheduler in consumer inventory, fixture roundtrip and failure proof. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Dry-run zero transfer, authenticated tamper/wrong-key rejection
- Retry/backoff/disconnect/freshness
- No secret/private-data logs

## Risks

- No real destination setup, purchase or secret disclosure is authorized by code-plan completion.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
