# PIX-01 — implementation evidence

- Leaf issue and parent(s): [#421](https://github.com/Vivekpsps3/vivek-monorepo/issues/421) PIX-01; parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#306](https://github.com/Vivekpsps3/vivek-monorepo/issues/306). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/pix-01`; `/tmp/vivek-pix-01`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `68014faf16fe92538309b45cefb2eceaa9eb1d2d` (TUX-09 merge, pull request #542). The implementation and these command results are `182ba773e3037a6c1152fe53e204c510b9297685`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `68014faf16fe92538309b45cefb2eceaa9eb1d2d`. TUX-09 is that merge. `gh pr list --state open` returned no pull requests. No open town-models or private-routes pull request. #421, #304, #306, #134, and #277 were open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PIX-01-A1 | Synthetic concept understood on 2026-08-15. Archive, redate to 2026-01-04, and delete. The dated annotation leaves the day. `GET /api/pixels` response bytes and the day score vector stay identical. | PASS | `apps/server/tests/test_pixels_day_facts.py` `test_day_facts_retract_without_changing_score_bytes`. `pixels-detail.spec.ts` archive at 1280 light keyboard. Score attribute stays `{"date":"2026-08-15","town":1,"media":0,"trip":1,"fin":null,"score":3,"level":2,"dominant":"travel"}`. |
| PIX-01-A2 | Fifty-five episodes and concepts on one day, a second owner, and one source failure. The fact list caps at 50. Foreign rows stay out. A missing concept table is absent. A held Aug 15 response does not publish after Aug 14 is opened. | PASS | `test_rich_history_stays_bounded_and_owner_scoped`, `test_one_source_failure_keeps_the_other_facts`, `test_missing_concept_table_is_absent`. `pixels-detail.spec.ts` held day. |
| PIX-01-LIFE | Owner change drops the in-flight day read and the annotation write. A 422 redate keeps the typed draft and the score vector. Lock and owner change start a new draft key. A refresh after a successful write keeps the current day until the replacement arrives, so a late body cannot replace a newer owner. | PASS | `pixels-data.service.spec.ts` owner change, redate failure, and deadline. `day-detail.component.spec.ts` draft epoch and day change. `year-page.component.spec.ts` losing day response. |
| PIX-01-VIEW | 1280×800 light keyboard archives. 390×844 night touch redates. Archive and Redate are at least 44px. Focus moves to the learning heading, and Escape returns to the day cell. Axe serious and critical violations are empty at both sizes in light and night. Reduced motion keeps transition duration at 0s. The global reduced-motion rule sets animation duration to 0.01ms. | PASS | `pixels-detail.spec.ts` keyboard, touch, axe, and reduced motion. `pixels-year.spec.ts` year table axe waits for the synthetic annotation. |
| PLACE-02-FACT | Each loaded fact has a stable id, occurrence, civil date, coverage, provenance, and route. Check-in route is `/town/`. Trip span carries start and end. Difference texts explain episode-versus-finished, trip-span-versus-credit, concept-not-score, and budget-versus-streak. No invented date or score. The rendered Town link is `/town`, which is how routerLink serializes `/town/`. | PASS | `test_day_facts_retract_without_changing_score_bytes`. `pixels-model.spec.ts` rejects a bad date, a `/finance/` route, a one-sided span, and a kind mismatch. `day-detail.component.spec.ts` score vector ignores `counts.town` 99. |
| PLACE-02-LEARN | Active understandings are annotations. Archive keeps the World concept and removes the Pixels annotation. Delete removes both. Redate moves the understood date in both. World week concepts for 2026-01-03 and 2026-01-04 share Monday 2025-12-29. Score bytes stay the same. Private notes are not returned. | PASS | Same API test, including the World week read. Browser archive and redate in `pixels-detail.spec.ts`. Phone redate to 2026-08-16 shows the annotation there and leaves Aug 15 score bytes unchanged. |
| PLACE-02-BOUND | Rich history stays at 50 included of 55, while the score count remains 55. User 2 does not see user 1's concept or check-in. One source exception marks that source unavailable and keeps the other facts and the score count. | PASS | Bound and failure tests above. Held-response Playwright test. |

Fixtures are synthetic records only. Names used in tests are "Synthetic concept", "Foreign concept", "Read synthetic", "Other habit", "Portland", and "Other trip". Private note strings in the seed are asserted absent from the page. No personal learning history is in the tests, logs, or the issue.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Pixel fact path | None. `GET /api/pixels` already returned sparse score counts. World concepts already owned archive, delete, and redate. | Score counts stay in `apps/server/pixels/router.py` and `packages/ui/pixels/pixels-score.ts`. Day facts are a projection in `apps/server/pixels/facts.py`. Concept writes stay on `/api/world/concepts`. | Retained the count query and the score engine. No second fact table, no score-channel change, and no new reviewed cross-feature import. | Boundary check passes. API bytes for `GET /api/pixels` match across archive, redate, and delete. Playwright score attributes match the year snapshot. |

- Candidate class and protected counterexamples: feature addition. There was no fact store to delete. Finance amounts stay off this response. Archived concepts stay in the World week and leave the Pixels annotation.
- Comparison base SHA and full replacement closure (including new files): `68014faf16fe92538309b45cefb2eceaa9eb1d2d`. New production file `apps/server/pixels/facts.py`. Changed production files: `apps/server/pixels/router.py`, `schemas.py`, `__init__.py`, `apps/server/AGENTS.md`, Pixels day detail, data service, model, types, year page, and `apps/web/src/app/pixels/AGENTS.md`.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat, including both AGENTS files and `facts.py`, is +1155/−13, net +1142. `facts.py` is 301 lines. Blank-only lines are not split out of that numstat.
- Independent equivalent implementations before/after: 1 / 1 score implementation, `pixels-score.ts`. 1 / 1 concept writer, the existing concept routes. Pixels calls those routes with its own HTTP client.
- State/cache owners and public entry points before/after: `GET /api/pixels` is unchanged. `GET /api/pixels/day` is a new read. The year snapshot still owns the displayed score. Day-fact requests use their own abort parent. A successful annotation write reloads that day only.
- Remaining old symbol/path search, including config and discovery: no fact table and no second score function. Town e2e discovery still lists 11 files. The new seed name is `pixels-facts`. `seed=pixels` stays free of concepts so the World learning journey keeps an empty concept list.
- Follow-up change: which production files and independent policy owners now need editing: a later Pixels leaf can read this day projection. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +913/−10, including `test_pixels_day_facts.py` (355 lines) and `tests/e2e/server.py`. Docs are inside the production numstat above. `apps/server/AGENTS.md` is 298 words. `apps/web/src/app/pixels/AGENTS.md` is 192 words. No generated bundle is committed. `make build-frontends` exited 0. Release `1780f9c03a74be289b068c27548cbe5d52ec7d9ba150d16a170bd8d33593a163`. The existing initial-bundle warning remains (678.03 kB against the 650 kB warning budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1142 production lines. This is the feature: the day projection, the annotation controls, and the lifecycle around them. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Year grid class, Portland copy, Hub `/api/pixels` pathname, and the World learning journey still pass. Score math is untouched.

## Verification

Commands ran in `/tmp/vivek-pix-01`. `make test-fast`, `make lint-python`, and `make typecheck-python` used `PATH="/tmp/vivek-pix-01/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Neither symlink is committed.

The first `make test-fast` was FAIL: `apps/server/AGENTS.md` was 314 words. It is 298 after the trim. The next run was FAIL: Pixels imported the World client. Annotation writes now call `/api/world/concepts` through the Pixels HTTP client. One run used system `python3` and missed alembic. The repaired command below passed. No gate was weakened. The coverage pin stayed 61.87. The floor stayed 61.53.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-pix-01/.venv/bin:$PATH" make test-fast` | `182ba773e3037a6c1152fe53e204c510b9297685` | First runs FAIL as noted above. Repaired run PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Town e2e discovery listed 11 files. Shared boundaries OK. The same command is run again after this evidence file exists. |
| `make lint-web` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. 442 SUCCESS. Statements 73.24% (6098/8325). Branches 58.31% (2347/4025). Functions 73% (1214/1663). Lines 78.09% (5291/6775). |
| `make build-frontends` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. Output `/tmp/vivek-pix-01/dist/web`. Release `1780f9c03a74be289b068c27548cbe5d52ec7d9ba150d16a170bd8d33593a163`. Initial-bundle warning 678.03 kB. Exit 0. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/web/e2e/playwright.config.ts` | `182ba773e3037a6c1152fe53e204c510b9297685` | First run 121 passed and 3 failed (Town href serialization, phone sheet locator, and the World learning journey seeing a concept in `seed=pixels`). Repaired run PASS. 124 passed. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --project=suite` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. 61 passed. |
| `PATH="/tmp/vivek-pix-01/.venv/bin:$PATH" make lint-python` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. 260 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 match the baseline. |
| `PATH="/tmp/vivek-pix-01/.venv/bin:$PATH" make typecheck-python` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | `182ba773e3037a6c1152fe53e204c510b9297685` | PASS. 431 passed. Total coverage 79.95%. Floor 61.53 reached. Pin left at 61.87. `facts.py` 96.30% (81 statements, 3 missed). Perf gate `GET /api/town` passed. |

Finance Karma, site Karma, Travel and Media coverage, Finance Playwright, Travel Playwright, and Media Playwright were not run. The diff does not change those screens. The suite project, which those domains share with Town, passed.

## Handoff

- PR URL (leaf closure keyword only): after the pull request is opened. The body uses `Closes #421` only.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: #304, #306, #134, and #277 stay open. This leaf does not deploy.
- Next actor: wait for green required checks, then merge with a merge commit.
