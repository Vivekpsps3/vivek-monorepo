# OPS-04 — Automate a disposable all-domain restore drill and measure recovery

- Stable key: `OPS-04`
- GitHub leaf: [#275](https://github.com/Vivekpsps3/vivek-monorepo/issues/275)
- Parents: [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: `OPS-03`
- Conflict groups: `backup-core`, `migration-tools`, `compose`, `operations-docs`
- Verification profiles: `ops`, `server_back`, `schema`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

The owner has repeatable synthetic recovery evidence and measured objectives instead of an untested backup claim.

Use verified backups to restore a temporary database/environment and prove schema/ownership/ciphertext recovery with timings.

## Requirements

- #125 acceptance3 monthly disposable drills, schema/integrity/owner/ciphertext and measured RPO/RTO.
- TD-27/TD-34 migration/account-ownership preservation and host-recovery proof boundary.

## Source paths

- `scripts/backup-site.py`
- `scripts/validate-seeded-adoption.sh`
- `scripts/seed_dev_db.py`
- `apps/server/migrations.py`
- `apps/server/schema.py`
- `docs/OPERATIONS.md`
- `docs/VERIFICATION.md`

## Target paths

- `scripts/ (owned restore-drill command and behavior tests)`
- `docs/OPERATIONS.md`
- `docs/VERIFICATION.md`
- `compose.yml (optional disposable profile only if needed)`

## Steps

1. Reuse source backup verification and seeded fixtures to restore into a uniquely named disposable directory/volume; hard-fail if target resembles production/existing nonempty state.
2. Verify checksum/authenticated decryption where applicable, SQLite integrity/foreign keys/schema head, owner counts and representative ciphertext records across all domains.
3. Record measured duration/data-loss window and compare objectives (local1h, off-host24h, restore4h) without declaring unperformed production achievements.
4. Test corrupt/wrong-version/interrupted restore and ensure current source database/backup are untouched.
5. Provide one documented monthly invocation using existing scheduling/ops patterns; remove redundant manual drill scripts if safely replaced.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Known synthetic all-domain backup | drill restores into disposable destination | schema/owner/ciphertext/integrity checks match and duration/data-loss window are recorded | deterministic seeded restore report |
| A02 | Nonempty/production-like target or corrupt/unsupported source | drill starts | it refuses before destructive writes and preserves current source/last good backups | negative path and sentinel file tests |
| A03 | Drill is interrupted or repeated | cleanup/retry executes | only its owned disposable artifacts are removed; production volumes never targeted | fault-injection cleanup/idempotency test |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Duplicated manual recovery/rehearsal steps | Reuse verification/migration primitives and one owned drill entrypoint; retire obsolete duplicate instructions/scripts only after parity proof. | required | Repeated synthetic drill and safe-target negative tests. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- All-domain owner/ciphertext counts and schema head
- Production-target refusal and corrupt/unsupported input
- Interrupted cleanup, repeat drill and measured objective report

## Risks

- A scrubbed synthetic restore proves the procedure, not production recovery; validate the actual schema chain and never write the fixture back to a live database.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
