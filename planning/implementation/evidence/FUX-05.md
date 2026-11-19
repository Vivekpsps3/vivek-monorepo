# FUX-05 — implementation evidence

- Leaf [#394](https://github.com/Vivekpsps3/vivek-monorepo/issues/394) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open.
- Pay implementation agent, branch `agent/fux-05`, worktree `/tmp/vivek-fux-05`.
- Base `4b8a004905e691947598e08a8916179558fcf09f` (`origin/main`, FUX-04 merge). Tested source `a5b214ba91dce5f4dfe32105b15e24b7d3bcd008`.
- [NAV-01](NAV-01.md) merge `35c9f241` (#498) and [STYLE-03](STYLE-03.md) merge `fe04d6d8` (#496) are ancestors of this base. NAV-01 supplies the Finance section list, including Holdings. STYLE-03 supplies the compact responsive table used by the income source list. No competing finance-ui or finance-public-api PR was open. The scoped claim is [on the issue](https://github.com/Vivekpsps3/vivek-monorepo/issues/394#issuecomment-7015959322).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FUX-05-A1 | `pay.spec.ts` opens Pay from Home and inspects January 2026 for synthetic Harbor Studio. The source list shows the $3,000 paycheck, the $3,600 Harbor deposit, the $400 dated bonus, the $200 stock-grant sale, and the −$3,600 overlap adjustment. Combined income is $3,600. The five rows are the whole list. The vault sends no write. | PASS |
| FUX-05-A2 | The same journey changes Yearly pay from 36000 to 38400 through the existing job editor. Recorded deposits stay $3,600. Combined income becomes $3,800. The bonus and stock-sale rows stay one each. The transaction collection is unchanged. One encrypted `job_incomes` upsert carries the new base pay and the original compensation and stock grant. The employer name is absent from the request body. | PASS |
| FUX-05-LIFE | A failed save keeps Yearly pay 38400 in the open editor and base pay 36000 in the vault. A held upsert that then fails is released only after a second tab locks the vault. The dialog and Pay view are gone before that response. Unlock restores `/finance/pay?month=2026-01&history=1&start=2026-01-01&end=2026-01-31`, the month and From date, and a fresh editor at 36000, with no save toast. Posted transactions stay as seeded. Karma drops a late January summary after February is current, retries a February read error, and ignores a late success after session invalidation. | PASS |
| FUX-05-VIEW | The Pay journey runs at 390×844 with touch and 1280×800 with keyboard, in light and night, with reduced motion. The month control, source disclosure, and Edit action are at least 44px. Escape and a successful save return focus to Edit. The page has one h1, axe reports no violations on Pay, the job dialog, or the compensation report, and the page does not scroll sideways. Back and Forward restore the income month and leave the 2025 compensation range in place. | PASS |

Fixtures are browser-local synthetic ciphertext. Income totals, overlap, and stock proceeds come from the existing cashflow summary and compensation report. Pay reads that summary for the selected month and does not add a ledger or a crypto protocol. `public-api.ts` is unchanged: the shell already exports `financeSections`, which now includes Pay.

## Deletion and compatibility

| Former path | Consumers and disposition | Surviving owner and proof |
| --- | --- | --- |
| `app-recurring-hub` at `/finance/recurring` | Section navigation, Home, Planning, and the dashboard first step open `/finance/pay`. Spend, bills, and subscription tabs still open Bills with their filters. Compensation history opens Pay with `history=1`. | `PayComponent` owns the destination, month, source list, and history disclosure. `IncomeComponent` still edits jobs. `CompensationReportComponent` still reports employer history. Navigation and coherence tests follow the old URLs. |
| Recurring-hub component and spec | Removed with the route. No remaining template, provider, or lazy import. | Route parity calls the redirect with an empty snapshot and resolves `finance/pay`. Server route parity still classifies `finance/pay` as a private document. |

- Feature replacement. Relative to the base, the closure adds 742 and removes 228 physical lines. Application and route files add 405 and remove 157. Tests add 322 and remove 57. Docs add 15 and remove 14. This record is outside those figures. The added lines are the Pay page and its source list. The deleted lines are the recurring hub.
- The encrypted store, job records, posted transactions, and `computeCashflowSummary` keep their owners. Pay subscribes to the existing job and transaction views. A projection save writes `job_incomes` only.
- Old `/finance/recurring` and `/finance/income` URLs remain compatibility redirects. `returnPath` keeps Pay month, history, and compensation coordinates and drops private query fields. Planning `spending_mode: recurring` is a cashflow mode and stays.
- No follow-up production file is required for this leaf. Bills filters and the income calculation stay with their current owners.

## Verification

Local verification used Node v24.22.2, the repository Python environment, and Chrome Headless 156.0.8078.4. Commands ran from `/tmp/vivek-fux-05` on `a5b214ba91dce5f4dfe32105b15e24b7d3bcd008`.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, planning validation, boundaries, 135 Python tests, and 21 Node tests. |
| `make lint-web` | PASS. Four ESLint ratchets match the baseline. Engine purity passes. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 501 tests. Statements 63.41% (7497/11823), branches 49.28% (3311/6718), functions 59.1% (1795/3037), lines 66.87% (6625/9906). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 417 tests. Statements 72.6% (5824/8022), branches 57.53% (2222/3862), functions 72.13% (1165/1615), lines 77.3% (5049/6531). |
| `make e2e` | PASS. Production build, release manifest, 270 Finance browser tests, and five existing viewport skips. |
| `python3 -m pytest apps/server/tests/test_route_parity.py -q` | PASS. 33 tests. The route manifest now names `pay`. |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs` | PASS. 16 tests. |

The first `make e2e` failed one console check because the income-month control had no id or name. The control now has both. The rerun is the result above. Pay’s source, projection, lock, and viewport journeys passed in both runs. The initial bundle is 673.65 kB, over the existing 650 kB warning and under the error limit. Python product files are unchanged. Finance, Travel, Media, and site Karma outside this diff, and the other Playwright projects, stay with CI.

## Handoff

- The PR closes only #394. Parents #304 and #134 stay open.
- The roadmap receives one status note after merge. The issue body, queue, and parent ledgers stay unchanged.
- Deployment remains separate.
