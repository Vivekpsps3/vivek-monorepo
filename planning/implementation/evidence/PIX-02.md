# PIX-02 — implementation evidence

- Leaf issue and parent(s): [#423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423) PIX-02. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#306](https://github.com/Vivekpsps3/vivek-monorepo/issues/306), [#311](https://github.com/Vivekpsps3/vivek-monorepo/issues/311), and [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/pix-02`; `/tmp/vivek-pix-02`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `269a966f2591d2274af9b3ae7fa0b37ef5a96e76` (PIX-01 merge, pull request #543). `git fetch origin main` on 2026-11-20 still returned that SHA. The implementation and these command results are the first commit on this branch. The follow-up only records that SHA in this file.
- Fresh-main/prerequisite/active-PR checks: `gh pr list --state open` returned no pull requests, including none on private-routes or town-ui. #421 is closed and `origin/main` still serves `GET /api/pixels/day` from `apps/server/pixels/router.py`. #387 is closed and the `/pixels` return allowlist still keeps `year` and `day`. #384 is closed. The new day journey passed axe on the existing theme at 390 night and 1280 light. #423, #304, #306, #311, #317, #134, and #277 were open when this evidence was written.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PIX-02-A1 | Open leap day 2024-02-29 from the 2024 year grid, then from the life week that starts 2024-02-29. Unlock link, browser back, and reload keep `/pixels/day` with that date and the originating year or span. The back link returns to `/pixels?year=2024&day=2024-02-29` or `/pixels/life?span=2024-02-29`. History back and reload restore the day page. | PASS | `apps/web/e2e/pixels-day.spec.ts` at 1280×800 light keyboard and 390×844 night touch. `day-route.spec.ts`, `day-page.component.spec.ts`, `life-page.component.spec.ts`, `return-context.spec.ts`. |
| PIX-02-A2 | After a real vault unlock, the first `GET /api/vault/records` returns 500. The finance slot says "Finance is unavailable." The same sentence remains after Back to 2024. The copy does not say "no data". Locked, before unlock, stays "Finance is locked." | PASS | `pixels-day.spec.ts` both viewports. `day-memory.spec.ts` and `year-stats.component.spec.ts` and `life-week.component.spec.ts` distinguish locked, expired, unavailable, no plan, and no budget activity. |
| PIX-02-LIFE | A held 2024-02-29 snapshot and fact response do not replace March 1 after navigation. A failed redate keeps the typed draft. `userChanged` clears it. The draft epoch does not change when only the date changes. | PASS | `day-page.component.spec.ts` late response and failed redate. |
| PIX-02-VIEW | 1280×800 light keyboard and 390×844 night touch. Open, unlock, and back targets are at least 44px. Reduced motion keeps transition duration at 0s. Axe serious and critical violations on `.pixels` are empty. Night theme is `data-theme=dark`. | PASS | `pixels-day.spec.ts` both viewports, including axe. |
| PLACE-13-RECAP | The recap names "Read synthetic" and says weekly review is not available. The recap has no anchor. Photos and notes stay absent, with no link and no private-note text. The score attribute contains the date and not the record title. | PASS | `pixels-day.spec.ts` and `day-detail.component.spec.ts` and `day-memory.spec.ts`. |

Fixtures are synthetic records only. Names used are "Read synthetic", "Leap harbor", "Synthetic concept", "Foreign concept", and "Late harbor". The seed private-note string is asserted absent from the page. No personal itinerary is in the tests, logs, or the issue. Pixel scores still come from `GET /api/pixels` counts. There is no second memory store.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Count-only day copy `townLine`, `mediaLine`, and `financeCopy`, plus the duplicate fact-article loop and "No dated facts on this day." | `day-detail.component.ts` and its template on base `269a966f`. Year and life pages rendered that detail. | Named records and coverage live in `day-memory.ts`. Score counts stay in `packages/ui/pixels/pixels-score.ts` and `GET /api/pixels`. Day facts stay the PIX-01 projection. | Removed the three copy functions and the duplicate fact loop. Retained the year query panel, coverage lines, differences, and learning annotations. | `git grep` of those three names finds them only on the base commit. Town Playwright still shows "Portland, day 2 of 4" and one Town link. Vault return still uses `/pixels?year=2026&day=2026-08-15`. |

- Candidate class and protected counterexamples: feature replacement of the count-only explanation. The year grid, life grid, score engine, and fact projection stay. Photos, notes, and the weekly review stay unconnected on purpose.
- Comparison base SHA and full replacement closure (including new files): `269a966f2591d2274af9b3ae7fa0b37ef5a96e76`. New production files: `day-memory.ts` (243), `day-page.component.ts` (210), `day-page.component.html` (37), `day-route.ts` (46). Changed production files include day detail, life page and week, year stats, pixels routes, return allowlist, route manifest, and `apps/web/src/app/pixels/AGENTS.md`.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat, including new files and the Pixels AGENTS file, is +874/−112, net +762. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 1 score implementation. 1 / 1 day-fact projection. The year panel and the day page both call `buildDayMemory`.
- State/cache owners and public entry points before/after: `GET /api/pixels` and `GET /api/pixels/day` are unchanged. `/pixels/day` is a new route. Return allowlist gains that pathname. Draft epoch still bumps on finance clear and user change only.
- Remaining old symbol/path search, including config and discovery: `townLine`, `mediaLine`, and `financeCopy` are gone from the worktree. Town e2e discovery lists 12 files, including `pixels-day.spec.ts`. The day route is in `routes.json` and `route-examples.json`.
- Follow-up change: which production files and independent policy owners now need editing: a later photo, note, or weekly-review leaf can fill the absent slots. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests and harness +730/−13, net +717, including `pixels-day.spec.ts` (186) and the seed trip "Leap harbor". Docs are the Pixels AGENTS paragraph, 239 words. No generated bundle is committed. `make build-frontends` exited 0. Release `12f6477afaae3acf284ae7df4a430ba0debfe24b6ceab920aa0f644bc73eff7f`. The existing initial-bundle warning remains (678.12 kB against the 650 kB warning budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +762 production lines. This is the feature: the day route, named slots, and the honest finance and recap states. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Year panel, Portland copy, Hub pixels links, vault return, and activity return still pass. Score math is untouched.

## Verification

Commands ran in `/tmp/vivek-pix-02`. `make test-fast`, `make lint-python`, `make typecheck-python`, and `./scripts/coverage-gate.sh server` used `PATH="/tmp/vivek-pix-02/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Neither symlink is committed.

The first `make test-fast` was FAIL: `apps/web/e2e/pixels-day.spec.ts` imported the Finance e2e vault directly. It now imports `tests/e2e/synthetic-vault-harness.ts`. The repaired run passed. The first `make typecheck-web` was FAIL on two spec nullability errors. The repaired run passed. The first Karma run was FAIL: the named-trip fixture left travel coverage absent, so the record list was empty. The fixture now marks that coverage ok. The repaired run passed. No gate was weakened. The coverage pin stayed 61.87. The floor stayed 61.53.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-pix-02/.venv/bin:$PATH" make test-fast` | first commit on `agent/pix-02` | First run FAIL as noted above. Repaired run PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Town e2e discovery listed 12 files. Shared boundaries OK. |
| `make lint-web` | first commit on `agent/pix-02` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | first commit on `agent/pix-02` | First run FAIL as noted above. Repaired run PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | first commit on `agent/pix-02` | First run FAIL as noted above. Repaired run PASS. 454 SUCCESS. Statements 73.8% (6414/8691). Branches 59.38% (2518/4240). Functions 73.46% (1271/1730). Lines 78.6% (5556/7068). |
| `make build-frontends` | first commit on `agent/pix-02` | PASS. Output `/tmp/vivek-pix-02/dist/web`. Release `12f6477afaae3acf284ae7df4a430ba0debfe24b6ceab920aa0f644bc73eff7f`. Initial-bundle warning 678.12 kB. Exit 0. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/web/e2e/playwright.config.ts` | first commit on `agent/pix-02` | PASS. 129 passed. Includes the leap-day unlock, back, reload, failed finance join, and both viewports. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --project=suite` | first commit on `agent/pix-02` | PASS. 61 passed. |
| `PATH="/tmp/vivek-pix-02/.venv/bin:$PATH" make lint-python` | first commit on `agent/pix-02` | PASS. 260 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 match the baseline. |
| `PATH="/tmp/vivek-pix-02/.venv/bin:$PATH" make typecheck-python` | first commit on `agent/pix-02` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | first commit on `agent/pix-02` | PASS. 432 passed. Total coverage 79.95%. Floor 61.53 reached. Pin left at 61.87. Perf gate `GET /api/town` passed. |

Finance Karma, site Karma, Travel and Media coverage, Finance Playwright, Travel Playwright, and Media Playwright were not run. The diff does not change those screens. The suite project, which those domains share with Town, passed. `python3 planning/implementation/plan.py launch PIX-02` printed the docs and web_front profiles that the table above covers.

## Handoff

- PR URL (leaf closure keyword only): opened after this evidence. The pull request body names #423 as the only issue with a closing keyword.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: #304, #306, #311, #317, #134, and #277 stay open. This leaf does not deploy.
- Next actor: wait for green required checks, then merge with a merge commit.
