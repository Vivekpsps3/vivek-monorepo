# PIX-03 — implementation evidence

- Leaf issue and parent(s): [#426](https://github.com/Vivekpsps3/vivek-monorepo/issues/426) PIX-03. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#311](https://github.com/Vivekpsps3/vivek-monorepo/issues/311) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited. #306 and #317 stay open.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/pix-03`; `/tmp/vivek-pix-03`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `2aa988de06a73a5c7c3600df41137e7bb986b66a` (PIX-02 merge, pull request #544). `git fetch origin main` on 2026-11-20 still returned that SHA. Commands ran on that base plus this working tree. The implementation commit is named in the follow-up that only edits this file.
- Fresh-main/prerequisite/active-PR checks: `gh pr list --state open` returned no pull requests, including none on private-routes or town-ui. #423 is merged as #544 and `origin/main` still has `/pixels/day`, `day-memory.ts`, and the year draft epoch. #384 is merged: dense tables, 44px controls, and the town axe journey remain. #426, #304, #311, #134, and #277 were open when this evidence was written.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PIX-03-A1 | Leap day 2024-02-29, Sunday 2024-02-25, and Monday 2024-02-26. Year grid, year table, and the life week agree on the Sunday span and the ISO span. The life week that contains the synthetic birthday 1990-05-04 and 2024-02-29 is 2024-02-29 through 2024-03-06. | PASS | `atlas.spec.ts`. `pixels-atlas.spec.ts` at 1280×800 light keyboard and 390×844 night touch. `life-week.component.spec.ts` and `life-page.component.spec.ts`. |
| PIX-03-A2 | Partial history says recorded time starts at the first suite day and earlier days are lived time with no suite data. A future day says it is ahead of today and is not a predicted end. The 90-row poster says that count is not a lifespan. The page does not say death, died, unlived, or end of life. | PASS | `atlas.spec.ts` coverage lines. `pixels-atlas.spec.ts` year 2024, life week, and future day 2026-12-31. `life-week.component.spec.ts`. |
| PIX-03-LIFE | A held life-day response titled "Foreign concept" does not replace the current week after the owner changes. A failed selected-day read leaves the span and focus in the URL and says the day is unavailable. Year still keeps a failed redate draft and clears it when the owner changes. | PASS | `life-page.component.spec.ts` losing day response. Existing `year-page.component.spec.ts` failed redate and `day-page.component.spec.ts` failed redate, still executed by the web Karma run. |
| PIX-03-VIEW | 1280×800 light keyboard and 390×844 night touch, reduced motion. "How activity colors work" is at least 44px. Atlas note transition duration is 0s. Axe serious and critical violations on `.pixels` are empty. Grid, table, Life, the day page, and back stay on the selected leap day. | PASS | `pixels-atlas.spec.ts` both viewports, including axe. |
| PLACE-07-ATLAS | Selecting 2024-02-29 keeps the same `data-score-vector` in the grid, in the table, and after Activity and By app. The compact preview names "Read synthetic" and "Leap harbor" and requests no thumbnail. | PASS | `pixels-atlas.spec.ts` both viewports. `atlas.spec.ts` `requestsThumbnails` is false and `safeRecordHref` rejects external and image URLs. The atlas journey counts `GET /api/pixels/day` and requires it to stay at most 12. |
| PLACE-07-COVER | Coverage and uncertainty stay visible for a partial year and for 2026-12-31. Photos and notes on the life preview say they are not connected. No preview renders an `img`. | PASS | `pixels-atlas.spec.ts` and `atlas.spec.ts`. |
| PLACE-07-PRIV | With age hidden, the life page says "Age is hidden", shows no full ISO date and no "Age N", and does not show the other owner's "Other trip", "Other habit", or "Foreign concept". Refresh, view switch, visit, and back keep `span=2024-02-29`. | PASS | `pixels-atlas.spec.ts` both viewports. Existing `pixels-life.spec.ts` still asserts the poster omits the birthday ISO date. |

Fixtures are synthetic records only. Names used are "Read synthetic", "Leap harbor", "Synthetic concept", and "Foreign concept". The life page assertion rejects a full ISO date in the rendered text. No personal date of birth was added to tests, logs, or the issue. Pixel scores still come from `packages/ui/pixels/pixels-score.ts` through `GET /api/pixels`. There is no second atlas store. The compact preview is text. Year asks for the selected day only. Life asks for one selected day through the existing `loadDay`.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Lifespan total `Week ${index} of ${rowCount * 52}` and `lifeWeekOrdinal` in `life-week.component.ts` / `life-model.ts` on base `2aa988de`. Shell subtitle "Your suite activity, one square at a time." | The life week detail rendered the ordinal. The shell rendered the subtitle. | `atlas.ts` coverage copy and `life-week.component.ts` `place()`. Score stays in `pixels-score.ts`. Day facts stay the PIX-02 projection. Sunday weeks stay `sundayOnOrBefore`. | Removed `lifeWeekOrdinal` and the "Week N of N" sentence. `place()` now says the row is one year of the poster, not an end date. The shell subtitle is "Recorded activity, without judgement." Grid, table, day route, score, and draft epoch stay. | `git grep lifeWeekOrdinal` on this tree is empty. `life-week.component.spec.ts` expects "not an end date" and rejects 4,680. The atlas journey rejects 4680 and the end-date words. |

- Candidate class and protected counterexamples: feature replacement of the lifespan total and the generic subtitle. The year grid geometry, life poster geometry, score engine, fact projection, and PIX-02 day route stay. Photos and notes stay unconnected on purpose.
- Comparison base SHA and full replacement closure (including new files): `2aa988de06a73a5c7c3600df41137e7bb986b66a`. New production files: `atlas.ts` (198), `atlas.css` (104), `atlas-note.component.ts` (13), `atlas-note.component.html` (10), `memory-preview.component.ts` (15), `memory-preview.component.html` (27). Changed production files: day detail, year page, life page, life week, life poster, life model, pixels shell, `pixels.css`, and `apps/web/src/app/pixels/AGENTS.md`.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat, including new files and the Pixels AGENTS file, is +609/−41, net +568. Blank-only lines are not split out. `life-model.ts` is −4. The Pixels AGENTS file is 270 words.
- Independent equivalent implementations before/after: 1 / 1 score implementation. 1 / 1 day-fact projection. 1 / 0 lifespan ordinal. 0 / 1 compact preview (`compactMemoryPreview`).
- State/cache owners and public entry points before/after: `GET /api/pixels` and `GET /api/pixels/day` are unchanged. Preferences `pixels.view` and `pixels.colorBy` stay in local storage. Year selection stays `year` and `day`. Life selection stays `span`. `focus` is the date inside the selected life week. Life uses the existing single-flight `loadDay`. A late or dropped day read does not write. Owner change increments the life generation and the preview request, then clears the preview.
- Remaining old symbol/path search, including config and discovery: `lifeWeekOrdinal` is gone. Town e2e discovery lists 13 files, including `pixels-atlas.spec.ts`. `pixels-settings.spec.ts` stays an owned omission. No second store path was added.
- Follow-up change: which production files and independent policy owners now need editing: a later photo or note leaf can fill the absent connector slots. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests and harness +510/−3, net +507, including `atlas.spec.ts` (204) and `pixels-atlas.spec.ts` (214). Docs are this evidence file and the Pixels AGENTS paragraph. No generated bundle is committed. `make build-frontends` exited 0. Release `e5bb64ee92bf3cb14f184195d13b8fe555f83e8088b199030d4c4286c5a9389d`. The existing initial-bundle warning remains (678.12 kB against the 650 kB warning budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +568 production lines. This is the feature: Sunday and ISO labels, coverage copy, the text preview, and the life selected-day read. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Grid and table, activity and app colors, the score vector, birthday hiding, the day route, year draft recovery, and the finance slot states still pass. The selection mark is a cross and a dashed poster rect, so it does not depend on hue alone. Cell size is unchanged.

## Verification

Commands ran in `/tmp/vivek-pix-03`. `make test-fast` used `PATH="/tmp/vivek-pix-03/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Neither symlink is committed.

An earlier town Playwright run, before `make build-frontends`, received the workspace-updating response because `dist/web/browser/index.csr.html` was missing. The recorded Playwright run used the release above. An earlier 390 atlas attempt used `click({ force: true })` on "View as table" and hit the open day sheet. The spec now sends a DOM click for covered year-toolbar controls at 390. Keyboard at 1280 still focuses the control and presses Enter. The leap cell, life view toggle, day link, and back link use tap or keyboard. The recorded town run passed both viewports. A Karma run started in the shared checkout did not compile this worktree and is not evidence. No gate was weakened.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-pix-03/.venv/bin:$PATH" make test-fast` | working tree on `2aa988de`; implementation commit named in the follow-up | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Town e2e discovery listed 13 files. Suite discovery listed 12. Finance 49, travel 32, and media 27 were listed and not executed. Shared boundaries OK. |
| `make lint-web` | same tree | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | same tree | PASS. `tsc --noEmit` for web app, web spec, finance app, finance spec, packages, site app, and site spec. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | same tree | PASS. 462 SUCCESS. Statements 74.1% (6578/8876). Branches 59.69% (2610/4372). Functions 73.75% (1298/1760). Lines 78.91% (5709/7234). |
| `make build-frontends` | same tree | PASS. Output `/tmp/vivek-pix-03/dist/web`. Release `e5bb64ee92bf3cb14f184195d13b8fe555f83e8088b199030d4c4286c5a9389d`. Initial total 678.12 kB. Exit 0. The 650 kB warning was not treated as a failure and the budget was not raised. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/web/e2e/playwright.config.ts` | same tree, bundle above | PASS. 131 passed. Includes both `pixels-atlas.spec.ts` viewports: leap-day grid and table, life span, partial and future coverage, and no thumbnail request. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --project=suite` | same tree, bundle above | PASS. 61 passed. |
| `make lint-python` | — | NOT RUN. The diff has no Python product file. |
| `make typecheck-python` | — | NOT RUN. The diff has no Python product file. |
| `./scripts/coverage-gate.sh server` | — | NOT RUN. The diff has no Python product file. |

Finance Karma, site Karma, Travel and Media coverage, Finance Playwright, Travel Playwright, and Media Playwright were not run. The diff does not change those screens. The suite project passed. `python3 planning/implementation/plan.py launch PIX-03` printed the docs and web_front profiles that the table above covers.

## Handoff

- PR URL (leaf closure keyword only): not opened yet.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: #304, #311, #134, and #277 stay open. #306 and #317 stay open. This leaf does not deploy.
- Next actor: commit, push, open the pull request, wait for green required checks, then merge with a merge commit.
