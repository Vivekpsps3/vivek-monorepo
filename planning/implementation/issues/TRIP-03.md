# TRIP-03 — Unify trip actions and typed deletion through existing menus/confirmation

- Stable key: `TRIP-03`
- GitHub leaf: [#227](https://github.com/Vivekpsps3/vivek-monorepo/issues/227)
- Parents: [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TRIP-02`
- Conflict groups: `travel-trip-main`, `travel-trip-actions`
- Verification profiles: `travel_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Every trip item is actionable by keyboard/touch and destructive trip deletion is explicit, recoverable and correctly focused.

## Requirements

- #84 scope4/T5/T6; all seven Add items, row kinds, typed delete failure/retry/success; preserve cards.
- #84 retained T2/T3 cost/reminder acceptance: complete existing browser matrix, failed toggle rollback, inline add, Undo/retry; ambiguous alert locators must be corrected without weakening assertions.

## Source paths

- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/trip-costs.component.ts`
- `apps/travel/frontend/src/trip-reminders.component.ts`
- `packages/ui/src/ui-menu/ui-menu.component.ts`
- `packages/ui/src/confirm.service.ts`

## Target paths

- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/trip-costs.component.ts`
- `apps/travel/frontend/src/trip-reminders.component.ts`
- `apps/travel/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Use existing K1 menu for Add Transport/Activity/Destination/Parking/Reminder/Note/Cost and responsive row menus/inline actions.
3. Replace duplicated ad-hoc action toggles and danger-at-rest rows with one current action contract; preserve canonical formatted header/money/date text.
4. Implement exact-title confirm-and-run deletion; disabled until exact title, in-dialog failure, retained input/retry, success returns Trips and focuses its heading/link.
5. Run the full existing cost/reminder browser matrix, including failed toggle rollback, inline add, Undo and retry. Correct ambiguous alert locators by role/scope rather than broadening assertions; record T2/T3 retained evidence in this packet.
6. Preserve Away now/Upcoming/Past, six-past expansion, per-currency totals and current item Undo.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| ACT1 | each supported trip item and an empty trip | open Add/row menus with keyboard and touch | all seven actions and every applicable row action are reachable once with correct focus | menu item counts and real dialog/command browser story |
| DELETE1 | trip with exact title confirmation | cancel, submit wrong text, fail first delete, then retry success | cancel/wrong text send no delete; failure retains dialog/input; success navigates/focuses Trips | intercepted request counts, body and focus assertions |
| ACT2 | existing card grouping and cost/reminder items | perform row actions at390/1280 | no duplicate/danger-at-rest control, card grouping/totals/Undo remain correct | responsive regression matrix |
| COSTREM | cost/reminder rows and held failure responses in existing T2/T3 fixtures | toggle,inline-add,Undo and retry across both responsive action layouts | all existing matrix outcomes pass and correct in-context alert is asserted; no assertion is weakened | apps/travel/e2e/trip-costs.spec.js and reminders.spec.js current matrix plus request/payload evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| ad-hoc Add details/button menus and duplicated row-action state | migrate to existing menu/confirm-and-run primitives and delete old paths | required | one action per record in accessibility tree; failure/retry proven |

## Non-goals

- No new menu/confirmation framework.
- No card grouping or source schema rewrite.

## Test scenarios

- seven Add entries; all row kinds; cancel/wrong/exact delete;502 retry; grouping/currency/card regressions

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
