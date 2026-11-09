# HUB-04 — Finish local unlocked Finance name search through a narrow facade

- Stable key: `HUB-04`
- GitHub leaf: [#246](https://github.com/Vivekpsps3/vivek-monorepo/issues/246)
- Parents: [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-03`, `SAFE-04`, `SAFE-05`
- Conflict groups: `suite-search`, `finance-public-api`, `finance-query-facade`
- Verification profiles: `web_front`, `finance_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Unified search finds existing Finance account/holding/bill names while unlocked without loading another dashboard or leaking results.

Unified search finds existing Finance account/holding/bill names while unlocked without loading another dashboard or leaking results.

## Requirements

- #93 scope6/#103;150ms,min2chars,8s deadline,at most5 ready name rows,ID-only recents,lock clearing,combobox/no-provider/performance acceptance; original #103 https://github.com/Vivekpsps3/vivek-monorepo/issues/103.

## Source paths

- `apps/web/src/app/search/search-dialog.component.ts`
- `apps/web/src/app/search/search-recents.ts`
- `apps/finance/frontend/src/public-api.ts`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/server/search.py`

## Target paths

- `apps/web/src/app/search/`
- `apps/finance/frontend/src/public-api.ts`
- `apps/finance/frontend/src/app/services/`
- `tests/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Expose a lazy app-owned Finance facade reading only already-loaded name streams and returning at most5 ready name-only rows; remove obsolete comment claiming streams do not exist.
3. Keep locked/no-vault behavior and resolve/prune Finance recent IDs locally only while unlocked; persisted refs remain {app,kind,id}.
4. Adopt current150ms debounce,min2chars,8s bounded work, stale-result guards, combobox/keyboard and no-store/owner-scoped Travel/Media server filtering.
5. Clear caches/rows immediately on lock/logout/identity change, do not trigger loadDashboard or provider requests, and remove duplicate local matching/recents state.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| SEARCH1 | loaded names,unloaded Finance and locked/no-vault states | type1/2characters rapidly and navigate results | at most5 ready names with correct debounce/keyboard; no dashboard/provider load or locked name leak | unit request/import counts and real search browser |
| SEARCH2 | Finance recent refs with missing records and a held old search | lock/switch owner then resolve | rows/recents resolve only for unlocked current owner; stale names cannot reappear and persisted data is ID-only | marker storage/network and lifecycle tests |
| SEARCH3 | cross-owner Travel/Media data and timeout | search/retry by keyboard | owner filtering,no-store,deadline and current performance/combobox acceptance survive | server search and browser deadline/request evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| locked-only Finance seam, stale nonexistent-stream narrative and competing match/recents logic | one narrow current Finance facade plus existing dialog contract | required | actual mounted unlocked results; no private service import or duplicate load |

## Non-goals

- No transaction search, plaintext server Finance index or broad dashboard load.

## Test scenarios

- minchars/debounce;fivecap;readystreamonly;recentsprune;lockrace;owner;combobox;timeout;no provider

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
