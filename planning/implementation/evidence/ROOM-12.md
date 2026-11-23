# ROOM-12 — implementation evidence

- Leaf issue and parent(s): [#462](https://github.com/Vivekpsps3/vivek-monorepo/issues/462) ROOM-12. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#257](https://github.com/Vivekpsps3/vivek-monorepo/issues/257), [#258](https://github.com/Vivekpsps3/vivek-monorepo/issues/258), and [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-12`; `/tmp/vivek-room-12`. The shared checkout was not edited. Town files outside `apps/web/src/app/town/health/`, Media, Travel, server code, and `apps/web/e2e` were not edited. `apps/finance/frontend/src/public-api.ts` is unchanged.
- Base main SHA, current tested SHA: work started from `087344d41e933ae6a9f6f6342b9ed4d884b5e36a` (ROOM-11, pull request #570). The branch was fast-forwarded to `be4d4e3c2855724a8b040310415ae2226b7f0359` (SCENE-06, pull request #571). Product and tests are `548bccbc8fa0267c18dedbd906f00e53dbf1faaf`. The gates below ran on that tree. This note only records that SHA.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441), FIT-05 (#435), and FIT-06 (#437) are merged ancestors. `git fetch origin main` before the product commit left `origin/main` at `be4d4e3c2855724a8b040310415ae2226b7f0359`. Pixel scores were not changed. The wall and cabinet read `projectHealthProgress` and `HealthStoreService`. No second store and no new crypto protocol.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-12-A1 | Synthetic squats `hlt_SyntheticWallLift00001` through `hlt_SyntheticWallLift00013` (80–92 kg, 1 rep, 2026-10-01 through 2026-10-13) and run `hlt_SyntheticRunEntryABCDE` (5000 m, 1500 s, 2026-10-20). Deleting `hlt_SyntheticWallLift00013` with `DELETE LIFT` shows the previous squat and drops the 92 kg pound text. The chart then includes 2026-10-01 and omits nothing. The unit replay of a 110 kg best over a 90 kg older lift returns 90.0 kg and one history point after the best is gone. | PASS | `health-progress.spec.ts` charts every attempt. `health-room.component.spec.ts` deletes the current lift and expects the 90 kg display. Browser journey below. |
| ROOM-12-A2 | `health.constants.ts` is not in the diff, so the twenty badge names and thresholds stay. The ready cabinet shows First lift PR, First run PR, PR breaker, One plate, and 5K finisher, and it does not show Two plates, Marathon finisher, Four plates, or 52-week logger. A medal uses a dashed border and the minigame sentence. A trophy uses a solid accent bar. A locked gym, including the selected wall, has no digit in visible text or input values and does not show Squat or a badge name. | PASS | `health-room.component.spec.ts` renders every `HEALTH_BADGES` key and keeps medal text off those names. `health.constants.spec.ts` still names the twenty badges. Browser journey below, locked and ready. |
| ROOM-12-LIFE | Applying 1899-01-01 keeps that typed value, focuses “Use a real date from 1900 through today.”, and leaves the last valid chart in place. A failed lift save keeps reps 8 and the typed from date. An owner change during a held list hides the chart and the date field, drops Squat and every digit, and reopens with an empty from field. | PASS | `health-progress.spec.ts` rejects 1899-01-01 and a reversed range. `health-room.component.spec.ts` failed save and owner change. Browser journey keeps the one-day chart after the rejected date. |
| ROOM-12-VIEW | 390×844 touch and 1280×800 keyboard, light and night (`suite-theme` light and dark), reduced motion. Locked, empty, and direct visits stay useful. Clinic does not render the mezzanine. Zoom does not write `scale`, `x`, or `y`. Phone Escape closes only the sheet. Desktop Escape keeps `up`. Targets are at least 44px. Axe serious and critical violations on `app-health-room` are empty. Transition duration is 0s. Show the chart focuses the exercise select. Show the cabinet focuses the cabinet title. | PASS | `health-room.component.spec.ts` chart, cabinet, and locked visit. Uncommitted `/tmp/room-12-browser/progress-wall.spec.ts`: 4 passed. Existing `health-entry.spec.ts` gym visits still passed inside Town Playwright. |

Fixtures are synthetic. The exercises are Squat and a 5K. No real workout, measurement, transaction, or credential is used. Health digits stay off the locked room. The wall does not give medical advice. The chart keeps the newest 12 finite points in the applied window. Its SVG is `aria-hidden`. The table is the text alternative. Older points in range use the sentence “Older points in this range stay off this chart.”

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| The flat current and previous progress lines, the records list, the trophy list, and the medal cabinet. No prior upstairs scene. | Health room gym route and `health-entry.spec.ts`. | `HealthStoreService` still owns `health_prs` and `health_workouts`. `projectHealthProgress` still derives the best, the previous best, and the trophies. | Nothing deleted. The current and previous lines stay on the ready gym page. Records, trophies, and medals are grouped in the record cabinet. The chart and date controls render only when the room is ready. | `git show --stat 548bccbc` adds the mezzanine and does not remove the store, the edit ids, or the delete ids. |

- Candidate class and protected counterexamples: vault crypto, `public-api.ts`, Pixel scores, and the Town files outside health stay. `apps/web/e2e` was not edited.
- Comparison base SHA and full replacement closure (including new files): `be4d4e3c2855724a8b040310415ae2226b7f0359` through product `548bccbc8fa0267c18dedbd906f00e53dbf1faaf`. New production files: `gym-mezzanine.ts`, `gym-mezzanine.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +976/−54, net +922. The gym-floor change is one comment line inside that count. Guidance is `FEATURES.md` and Town `AGENTS.md`, +4/−4, and is not in that production count. Town `AGENTS.md` is 298 words. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 upstairs scene. 1 / 1 progress projector. 1 / 1 health store. Game medals stay a presenter, not a store.
- State/cache owners and public entry points before/after: the durable upstairs selection is the `up` query on `/town/gym`. Camera zoom and pan stay in component memory. The applied date window is component state, and lock or an owner change clears it through `dropPrivate`. `up` is not added to the vault return query, so unlock return stays entry-only.
- Remaining old symbol/path search, including config and discovery: no new e2e file under `apps/web/e2e`. The browser proof lives outside the repo so it does not collide with the Town date-visit specs. `public-api.ts` has no diff. `health.constants.ts` has no diff.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +238/−1. This evidence file is docs. No generated bundle is committed. `make build-frontends` ran inside `make e2e` and exited 0. Release `412835cd155ae197a89d265aefe34cb9fcfc87692b4da6023b09101282190822`. The initial bundle stays over the 650 kB warning budget at 680.38 kB. The budget was not raised. The health room chunk is 131.45 kB. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +922 production lines. This is the upstairs scene, the bounded chart and table, and the cabinet grouping. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. Locked gym copy stays digit-free, including “Finance is locked. Unlock to see measurements.” An empty progress list still says “No progress yet.” Deleting the current best still restores the previous valid result.

## Verification

Commands ran in `/tmp/vivek-room-12` on `548bccbc8fa0267c18dedbd906f00e53dbf1faaf`. `make test-fast` and `make e2e` used `PATH="/tmp/vivek-room-12/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to that same Chrome. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-12` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (18) and not executed by this gate. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 521 SUCCESS. Statements 63.34% (7770/12267), branches 49.51% (3445/6958), functions 59.22% (1853/3129), lines 66.77% (6861/10275). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 638 SUCCESS. Statements 77.58% (10057/12963), branches 65.24% (4504/6903), functions 79.55% (2121/2666), lines 82.65% (8738/10572). |
| `make build-frontends` | PASS, as the first step of `make e2e`. Release hash above. Initial total 680.38 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 180 passed (2.0m). |
| `npx playwright test --project=suite` | PASS. 61 passed (53.2s). |
| `make e2e` | PASS. 281 passed, 5 skipped (2.4m). |
| `/tmp/room-12-browser` Playwright, not part of the launch list | PASS. 4 passed (14.0s). 390×844 and 1280×800, light and dark, reduced motion, including the locked room. Screenshots stayed in `/tmp/room-12-browser/shots` and are not committed. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/572. The body is only the leaf keyword for #462.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the wall stays separate from these passing checks.
- Next actor: wait for required checks, then merge.
