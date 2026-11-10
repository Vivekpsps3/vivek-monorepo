# FIN-03 — Expose accurate Planning source counts and finish current-facts copy

- Stable key: `FIN-03`
- GitHub leaf: [#222](https://github.com/Vivekpsps3/vivek-monorepo/issues/222)
- Parents: [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `finance-planning`
- Verification profiles: `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Planning explains which records supplied its facts without confusing gross/net or unknown prices.

## Requirements

- #65 scope3/F18/#73 and all count/copy acceptance; zero-valued records count.

## Source paths

- `apps/finance/frontend/src/app/services/planning.service.ts`
- `apps/finance/frontend/src/app/models/planning.model.ts`
- `apps/finance/frontend/src/app/planning/planning-copy.ts`
- `apps/finance/frontend/src/app/planning/planning.component.html`

## Target paths

- `apps/finance/frontend/src/app/services/planning.service.ts`
- `apps/finance/frontend/src/app/models/planning.model.ts`
- `apps/finance/frontend/src/app/planning/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Add source-record counts to the existing typed preview and client calculation at the authoritative fact assembly point.
3. Render singular/plural asset/debt/holding/active-job/active-recurring parentheticals; count zero-valued records but exclude inactive inputs according to current rules.
4. Remove duplicated count inference in templates/helpers, retain the undated-price warning, accurate gross/net/source/no-tax/error/saved-scenario copy.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLAN1 | synthetic zero, one and many source records including zero values and inactive jobs | calculate preview and open Planning | counts reflect source participation and pluralize correctly | Planning service/unit/browser fixtures |
| PLAN2 | unknown/undated holdings, gross pay and absent tax data | open current facts and saved scenario errors | unknown dates remain warned; copy never claims gross is net or exposes internal keys | rendered text and existing failure-path specs |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| template-local or duplicate record-count inference and obsolete copy branches | calculate once in typed preview and render that contract | required | all displayed counts match service fixture with no repeated record scanning in the template |

## Non-goals

- No simulation math or record rewrite.
- Do not duplicate already landed copy.

## Test scenarios

- zero-value count; active/inactive jobs; singular/plural; undated quote; no-tax and saved-input failure

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
