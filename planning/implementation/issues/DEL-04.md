# DEL-04 — Remove redundant Finance orchestration while preserving one store

- Stable key: `DEL-04`
- GitHub leaf: [#216](https://github.com/Vivekpsps3/vivek-monorepo/issues/216)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-04`
- Conflict groups: `finance-service`, `finance-public-api`, `finance-persistence`, `finance-imports`
- Verification profiles: `finance_front`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A small Finance feature uses the relevant collection/public facade without learning duplicated dashboard load pipelines.

Simplify FinanceService’s dashboard/collection orchestration around the existing store, import service and market coordinator; keep one authoritative record state.

## Requirements

- TD-19
- TD-35 Finance touched boundary paydown
- TD-20 preserve existing import engine; FIN-04/FIN-05 own importer work
- #200 migrated actual consumers and removed old path

## Source paths

- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/finance/frontend/src/app/services/finance-import.service.ts`
- `apps/finance/frontend/src/app/services/finance-market-coordinator.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.service.ts`
- `apps/finance/frontend/src/app/hub/finance-hub-facade.ts`
- `apps/finance/frontend/src/public-api.ts`

## Target paths

- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/finance/frontend/src/app/services/finance.service.spec.ts`
- `apps/finance/frontend/src/app/hub/`
- `apps/finance/frontend/src/public-api.ts`
- `apps/web/src/app/search/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Inventory service public methods, actual callers and duplicate load/publish/cache paths. Choose one complete bounded consolidation: common collection-read publication and derived refresh ownership, leaving imports and market responsibilities in their existing owners.
3. Migrate actual query consumers and an existing narrow public summary/name adapter to the canonical collection-read path; ready name lookup must not trigger a whole dashboard load. Do not prebuild facades for hypothetical consumers.
4. Delete redundant request/publish/cache invalidation branches and unconsumed pass-through methods, retaining collection/session epochs, silent reload behavior, revision conflicts and downstream change notifications.
5. Keep transaction effects/net worth/cashflow and staged importer semantics unchanged; no second record store or new generic repository. Measure all added adapters and deleted orchestration together.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | Two callers request the same eligible collection view | canonical load executes | work is joined where intended and each caller gets current data without duplicate source load | request-count and current-epoch tests |
| LOCAL2 | A lock or newer collection revision occurs while work is held | old work resolves | it does not republish stale snapshots | Finance coherence/session/collection race tests |
| LOCAL3 | A name-only/public summary consumer is used | it reads already-ready data | it does not load unrelated dashboard collections and returns only its intended projection | public facade request-count/result test |
| LOCAL4 | The service cleanup finishes | all known callers are inspected | one record state and one adopted load/publication path remain; old duplicate methods are deleted | caller migration and production delta ledger |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Overlapping Finance collection/dashboard load-publication and cache invalidation implementations | Consolidate one complete repeated workflow into the existing owner and remove superseded branches | required | caller/request-count/epoch evidence |
| Unconsumed FinanceService pass-through methods after migration | Delete only when no current public/test/lazy consumer needs them | conditional | consumer inventory and type/build |

## Non-goals

- No rewrite of encrypted storage or accounting math
- No extra global store or generic repository
- No duplicate importer/market engine
- No implementation of the whole Finance roadmap

## Test scenarios

- joined/independent collection loads and silent409 reload
- lock/session switch during load; new revision wins
- existing imports/market/no-ticker/coherence and net-worth calculations

## Risks

- Dashboard and full-ledger streams may intentionally differ for paging/coverage. Delete only duplicated orchestration, not distinct data semantics. Some narrow adapter typing may add bounded LOC; whole-workflow simplification needs actual removed paths.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
