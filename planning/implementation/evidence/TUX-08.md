# TUX-08 — implementation evidence

- Leaf issue and parent(s): [#413](https://github.com/Vivekpsps3/vivek-monorepo/issues/413) TUX-08; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-08`; `/tmp/vivek-tux-08`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `6586c3444a9e102a03d93061313cdf81850b7ca2` (TUX-07 merge, pull request #540). The implementation and these command results are `6da2563c10835cae5274b013d6b5967e1747802e`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `6586c3444a9e102a03d93061313cdf81850b7ca2`. STYLE-03 dense holdings and media cards are ancestors of that tree (`fe04d6d84a6a99f525e053e483ba19405ea96e06`, pull request #496). NAV-02 return context is an ancestor (`8126d6efef2e6e0564d7dccc67e17d785204d4f9`, pull request #499; `packages/ui/src/return-context.ts`). `gh pr list --state open` returned no pull requests. No open `travel-forms` or `travel-ui` pull request. #413, #304, #134, and #277 were open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-08-A1 | Synthetic Harbor week, Friday 2026-12-11 through Tuesday 2026-12-15, amounts 1, 0.5, 0, 0.5, and 1, with no stays. Editing the span to Saturday 2026-12-12 through Wednesday 2026-12-16 drops Friday and keeps Saturday Half, Sunday None, Monday Half, and Tuesday Full. Wednesday starts Full. A new-trip draft from Monday 2026-12-14 through Wednesday 2026-12-16 sets Wednesday to Half, then extends through Sunday 2026-12-20 and keeps Monday Full and Wednesday Half. Saturday and Sunday in the extension are None. | PASS | `apps/travel/e2e/pto-inspect.spec.js` date edit at 390×844 and 1280×800, plus the unsaved new-trip date change. `apps/travel/backend/static/tests/pto-model.test.mjs` weekend default. |
| TUX-08-A2 | PTO policy: start 80 h, balance date 2026-03-15, monthly 8 h, cap 40 h, year start 04-01, carry off. Sick: start 16 h, same balance date and year, monthly 4 h, no cap, carry on. North trip and South trip share 2026-12-14 through 2026-12-16. The history row for each `as_of` point shows that point's own day and hour strings and "Accrual boundary". Carry, cap, reset, and year start are the policy sentences. The overlap sentence uses the server conflict amount and labels. The hidden monthly table is unchanged. | PASS | `pto-inspect.spec.js` forecast journey at both viewports. `pto-model.test.mjs` `policyFacts`, `forecastHistory`, and `overlapSentence`. `pto-chart.component.spec.ts` accrual-boundary row. `pto.component.spec.ts` policy facts and overlap sentence. |
| TUX-08-LIFE | A 503 on Save PTO dates keeps Wednesday None, Saturday Half, and Monday Half; the retry stores Wednesday 0. A change during a held save leaves the newer Sunday Full choice on screen, the first response does not mark the trip saved, and the server keeps the first payload until the next save. Session end clears the Clinic draft and ignores the late policy save. An owner change clears the draft and does not reload. | PASS | `pto-inspect.spec.js` failed save, late save, and session expiry. `pto.component.spec.ts` 500 save, session clear, and owner change. |
| TUX-08-VIEW | 390×844 dark touch and 1280×800 light keyboard, reduced motion. Edit trip and the Saturday Half choice are at least 44 px. After the date save, focus returns to Edit trip. Desktop ArrowRight moves Tuesday from Full to Half. Phone taps Monday Half. Axe serious and critical violations are empty. `animation-name` is `none` on the weekend day and the history row. No horizontal scroll. | PASS | `pto-inspect.spec.js` at both viewports, including AxeBuilder, target size, reduced motion, and focus return. |

Fixtures are synthetic trips only. No private itinerary is in the tests, logs, or the issue. Charts still place server `/pto/series` points. `forecastHistory`, `policyFacts`, and `overlapSentence` copy those fields. They do not project a balance. Server leave math in `leave_math.py` and `pto.py` is unchanged.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Collapsed `details`/`summary` for the trip allocation and the new-trip "Time off" block | `trip.component.html`, `new-trip.component.ts`. `focus-ring.spec.js` and `undo.spec.js` clicked the summary. | Always-visible headings "PTO · N days" and "Time off" | Removed the collapsed controls. The same day radios remain. | Date edit and new-trip extension in `pto-inspect.spec.js`. The two specs now use the heading. |
| Duplicate overlap paragraphs above the day list | `trip.component.html` printed every `trip.pto.conflicts` row, and the day row printed the same sentence again. | One sentence on the day via `travel-pto-days`. A fallback remains only when that date is outside the span. The PTO page lists `board.policy.conflicts` once. | Removed the duplicate trip-page loop. | `trip-stories.spec.js` still finds one overlap sentence. `pto-inspect.spec.js` checks the same server sentence on the PTO page and the trip. |

- Candidate class and protected counterexamples: feature replacement. Carry, cap, reset, sick and PTO buckets, and conflict details stay on the server payload. The visually hidden monthly table stays hidden. Home still shows the "PTO overlaps" badge.
- Comparison base SHA and full replacement closure (including new files): `6586c3444a9e102a03d93061313cdf81850b7ca2`. Closure is `pto-model.mjs`, `pto-model.d.mts`, `pto-chart.component.ts`, `pto-days.component.ts`, `pto.component.ts`, `trip.component.ts`, `trip.component.html`, `new-trip.component.ts`, and `travel.css`. No new production file.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat, including `pto-model.d.mts`, `docs/TRAVEL.md`, and `apps/travel/AGENTS.md`, is +377/−38, net +339. `pto.component.ts` is +123/−18. `pto-model.mjs` is +92/−2. `pto-chart.component.ts` is +48/−0. Blank-only lines are not split out of that numstat.
- Independent equivalent implementations before/after: 1 / 1 leave calculation, the server. The client copies point text, policy fields, and conflict rows.
- State/cache owners and public entry points before/after: forecasts still use `GET /travel/api/pto/series`. Policy saves still use the existing policy routes. Trip allocation still uses `PATCH /trips/{id}`. A change during a save bumps the existing trip save epoch, so the late response does not adopt. PTO page session invalidation clears drafts, cancels the board and series reads, and does not reload. Trip session invalidation already cleared the open trip.
- Remaining old symbol/path search, including config and discovery: no second forecast engine. `combinedForecast` still places the chart. `bucketLabel` remains the one bucket name helper.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf.
- Tests/docs/generated changes separately: tests +499/−5, including new `pto-inspect.spec.js` (289 lines). `docs/TRAVEL.md` is +1/−1 and `apps/travel/AGENTS.md` is +3/−2, inside the production numstat above. `apps/travel/AGENTS.md` is 299 words. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (677.57 kB against the 650 kB budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +339 production lines. This is the feature: visible policy history, the accrual boundary, per-day overlap, weekend marking, and the session guard on the PTO page. The positive delta is the implementation, not a simplification claim.
- No behavior/data/meaningful assertion silently removed: confirmed. The overlap sentence on the trip is still the shared `formatDay` sentence. Carry, cap, reset, and both buckets still come from the server. Intersecting day amounts are kept when dates change. The TUX-07 postcard and map behavior still passes in the same Playwright run.

## Verification

Commands ran in `/tmp/vivek-tux-08`. `make test-fast` used `PATH="/tmp/vivek-tux-08/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. The product tree did not change after the non-Playwright gates. The Playwright spec was corrected after the first full run, and the passing full run below includes that spec.

The first full Playwright command was FAIL: 191 passed and 3 failed, all in `pto-inspect.spec.js`. The phone and desktop date-edit tests waited on a choice label that required the radiogroup to be inside the label. The late-save test expected "Saved" from a response the trip page correctly ignores after a newer choice. The date-edit success check also matched the earlier date-save status. The spec was corrected. An isolated rerun of that file passed 7 of 7. The full suite was rerun and passed. The first command stays recorded as FAIL. The repaired run is the PASS row.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-08/.venv/bin:$PATH" make test-fast` | `6da2563c10835cae5274b013d6b5967e1747802e` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Travel e2e discovery listed 31 files, including `pto-inspect.spec.js`. The same command was run again after this evidence file existed and passed with the same counts. |
| `make lint-web` | `6da2563c10835cae5274b013d6b5967e1747802e` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | `6da2563c10835cae5274b013d6b5967e1747802e` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `6da2563c10835cae5274b013d6b5967e1747802e` | PASS. 425 SUCCESS. Statements 72.6% (5824/8022). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `6da2563c10835cae5274b013d6b5967e1747802e` | PASS. 71 pass / 0 fail. |
| `make build-frontends` | `6da2563c10835cae5274b013d6b5967e1747802e` | PASS. Output `/tmp/vivek-tux-08/dist/web`. Release `5699553ec553257398033f6bf114cd77f9d3ff6fb26c21159d1a4725753a851b`. Initial-bundle warning 677.57 kB. Exit 0. The Playwright run used that bundle. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `6da2563c10835cae5274b013d6b5967e1747802e` | First run FAIL: 191 passed, 3 failed (`pto-inspect.spec.js`). Isolated rerun of that file PASS: 7 passed. Second full run PASS: 194 passed. |

Python lint, Python typecheck, and the travel and server coverage gates were not run. The diff does not change Python. Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run. The diff does not change those screens.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/541 (`Closes #413` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
