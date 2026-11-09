# TRIP-01 — Connect encrypted trip tags to the live Finance–Travel spending bridge

- Stable key: `TRIP-01`
- GitHub leaf: [#225](https://github.com/Vivekpsps3/vivek-monorepo/issues/225)
- Parents: [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-01`, `SAFE-03`, `SAFE-04`
- Conflict groups: `finance-transactions`, `finance-public-api`, `private-shell`, `travel-trip-costs`
- Verification profiles: `finance_front`, `travel_front`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Travel shows correct tagged Finance spending while unlocked and clears it immediately on lock, including Travel-first navigation.

Travel shows correct tagged Finance spending while unlocked and clears it immediately on lock, including Travel-first navigation.

## Requirements

- #84 scope1/F15/#68 and scope2/private spend bridge; acceptance tags, USD/refunds, privacy and no duplicate starts.

## Source paths

- `apps/finance/frontend/src/app/models/transaction.model.ts`
- `apps/finance/frontend/src/app/transactions/transactions.component.ts`
- `apps/finance/frontend/src/app/services/finance.service.ts`
- `apps/finance/frontend/src/public-api.ts`
- `packages/ui/src/finance-trip-spend.ts`
- `apps/travel/frontend/src/trip-costs.component.ts`
- `apps/web/src/app/private-layout.component.ts`

## Target paths

- `apps/finance/frontend/src/app/transactions/`
- `apps/finance/frontend/src/app/models/`
- `apps/finance/frontend/src/app/services/`
- `apps/finance/frontend/src/public-api.ts`
- `apps/travel/frontend/src/trip-costs.component.ts`
- `apps/web/src/app/private-layout.component.ts`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect active PR193 and current consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Add optional nullable positive-integer trip_id only inside encrypted transaction JSON/editor/load/save; load owner trips through existing /travel/api/home with stable current/upcoming/past ordering.
3. Support No trip and retained orphan Earlier trip; a trip-list failure is nonblocking and explains saving without a tag.
4. Compute totals once using existing transaction effects: refunds subtract, income/invalid IDs excluded, explicit USD/count; keep Travel multi-currency costs separate.
5. Start an idempotent lazy public producer from the private shell only when vault presence permits; publish/re-register on transaction changes through existing registry, clear/unregister on lifecycle invalidation.
6. Replace financeSpendLookup null seam and obsolete K1 blocker with actual reactive consumer; do not add a new endpoint or cross-tab totals store.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TAG1 | current/upcoming/past, orphan and unavailable-trip fixtures | add/edit/clear a transaction tag and reopen | tag roundtrips encrypted; ordering/no-trip/orphan/error states are correct | transaction editor/service/browser fixtures |
| BRIDGE1 | Travel-first navigation and an unlocked Finance vault with purchase/refund/bad-ID/income rows | load costs and then change transactions | none/some totals update once, labelled USD, while Travel currencies remain separate | request/registration counts and DOM totals |
| BRIDGE2 | held producer load and visible Finance totals | lock/logout or switch owner, then release old work | totals clear immediately and never reappear; no crypto imports while initially locked | marker network/storage/channel listeners and lifecycle race browser |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| TripCostsComponent.financeSpendLookup hardcoded-null seam and BLOCKED-ON-K1 narrative | replace with the existing registry and remove the obsolete implementation/comment | required | consumer transitions locked/none/some without reload |
| independent per-screen trip spend calculation/start subscriptions | one app-owned public producer; remove duplicate subscriptions after migration | required | counts prove one producer and shared transaction effects |

## Non-goals

- No transaction currency inference/FX, server totals or plaintext URL/localStorage/channel payload.
- No replacement registry or second ledger.

## Test scenarios

- No trip/orphan/list outage; refunds; separate currencies; Travel-first unlock; lock race; owner switch; duplicate subscription

## Risks

- Current main/PR193 may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
