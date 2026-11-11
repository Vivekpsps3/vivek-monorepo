# FIN-01 — implementation evidence

- Leaf issue and parent(s): [#220](https://github.com/Vivekpsps3/vivek-monorepo/issues/220), parent [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65)
- Agent/context, branch/worktree: Cursor Grok, `agent/fin-01`, `/tmp/vivek-fin-01`
- Base main SHA, current tested SHA: assigned base `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Product checks below ran on that base plus the FIN-01 diff, before this file. Head SHA is the commit that contains this file.
- Fresh-main/prerequisite/active-PR checks: SAFE-01 (#201) is merged. `gh pr list --state open` was empty at start. Issue #220 had no earlier claim. Conflict groups `finance-price-shell` and `finance-home` were not taken by another open PR. During the run, `origin/main` advanced to `c252b4d` (planning PLACE packets, #319). That commit does not touch Finance. It was not merged into this branch.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PRICE1 | Fresh holdings user: unlock sends one quote per symbol. Turning “Check prices when I unlock” off writes only `finance-auto-price-check:<userId>` and the next unlock sends nothing. Another user stays default-on. Storage throws and the check still runs. | PASS | `does not refresh on the next unlock while that user stays off (PRICE1)`, `keeps the off preference for one user and checks prices for another (PRICE1)`, `checks prices when preference storage throws`, `starts once per authenticated unlocked session` in `market-refresh-coordinator.service.spec.ts`; per-user and throwing-storage cases in `finance-price-prefs.service.spec.ts`; Playwright `turning automatic checks off persists for this user and the next unlock sends nothing` and `unlock checks each symbol once` in `price-privacy.spec.ts`. Fixture: two VOO lots, synthetic user 987, quote log `['VOO']` then no further `/api/market/price/` request. |
| PRICE2 | With automatic checks off, Refresh prices requests the held symbol once. Home, Holdings, and Stock research then show that same saved price. Opening research does not call `/api/market/research` until Look up. | PASS | Playwright `with automatic checks off, manual refresh updates every holdings screen and research stays quiet` and `stock research fetches nothing until Look up is chosen`. Quote log stays `[{ symbol: 'VOO', refresh: true }]`. Home shows `$375.00`; both Holdings price cells show `$125.00`; research shows `Saved price for VOO` containing `125`. Coordinator `skips the automatic check when the user turned it off, but manual refresh still works`. |
| PRICE3 | Keyboard OK dismisses the one-time notice. The menu checkbox toggles in place, keeps the menu open, and shows or hides the check icon. About price checks opens, Escape and Close return focus to the account button, and reopening shows the same off state and ticker sentence. 390 and 1280, light and dark. | PASS | Playwright `keyboard notice, preference, and About price checks agree` at `[390 light]`, `[390 dark]`, `[1280 light]`, and `[1280 dark]`. `html` `data-theme` matched the theme. Copy was `Prices checked automatically for 1 ticker symbol (VOO). Only ticker symbols are sent.` Dialog title `About price checks`, `aria-checked` flipped, focus returned to the `synthetic` account button. `clear-data.spec.ts` also returns focus after Close at the same four viewport/theme pairs. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Independent Home/menu price preference state and the unwired Details notice | Home cached `autoPricesOff` once at startup. The account menu showed a Details link and did not write the preference. | `FinancePricePrefsService.setAutoCheck` / `autoCheck` | Deleted the cached Home flag. Home now reads the service. The menu checkbox and “Turn off automatic checks” both call `setAutoCheck`. The only production `setItem` for `finance-auto-price-check:` is in that service. | Coordinator specs and both UI specs use the service. Layout spec toggles `aria-checked` and the stored key. Dashboard spec turns checks off from the notice and shows Refresh. |
| Hardcoded one-time notice (“Got it”) and dialog title “Price checks” | Home notice and the account-menu dialog | `automaticPriceNotice` plus `MarketRefreshCoordinatorService.disclosure` | Replaced. The notice and About price checks dialog share the ticker sentence. The dialog’s ticker-only paragraph is the coordinator disclosure. | PRICE3 matrix and `automaticPriceNotice` unit cases for 0, 1, and 2 symbols. |

- Candidate class and protected counterexamples: duplicate live policy for the preference flag. Money formatting, vault lock, and the quote protocol were not changed. Media migration SQL, Pixels import, and other protected counterexamples were not touched.
- Comparison base SHA and full replacement closure: `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Closure is the Finance price preference service, refresh coordinator, Home notice, account menu, and the Finance unit/e2e specs that prove them.
- Production added/deleted/moved: production `+131 / -20`, net `+111`. Moved 0. Test `+334 / -24`, net `+310`, including this task’s specs. This evidence file is documentation and is not in those counts.
- Independent equivalent implementations before/after: before, Home kept its own boolean and the menu did not write the preference. After, one write method. The coordinator already read the service and still does.
- State/cache owners and public entry points before/after: the store is still the per-user localStorage keys. `changes$` only tells Home and the menu to re-read that store. `disclosedSymbols` is cleared when the vault session ends so the next owner does not see the previous ticker list.
- Remaining old symbol/path search: production `setItem` of `finance-auto-price-check:` is only in `finance-price-prefs.service.ts`. Test fixtures still seed that key.
- Follow-up change: a later price-control edit touches `FinancePricePrefsService`, the account-menu checkbox in `main-layout`, and the Home notice in `dashboard`. The coordinator remains the request owner.
- Tests/docs/generated changes separately: tests as counted above. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: net `+111` production lines. This is the missing control, not a simplification. The added lines are the menu checkbox, the shared ticker sentence, and announcing the symbol list only after it is known. Clearing that list on session end is the privacy guard for an owner switch.
- No behavior/data/meaningful assertion silently removed: default-on, throwing-storage fallback, manual refresh, one quote per symbol, and research-on-demand stay. The chart assertion that looked up `VOO` on the whole page now looks at `app-charts`, because the notice also names the symbol.

## Verification

Local execution only. CI, merge, and deployment were not run.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0 |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 787 SUCCESS. Statements 75.19% (7712/10256), branches 64.79% (3742/5775), functions 72.16% (1978/2741), lines 78.23% (6818/8715) |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 653 SUCCESS. Statements 82.41% (5042/6118), branches 68.65% (1877/2734), functions 81.92% (1038/1267), lines 85.93% (4393/5112) |
| `make e2e` | PASS on the rerun after the chart locator fix. 245 passed, 8 skipped. The 8 skips are the pre-existing a11y target skips, unchanged from the earlier run. |

The first `make e2e` failed in `finance-ux-asserts.spec.ts`: `getByText('VOO')` matched the new notice and the chart. The assertion was scoped to `app-charts`. That spec then passed 3/3, and `make e2e` was run again and passed. No suite was skipped and no gate was lowered.

An earlier Finance and web Karma launch failed before any spec because `SUITE_KARMA_COVERAGE=0` was still exported, so the coverage reporter was not registered. Both commands were rerun with coverage enabled. Those reruns are the results above.

## Handoff

- PR URL (leaf closure keyword only): opened with `Closes #220` and a non-closing reference to #65. Not merged.
- Roadmap #134 append-only status-note URL: posted after the PR. The issue body was not edited.
- Merged/activation status: not merged, not deployed, not activated.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Parent #65 stays open.
- Next actor: reviewer. Integration owner folds the roadmap body after merge.

No unstated decision from this context is required to continue.
