# PTO-02 — Finish policy form decimal/draft behavior and retire duplicate validation

- Stable key: `PTO-02`
- GitHub leaf: [#231](https://github.com/Vivekpsps3/vivek-monorepo/issues/231)
- Parents: [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `PTO-01`
- Conflict groups: `travel-pto-main`, `travel-settings`
- Verification profiles: `travel_front`, `travel_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Editing a time-off policy preserves old values and gives precise inline recovery for invalid or failed changes.

Editing a time-off policy preserves old values and gives precise inline recovery for invalid or failed changes.

## Requirements

- #110 scope1; UA1–UA12 and UB1–UB12 policy/entry acceptance; #128 PTO boundaries, first-run dismissal, preview key, Settings refresh.

## Source paths

- `apps/travel/frontend/src/pto.component.ts`
- `apps/travel/frontend/src/pto-model.mjs`
- `apps/travel/frontend/src/settings.component.ts`
- `apps/travel/backend/services/leave_math.py`
- `apps/travel/backend/schemas.py`

## Target paths

- `apps/travel/frontend/src/pto.component.ts`
- `apps/travel/frontend/src/pto-model.mjs`
- `apps/travel/frontend/src/pto-model.d.mts`
- `apps/travel/frontend/src/settings.component.ts`
- `apps/travel/e2e/pto.spec.js`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Create the UA/UB-to-current-test matrix before altering behavior; retain existing accepted backend/forms and fix only missing cases.
3. Days lead with hours following based on Hours in a workday; accept decimal-safe comma input and quarter-hour blur rounding only for edited fields, preserving untouched grandfathered values.
4. Route inline422 field_errors, soft warnings versus hard limits, persistent original-intent retry, unsaved changes, first-run Sick dismissal and policy focus return through one current form lifecycle.
5. Invalidate previews after their true dependencies change and refresh Settings-driven values; remove stale cached preview and duplicate parsing/validation paths.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| POL1 | each UA/UB case including grandfathered and comma/fractional values | open unchanged then edit/blur/save or submit invalid input | only edited values round; limits/warnings differ and all24cases have current evidence | pure/API/browser matrix keyed UA/UB |
| POL2 | server422/network failure and an open policy draft | correct fields or retry while Settings/preview inputs change | draft linked errors/focus/original body survive and stale preview cannot publish | held response, request-body and focus tests |
| POL3 | first-run Sick prompt and policy dialog at390 | dismiss/open/close and navigate with keyboard | dismissal persists correctly, unsaved protection/focus return and44px targets work | browser first-run/draft/Settings regression |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| parallel decimal parsing/preview cache/form validation paths | use existing canonical model functions and one dependency key; remove stale caches/duplicated flags | required | same field fixtures apply to actual form and model; no untouched value changes |

## Non-goals

- No silent accrual-mode conversion.
- No second projection calculator or generic form framework.

## Test scenarios

- UA1–12/UB1–12; comma decimals; quarter-hour edited blur; grandfathered values;422; retry; preview; Settings refresh

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
