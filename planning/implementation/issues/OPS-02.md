# OPS-02 — Reconcile snapshot retention and prove last-good preservation

- Stable key: `OPS-02`
- GitHub leaf: [#273](https://github.com/Vivekpsps3/vivek-monorepo/issues/273)
- Parents: [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286). Use its branch if the amendment is not yet on main.
- Dependencies: `OPS-01`
- Conflict groups: `backup-core`, `compose`, `operations-docs`
- Verification profiles: `ops`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Backups rotate according to the documented policy and no failed/corrupt/concurrent run deletes the last good recovery point.

Implement the selected retention policy explicitly while keeping hourly and pre-migration snapshots independently safe.

## Requirements

- #125 settled30-day/minimum-seven retention, hourly/predeploy snapshots and acceptance3 corruption/concurrency.
- TD-34 local recovery prerequisite and retention contradiction disposition.

## Source paths

- `scripts/backup-site.py`
- `scripts/backup-site.sh`
- `compose.yml`
- `scripts/test_deploy_site.py`
- `docs/BACKUP.md`
- `docs/OPERATIONS.md`
- `docs/SRE-FOLLOWUPS.md`

## Target paths

- `scripts/backup-site.py`
- `scripts/backup-site.sh`
- `compose.yml`
- `scripts/test_deploy_site.py (or focused new backup behavior tests)`
- `docs/BACKUP.md`
- `docs/OPERATIONS.md`

## Steps

1. Pin current keep1 hourly and separate at-least-three-revision pre-migration behavior using synthetic snapshots and manifests.
2. Encode selected age/minimum-count policy explicitly with backward-compatible configuration and safe defaults; record rollout behavior rather than silently assuming production already changed.
3. Keep atomic integrity/restore verification before publication/prune and directory locking; distinguish hourly and pre-migration namespaces.
4. Test corruption/missing source/concurrent publication/retention boundaries and preserve the newest verified snapshot under all failure modes.
5. Remove obsolete count-only or duplicate pruning branches when replaced and reconcile all current docs/config examples.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Dated valid snapshots across more than30 days | retention runs | age policy and minimum-seven verified copies agree; pre-migration revisions remain separately protected | synthetic timestamp/count fixture matrix |
| A02 | New backup is corrupt, missing or interrupted | rotation is attempted | last good snapshot remains readable and no successful manifest is fabricated | fault-injection backup/restore test |
| A03 | Two manual/scheduled jobs overlap | publish/prune execute | locking prevents deleting the winner or racing manifest contents | concurrent temporary-directory test |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Contradictory count-only retention branches/docs | Replace with one explicit policy path and delete duplicate prune logic while preserving pre-migration behavior. | required | Boundary/failure/concurrency fixtures and matching docs/config. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Retention age/count and pre-migration revision grouping
- Checksum/foreign-key/corrupt/missing-state failure
- Concurrent publication and last-good preservation

## Risks

- A local verified snapshot is not an off-host recovery guarantee; keep retention and source validation explicit without logging secrets.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
