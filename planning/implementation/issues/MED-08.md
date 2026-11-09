# MED-08 — Collapse competing Media catalog/entry/progress/query implementations

- Stable key: `MED-08`
- GitHub leaf: [#242](https://github.com/Vivekpsps3/vivek-monorepo/issues/242)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `MED-01`
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
- `apps/server/alembic/versions/site_media_membership_v1.py`

## Target paths

- `apps/media/backend/services/records.py`
- `apps/media/backend/services/`
- `apps/media/backend/routers/journal.py`
- `apps/media/backend/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Map existing catalog identity lookup, owner entry creation, progress and projections to their actual functions. membership.py is applied-migration support, not a competing runtime store. Keep its imported behavior unchanged.
3. Use the existing _catalog_by_source identity lookup from _public_catalog instead of its inline query; preserve the caller-specific kind check. Inventory remaining runtime duplication and consolidate only proven equivalent operations; new_entry and _entry_for_catalog are already owners, not new seams to invent.
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
| Proven duplicate runtime catalog identity lookups, starting with _public_catalog versus _catalog_by_source; any additional equivalent serializer/mutation paths require evidence | migrate to one owner per operation and delete old implementations | required | caller and transaction map, preserved multi-owner/Undo tests |
| hidden record repair orchestration on normal read paths | retain only explicit canonical operation established by MED-01 | required | forbidden-provider/read-write spies on ordinary views |

## Non-goals

- No universal repository/UoW framework, broad model rewrite or removed personal history.
- Do not edit/remove membership.py or its backfill/downgrade functions: applied site_media_membership_v1 imports them. Migration-only LOC is outside the runtime reduction denominator.

## Test scenarios

- sharedcatalog;releasegroup;no-op;conflict;rollback;owner;episode/season/album/trackUndo;delete;readpaging

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Dependency rationale

Keep the merged saved-read correction. Provider transport cleanup has no required catalog/query API change, so schedule actual shared files rather than depend on MED-07.

## Concrete deletion plan

At main 29e1318 after MED-01, records.py is 2,356 lines (the earlier 63bc975 snapshot was 2,177). Those extra identity-safety paths are not presumed dead code. _catalog_by_source already owns (source, source_id) lookup; _public_catalog repeats that query. Migrate the latter to the existing lookup, retain its kind mismatch rejection, and delete the inline query. _entry_for_catalog and new_entry already own owner-specific entry lookup/creation; do not add a repository or second entry state machine around them.

Map each remaining runtime operation to its authoritative existing function and direct callers before removing any equivalent serializer/merge branch. catalog_dict, entry_card, _album_payload and _track_payload represent different catalog/personal/nested contracts; field overlap is not proof of equivalence. Preserve owner-specific rating/note/portrait and pressing/release-group identity.

membership.py is 874 lines, mostly backfill/downgrade SQL imported by applied site_media_membership_v1. Its filename does not imply a competing runtime store. Preserve that helper and the revision; exclude its LOC from potential runtime savings. Run migration preservation/seeded validation if actual migration-facing imports change; no such change is required by this packet.

Saved reads stay DB-only after MED-01. Prove source-id collision/kind rejection, two owners sharing a catalog, no-op edits, failed transactions, bounded library queries and progress/Undo. Count removed equivalent decision paths separately from necessary projections. If no further duplication exists, provide that evidence rather than inventing abstraction to make the module look smaller.
