# GAME-11 — implementation evidence

- Leaf issue and parent(s): [#480](https://github.com/Vivekpsps3/vivek-monorepo/issues/480) GAME-11. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/game-11`; `/tmp/vivek-game-11`. The shared checkout was not edited. Media, Travel, Finance, Health, Gym, and server product files were not edited.
- Base main SHA, current tested SHA: product and tests are `cdf3614e131c636370eaf6be5b8d68c5c09d2e09`. Every gate below ran on that tree before this evidence file. The branch started at `bb7666003280c4817d563f278df2a8669c9feb9d`.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441) and NAV-04 (#389) are present on this base. Library cutaway routes and the settings Game group, including Open Town, are on `bb766600`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/480#issuecomment-7228436015). Fetch before this note still has `origin/main` at `bb766600`. Chapter Stamp amounts were not changed. The game grants no Stamps, currency, medals, or life records.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-11-A1 | Empty account `town-empty`. Lantern Tide is 16 original lanes, 1.8s apart, inside 30 seconds. Timed and untimed finishes are both wins. A wrong tap scores 0% and does not advance the sequence. A missed window still finishes as a win at 0% accuracy. | PASS | `harbor-rhythm.spec.ts`, `harbor-rhythm.component.spec.ts`, and `apps/web/e2e/town-rhythm.spec.ts` timed and untimed journeys. |
| GAME-11-A2 | Reduced motion hides traveling notes and keeps tones silent. Hiding the page pauses the chart and stops the clock. Pause, quit, and a closed tone dispose the timer and the audio context. Opt-in sound plays one original sine and no recording. | PASS | Playwright hide, pause, and tone journeys. Component specs cover sound off, sound on, reduced motion, and a stale tick. |
| GAME-11-LIFE | A throwing `sessionStorage` write keeps the open chart. Sign-out removes `town.harbor-rhythm.v1.` keys. An owner change during the write drops the previous key. Town, Media, and Pixels 503 responses still finish the untimed sequence. | PASS | Component specs for storage, owner switch, and `cleared$`. Playwright 503 and sign-out journeys. |
| GAME-11-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Pause, resume, restart, and quit work from the buttons and from P, R, and Q. Play, lanes, Pause, Restart, and Quit are at least 44px. Arrow keys move between lanes. Return to Town restores the open lane and focuses Harbor Rhythm. Axe serious, critical, and color-contrast violations on `app-harbor-rhythm` are empty. No horizontal scroll. | PASS | Eleven Playwright journeys inside the Town suite. Screenshots were attached in the run and were not committed. |

Fixtures are synthetic. The score is accuracy. Pause freezes the clock and ignores lane input. Quit keeps the last finished accuracy in this tab only. Compact Hub stays home. The Arcade building was not retargeted.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Town Harbor Rhythm page. The Media arcade table and music-bar stage are separate. | The Arcade building links to `/media/library?kind=game`. | `harbor-rhythm.ts` and `HarborRhythmComponent` on `/town/rhythm`. | The Media table and music stage were not edited. Town gained a header link, a switcher section, and a Game settings link. Open Town and Color theme remain. | `town.component.spec.ts` expects the header link. Town Playwright passed 324 tests, including the Media boundary. |

- Candidate class and protected counterexamples: Reading Hall, Hall, Home, Clinic, Gym, the weekly review, habit check-in, the cosmetic catalog, chapter rewards, and the Media arcade stay. No previous Town rhythm module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `bb7666003280c4817d563f278df2a8669c9feb9d`. New production files: `harbor-rhythm.ts`, the component, template, and stylesheet. Changed production files: Town routes, private Town section, Town header, return focus, Game settings, `routes.json`, and `route-examples.json`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1019/−3, net +1016, counted from `origin/main` to `cdf3614e`. Guidance and discovery +4/−4 (`town/AGENTS.md`, `docs/QUALITY.md`, `tests/e2e/discovery.mjs`, `scripts/check-e2e-discovery.test.mjs`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 Town Harbor Rhythm game. The Media arcade table remains a separate session and was not changed. 0 / 0 currency wallet.
- State/cache owners and public entry points before/after: `/town/rhythm` is the public entry. The chart and last finished accuracy live in `sessionStorage` under `town.harbor-rhythm.v1.<ownerId>`. Sign-out and an owner change clear that prefix. A storage failure keeps the in-memory chart. Town sound stays in the existing scene preference. Nothing is posted to Town, Media, Pixels, or Health.
- Remaining old symbol/path search, including config and discovery: `town-rhythm.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`. The private route pattern includes `rhythm` beside `memory`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited. Minigame receipts stay with GAME-12.
- Tests/docs/generated changes separately: tests +796/−0. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `61883377c8bb7fdd4591175f77606fea9c45fa58031efbc095cd7a1f18ec6969`. The initial bundle stays over the 650 kB warning budget at 732.92 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1016 production lines. This is the feature: a 30-second four-lane chart, an untimed sequence, accuracy, pause, quit, restart, and opt-in tones. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 324 tests.

## Verification

Commands ran in `/tmp/vivek-game-11` on `cdf3614e` before this evidence file. `make test-fast` used `PATH="/tmp/vivek-game-11/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at that Chromium. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. `apps/server/tests/test_route_parity.py` ran because `routes.json` and `route-examples.json` changed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch GAME-11` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`, `make build-frontends`, `npx playwright test --config apps/web/e2e/playwright.config.ts`, and `npx playwright test --project=suite`. It does not edit the queue. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=28. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 776 SUCCESS. Statements 78.11% (13063/16723), branches 66.15% (5943/8983), functions 80.49% (2843/3532), lines 83.51% (11373/13618). |
| `make build-frontends` | PASS. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 324 passed (6.1m), including eleven Harbor Rhythm tests. |
| `npx playwright test --project=suite` | PASS. 75 passed (2.2m). |
| `/tmp/vivek-game-11/.venv/bin/python3 -m pytest -q apps/server/tests/test_route_parity.py -m "not perf"` | PASS. 50 passed, 1 skipped, 1 warning. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/653. The body is only `Closes #480`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet.
- Remaining external prerequisites or approved scope decisions: no receipt integration, so this game grants no currency, medals, or Stamps. No deployment.
- Next actor: review and merge this leaf only.
