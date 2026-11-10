# PTO-03 — Show canonical PTO/Sick day-hour balances and next-trip impact on Home

- Stable key: `PTO-03`
- GitHub leaf: [#232](https://github.com/Vivekpsps3/vivek-monorepo/issues/232)
- Parents: [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Plan source: [amendment #286](https://github.com/Vivekpsps3/vivek-monorepo/pull/286).
- Dependencies: none
- Conflict groups: `travel-home`, `travel-summary`
- Verification profiles: `travel_front`, `travel_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Travel Home explains available time off and the effect of the next trip without duplicating policy calculations.

## Requirements

- #110 scope4/#126 Home hours and matching summary acceptance.

## Source paths

- `apps/travel/frontend/src/travel.component.ts`
- `apps/travel/frontend/src/travel.models.ts`
- `apps/travel/backend/app.py`
- `apps/travel/backend/services/leave_math.py`

## Target paths

- `apps/travel/frontend/src/travel.component.ts`
- `apps/travel/frontend/src/travel.models.ts`
- `apps/travel/backend/routers/`
- `apps/travel/backend/services/`
- `apps/travel/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Extend/reuse the typed Home summary from the same policy math used by PTO; add no component balance calculation.
3. Render PTO and Sick in days and hours with next-trip impact, while keeping currency and hours distinct.
4. Provide loading/unconfigured/single-bucket/error states and setup links; remove old PTO-only summary formatting/state when migrated.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| HOMEH1 | configured PTO/Sick and a next trip | compare Home with PTO page before/after allocation change | day/hour balances and trip impact match authoritative math | API fixture and browser cross-screen assertion |
| HOMEH2 | no policy, one bucket or one summary failure | open Home and follow setup/retry | clear state and correct setup link; unrelated trip cards remain usable | source-state browser matrix |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| PTO-only Home summary and any inline days/hours calculator | consume canonical typed summary for both buckets | required | one source math owner and matching cross-screen fixtures |

## Non-goals

- No speculative policy model or second projection endpoint with equivalent work.

## Test scenarios

- unconfigured/one/two buckets; next-trip effect; failed summary; hours/currency separation

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Dependency rationale

Canonical leave math and summary endpoints already exist. Form validation changes do not need to merge before the Home projection.
