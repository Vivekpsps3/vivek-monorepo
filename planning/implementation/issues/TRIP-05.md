# TRIP-05 — Replace both trip PTO pickers with one readable day allocation control

- Stable key: `TRIP-05`
- GitHub leaf: [#229](https://github.com/Vivekpsps3/vivek-monorepo/issues/229)
- Parents: [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TRIP-04`
- Conflict groups: `travel-new-trip`, `travel-trip-main`, `travel-pto-picker`
- Verification profiles: `travel_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

New and existing trips use the same Full/Half/None allocation behavior with immediate accurate totals.

## Requirements

- #84 scope5/T8 picker half; existing/new trip pickers, local dates, immediate totals and390 no-scroll; PTO decimal-cache legacy portion #128.

## Source paths

- `apps/travel/frontend/src/new-trip.component.ts`
- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/pto-model.mjs`
- `apps/travel/backend/services/pto.py`

## Target paths

- `apps/travel/frontend/src/new-trip.component.ts`
- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/travel.css`
- `apps/travel/e2e/pto.spec.js`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Use a small shared trip-allocation presentation/helper for Full/Half/None, adopted by both new-trip and existing-trip controls; remove their duplicated selection state/markup where semantics match.
3. Format dates locally, update totals immediately and preserve current server allocation and overlap rules.
4. Verify quarter/decimal cache behavior and last edited allocation survives appropriate retry while stale previews invalidate; coordinate policy-only changes with #110.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PICK1 | same dates/allocation in new and existing trip | choose Full/Half/None with pointer and keyboard | both controls show the same totals and send equivalent allocation payloads | unit vectors and two actual browser journeys |
| PICK2 | 390px light/dark trip and fractional existing allocations | edit allocation, trigger failure and retry | no horizontal scroll, date/copy readable, decimal state not stale or silently rounded | width, payload and retry assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| parallel new/edit trip allocation controls with separate math | adopt one small allocation control/helper and remove duplicate math/state | required | same fixture drives both entry points; server math remains authoritative |

## Non-goals

- Policy balances/accrual/chart belong to PTO packets.
- No new leave math or horizontal scroller.

## Test scenarios

- Full/Half/None; keyboard; local date; overlap; fractional cache; failure/retry;390 light/dark

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
