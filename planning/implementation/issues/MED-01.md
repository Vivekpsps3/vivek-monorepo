# MED-01 — Keep saved Media reads database-only and move repair to explicit bounded work

- Stable key: `MED-01`
- GitHub leaf: [#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235)
- Parents: [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85), [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `media-records`, `media-library-api`, `media-provider-transport`
- Verification profiles: `media_back`, `server_back`, `media_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Opening or filtering saved Media never waits on external providers or silently repairs catalog history.

Opening or filtering saved Media never waits on external providers or silently repairs catalog history.

## Requirements

- #85 architecture/read guarantees plus technical-debt TD-04/TD-28 and independent A03/F-03; PR193 MusicBrainz changes must be reconciled before edits.

## Source paths

- `apps/media/backend/routers/journal.py`
- `apps/media/backend/services/records.py`
- `apps/media/backend/services/providers.py`
- `apps/server/database.py`

## Target paths

- `apps/media/backend/routers/journal.py`
- `apps/media/backend/services/records.py`
- `apps/media/backend/tests/`
- `docs/MEDIA.md`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Trace library/summary/detail and discography reads; distinguish explicitly requested metadata browsing from ordinary saved reads.
3. Remove the pre-pagination repair/provider path from ordinary saved GETs. Reuse an existing explicit refresh/repair command where it can safely own necessary repair; introduce no background job framework.
4. Bound any retained explicit identity repair by page/batch/total deadline with idempotent retry, clear transaction ownership and unresolved-metadata display. Preserve release-group/pressing identity and each owner’s notes/ratings/membership.
5. Delete hidden read-triggered repair invocation and obsolete fallback state, while retaining correct identity resolution on writes/explicit actions.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| READ1 | unresolved album fixtures and provider spies that throw | GET saved library/summary/detail repeatedly with filtering/paging | requests succeed from saved DB state with zero provider calls and no repair writes | Media API provider spies and before/after catalog/link snapshots |
| REPAIR1 | shared catalog records across two owners with conflicting personal notes/ratings | explicitly invoke bounded repair, interrupt/fail and retry | identity repair is idempotent, bounded and preserves each owner’s history; no cross-owner personal mutation | transaction/conflict/multi-owner fixtures |
| PAGE1 | large saved album history and a small page request | read a bounded page | no full-history repair loop runs before paging; unresolved metadata remains honest | query/provider-call budget assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| GET /library→repair_musicbrainz_albums pre-page provider/mutation path | remove hidden invocation and route necessary repair through one explicit owner | required | GET spy forbids providers and DB snapshots prove reads do not mutate |
| duplicate identity-repair entry points that bypass current canonical write logic | reuse the existing authoritative identity command and delete obsolete alternate path | required | all explicit consumers named and same identity fixtures pass |

## Non-goals

- No global catalog deletion, title-only dedupe or provider call ban on explicitly requested metadata browse.
- No new queue framework or weakened cache/identity assertions.

## Test scenarios

- unresolved/mixed/music saved lists; no-IO reads; paging; shared identity; cancellation/failed repair; personal-state preservation

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
