# DEL-01 — implementation evidence

- Leaf issue and parent(s): [#213](https://github.com/Vivekpsps3/vivek-monorepo/issues/213); parent [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/del-01`, `/home/vivek/Deployments/worktrees/vivek-del-01`
- Base main SHA, current tested SHA: base `29e131821d138bba224e02d5d61b77e23247e08a`; verified working tree is that base plus the changes in this commit. The PR head SHA is recorded in the pull request after this file lands.
- Fresh-main/prerequisite/active-PR checks: no queue dependency. PR #145 (K1: ui-menu, trip-spend registry) merged 2026-11-07. PR #193 merged 2026-11-09 and is already in this base. Open PR #283 is planning guidance and does not edit these files. Claim was already on #213. DEL-02 and DEL-03 were not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Zero-consumer pass-throughs removed: `CHART_COLORS`, `MoneyAriaPipe`, `SuiteHubLinkComponent` (`ui-suite-hub`), and the unread toast layout constants. Repo search covered ts/html/mjs/css/json/py. No dynamic import, template selector, pipe name, or test referenced them. `controls.css` `.suite-hub` was not edited. | PASS | consumer search; `make lint-web`; `make typecheck-web`; Karma; Playwright below |
| LOCAL2 | K1-unmerged and "Finance streams do not exist" comments compared with this base. Registry and ui-menu exist (`packages/ui/src/finance-trip-spend.ts`, `packages/ui/src/ui-menu/`). FinanceService exposes `assets$`, `liabilities$`, `holdings$`, `fixedExpenses$`, `subscriptions$`. Badge copy is settled on #90. Null spend lookup, locked-only search, and placeholder badge strings remain, owned by #225, #246, and #257. | PASS | source diff; live issues #145 (merged), #225, #246, #257, #90 |
| LOCAL3 | `MoneyPipe` still converts stored dollars through `fromDollars` before `formatMoney`. `showMoney` in `apps/travel/frontend/src/display.ts` was not changed. `chartPalette` and `chartGridColor` stay as the internals of `chartColorAt` and `chartCartesianScales`. Theme application functions stay. Health unit constants stay. | PASS | retained-candidate table; Finance Karma 751, web Karma 631 |
| LOCAL4 | `git diff --numstat` on the implementation (evidence file excluded): production files 35 insertions / 129 deletions. Docs 20 / 17. Tests 0. Generated 0. The deleted component, pipe, deprecated palette alias, and unread constants are the code removal. Comment edits are not counted as that removal. | PASS | numstat below |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `CHART_COLORS` deprecated alias of `chartPalette` | none outside `chart-theme.ts` and the barrel | `chartColorAt` | removed | identifier search; barrel no longer exports it |
| Barrel exports of `chartPalette` and `chartGridColor` | none outside the module | same functions, now module-private, used by `chartColorAt` and `chartCartesianScales` | export removed; functions retained | identifier search |
| `MoneyAriaPipe` / `moneyAria` | none | `moneyAriaLabel` in `@vivek/browser` and `MoneyPipe` for visible money | removed | no template or import; `MoneyPipe` remains |
| `SuiteHubLinkComponent` (`ui-suite-hub`) | none; private-layout spec expects `a.suite-hub` to be absent because the app switcher owns Hub | app switcher in the private shell | component file removed | selector/class search; shell specs still expect no `a.suite-hub` |
| `TOAST_INSET_PX`, `TOAST_MAX_WIDTH_PX`, `TOAST_MOBILE_BREAKPOINT_PX` | none | `apps/web/src/styles.css` toast host (24px, 400px, 768px). That file was not edited | constants and barrel exports removed | identifier search; toast node test still checks limit, duration, role, and copy |
| BLOCKED-ON-K1 spend comment | readers of `financeSpendLookup` | null lookup until TRIP-01 (#225) reads `FinanceTripSpendRegistry` | comment replaced; method kept | #145 merged; #225 open |
| BLOCKED-ON-K1 row-action comment | readers of `trip-costs.component.css` | inline actions at every width; menu swap is TRIP-03 (#227) | comment replaced; CSS rules kept | ui-menu is on main |
| Search "streams do not exist" comment | readers of the search dialog | locked-vault row only; unlocked names are HUB-04 (#246) | comment replaced; probe and locked row kept | streams at `finance.service.ts` |
| Health "waiting for design" comment and `TODO(design)` | readers of `HEALTH_BADGES` | placeholder strings until HEALTH-02 (#257) applies the #90 names | comment and TODO owner replaced; the fifteen placeholder strings kept | #90 body has the settled mapping; #257 open |
| Bank-import onboarding (expense-only / skipped-credit table) | `docs/ADDING_A_BANK_IMPORT.md` | `bank-import.parsers.ts`, `bank-import.util.ts`, `transactionEffects` | prose replaced | parser hints and `directedEffects` |
| Quality prose (packages ESLint 0, Finance/web 474, import-order leftovers) | `docs/QUALITY.md` | `quality/*.txt` via `scripts/quality_ratchet.py` `TOOLS` | hardcoded counts removed; packages baseline called out as non-empty | baselines: ruff 101, mypy 87, eslint-finance 469, eslint-site 9, eslint-packages 1, suppressions 0 |

Retained on purpose, with consumers or an owner outside this leaf:

| Candidate | Why it stays |
| --- | --- |
| `financeSpendLookup` returning null | TRIP-01 (#225) wires the existing registry. Deleting the seam would change trip behavior. |
| Locked-only Finance search row | HUB-04 (#246) adds the facade. Streams exist; this leaf does not match them. |
| Fifteen Health badge placeholders and their TODOs | #90 settled the names. HEALTH-02 (#257) applies them. TODOs were retargeted, not deleted. |
| `MoneyPipe`, `showMoney`, `fromDollars` / trip `toCents` | Unit adapters. `showMoney` and the trip alias were not edited. |
| `FinanceTripSpendRegistry`, `TripSpendTotal` | Live contract. Travel does not read it yet; #225 will. |
| Public type exports of live components (`UiButtonVariant`, toast types, `UpdateNotice`, and the rest) | Type contract of components that are used. No pass-through body to delete. |
| `applyThemePreference` and `systemTheme` barrel exports | Used by `setThemePreference` and `bindSystemTheme`. Site imports the sibling functions. |
| `packages/ui/controls.css` `.suite-hub` rules | Duplicate of the removed component's styles. File is outside this leaf (DEL-05). |
| `apps/finance/frontend/src/app/vault/vault-page.css` `app-suite-hub` | Different selector, no matching component, outside the file fence. |
| `trip.component.ts` "T2's toCents is not on main" | Outside the file fence. `toCents` in `trip-costs.mjs` is a separate decimal parser. Trip behavior was not changed. |
| `activity.spec.ts` "ui-menu (not on main)" and `test_town_api_write.py` UTC-clamp xfail | Outside the file fence. ui-menu is on main. The xfail is still an unimplemented clamp. |
| `apps/server/town/service.py` "TB3 replaces passive_days" | Outside the file fence. TOWN-02 owns the stub. |
| World controller orphan | DEL-03. Not searched for deletion. |
| Legacy vault/auth compatibility paths | DEL-02. Not retired. |

- Production added/deleted/moved: implementation diff excluding this evidence file and counting comment edits in the same production files: **35 added, 129 deleted, net −94**. Moved: 0. The code deletion inside that total is `suite-hub-link.component.ts` (62), `MoneyAriaPipe` (13), three unread toast constants (3), `CHART_COLORS` plus the two barrel-only chart exports (`chart-theme.ts` 2 added / 7 deleted), and `public-api.ts` (1 added / 8 deleted). The rest of the production numstat is replacement of stale comments in trip costs, search, and health constants.
- Tests/docs/generated changes separately: tests 0. Generated 0. Docs before this evidence file: `ADDING_A_BANK_IMPORT.md` 17 added / 14 deleted, `QUALITY.md` 3 / 3. This evidence file is the required note, not a product deletion.
- Remaining necessary overhead and why: the null spend lookup, the locked search row, and the badge placeholders are still the honest unfinished behavior. Toast duration and limit constants stay because `toastDuration` and the toast test use them. Chart palette and grid readers stay because the public chart helpers call them.
- No behavior/data/meaningful assertion silently removed: badge ids and the five existing display names are unchanged. Spend lookup still returns null. Search still adds only the locked Finance row. Money formatting, refund/payment effects, and coverage floors were not edited.

`git diff --numstat` for the implementation (evidence file not included):

```
3	5	apps/travel/frontend/src/trip-costs.component.css
4	7	apps/travel/frontend/src/trip-costs.component.ts
7	7	apps/web/src/app/search/search-dialog.component.ts
18	17	apps/web/src/app/town/health/health.constants.ts
17	14	docs/ADDING_A_BANK_IMPORT.md
3	3	docs/QUALITY.md
2	7	packages/ui/src/chart-theme.ts
0	13	packages/ui/src/money.pipe.ts
1	8	packages/ui/src/public-api.ts
0	62	packages/ui/src/suite-hub-link.component.ts
0	3	packages/ui/src/toast-contract.ts
```

## Verification

Commands ran in `/home/vivek/Deployments/worktrees/vivek-del-01` against the working tree on base `29e131821d138bba224e02d5d61b77e23247e08a`. Local execution only. CI, merge, and deployment were not run.

Toolchain notes, not product changes: this worktree had no `node_modules`, so the main checkout's install at the same base was copied in. Playwright used `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointing at the installed Playwright Chromium 156. Karma used that same binary as `CHROME_BIN`. An earlier `make e2e` failed only because system `python3` has no FastAPI and the sandbox browser cache had no headless shell. Those runs were discarded. The results below are the reruns that actually executed.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, blame revisions, shared boundaries, finance UX F1, 44 unittest cases, e2e discovery guard, 15 node script tests. |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, engine purity 1 passed. |
| `make typecheck-web` | PASS. web, finance, packages, and site app/spec `tsc --noEmit`. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 751 SUCCESS. Statements 73.86% (floor 60). |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 15 SUCCESS. Statements 92.17% (floor 61). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 631 SUCCESS. Statements 81.39% (floor 60). |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` on Node v24.11.0 | PASS. 18 passed. CI setup uses Node 24. |
| same `node --test` command on system Node v20.20.2 | FAIL, pre-existing. `calendar-format.test.mjs` cannot import `format.ts` (`ERR_UNKNOWN_FILE_EXTENSION`). The same command fails on unmodified `origin/main` at the base SHA. Not introduced by this diff. |
| `make e2e` | PASS on the rerun. Build wrote `dist/web`. Playwright 238 passed, 8 skipped, exit 0 (2.9m). |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 72 passed. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 144 passed. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 28 passed. |
| `npx playwright test --project=suite` | PASS. 24 passed. |
| `make lint-python`, `make typecheck-python`, Python coverage gates | NOT RUN. No Python file changed. |
| Finance/site/web Karma and the Playwright commands above | the applicable root AGENTS browser gates for the TypeScript, CSS, and docs touched here |

## Handoff

- PR URL (leaf closure keyword only): filled in the pull request that contains `Closes #213`. Parent #200 is referenced and not closed.
- Roadmap #134 append-only status-note URL: posted after the PR exists.
- Merged/activation status: not merged, not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. TRIP-01 (#225), TRIP-03 (#227), HUB-04 (#246), and HEALTH-02 (#257) still own the unfinished behavior called out above. DEL-05 still owns `controls.css`.
- Next actor: review. Do not merge from this leaf.
