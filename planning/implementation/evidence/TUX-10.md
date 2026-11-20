# TUX-10 — implementation evidence

- Leaf issue and parent(s): [#422](https://github.com/Vivekpsps3/vivek-monorepo/issues/422) TUX-10; parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#315](https://github.com/Vivekpsps3/vivek-monorepo/issues/315). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-10`; `/tmp/vivek-tux-10`. The shared checkout was not edited. Health and `/tmp/vivek-heal-04` were not edited.
- Base main SHA, current tested SHA: base `5e63cd7ec6e34c162c332f12730945da1439b138` (HEAL-03 merge, pull request #548). The implementation and these command results are `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `5e63cd7ec6e34c162c332f12730945da1439b138`. TUX-06 itinerary projection is on that tree (`projectItinerary` in `apps/travel/frontend/src/calendar-model.mjs`; `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` is an ancestor). PIX-01 trip spans are on that tree (`kind="trip_span"` in `apps/server/pixels/facts.py`). Issues #411 and #421 are closed. `gh pr list --state open` showed only HEAL-04 (#549) on `agent/heal-04`. No open `travel-forms` or `travel-ui` pull request.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-10-A1 | Synthetic trips Late north (booked, 2020-03-01 through 2020-03-10, Oslo) and Late south (completed, 2020-03-08 through 2020-03-15, no stay). Both cards show those spans. Each names the other overlap and says both spans stay. Town credit is absent, with the log day explained apart from the span. A 2026-10-29 06:30 UTC log of a trip ending 2026-10-28 is late in UTC and credits 2026-10-29 in America/Los_Angeles. | PASS | `apps/travel/e2e/memories.spec.js` desktop and phone overlap reads. `apps/travel/backend/tests/test_memories.py` timezone and overlap tests. |
| TUX-10-A2 | Redating Late south to 2090-09-01 through 2090-09-04 credits September 5, 2090 and removes the overlap on both cards. Canceling Completed coast marks it planned and drops August 7, 2090 credit while the span stays. Deleting Planned harbor removes that card. The list is reread from `GET /travel/api/memories`. A later memories response with the old span does not replace the new card. No `memories` or `trip_memories` table exists. | PASS | `memories.spec.js` redate, cancel, delete, and stale-list tests. `test_memories.py` mutation, cap, and table tests. |
| TUX-10-LIFE | A held redate response leaves the newer start date and the private note in the dialog, and the card stays on March 8–15, 2020. The private note is not in the PATCH body. A 503 keeps the note; the retry saves the dates and clears it. Session expiry clears the note, shows no discard prompt, and lands on the login page. `settleMemoryWrite` drops a stale epoch, an inactive session, and a changed date. `clearMemoryDraft` empties the private fields. | PASS | `memories.spec.js` late-response, failed-save, and session tests. `apps/travel/backend/static/tests/memories.test.mjs`. |
| TUX-10-VIEW | 390×844 dark touch and 1280×800 light keyboard, reduced motion. Overlap text, credit sentences, and the redate update are visible. Reload, Redate, Delete, and Open are at least 44px. Axe serious, critical, and color-contrast violations are empty. `animation-name` on the card is `none`. Escape returns focus to the Redate button. Save returns focus to the card. Delete returns focus to the differences section. The axe sweep also opens `/travel/memories` at 390 and 1280 in light and dark. | PASS | `memories.spec.js` VIEW keyboard day and VIEW touch night. `apps/travel/e2e/axe.spec.js` includes `/travel/memories`. |
| PLACE-11-TRIP | Planned harbor does not credit and names Lisbon. Booked fjord credits June 4, 2090. Completed coast credits August 7, 2090. Late overlapping trips keep both spans. The differences list states the span-versus-credit, planned-versus-completed, and saved-place-versus-World rules. Pixels text counts the civil days. | PASS | `memories.spec.js` honest-overlap assertions. `test_memories.py` planned, booked, and completed test. |
| PLACE-11-CHANGE | Cancel, delete, and redate update the derived cards from the saved trips. A title or origin of Oslo with no stay says no saved destination and does not invent a place. A blank city is skipped. Three saved cities stay in stay order. | PASS | `memories.spec.js` redate, cancel, and delete. `test_memories.py` place and mutation tests. |

Fixtures are synthetic trips only. No private itinerary is in the tests, logs, or the issue.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| A copied trip-memory ledger | None. Main had no memory route, table, or client cache of trip spans. | `project_memories` in `apps/travel/backend/services/memories.py`, read through `GET /travel/api/memories`. | No table or client ledger was added. Cancel, delete, and redate use the existing trip routes, then the page reloads the projection. | `test_memories.py` asserts `memories` and `trip_memories` are absent and a read does not change `updated_at`. The stale GET test keeps the newer card. |

- Candidate class and protected counterexamples: feature addition. There was no prior memory implementation to delete. Trip rows, stays, Town credit SQL, and Pixels `trip_span` facts stay. The Town service still owns the credit that changes a score. This page repeats that date rule only to explain the card.
- Comparison base SHA and full replacement closure (including new files): `5e63cd7ec6e34c162c332f12730945da1439b138`. Closure is `memories.py`, `board.py`, `memories.mjs`, `memories.d.mts`, `memories.component.ts`, `memories.component.css`, `public-api.ts`, `travel-navigation.ts`, `travel.css`, and `apps/web/routes.json`.
- Production added/deleted/moved; comments/blank-only churn separately: executable production numstat is +926/−2, net +924. That includes the service (+286), the component (+444), and the declaration file (+75). Docs are `docs/TRAVEL.md` +4 and `apps/travel/AGENTS.md` +2/−1. `routes.json` is +1/−1.
- Independent equivalent implementations before/after: 1 / 1 trip store. The memory page is a projection of saved trips and stays.
- State/cache owners and public entry points before/after: `GET /travel/api/memories` is a new read. Writes stay on `PATCH /travel/api/trips/{id}` and `DELETE /travel/api/trips/{id}`. The private note lives in the component and is not posted. A date change during a save drops that response. Session invalidation clears the note without a discard prompt.
- Remaining old symbol/path search, including config and discovery: no `trip_memories` symbol. `/travel/memories` is in the Travel routes and in `apps/web/routes.json`.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf. A future change to the Town credit query would also need this explanation updated. Pixels facts were not edited.
- Tests/docs/generated changes separately: tests +908/−2 (`test_memories.py`, `memories.test.mjs`, `memories.spec.js`, `axe.spec.js`), plus this evidence file. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (679.17 kB against the 650 kB budget).
- Net production delta and specific reviewed safety/compatibility exception if positive: +924 executable lines. This is the feature: one bounded memory read, the credit explanation, and the redate draft guards. The positive delta is the implementation, not a simplification claim.
- No behavior/data/meaningful assertion silently removed: confirmed. Home trip cards, the itinerary, and the Town and Pixels projections still pass their existing suites.

## Verification

Commands ran in `/tmp/vivek-tux-10`. `make test-fast` used `PATH="/tmp/vivek-tux-10/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Travel coverage rose from the stored 81.41% to 89.32%. Server coverage rose from the stored 61.87% to 79.95%. The floors were not lowered and were not pinned.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-10/.venv/bin:$PATH" make test-fast` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. |
| `make lint-web` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. |
| `make typecheck-web` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. 492 SUCCESS. Statements 75.06% (7106/9467). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. 79 pass / 0 fail. |
| `make build-frontends` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. Output `/tmp/vivek-tux-10/dist/web`. Initial-bundle warning 679.17 kB. Exit 0. The Playwright run used that bundle. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. 202 passed. |
| `make lint-python` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. Ruff format check, ruff 90 findings match the baseline, suppressions 6 match the baseline. |
| `make typecheck-python` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh travel` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. 232 passed. TOTAL 89.32%. Floor remains 81.41%. |
| `./scripts/coverage-gate.sh server` | `eee9ce7ca2cc55d9763f7ca915b6d1b91f719106` | PASS. 432 passed, 1 skipped. TOTAL 79.95%. Floor remains 61.87%. |

Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run. The diff does not change those screens.

## Handoff

- PR URL (leaf closure keyword only): after open. The body uses `Closes #422` only.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #315, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
