# TRIP-01 — implementation evidence

- Leaf issue and parent(s): #225, parent #84
- Agent/context, branch/worktree: agent/trip-01, `/tmp/vivek-trip-01`
- Base main SHA, current tested SHA: gates ran on `6ab81180d8aaad1494eed091b7b422b56582d115` (parent `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`). Before push, origin/main moved to `1b4f35a80784a3181da809784fa80b33c13c6e60` (#322) and was merged with no conflicts.
- Fresh-main/prerequisite/active-PR checks: SAFE-01/03/04 outcomes are on that main (`FinanceTripSpendRegistry`, vault presence, lock notices). FIN-01 #322 merged into this branch. This change does not edit price prefs, the market coordinator, main layout, or the Finance dashboard.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TAG1 | Ordered current/upcoming/past, duplicate ids, recent-past limit, orphan Earlier trip, invalid ids (`trip-tag.spec.ts`). Add, clear, reopen, and list-outage copy (`transactions-editor-workflow.spec.ts`, `transactions-trip-tag.spec.ts`). Encrypted payload keeps `trip_id` and a null tag does not mark an import edited (`encrypted-store.service.spec.ts`) | PASS | Finance Karma, 798 tests |
| BRIDGE1 | Refunds subtract, income/payment/bad ids excluded, USD count once (`trip-spend.spec.ts`). One ledger subscription and one re-register (`trip-spend-producer.spec.ts`). Travel DOM locked/none/some without reload; EUR trip total stays separate from the USD finance line (`trip-costs.component.spec.ts`). Travel-first shell starts one producer (`trip-spend-shell.spec.ts`) | PASS | Finance Karma 798; web Karma 657 |
| BRIDGE2 | Held ledger released after lock does not republish; storage, channel, and HTTP stay empty of totals (`trip-spend-producer.spec.ts`). `readTripSpendLedger` returns null after lock or a session change (`finance.service.spec.ts`). Locked shell does not import the producer; owner switch drops a held load (`trip-spend-shell.spec.ts`) | PASS | Finance Karma 798; web Karma 657 |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `TripCostsComponent.financeSpendLookup` null seam and K1 comment | Trip costs template | `FinanceTripSpendRegistry.lookup` read inside the spend computed | Method and comment removed | `trip-costs.component.spec.ts` locked → none → some on one fixture |
| Per-screen trip spend calculation and extra start subscriptions | None on main; the null method was the only seam | One producer started from `PrivateLayoutComponent` through `startFinanceTripSpend` | No second registry, endpoint, or totals store | Producer register/read counts stay one; shell module load stays one |

- Candidate class and protected counterexamples: duplicate live policy (null seam) replaced by the existing registry. Transaction views, owner/revision/AAD, and Travel multi-currency totals stay distinct.
- Comparison base SHA and full replacement closure: `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Closure is the transaction model/editor/store field, `readTripSpendLedger`, `trip-tag.ts`, `trip-spend.ts`, `trip-spend-producer.ts`, public `startFinanceTripSpend`, trip costs, and the private layout.
- Production added/deleted/moved: about +383 / −22 physical production lines (net about +361), including new `trip-tag.ts` (62), `trip-spend.ts` (34), and `trip-spend-producer.ts` (119). No moves. Doc comments and the public-api starter account for part of the addition.
- Independent equivalent implementations before/after: 1 null lookup / 0 producers → 0 null lookups / 1 producer. Travel still renders with `spendState`; it does not recompute effects.
- State/cache owners and public entry points before/after: registry remains the only in-memory hand-off. New entry point `startFinanceTripSpend` is lazy and does not import the ledger while `financeVaultPresent()` is false. Lock snapshots and `readTripSpendLedger` drop a late read.
- Remaining old symbol/path search: `financeSpendLookup` and `BLOCKED-ON-K1` have no remaining app matches.
- Follow-up change: a new trip-tag rule touches `trip-tag.ts` and the transaction editor; a spend rule touches `financeTripSpendLookup` only.
- Tests/docs/generated changes separately: about +573 / −8 test lines, plus short Finance and web AGENTS sentences. No generated bundles committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: feature, not a simplification. The positive delta is the encrypted tag and the one producer. The lock/session generation checks are the safety addition so a held read cannot republish totals after lock, logout, or an owner switch.
- No behavior/data/meaningful assertion silently removed: Travel still shows the unlock link when the registry is empty. Trip currency totals are unchanged.

## Verification

Local, before the pull request. Chrome: `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS (eslint-finance 469 matches baseline) |
| `make typecheck-web` | PASS |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS (62) |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS (798). Coverage statements 75%, branches 64.89%, functions 72.01%, lines 78.07% |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS (657). Coverage statements 82.55%, branches 68.66%, functions 82.09%, lines 86.11% |
| `make e2e` | PASS (build-frontends, then Finance Playwright 240 passed, 8 skipped) |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS (151) |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS (76) |
| `npx playwright test --project=suite` | PASS (24) |

CI, merge, and deployment are not claimed here.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/333 (`Closes #225`; parent #84 referenced only)
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6789426299
- Merged/activation status: not merged, not deployed
- Remaining external prerequisites or approved scope decisions: none for this leaf. FIN-01 may still land; do not take its files
- Next actor: open the pull request, watch CI, squash-merge, then record the SHA
