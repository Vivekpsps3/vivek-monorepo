# TOWN-03 — Replace habit-based Treasury with Finance budget weeks and finish the existing Hub card

- Stable key: `TOWN-03`
- GitHub leaf: [#251](https://github.com/Vivekpsps3/vivek-monorepo/issues/251)
- Parents: [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `TOWN-02`, `SAFE-04`, `SAFE-05`
- Conflict groups: `town-treasury`, `town-main`, `hub-main`, `finance-public-api`
- Verification profiles: `web_front`, `finance_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Treasury reflects completed spending-plan weeks privately, while the Town Hub card reliably reflects actual Town progress.

## Requirements

- #81 delivery4/Treasury and delivery5/TF5 Hub card; #97 retained scope https://github.com/Vivekpsps3/vivek-monorepo/issues/97; Treasury/Hub state/lock/performance acceptance.

## Source paths

- `apps/web/src/app/town/town.component.ts`
- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/weeks-kept.ts`
- `apps/web/src/app/hub/town-hub-card.ts`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/web/src/app/town/town.component.ts`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/town/town-today.component.ts`
- `apps/web/src/app/town/index.ts`
- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/hub/town-hub-card.ts`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Load52 completed ISO weeks through loadFinanceBudgetKept with no current week and safe lifecycle/deadline integration.
3. Add an explicitly named Finance-budget run normalizer: newest completed week backward until false/null/missing; normalize order, reject duplicate/malformed weeks. Preserve existing habit helper semantics used by World.
4. Use current treasuryTier/stage; show tier/run with52+ saturation and correct locked/no-plan/no-data/unavailable states/links; clear immediately on lock/logout/owner change and abort obsolete work.
5. Finish existing TF5 Hub loading/ready/empty/unavailable/expired/stale/retry, XP ARIA and44px navigation after passive credits. Hub card stays free of Treasury/Health imports/data.
6. Delete Treasury’s wrong habit-run wiring and duplicate budget calculations/state, not the legitimately different habit helper.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TREAS1 | long habit streak/no kept budget weeks and the inverse, plus malformed/unordered week sets | load Treasury | only correct completed Finance weeks determine tier/run; current week ignored and invalid input explicit | pure vectors and browser private-budget fixture |
| TREAS2 | held budget load and visible tier | lock→unlock→lock or change owner | old tier clears immediately and cannot return; no crypto import initially locked; TownXP unchanged | marker/request/storage and lifecycle browser assertions |
| TF5 | Town summary each loading/error/stale/expired/empty/ready state | retry/navigate using keyboard | existing Hub card remains independent and correct with44px navigation/XP ARIA | card unit/root browser matrix |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Treasury use of habit-based weeksKeptRun and component duplicate budget math | replace with named budget-week projection via existing facade | required | contrasting habit/budget fixtures and unchanged World helper tests |
| duplicated TF5 card state/disabled-Town slot paths | use existing common card contract and remove stale seams | required | one enabled card and complete state tests |

## Non-goals

- No server/stored Finance values, copied7/365 math or silent change to World habit semantics.

## Test scenarios

- 52completed;currentexcluded;false/null/missing;unordered/duplicate;52+;locked/no-plan/outage;TF5states;noXPchange

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Living World scope boundary — 2026-11-11

Retain Finance-only budget weeks, lifecycle and existing Hub-card acceptance. PLACE-04 must project the same approved building/Treasury facts in Town and World; cosmetics cannot replace this correction. See [scope reconciliation](../../living-world/scope.md) and [parent #304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). This is planned extension scope; it neither closes nor enlarges this packet's retained implementation acceptance.
