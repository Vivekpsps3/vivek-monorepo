# FIN-05 — Close retained Finance store/import race findings with focused fixes and deletion

- Stable key: `FIN-05`
- GitHub leaf: [#224](https://github.com/Vivekpsps3/vivek-monorepo/issues/224)
- Parents: [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-01`
- Conflict groups: `finance-vault-lifecycle`, `finance-imports`, `finance-transactions`
- Verification profiles: `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Finance mutations, import staging and lock/error recovery follow one current behavior instead of stale special cases.

Finance mutations, import staging and lock/error recovery follow one current behavior instead of stale special cases.

## Requirements

- #65 scope5 Finance #128: failed/queued rewrite propagation, session-change/422 feedback, bank/brokerage lock lookups, deleteHolding routing and brokerage staging snapshot races.

## Source paths

- `apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.service.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.brokerage-stages.ts`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/finance/frontend/src/app/transactions/transactions-import-workflow.ts`

## Target paths

- `apps/finance/frontend/src/app/crypto/`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/finance/frontend/src/app/transactions/`
- `apps/finance/frontend/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Build an item-by-item retained #128 evidence table from original source/current tests; label proven current behavior rather than reimplementing historical findings.
3. Add held-promise behavioral regressions for failed/queued rewrites, A→B session change and422 feedback, locked bank/brokerage lookup, deleteHolding command routing and stage snapshot changes.
4. Fix genuine residuals at the current authoritative operation queue/snapshot boundary and remove obsolete fallback/race branches that no longer have a supported state.
5. Keep silent reload semantics, atomic staged replacement, owner/revision binding and all existing receipt/valuation behavior intact.
6. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
7. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FQA1 | each retained finding with a synthetic source marker | execute its race/error/lookup/delete trigger | the exact current expected behavior is proved or a focused residual fix is included | requirement-to-test matrix with current file/test names |
| FQA2 | a held rewrite/staging operation and a lock or owner switch | release obsolete work after invalidation | no stale snapshot/write/feedback publishes to the next owner and no partial replacement activates | unit promise gates and marker browser cases |
| FQA3 | deleting a holding versus a transaction | perform each command and reload | only the requested record/path is mutated; unrelated records remain intact | service/API request assertions and current component journey |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| stale per-operation fallback/retry branches retained only for superseded findings | remove only after current-state fixtures establish the surviving queue/snapshot owner | required | before/after branch and consumer ledger; all original meaningful assertions retained |

## Non-goals

- No new crypto protocol or staging engine.
- No source-regex-only acceptance.

## Test scenarios

- queued rewrite rejection; session switch;422; lock lookup; wrong delete routing; stage snapshot race

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.

## Dependency rationale

This Finance race tranche needs the composable lock binding, not the Health-store implementation. Preserve Finance session/collection eligibility in the actual touched operations.
