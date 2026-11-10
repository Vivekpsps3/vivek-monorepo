# FIN-01 — Complete automatic price controls through the existing preference and refresh coordinator

- Stable key: `FIN-01`
- GitHub leaf: [#220](https://github.com/Vivekpsps3/vivek-monorepo/issues/220)
- Parents: [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-01`
- Conflict groups: `finance-price-shell`, `finance-home`
- Verification profiles: `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can control unlock-time price checks from Finance and understand exactly which ticker symbols leave the browser.

## Requirements

- #65 scope1/F7; acceptance price toggle, one-time notice/Details, held-symbol agreement and zero research fetch on open.

## Source paths

- `apps/finance/frontend/src/app/core/finance-price-prefs.service.ts`
- `apps/finance/frontend/src/app/services/market-refresh-coordinator.service.ts`
- `apps/finance/frontend/src/app/core/layout/main-layout.component.ts`
- `apps/finance/frontend/src/app/dashboard/dashboard.component.html`

## Target paths

- `apps/finance/frontend/src/app/core/`
- `apps/finance/frontend/src/app/core/layout/`
- `apps/finance/frontend/src/app/dashboard/`
- `apps/finance/frontend/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Mount the existing per-user preference as a menuitemcheckbox with aria-checked, checked icon and in-place toggling; retain default-on and throwing-storage behavior.
3. Connect Home Turn off automatic checks/OK, ticker counts, one-time dismissal and About price checks disclosure to that same preference.
4. Use the existing refresh coordinator for held symbols; manual refresh remains available when auto is off and research pages make no opening request.
5. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
6. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PRICE1 | a fresh user with holdings | unlock then toggle automatic checks off and unlock again | default-on performs the bounded refresh; off persists only for that user and prevents the next automatic requests | request-count unit/browser checks in coordinator, price-pref specs and Finance e2e |
| PRICE2 | automatic checks are off | activate manual Refresh and open research | manual refresh works; research opening does not fetch; prices remain consistent across existing holdings screens | held-symbol fixture and intercepted market request log |
| PRICE3 | the Home notice and account disclosure | use keyboard to dismiss, change preference and close/reopen Details | copy/ticker count, checked state, one-time dismissal and focus return agree | 390/1280 light/dark keyboard browser evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| independent Home/menu price preference state and obsolete F7 integration seams | route all controls through FinancePricePrefsService and delete duplicated flags/handlers | required | one preference write path; coordinator tests and both UI consumers use it |

## Non-goals

- No quote collection or public-research prefetch.
- No protocol or holding valuation rewrite.

## Test scenarios

- off/default-on/manual refresh; empty tickers; storage throws; owner switch; one-time notice; Details focus

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
