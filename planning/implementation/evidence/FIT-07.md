# FIT-07 — implementation evidence

- Leaf issue and parent(s): [#438](https://github.com/Vivekpsps3/vivek-monorepo/issues/438) FIT-07. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90), and roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stay open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/fit-07`; `/tmp/vivek-fit-07`. The shared checkout was not used for source edits. Finance, Travel, Media, and server files were not edited by this leaf.
- Base main SHA, current tested SHA: branch started at `df970e356ce8be8198b5bd3fa5543d359b2943d2` (GAME-10, pull request #598). `git fetch origin main` during the work moved main to `49bb1d1c` (pull request #594). That history was merged, not rebased. Implementation commit `0f1df533f828bda6cc3d0b49ff8147841ae04170`. Tested merge `04d38de2`. Commands below ran on that merge.
- Fresh-main/prerequisite/active-PR checks: FIT-03 (#433) and NAV-04 (#389) are merged. At the pre-PR check, #438, #304, #90, #134, and #277 were open. No other pull request was open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIT-07-A1 | Start, pause, and reset a local count-up rest clock in the open session. Leave, cancel, the clinic route, and Finance lock dispose the clock. The locked gym shows no exercise name and no health digits. Resume opens the same saved draft with the timer idle. | PASS | `health-room.component.spec.ts` “disposes the rest timer on leave and lock and keeps the saved session”. Town Playwright “pauses, leaves, locks, and resumes the same session without a tick or the exercise name” at 1280×800 and 390×844, light and dark. Captures in `/tmp/fit-07-captures/` (not committed). |
| FIT-07-A2 | Sound off and reduced motion still show Start rest, Pause rest, and Reset rest. No tick is constructed. With Town sound on and motion allowed, one short tick plays only while the session stays open, and pause or cancel stops it. | PASS | The same four Playwright journeys assert `data-rest-audio="off"`. “plays a tick only while the session is open and sound is on” arms one context for synthetic owner 987, counts a tick at 0:01, and closes it on cancel. Dialog spec covers sound, hide, reduced motion, and reopen. |
| FIT-07-LIFE | A failed save keeps the typed note, the entered set, and the running clock. The saved ciphertext has no timer fields. Lock drops the private view. Unlock and Resume restore the saved draft, idle. | PASS | The room spec above, including the failed upsert, the decoded `health_workouts` row, and `lockFinance`. The timer is component state, not a vault collection. |
| FIT-07-VIEW | 1280×800 and 390×844, light and night, keyboard and touch, reduced motion. The three controls are at least 44px. The dialog does not overflow. Focus returns to Resume after Cancel. Axe serious and critical violations on the room are empty while the timer is running and after lock. | PASS | The four Town Playwright journeys. Reviewed captures show 0:01 Running, Start rest disabled, and Reset rest wrapping under the other two controls at 390. Locked gym captures show the floor and no exercise name. |

The clock is optional: it stays at 0:00 until Start rest. Pause freezes it. Reset returns idle and disposes the tick. It is not a notification, a reward, a Stamp, or a second store. The exercise name is not in the clock label, the tick, or the locked screen. Health digits stay hidden until unlock. No medical advice and no new crypto.

Fixtures are synthetic. The new name is “Synthetic press” and the note is “Synthetic kept”. Existing Health fixtures still say “Squat”. No personal workout, measurement, credential, or transaction was added.

Browser proof is the Town Playwright journeys plus review of the captures at `/tmp/fit-07-captures`. There is no separate browser tool in this session.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior rest timer. | None. | `HealthWorkoutDialogComponent` for an open session, using `rest-timer.ts`. | Nothing was deleted. The timer is not a `WorkoutDraft` field and not a vault collection. | `git diff 49bb1d1c...HEAD` adds the clock and its tests. `health/index.ts` and `HealthStoreService` are unchanged. |

- Candidate class and protected counterexamples: none. No prior rest timer existed, so none was deleted. Preserved: FIT-03 session drafts, entered sets, schema version 2, and the clinic and completed-session journeys.
- Comparison base SHA and full replacement closure (including new files): `49bb1d1c`. New production file `apps/web/src/app/town/health/rest-timer.ts`. Changed production files are the workout dialog template, component, and CSS.
- Production added/deleted/moved; comments/blank-only churn separately: production numstat is +339/−2, net +337. That is `rest-timer.ts` +137, the dialog component +167/−1, the dialog template +10, and the dialog CSS +25/−1. The outside-zone interval comment is inside the component count.
- Independent equivalent implementations before/after: 0 / 1 local rest clock. 1 / 1 encrypted Health store.
- State/cache owners and public entry points before/after: `HealthStoreService` still owns `health_stats`, `health_prs`, and `health_workouts` at schema version 2. The clock lives on the open session dialog and is cleared on close, destroy, and lock. The public stage barrel does not export it.
- Remaining old symbol/path search, including config and discovery: no old rest-timer symbol. Town e2e discovery still lists 23 files. `health-entry.spec.ts` stays inside the Town project. No notification service was added.
- Follow-up change: which production files and independent policy owners now need editing: none in this leaf. No queue, parent ledger, or coverage pin was edited by this leaf. The queue change in the merge came from main.
- Tests/docs/generated changes separately: tests +849. That is Town Playwright +271, the room spec +207, the dialog spec +227, and `rest-timer.spec.ts` +144. Docs are `FEATURES.md` +1/−1, `apps/web/src/app/town/AGENTS.md` +1/−1 (300 words), and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `36028de069bbd518721b5641b8983a09bb65e45d2994da3c9a793d99e723c356`. The existing initial-bundle warning remains (687.76 kB against the 650 kB warning budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +337 production lines. This is the feature. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. The existing Town Playwright file passed with the new journeys (220 passed).

## Verification

Commands ran in `/tmp/vivek-fit-07` on `04d38de2` except the launch row, which ran on the pre-merge working tree and did not edit the queue. Python commands used `PATH="/tmp/vivek-fit-07/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to that Chrome. `node_modules` is a symlink to the shared install. Neither the symlink nor the virtualenv is committed.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-fit-07/.venv/bin:$PATH" python3 planning/implementation/plan.py launch FIT-07` | working tree before `04d38de2` | PASS. Printed the command list below. It did not edit the queue. |
| `PATH="/tmp/vivek-fit-07/.venv/bin:$PATH" make test-fast` | `04d38de2` | PASS. Doc paths OK. Planning validation PASS (103 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Town e2e discovery listed 23 files. Suite discovery listed 12. Finance 50, travel 35, and media 31 were listed and not executed. |
| `make lint-web` | `04d38de2` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | `04d38de2` | PASS. `tsc --noEmit` for web app, web spec, finance app, finance spec, packages, site app, and site spec. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `04d38de2` | PASS. 707 SUCCESS. Statements 78.13% (11753/15042). Branches 65.79% (5204/7910). Functions 80.49% (2521/3132). Lines 83.34% (10225/12269). |
| `PATH="/tmp/vivek-fit-07/.venv/bin:$PATH" make build-frontends` | `04d38de2` | PASS. Output `/tmp/vivek-fit-07/dist/web`. Release `36028de069bbd518721b5641b8983a09bb65e45d2994da3c9a793d99e723c356`. Initial total 687.76 kB. Exit 0. The 650 kB warning was not treated as a failure and the budget was not raised. |
| `PATH="/tmp/vivek-fit-07/.venv/bin:$PATH" npx playwright test --config apps/web/e2e/playwright.config.ts` | `04d38de2` | PASS. 220 passed (3.2m), including the five rest-timer journeys. |
| `PATH="/tmp/vivek-fit-07/.venv/bin:$PATH" npx playwright test --project=suite` | `04d38de2` | PASS. 61 passed (1.1m). |

Python lint, Python typecheck, and the Python coverage gates were not run. This leaf's diff does not change Python. Finance Karma, Finance Playwright, Travel Playwright, Media Playwright, and site Karma were not run. This leaf's diff does not change those screens.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/600 (`Closes #438` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: #304, #90, #134, and #277 stay open. This leaf does not deploy.
- Next actor: wait for green required checks on pull request #600, then merge with a merge commit. The tested merge is `04d38de2`.
