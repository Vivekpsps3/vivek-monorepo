# PTO-04 — Implement conflict-safe Remove Sick policy while preserving history

- Stable key: `PTO-04`
- GitHub leaf: [#233](https://github.com/Vivekpsps3/vivek-monorepo/issues/233)
- Parents: [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `PTO-02`
- Conflict groups: `travel-pto-main`, `travel-leave-api`
- Verification profiles: `travel_front`, `travel_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A user can remove and later reconfigure Sick policy without losing historical leave, future allocations or PTO.

## Requirements

- #110 scope5/#126 safe Reset Sick, impact preview and owner-isolation acceptance.

## Source paths

- `apps/travel/frontend/src/pto.component.ts`
- `apps/travel/backend/routers/leave.py`
- `apps/travel/backend/models.py`
- `apps/travel/backend/services/leave_math.py`

## Target paths

- `apps/travel/frontend/src/pto.component.ts`
- `apps/travel/backend/routers/leave.py`
- `apps/travel/backend/schemas.py`
- `apps/travel/backend/tests/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Use existing confirm-and-run for Remove Sick policy and explain policy/setup/dismissal changes exactly; balance correction stays in dated editor with impact preview.
3. Add the smallest owner/revision-aware command needed to unconfigure Sick and reset its setup state; preserve all history, future leave allocations and PTO.
4. Guard stale/double requests so a removed/reconfigured policy cannot be erased by an old retry; allow reconfiguration over retained history.
5. Delete ambiguous reset/remove branches that implied deleting ledger rows.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| SICK1 | Sick/PTO policies with old entries and future allocations | cancel, fail then successfully confirm removal | cancel/failure preserve policy; success changes only Sick policy/setup and preserves every entry/allocation/PTO row | API before/after row snapshots and browser confirmation |
| SICK2 | old removal request while Sick is reconfigured or another owner exists | retry/double-click old command | conflict/no-op cannot erase new/foreign policy; user gets recoverable state | concurrency/owner API regression |
| SICK3 | removed policy with retained history | configure Sick again and correct a dated balance | history remains visible and correction previews effects without rewriting prior entries | roundtrip/browser projection evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| ambiguous Sick reset actions and destructive ledger-reset paths | replace with one explicit policy-only command and remove obsolete copy/handlers | required | row-preservation fixture proves no entry deletion |

## Non-goals

- No historical ledger deletion or silent balance rewrite.

## Test scenarios

- cancel;502;conflict;double-click;owner;reconfigure;historical/future preservation;dated correction

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
