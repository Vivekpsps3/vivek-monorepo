# MED-08 — Collapse competing Media catalog/entry/progress/query implementations

- Stable key: `MED-08`
- GitHub leaf: [#242](https://github.com/Vivekpsps3/vivek-monorepo/issues/242)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `MED-01`, `MED-07`
- Conflict groups: `media-records`, `media-membership`, `media-library-api`
- Verification profiles: `media_back`, `server_back`, `media_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Media changes touch one authoritative command/query path rather than interleaved catalog repair, personal state and serializers.

Media changes touch one authoritative command/query path rather than interleaved catalog repair, personal state and serializers.

## Requirements

- #200 TD-18/TD-28 and A03/A10/F-13; preserve #85 owner isolation, no-op edits, progress/Undo and saved-read contracts.

## Source paths

- `apps/media/backend/services/records.py`
- `apps/media/backend/services/membership.py`
- `apps/media/backend/routers/journal.py`
- `apps/server/database.py`
- `apps/media/backend/tests/`

## Target paths

- `apps/media/backend/services/records.py`
- `apps/media/backend/services/membership.py`
- `apps/media/backend/services/`
- `apps/media/backend/routers/journal.py`
- `apps/media/backend/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Map global catalog identity/reconciliation, owner entry mutation, membership, progress, saved queries and projection functions; identify actual competing/duplicate paths and current transaction boundaries.
3. Choose one authoritative operation for each behavior and migrate public route callers; separate independent responsibilities only where it removes coupling, without adding a generic repository layer.
4. Delete old serializers/lookup/mutation/merge branches after callers migrate; keep global catalog and personal entry concerns distinct and preserve request commit-before-response.
5. Keep external repair explicit after MED-01, preserve release-group/pressing, multi-owner notes/ratings/links, expected revision/no-op/Undo and bounded owner-scoped reads.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| RECORD1 | shared catalog with two owners and every supported progress kind | add/edit/no-op/complete/Undo/delete and repair identities explicitly | one authoritative command path preserves personal data and stable catalog relations | API transaction/identity/membership/progress fixtures |
| RECORD2 | failed write/conflict/partial repair and paginated saved reads | retry and read existing records | rollback/idempotency/owner scoping hold; saved reads remain DB-only and bounded | held transaction/uniqueness/provider-spy/query-budget regressions |
| RECORD3 | all migrated route callers and obsolete implementations | compare before/after and run affected suites | old independent paths deleted, public responses compatible, fewer separate implementations | caller/removal ledger plus payload fixtures and actual LOC counts |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| competing catalog lookup/serialization/entry-progress mutation branches across records and membership | migrate to one owner per operation and delete old implementations | required | caller and transaction map, preserved multi-owner/Undo tests |
| hidden record repair orchestration on normal read paths | retain only explicit canonical operation established by MED-01 | required | forbidden-provider/read-write spies on ordinary views |

## Non-goals

- No universal repository/UoW framework, broad model rewrite or removed personal history.

## Test scenarios

- sharedcatalog;releasegroup;no-op;conflict;rollback;owner;episode/season/album/trackUndo;delete;readpaging

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
