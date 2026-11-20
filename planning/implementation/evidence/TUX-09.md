# TUX-09 — implementation evidence

- Leaf issue and parent(s): [#414](https://github.com/Vivekpsps3/vivek-monorepo/issues/414) TUX-09; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-09`; `/tmp/vivek-tux-09`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `e6140fbc2e337d6fc219ad65a9dd5d1ed812aeba` (TUX-08 merge, pull request #541). The implementation and these command results are `8540c55203cb5193904b6abdfa695cd46dc07bac`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `e6140fbc2e337d6fc219ad65a9dd5d1ed812aeba`. FUX-03 browser spend is an ancestor (`0dbf34e4`, pull request #527, issue #392). TUX-06 trip costs are an ancestor (`f373cafd`, pull request #539, issue #411). `gh pr list --state open` returned no pull requests. No open travel-costs or finance-public-api pull request. #414, #304, #134, and #277 were open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-09-A1 | Synthetic trip "Stage costs": paid flight SYN 100 Harbor to Field at 420.00 USD, unpaid Museum hour 15.00 USD, unpaid Guidebook 8.00 EUR, and one posted USD purchase id 91001 for 420.00 tagged to that trip. Linking the flight shows Planned 15.00, Booked 420.00, Posted 420.00, and Counted once 420.00. The trip total stays 435.00. The page does not show 840.00. The link is one in-memory id. The confirm is a transaction re-read. No vault upsert is recorded. Description, merchant, and account stay off the Travel page. | PASS | `apps/travel/e2e/trip-cost-reconcile.spec.ts` touch night. `trip-costs.test.mjs` `reconcileStages counts a linked booked flight once`. `trip-costs.component.spec.ts` counts the flight once. `trip-spend.spec.ts` publishes date and category only. `trip-spend-producer.spec.ts` confirms through the registry with an empty HTTP match. |
| TUX-09-A2 | After the link, deleting that purchase in the same browser session shows "No posted USD", "That posted transaction is no longer available.", and "no card spend is tagged to this trip". SYN 100 remains. Locking Finance shows "Hidden while Finance is locked" for USD and EUR, hides the 420.00 posting, and leaves the flight. The committed id is kept so a later unlock can resolve it. A full document reload drops the in-memory link. | PASS | `trip-cost-reconcile.spec.ts` delete path and lock path. `trip-costs.test.mjs` hides posted overlap while locked and when the posting is gone. `finance.service.spec.ts` drops the ledger after lock. |
| TUX-09-LIFE | A 503 on the confirm re-read keeps the flight and the draft, with "Couldn't save this link. Try again." Escape while that read is held bumps the epoch, so the late response does not link and focus returns to Link. Session end clears the draft and the stored id. A stale confirmer release does not clear a newer confirmer. | PASS | `trip-cost-reconcile.spec.ts` keyboard day. `trip-costs.component.spec.ts` failed read and session end. `trip-costs.test.mjs` `settleCostLink`. `finance-trip-spend.spec.ts` stale confirmer release. |
| TUX-09-VIEW | 390×844 night touch and 1280×800 light keyboard, reduced motion. Link, Clear link, Cancel, and Try again are at least 44 px. After a successful link, focus is on Clear link. After the failed read, focus is on Try again. Axe serious, critical, and color-contrast violations inside `travel-trip-costs` are empty. `animation-name` is `none`. No horizontal scroll. | PASS | `trip-cost-reconcile.spec.ts` at both viewports, including AxeBuilder, target size, reduced motion, and focus return. |

Fixtures are synthetic records only. No real transaction, account name, or private itinerary is in the tests, logs, or the issue. Planned, booked, and posted stay separate by currency. Counted once is the overlap of one linked payment, shown only when that overlap is greater than zero. The trip total remains the server rollup. The sentence "Card spend isn't added to the trip total." is unchanged. Linking does not write a Finance record and does not add a schema revision.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior cost-to-transaction link | None. Posted card spend was a separate Finance total on the trip cost screen. | `FinanceTripSpendRegistry` lookup plus one confirmer. `TripCostLinkStore` holds the selected id for this session only. | Retained the spend facade and the "isn't added" sentence. No second ledger, second registry, crypto protocol, or `trip_cost_links` table. | Boundary check passes. The Playwright link records zero vault upserts. Deleting or locking the source clears private spend and leaves the Travel cost. |

- Candidate class and protected counterexamples: feature addition. There was no prior link implementation to delete. Finance vault privacy and Travel money meaning stay. Refund rows still subtract in the posted total and add no counted-once overlap.
- Comparison base SHA and full replacement closure (including new files): `e6140fbc2e337d6fc219ad65a9dd5d1ed812aeba`. New production file `apps/travel/frontend/src/trip-cost-links.ts`. Changed production files: `finance.service.ts`, `trip-spend.ts`, `trip-spend-producer.ts`, finance `public-api.ts`, `travel.models.ts`, `trip-costs.component.ts`, `trip-costs.component.css`, `trip-costs.mjs`, `trip-costs.d.mts`, `packages/ui/src/finance-trip-spend.ts`, and packages `public-api.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat, including `trip-costs.d.mts`, `docs/TRAVEL.md`, `apps/travel/AGENTS.md`, and `apps/finance/AGENTS.md`, is +924/−28, net +896. `trip-costs.component.ts` is +428/−0. `trip-costs.mjs` is +138/−1. `trip-cost-links.ts` is +56. Blank-only lines are not split out of that numstat.
- Independent equivalent implementations before/after: 1 / 1 spend facade, `FinanceTripSpendRegistry`. The confirmer is a method on that registry. Travel calls it and does not import Finance.
- State/cache owners and public entry points before/after: the lookup still publishes from the existing producer. Confirm re-reads `transactions` and does not upsert. The link store is a root Angular service in memory. It stores trip, source, source id, and transaction id. Amounts always come from the current lookup. Lock clears in-flight drafts and hides amounts. Session clear wipes drafts and committed ids. A full reload drops the link.
- Remaining old symbol/path search, including config and discovery: no `trip_cost_links` table and no second spend registry. Travel e2e discovery lists the new spec. The suite project does not execute `tests/e2e/synthetic-vault-harness.ts`.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf.
- Tests/docs/generated changes separately: tests +833/−8, including `trip-cost-reconcile.spec.ts` (254 lines) and `tests/e2e/synthetic-vault-harness.ts` (2 lines). Docs are inside the production numstat above. `apps/travel/AGENTS.md` is 291 words. `apps/finance/AGENTS.md` is 288 words. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (678.03 kB against the 650 kB warning budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +896 production lines. This is the feature: stage amounts, the session link, and the confirm re-read. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Unlinked posted spend still says it is not added to the trip total. Locked Finance still offers the existing unlock link. The server cost rollup is unchanged.

## Verification

Commands ran in `/tmp/vivek-tux-09`. `make test-fast` and `make e2e` used `PATH="/tmp/vivek-tux-09/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Neither symlink is committed.

The first `make test-fast` was FAIL. `scripts/check-shared-boundaries.py` rejected a Travel import of finance `public-api.ts` and a Travel e2e import of the finance synthetic vault. Confirm moved onto `FinanceTripSpendRegistry.registerConfirmer`, and the spec now imports `tests/e2e/synthetic-vault-harness.ts`. The repaired command passed. No gate was weakened.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-09/.venv/bin:$PATH" make test-fast` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | First run FAIL: two forbidden Travel-to-Finance imports. Repaired run PASS. The same command was run again after this evidence file existed and passed with the same counts. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Travel e2e discovery listed 32 files, including `trip-cost-reconcile.spec.ts`. Shared boundaries OK. |
| `make lint-web` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. 429 SUCCESS. Statements 72.6% (5824/8022). Branches 57.58% (2225/3864). Functions 72.13% (1165/1615). Lines 77.3% (5049/6531). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. 75 pass / 0 fail. |
| `make build-frontends` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. Output `/tmp/vivek-tux-09/dist/web`. Release `60604ce986f4f64ca7c63ec137b6537b4d1d02f13dfca91c9b346c96687660ab`. Initial-bundle warning 678.03 kB. Exit 0. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. 196 passed. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. 519 SUCCESS. Statements 63.37% (7770/12261). Branches 49.49% (3444/6958). Functions 59.27% (1854/3128). Lines 66.8% (6860/10269). |
| `PATH="/tmp/vivek-tux-09/.venv/bin:$PATH" make e2e` | `8540c55203cb5193904b6abdfa695cd46dc07bac` | PASS. Rebuild wrote the same release `60604ce986f4f64ca7c63ec137b6537b4d1d02f13dfca91c9b346c96687660ab`. Finance Playwright 281 passed, 5 skipped. |

Python lint, Python typecheck, and the Python coverage gates were not run. The diff does not change Python. Site Karma, Media coverage, Media Playwright, and Town Playwright were not run. The diff does not change those screens.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/542 (`Closes #414` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: the link is session memory. A full document reload drops it. That is the scope of this leaf, not a schema follow-up. #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
