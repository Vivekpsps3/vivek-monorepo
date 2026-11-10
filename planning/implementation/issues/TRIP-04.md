# TRIP-04 — Make trip forms submit-to-explain with live field recovery

- Stable key: `TRIP-04`
- GitHub leaf: [#228](https://github.com/Vivekpsps3/vivek-monorepo/issues/228)
- Parents: [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TRIP-03`
- Conflict groups: `travel-trip-main`, `travel-new-trip`, `travel-transport-editor`
- Verification profiles: `travel_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Trip creation/editing explains incomplete input and keeps drafts recoverable instead of disabling Save silently.

## Requirements

- #84 scope5/T7 form half; scope6 noValidate/requestSubmit, transport defaults, chip/choice/skip/focus/mobile and screenshot-path QA; UX-7 form acceptance.

## Source paths

- `apps/travel/frontend/src/new-trip.component.ts`
- `apps/travel/frontend/src/transport-editor.component.ts`
- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/validate.mjs`
- `apps/travel/e2e/optional-forms.spec.js`
- `apps/travel/e2e/native.spec.js`

## Target paths

- `apps/travel/frontend/src/new-trip.component.ts`
- `apps/travel/frontend/src/transport-editor.component.ts`
- `apps/travel/frontend/src/trip.component.ts`
- `apps/travel/frontend/src/trip.component.html`
- `apps/travel/frontend/src/validate.mjs`
- `apps/travel/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Make Save usable on empty forms; ngSubmit/requestSubmit reveals inline errors linked by aria-describedby and focuses the first invalid field.
3. Clear corrected errors live after submit and reset errors on reopening while retaining same-session failed drafts; retry preserves original intent.
4. Require explicit transport mode selection; keep parking genuinely optional.
5. Reconcile retained #128 noValidate/requestSubmit, chip/choice styling, skip-link geometry, focus-visible/mobile controls and configurable screenshot outputs to current behavior; remove obsolete validation branches/source-only tests only with equivalent behavior proof.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FORM1 | empty new/edit forms for each item kind | submit, correct the first field, submit again and reopen | errors are linked, first invalid focused, corrections clear live and reopen resets validation state | actual form browser journeys with zero invalid POSTs |
| FORM2 | transport without chosen mode and optional parking omitted | submit and then choose a valid mode | invalid mode cannot save; no unwanted parking requirement; corrected draft saves | API body and inline-message assertions |
| FORM3 | failed save and retained legacy QA inventory | retry original intent and inspect390 controls/skip link | draft/body preserved, targets/focus/styling/screenshot path behavior proved for every retained finding | #128-to-test ledger and selected regression suite |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| disabled-until-valid Save branches and duplicated submit error state | replace with one submit/field-error lifecycle using existing helpers | required | empty submit explains without POST; old disabled path absent |
| source-regex-only validation tests for mounted form behavior | replace only with equivalent real submit/focus/request assertions | required | surviving behavioral test named per removed assertion |

## Non-goals

- No generic schema form system or changed domain validation limits.
- No tests skipped or weakened to satisfy UI.

## Test scenarios

- all forms empty/correction/reopen; submit semantics; transport mode; optional parking;502 retry; skip link; keyboard390

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
