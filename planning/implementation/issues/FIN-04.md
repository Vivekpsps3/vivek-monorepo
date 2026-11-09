# FIN-04 — Add custom CSV mapping through the existing encrypted import plan and Undo

- Stable key: `FIN-04`
- GitHub leaf: [#223](https://github.com/Vivekpsps3/vivek-monorepo/issues/223)
- Parents: [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `CON-03`, `SAFE-04`
- Conflict groups: `finance-imports`, `finance-transactions`, `vault-collections`
- Verification profiles: `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A supported custom statement can be mapped, previewed, committed and undone through the same receipt workflow as banks.

A supported custom statement can be mapped, previewed, committed and undone through the same receipt workflow as banks.

## Requirements

- #65 scope4/custom CSV portion #132; all custom mapping, currency and lock/atomicity acceptance.
- TD-20: custom CSV is another parser and mapping adapter on the existing parse, stage, commit, receipt and Undo plan. Do not add a second import engine. Brokerage replacement keeps its own staging operation.

## Source paths

- `apps/finance/frontend/src/app/utils/bank-import.util.ts`
- `apps/finance/frontend/src/app/utils/bank-import.parsers.ts`
- `apps/finance/frontend/src/app/transactions/transactions-import-workflow.ts`
- `apps/finance/frontend/src/app/services/finance-import.service.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.bank-imports.ts`

## Target paths

- `apps/finance/frontend/src/app/utils/`
- `apps/finance/frontend/src/app/transactions/`
- `apps/finance/frontend/src/app/services/finance-import.service.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.bank-imports.ts`
- `apps/finance/frontend/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Add an explicit Custom CSV adapter for date/description/amount or split debit-credit/account/optional category; detect delimiter/header deterministically and preview the selected date/sign/refund mapping.
3. Validate any currency column against current USD support and reject mixed/foreign rows with actionable row errors before commit.
4. Let users revise mappings/select valid rows; persist versioned encrypted mapping metadata using an approved additive format and preserve current bank/Fidelity paths.
5. Call the existing normalized import/staging/dedupe/receipt/resume/Undo engine; delete adapter-specific commit code if any is introduced during development.
6. On cancel/lock clear raw CSV and previews; failure/concurrent data changes must not silently activate partial data or corrupt prior receipts.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| CSV1 | signed and debit-credit sample files with mapped dates/accounts and refund rows | map, preview, select valid rows, commit and reload | normalized ledger and encrypted receipt match the preview and the existing dedupe policy | parser fixtures plus end-to-end preview/receipt journey |
| CSV2 | foreign/mixed currency, malformed/empty file and wrong mappings | attempt preview/commit then correct mappings | row errors are actionable, incompatible totals are never mixed, valid corrections can be retried | zero-commit request/write assertions and corrected roundtrip |
| CSV3 | a staged custom import with duplicates and an edited committed row | fail a write or lock, resume appropriately, then Undo/delete receipt | no partial silent activation or plaintext leaks; Undo preserves edited rows and withdraws coverage correctly | held-write/marker/conflict tests and existing import regression matrix |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| potential format-specific commit/receipt engines | implement only parser/mapping adaptation and reuse the existing importer | required | one commit/staging owner services both bank and custom formats; no raw CSV network/localStorage |
| duplicated remembered account/date/sign normalization branches exposed by custom mapping | reuse canonical normalization and encrypted metadata instead of storing a second map | required | same fixture produces same normalized transaction effects |

## Non-goals

- No FX conversion, multi-currency accounting or second ledger.
- No plaintext/raw CSV in URLs/storage/logs/network.
- No new importer framework.

## Test scenarios

- delimiter/header/date/sign/refund; debit-credit; multiple accounts; duplicate; unsupported currency; wrong mapping; lock/cancel; failure/resume; edited Undo

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
