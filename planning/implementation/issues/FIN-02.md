# FIN-02 — Simplify recurring editors and finish one exact pay schedule

- Stable key: `FIN-02`
- GitHub leaf: [#221](https://github.com/Vivekpsps3/vivek-monorepo/issues/221)
- Parents: [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `finance-recurring-editors`
- Verification profiles: `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Bills, subscriptions and jobs can be edited on a phone without losing Save or changing existing annual totals.

Bills, subscriptions and jobs can be edited on a phone without losing Save or changing existing annual totals.

## Requirements

- #65 scope2/F17 and #71 retained acceptance; UX-7 recurring form density where applicable.

## Source paths

- `apps/finance/frontend/src/app/income/income.component.ts`
- `apps/finance/frontend/src/app/fixed-expenses/fixed-expenses.component.ts`
- `apps/finance/frontend/src/app/subscriptions/subscriptions.component.ts`
- `apps/finance/frontend/src/app/shared/form-validation.ts`

## Target paths

- `apps/finance/frontend/src/app/income/`
- `apps/finance/frontend/src/app/fixed-expenses/`
- `apps/finance/frontend/src/app/subscriptions/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Compare all three existing editors and delete repeated footer/scroll rules using the smallest shared styling pattern already supported; do not add a schema-driven form framework.
3. Make the body scroll and keep Cancel/Save visible; place optional fields under More options and open it for existing values.
4. Replace competing legacy pay schedule inputs with How often are you paid?/Next payday and Yearly/Hourly base-pay choice; normalize legacy cadences with existing decimal/cents helpers.
5. Preserve annual pay, tax/deduction and estimated paycheck amounts; subscriptions keep renew date and never acquire unsupported Autopay/Due day fields.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| REC1 | each recurring editor at 390×844 and1280×800 in both themes | scroll a long form, correct an error and save | Cancel/Save remain visible and draft/errors/focus survive | browser screenshots plus existing editor specs |
| REC2 | legacy monthly/weekly/biweekly/semimonthly pay including fractional cents | open, convert through the new inputs and save/reload | annual totals, tax/deduction and paycheck estimates remain equal under the documented cents policy | pure conversion fixtures and actual editor roundtrip |
| REC3 | records with optional existing fields | open More options and save or cancel | existing values remain visible/preserved and only one active pay schedule is shown | DOM/control counts and record payload assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| parallel pay-frequency/base-pay UI paths and copied footer/scroll handlers | replace with one schedule and minimal reusable footer pattern; remove obsolete branches | required | old controls absent, all legacy fixtures preserve amounts and all three editors use the surviving pattern |

## Non-goals

- No new recurring model fields unsupported by current records.
- No formatter migration or generic form generator.

## Test scenarios

- all cadences; fractional cents; options auto-open; failed save retains draft; no fabricated subscription fields

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
