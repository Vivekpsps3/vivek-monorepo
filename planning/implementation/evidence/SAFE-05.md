# SAFE-05 — implementation evidence

- Leaf issue and parent(s): [#205](https://github.com/Vivekpsps3/vivek-monorepo/issues/205); parent [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198) stays open
- Agent/context, branch/worktree: SAFE-05 in `/tmp/vivek-safe-05`, branch `agent/safe-05`
- Base main SHA, current tested SHA: parent `1b4f35a80784a3181da809784fa80b33c13c6e60` (fast-forward from the assigned base `3954d1f27aa8ad0766eac9a7e9667f68d3c76571` after #322). Gates below ran on this working tree. Node is `/tmp/node24/bin/node` v24.11.1.
- Fresh-main/prerequisite/active-PR checks: SAFE-02 and SAFE-04 outcomes are on the assigned base (Health generation/abort guards and `bindLockNotices`). Open PR #322 did not touch this fence and has since merged. No competing SAFE-05 claim.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | A hung Pixels HTTP window ends at one 8s deadline, the request is cancelled, and Finance is not called. A hung Finance join after a ready Pixels body publishes `financeStatus: unavailable` with empty finance channels; the late kept-day payload does not change that snapshot. A held Health decrypt that loses its deadline stays `unavailable` with empty snapshots, including the Town stage read. | PASS | `pixels-data.service.spec.ts` "ends a hung source window on the one action deadline and ignores the late body"; "gives every Finance window the time left on one action, then ignores a late join". `health-store.service.spec.ts` "does not publish a load that loses its deadline (LOCAL3)"; "bounds the stage read on the store deadline and drops a late decrypt". `packages/browser/runtime/bounded-work.test.mjs` "one deadline bounds a later step and a late success is ignored" |
| LOCAL2 | Two Pixels source windows and two Finance windows share one signal and one start time. After the first Finance window consumes 6s, the second call receives at most the remaining 2s. The action settles at 8s total, not a second full wait. The primitive's second step is bounded by the deadline opened before the first step. | PASS | Pixels spec "gives every Finance window the time left on one action, then ignores a late join" (`financeSignals[0] === financeSignals[1]`, `financeDeadlines[1] <= 2000`). Node test "one deadline bounds a later step and a late success is ignored" |
| LOCAL3 | Abort before Health `vault()` does not touch the vault. Abort during a Pixels read or an owner change cancels the HTTP request and returns `dropped` without calling Finance. Route disposal cancels the request and returns `dropped`. A finished Pixels snapshot stays intact after `release()`. `dispose()` twice drops the timer and listeners so a later parent abort and tick do not abort the child. A thrown step stays `failed`. Health's deadline aborts the vault list subscription. World lock still aborts the in-flight budget signal and does not publish amounts. | PASS | Health spec "does not touch the vault when the caller aborted before load"; "times out to unavailable at the load deadline" (`listCancelled`); "cancels a held list, save, and delete". Pixels spec "cancels the pixels request when the owner changes"; "cancels an in-flight pixels request when the route is destroyed"; "keeps an available source when another source is down, and keeps a finished snapshot after cancel". Node test "a thrown step stays failed, and dispose is idempotent"; "a parent that is already aborted does not start the step". World spec "drops an in-flight budget when finance locks" |
| LOCAL4 | Hub still distinguishes caller cancel from a deadline (`cancelled` vs `unavailable`) and ignores a late body. Pixels keeps locked, expired, partial source, and ready states distinct. Health keeps locked, corrupt/v1 rows, conflicts, and unavailable distinct. World budget states and the stale-response generation check stay in the controller. | PASS | Existing Hub `hub-load.spec.ts` (7), Pixels, Health, and World controller specs inside web Karma 662 SUCCESS. Pixels spec "reports an expired session and a JSON parse exception without throwing" and the mixed-source assertion in the finished-snapshot spec |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Health `load` `Promise.race` plus `setTimeout`, and `loadTownHealthStages` `Promise.race` plus abort listener | `HealthStoreService.load`, `loadTownHealthStages` | `openBoundedWork` in `packages/browser/src/bounded-work.ts`. The stage barrel forwards one `deadlineMs` and the caller signal into `store.load` | Deleted both timer/race copies. The store aborts the linked signal on the deadline, so a losing list subscription is unsubscribed | LOCAL1 stage spec; Health "times out to unavailable" asserts `listCancelled` |
| Health `link()` `AbortController` and listeners that were never removed | `load`, `upsert`, `remove` | `openBoundedWork({ parents: [stop] })` with `dispose()` in `finally` | Deleted `link()`. `observe()` still unsubscribes the vault call | Health LOCAL2 cancel specs |
| Pixels unbounded `firstValueFrom` and a new `AbortController` per Finance window | `PixelsDataService.getJson`, `joinFinance` | One `openBoundedWork` for `load()`, passed through `takeUntil` and into `financeDays` with remaining `deadlineMs` | Deleted the per-window controller. `load(request)` signature is unchanged | LOCAL1 and LOCAL2 Pixels specs |
| World `link()` and budget `addEventListener` copies | `loadInitial`, `pageOlder`, `refetchWeeks`, `reloadBudget`, `refreshBudget` | `openBoundedWork` without a deadline. Budget states stay in `toBudgetView` | Deleted the hand-rolled listeners. `mayPublish` blocks a late budget write. No new budget deadline | World spec "drops an in-flight budget when finance locks" and the expired-budget overlay spec |
| Hub `setTimeout` and abort listener inside `fetchHubSummary` | Hub and search summaries | Hub keeps this timer | Retained. Importing `openBoundedWork` into the initial shell bundle made Media's Back filter keep a late Type value in CI. Hub stays the reference implementation. Health, Pixels, and World use the helper | `hub-load.spec.ts` still passes with the original timer |

- Candidate class and protected counterexamples: duplicate live policy for deadline, abort linking, and publication. Owner, revision, vault AAD, Pixels window limits, and World budget states are unchanged. No loader framework.
- Comparison base SHA and full replacement closure: `1b4f35a80784a3181da809784fa80b33c13c6e60`, plus later main merges. Closure is `packages/browser/src/bounded-work.ts`, `packages/browser/src/index.ts`, `pixels-data.service.ts`, `health-store.service.ts`, `town/health/index.ts`, and `world-controller.ts`. `hub-load.ts` and `library.component.ts` match main.
- Production added/deleted/moved: added 339, deleted 189, net +150. Moved 0. `bounded-work.ts` is 116 lines (95 code, 13 comment, 8 blank). Pixels service net +79. Health store net −11. Health barrel net −21. World net −15. Browser index +2. Hub and the library component are unchanged.
- Independent equivalent implementations before/after: two Health races, Health `link()`, the Pixels per-window controller, and two World listener blocks become `openBoundedWork`. Hub's summary timer stays the reference and is not loaded as a second copy of the helper.
- State/cache owners and public entry points before/after: feature snapshots stay in Hub, Pixels, Health, and World. Public entries added: `openBoundedWork`, `mayPublish`, `BoundedWork`, `BoundedStep`. `PixelsDataService.load` keeps its argument list. `PIXELS_ACTION_DEADLINE_MS` is the one Pixels action budget.
- Remaining old symbol/path search: `rg` of `setTimeout|Promise.race` in `hub-load.ts`, `pixels-data.service.ts`, `health-store.service.ts`, `health/index.ts`, and `world-controller.ts` finds no matches. Remaining `AbortController` values are lifecycle owners (`lifecycle`, Health `stop`, World `worldAbort` and the budget handle passed into `openBoundedWork`).
- Follow-up change: which production files and independent policy owners now need editing: a new bounded load calls `openBoundedWork` once per user action and maps its own locked/expired/partial states. Do not start a fresh 8s timeout per window.
- Tests/docs/generated changes separately: tests added 285 and deleted 17, net +268 (`bounded-work.test.mjs` 108, Pixels spec +123, Health spec +37). This file is the documentation change. Generated bundles are not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +150. The increase is the shared deadline/cancel/publish helper and Pixels' single action deadline across sequential windows and Finance joins (previously unbounded). Health and World shrank. Hub's timer stays so the initial shell bundle does not import the helper; that import failed Media's Back filter in CI. No source-window, privacy, or budget-state meaning changed.
- No behavior/data/meaningful assertion silently removed: Hub cancel vs timeout, Health corrupt/v1/conflict rows, Pixels locked finance, and World cleared-budget amounts remain asserted.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `SUITE_KARMA_COVERAGE` was unset for gate runs. Node test and Karma commands used `/tmp/node24/bin/node` v24.11.1 because Node 20 cannot import the TypeScript browser sources.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, matching baseline. Re-run after the library guard |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS on the final tree, including the #322 fast-forward. 797 SUCCESS. Statements 75.3% (7745/10285), branches 65.06% (3776/5803), functions 72.27% (1984/2745), lines 78.32% (6846/8741) |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 15 SUCCESS. Statements 92.17% (106/115), branches 64.7% (22/34), functions 83.33% (20/24), lines 93.2% (96/103) |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on the final tree. 662 SUCCESS. Statements 82.42% (5103/6191), branches 68.51% (1917/2798), functions 82.32% (1048/1273), lines 85.97% (4437/5161) |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 22 pass, 0 fail |
| `make e2e` | PASS after one isolated rerun. Full run: 239 passed, 1 failed, 8 skipped. The failure was `[390 dark] navigating between sections moves focus to the h1` under the full worker load. The same spec, all four viewport/theme cases, passed alone (4 passed). Not a product change to focus |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS locally, 77 passed, after Hub stopped importing the helper. CI failed this spec while the helper was in the initial bundle; that import is removed |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 151 passed |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 76 passed |
| `npx playwright test --project=suite` | PASS. 24 passed |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/335 (`Closes #205`, references #198)
- Roadmap #134 append-only status-note URL: posted after the PR exists
- Merged/activation status: not merged at this commit. Not a deployment
- Remaining external prerequisites or approved scope decisions: parent #198 stays open. WebCrypto decrypt remains uncancellable; Health drops the result instead
- Next actor: CI, then squash merge after Backend, Frontend, Unified Site Release, and Playwright are green
