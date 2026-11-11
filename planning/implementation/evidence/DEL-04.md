# DEL-04 — implementation evidence

- Leaf issue and parent(s): [#216](https://github.com/Vivekpsps3/vivek-monorepo/issues/216) DEL-04. Parents [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) and [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65) stay open.
- Agent/context, branch/worktree: Cursor agent, branch `agent/del-04`, worktree `/tmp/vivek-del-04`.
- Base main SHA, current tested SHA: base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Tested source is this commit's `finance.service.ts` and `finance.service.spec.ts`. Evidence is documentation only.
- Fresh-main/prerequisite/active-PR checks: origin/main at the base above. HUB-04 #246 / PR #340 `779f1679827de7e45f1ce3d3f09fe5d8715c3ceb` and TYPE-01 #218 / PR #338 `e3ff785e1e65315425fd24fc733b88bdf0337857` are ancestors. No queue dependency. No open pull request edited these files at implementation time. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/216#issuecomment-6806644696.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Two `getSubscriptions` callers share one store read and both receive the current rows. A concurrent `getJobIncomes` still loads. After the joined read settles, the next subscription read calls the store again. A held job-income refresh that loses its epoch does not block subscription publication. | PASS | `finance.service.spec.ts`: "joins one in-flight collection read and still loads an unrelated collection"; "publishes a later collection when an earlier cashflow refresh goes stale" |
| LOCAL2 | A stale subscription read does not overwrite a newer revision. Lock during a fixed-expense read publishes nothing and emits nothing. A job-income read whose session changes does not replace the subject. A subscription refresh whose session changes keeps the previous subject and does not continue into cashflow. A subscription write-back that resolves after a newer revision does not republish the stale rows. Existing lock-gating still covers all three getters. | PASS | `finance.service.spec.ts`: "does not let a stale subscription read overwrite a fresher one (B0F2 GA5)"; "lock-gates every subject-emitting getter while a read is in flight (B0F2 N2)"; "does not publish a cashflow read after its session, revision, or lock moves"; "does not let a subscription write-back overwrite a newer revision" |
| LOCAL3 | Ready bill names come from the published fixed-expense stream. Search returns only the name projection, does not call `loadDashboard`, and does not read transactions, assets, holdings, or job incomes. The existing name-search specs still refuse a dashboard load when the vault is absent, locked, or unloaded. | PASS | `finance.service.spec.ts`: "reads ready bill names from the public search facade without loadDashboard". Existing `finance-search.spec.ts` request-count specs run in the Finance Karma gate. |
| LOCAL4 | Job income, fixed expense, and subscription getters, remote refresh, and add/update/delete read-back all go through `loadEligible`. The old getter wrappers, remote branches, and `publishReadBackIfUnlocked` calls for those three collections are gone. One record store and the existing snapshot subjects remain. Production delta for `finance.service.ts` is negative. | PASS | Caller inventory and deletion ledger below. `git diff --numstat` against `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Three remote refresh branches in `refreshCollectionViewsFromStore` for `job_incomes`, `fixed_expenses`, and `subscriptions` (separate read, session abort, epoch check, and publish) | `encStore.changes$` remote updates and `refreshCollectionsFromAnotherTab` | `FinanceService.loadEligible` | Removed. Refresh calls `loadEligible` and still aborts the rest of the refresh when the session ends. | LOCAL1 independent-refresh test; LOCAL2 session-abort assertion that cashflow is not read |
| `getJobIncomes` / `getFixedExpenses` / `getSubscriptions` epoch wrappers around `guardedRead` | Income, transactions, charts, subscriptions, fixed expenses, recurring hub, and `loadDashboard` | `observeEligible` → `loadEligible` | Removed. Public method names and callers stay. Callers were not copied onto a second pipeline. | LOCAL1 join test; full Finance Karma |
| Nine add/update/delete `publishReadBackIfUnlocked` calls for those three collections | Income, fixed-expense, and subscription editors | `writeEligible` → `loadEligible`, capturing session, epoch, and lock after the store write | Removed. The post-write epoch is the owner. A later revision, lock, or session during the re-read does not publish. | LOCAL2 write-back test |
| Unconsumed FinanceService pass-throughs | Public getters, `peekLoadedNames`, `loadDashboard`, import and market methods | Same methods | None deleted. Each still has a production or test caller. No pass-through became unused. | `make typecheck-web` PASS; caller list below |

- Candidate class and protected counterexamples: duplicate live publication policy. `_transactions` and `_dashboardTransactions` stay separate. The encrypted store stays the only record store. No second decoder, dashboard cache, import engine, or market coordinator was added. `publishReadBackIfUnlocked` remains for transactions, holdings, assets, and liabilities because those collections were outside this tranche; their write-back still checks lock and DEK only.
- Comparison base SHA and full replacement closure: `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Closure is `apps/finance/frontend/src/app/services/finance.service.ts` only. No new production file.
- Production added/deleted/moved: `git diff --numstat` 65 added, 84 deleted, net −19 physical lines. Non-blank non-comment lines 891 → 866 (−25). Comments stayed 22. Blank lines 91 → 97 (+6). Nothing moved.
- Independent equivalent implementations before/after: three publication policies (getter epoch check, remote refresh branch, lock-only write-back) → one `loadEligible` policy (session, collection epoch, lock epoch, and DEK).
- State/cache owners and public entry points before/after: encrypted store, snapshot subjects, `dashboardLoad$`, import staging, and `FinanceMarketCoordinator` are unchanged. `joinedReads` holds an in-flight store promise keyed by collection, session, epoch, and lock, and deletes it when the read settles. It is not a snapshot cache; the spec reads the store again after settle. Public entry points are unchanged: the three getters, `peekLoadedNames`, `searchFinanceNames`, and `loadDashboard`.
- Remaining old symbol/path search: no `guardedRead` or `publishReadBackIfUnlocked` call remains for `getJobIncomes`, `getFixedExpenses`, `getSubscriptions`, or those three subjects. `FinanceMarketCoordinator` still publishes job-income rows it already loaded after its own session and epoch check. That quote path does not call `loadDashboard` or the collection-read helper; folding it in would re-read or add a publish-without-read side door. `planning.service.ts` still reads the store for planning math and does not publish snapshots.
- Migrated callers, unchanged call sites: `income.component.ts`, `transactions.component.ts`, `charts.component.ts`, `subscriptions.component.ts`, `fixed-expenses.component.ts`, `recurring-hub.component.ts`, and `loadDashboard`. Name search stays on `peekLoadedNames` through `finance-search.ts`, `public-api.ts`, and `search-dialog.component.ts`. HUB-04 behavior is preserved: a name lookup does not call `loadDashboard` or a provider.
- Collections left on their previous path: transactions (ledger versus dashboard subjects), holdings, assets, and liabilities. They do not copy `loadEligible`. Holdings quote publication stays on the market coordinator.
- Follow-up change: a screen that lists one of these three collections calls the existing getter. A name-only consumer calls `searchFinanceNames`. Neither adds a refresh branch or a dashboard load.
- Tests/docs/generated changes separately: `finance.service.spec.ts` +138 / −0. This evidence file is the only documentation change. No generated file is committed.
- Net production delta and exception: −19 physical lines, −25 code lines. No positive-delta exception.
- No behavior/data/meaningful assertion silently removed: joined and independent loads, silent other-tab reload, lock and session clearing, revision conflicts, cashflow and net-worth refresh, import staging, and market quotes stay. Name search still returns names only. The three migrated write-backs gained the post-write session and epoch check; they no longer publish a stale re-read.

## Verification

Commands ran in `/tmp/vivek-del-04` with `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python`, `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Finance and web Karma used port 9961 in `apps/karma.conf.js`. That port edit was reverted before commit and is not in the diff. `SUITE_KARMA_COVERAGE` was unset for the gate runs.

| Command | Tested source | Result |
| --- | --- | --- |
| `python3 planning/implementation/plan.py launch DEL-04` | base plus the service diff | PASS. Printed the commands below. |
| `make test-fast` | same | PASS. Doc paths, planning validation (94 packets), boundary checks, 91 unittest tests, 15 node tests. |
| `make lint-web` | same | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Engine purity 1 passed. |
| `make typecheck-web` | same | PASS. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | same | PASS. 818 of 818. Statements 75.49% (8015/10616), branches 65.02% (3916/6022), functions 72.01% (2036/2827), lines 78.64% (7077/8999). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | same | PASS. 710 of 710. Statements 83.27% (5520/6629), branches 70.25% (2123/3022), functions 82.93% (1108/1336), lines 86.93% (4777/5495). |
| `make e2e` | same | PASS. 245 passed, 8 skipped. Skips are the existing non-390 target-size cases in `suite-v2-a11y.spec.ts`. The run includes `build-frontends`. |
| `make build-frontends` | same | PASS. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | same | PASS. 78 passed. |
| `npx playwright test --project=suite` | same | PASS. 26 passed. |
| `make lint-python`, `make typecheck-python`, Python coverage gates | — | NOT RUN. No Python file changed. |

Headless Karma and Playwright are the UI proof. No shared desktop browser was used.

## Handoff

- PR URL (leaf closure keyword only): opened after this evidence, `Closes #216` only. Parents are referenced without a closing keyword.
- Roadmap #134 append-only status-note URL: posted after the pull request exists.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed at this commit.
- Remaining external prerequisites or approved scope decisions: none. #200 and #65 stay open.
- Next actor: CI, then squash-merge of this leaf. No unstated decision is required to continue.
