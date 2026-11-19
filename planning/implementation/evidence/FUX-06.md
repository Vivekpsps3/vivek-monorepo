# FUX-06 — implementation evidence

- Leaf [#395](https://github.com/Vivekpsps3/vivek-monorepo/issues/395) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open.
- Planning implementation agent, branch `agent/fux-06`, worktree `/tmp/vivek-fux-06`.
- Base `809254d5984a39426deea3993ac20e52977fb4ee` (`origin/main`, FUX-05 merge). Tested source `dc7a994b00c20d0747adc19e694c7156d7fec3a3`.
- [NAV-01](NAV-01.md) merge `35c9f241` (#498) and [STYLE-03](STYLE-03.md) merge `fe04d6d8` (#496) are ancestors of this base. NAV-01 supplies the Finance section list, including the Planning link to `/finance/planning`. STYLE-03 supplies the compact table treatment. No competing finance-ui or finance-public-api pull request was open.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FUX-06-A1 | `planning-tools.spec.ts` opens `/finance/planning` and then retirement, simulation, savings, debt, and stock research by URL. Each page shows its heading, marks that tool current, and restores the typed input after reload. Projection restores a monthly contribution of 125 after reload. Legacy `?t=path` stays on Planning. `?t=growth`, `?tool=debt-payoff`, `/investment-insights`, and `/stock-lab` open Projection, Debt, Projection, and Stock research. | PASS |
| FUX-06-A2 | The same journey shows “Projected. This does not change your current balances.” on each tool. After the projection contribution change and again after reload, the synthetic asset stays 2500, the holding stays 3 shares, and the liability stays 400. | PASS |
| FUX-06-LIFE | A market lookup that returns HTTP 500 leaves the typed ticker MSFT, and reload still shows MSFT. Locking Finance clears the retirement extra-expense draft. Unlock returns to Retirement with that field at 0. Karma drops a simulation result that arrives after the horizon changes, ignores a stock scenario saved after the research view closes, and skips a projection chart paint after the lock epoch changes. | PASS |
| FUX-06-VIEW | The planning journey runs at 390×844 with touch and 1280×800 with keyboard, in light and night, with reduced motion. The Savings target is at least 44px and has no motion duration. Enter on Retirement focuses the Retirement heading. Finance sections returns to Planning. Axe reports no violations on the Planning index or the projection page. | PASS |

Fixtures are browser-local synthetic ciphertext. Retirement, savings, and debt still use `planning-tools.util.ts`. Simulation still uses `PlanningWorkflow.runComparison`. Projection and stock research still use their existing local calculations. Planning profiles and stock scenarios stay in the encrypted vault. `public-api.ts` is unchanged.

## Deletion and compatibility

| Former path | Consumers and disposition | Surviving owner and proof |
| --- | --- | --- |
| `PlanningHubComponent` at `/finance/planning` | Section navigation, Town, and World still open `/finance/planning`. The question selector and hub component are removed. The index and direct tool routes render the tools. | `PlanningComponent` owns the index, retirement, simulation, savings, and debt. `InvestmentInsightsComponent` owns projection. `StockLabComponent` owns stock research. Navigation, coherence, and `planning-tools.spec.ts` follow the direct URLs. |
| Planning-hub component and spec | Removed with the route. No remaining template, provider, or lazy import. | Route parity calls the investment-insights and stock-lab redirects with an empty snapshot. Server route parity classifies the six tool paths as private documents. |

- Feature replacement. Relative to the base, the closure adds 1393 and removes 237 physical lines. Application and route files add 910 and remove 140. Tests add 476 and remove 90. Docs add 7 and remove 7. This record is outside those figures. The added lines are the tool index, direct routes, and same-session drafts. The deleted lines are the planning hub and the question selector.
- The encrypted store, Monte Carlo run, projection chart, and stock purchase plan keep their owners. A projection edit writes a session draft and does not upsert balances.
- Old `/finance/planning?t=growth`, `?t=stocks`, `?tool=`, `/finance/investment-insights`, and `/finance/stock-lab` URLs remain compatibility redirects. `?t=compensation` still opens Pay. `returnPath` accepts the six tool paths and still drops private query fields.
- No follow-up production file is required for this leaf. Pay, Bills, and the calculation utilities stay with their current owners.

## Verification

Local verification used Node v20.20.2, Python 3.12.3 from the repository environment, and Chrome Headless 156.0.8078.4. Commands ran from `/tmp/vivek-fux-06` on `dc7a994b00c20d0747adc19e694c7156d7fec3a3`.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, planning validation, boundaries, Python unittest modules, and 21 Node tests. |
| `make lint-web` | PASS. Four ESLint ratchets match the baseline. Engine purity passes. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 511 tests. Statements 63.22% (7682/12150), branches 49.33% (3390/6871), functions 59.06% (1835/3107), lines 66.66% (6789/10183). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 417 tests. Statements 72.6% (5824/8022), branches 57.53% (2222/3862), functions 72.13% (1165/1615), lines 77.3% (5049/6531). |
| `make e2e` | PASS. Production build, release manifest, 274 Finance browser tests, and five existing viewport skips. |
| `python3 -m pytest apps/server/tests/test_route_parity.py -q` | PASS. 33 tests. The route manifest names the six planning tool paths. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 121 Town tests, including the spending-plan visit to `/finance/planning/simulation`. |

The first `make e2e` failed four navigation cases because a planning query change on the open index did not run the redirect guard. The index route now uses `runGuardsAndResolvers: 'paramsOrQueryParamsChange'`. The rerun is the result above. The planning direct-URL, reload, projection, lock, and viewport journeys passed in that rerun. The initial bundle is 673.84 kB, over the existing 650 kB warning and under the error limit. Python product files are unchanged. Finance, Travel, Media, and site Karma outside this diff, and the other Playwright projects, stay with CI.

## Handoff

- The PR closes only #395. Parents #304 and #134 stay open.
- The roadmap receives one status note after merge. The issue body, queue, and parent ledgers stay unchanged.
- Deployment remains separate.
