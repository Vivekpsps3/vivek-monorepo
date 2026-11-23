# ROOM-11 — implementation evidence

- Leaf issue and parent(s): [#461](https://github.com/Vivekpsps3/vivek-monorepo/issues/461) ROOM-11. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#258](https://github.com/Vivekpsps3/vivek-monorepo/issues/258), and [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-11`; `/tmp/vivek-room-11`. The shared checkout was not edited. Town files outside `apps/web/src/app/town/health/`, Media, Travel, server code, and `apps/web/e2e` were not edited. `apps/finance/frontend/src/public-api.ts` and `packages/ui/src/return-context.ts` are unchanged.
- Base main SHA, current tested SHA: work started from `e2f1d28e27f4d067cb0c1e7ce79da5301a6ee004` (HEAL-05, pull request #568). The branch was fast-forwarded to `bcffbb260ec23b464dfb80f6f91f434ccd218fab` (SCENE-10, pull request #569). Product and tests are `89b0fb1d4331a8c913d69cbe848ceda4df5eb1cf`. The gates below ran on that tree. This note only records that SHA.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441), FIT-03 (#433), and FIT-04 (#434) are merged ancestors. `git fetch origin main` before the product commit left `origin/main` at `bcffbb260ec23b464dfb80f6f91f434ccd218fab`. No other pull request was open. Pixel scores were not changed. The gym floor uses the existing workout dialog and `HealthStoreService`. No second store and no new crypto protocol.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-11-A1 | Synthetic routine `hlt_SyntheticRoutinePlan01` (“Synthetic plan”, one planned set, 40 kg, 8 reps). Desk “Use this routine” opens Start session. Load 50 and reps 6 are added. Station “Record sets” reopens that same unsaved session. Bench “Finish workout” writes one completed session and leaves the routine ciphertext unchanged. A second bench visit says “Nothing to finish yet.” A saved draft finished from the bench keeps its client id and moves to revision 2. | PASS | `health-room.component.spec.ts` desk/station/bench and saved-draft tests. Browser journey below: one new `health_workouts` row, revision 1, routine ciphertext unchanged. |
| ROOM-11-A2 | Resume the synthetic draft, type load 77 and reps 9, then lock while those inputs are mounted. The room returns to locked, the inputs are gone, visible text has no digits and no “Synthetic”, and the draft ciphertext is unchanged and does not contain 77. Unlocking again shows the stored 5-rep set with empty open fields and revision 1. | PASS | `health-room.component.spec.ts` mid-set lock. Browser journey posts `finance-vault-sync-v1` while 77 and 9 are visible; ciphertext rows stay equal and storage does not contain 77 or “Synthetic plan”. |
| ROOM-11-LIFE | A failed bench finish shows “Could not save this workout. Try again.” and keeps the unsaved session. Retry writes one session. An owner change during “Complete session” cancels the upsert, leaves the workout rows unchanged, and does not store 77. | PASS | `health-room.component.spec.ts` failed finish and owner-change test. `upsertCancelled` is greater than 0. |
| ROOM-11-VIEW | 390×844 touch and 1280×800 keyboard, light and night (`suite-theme` light and dark), reduced motion. Locked, empty, setup, and direct visits stay useful. Clinic does not render the floor. Zoom and pan do not write `scale`, `x`, or `y`. Phone Escape closes only the sheet. Desktop Escape keeps `object`. Targets are at least 44px. Axe serious and critical violations on `app-health-room` are empty. Transition duration is 0s. Add session, Add routine, and Add exercise remain. | PASS | `health-room.component.spec.ts` locked/empty/direct visit. Uncommitted `/tmp/room-11-browser/gym-floor.spec.ts`: 4 passed. Existing `health-entry.spec.ts` gym visits still passed inside Town Playwright. |

Fixtures are synthetic. The routine name is “Synthetic plan” and the exercise is “Synthetic press”. No real workout, measurement, transaction, or credential is used. Health digits stay off the locked floor. The floor does not give medical advice.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior gym floor. The workout list, Add session, Add routine, Add exercise, and `app-health-workout-dialog` already opened the same records. | Health room gym route and `health-entry.spec.ts`. | `HealthStoreService` still owns `health_workouts`. The dialog remains the only set editor. The floor only opens that dialog. | Nothing deleted. The list stays as direct access. “Complete session” is a button on the existing dialog. | `git show --stat 89b0fb1d` adds the floor and does not remove the list or the store. |

- Candidate class and protected counterexamples: vault crypto, `public-api.ts`, return-context allowlists, Pixel scores, and the Town files outside health stay. Progress, trophies, medals, and the records list stay for ROOM-12.
- Comparison base SHA and full replacement closure (including new files): `bcffbb260ec23b464dfb80f6f91f434ccd218fab` through product `89b0fb1d4331a8c913d69cbe848ceda4df5eb1cf`. New production files: `gym-floor.ts`, `gym-floor.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +725/−2, net +723. Guidance is `FEATURES.md` and Town `AGENTS.md`, +2/−2, and is not in that production count. Town `AGENTS.md` stays at 300 words. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 gym floor. 1 / 1 workout dialog. 1 / 1 health store.
- State/cache owners and public entry points before/after: the durable floor selection is the `object` query on `/town/gym`. Camera zoom and pan stay in component memory. The in-memory `WorkoutDraft` is still the only open session. Finish calls `saveWorkout`. Lock still runs `clearLockSnapshots` and `dropPrivate`. Vault ciphertext is the allowed encrypted draft. `object` is not added to the vault return query, so unlock return stays entry-only.
- Remaining old symbol/path search, including config and discovery: no new e2e file under `apps/web/e2e`. The browser proof lives outside the repo so it does not collide with the Town date-visit specs. `public-api.ts` has no diff.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. ROOM-12 still owns the progress mezzanine and trophy cabinet. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +404/−0. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `ecb6c2ba3abf5c6c2ef3916f5e951c43fd01742444cf4e03e04a36f202ad55c9`. The initial bundle stays over the 650 kB warning budget at 680.17 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +723 production lines. This is the floor, its wiring into the health room, and “Complete session” on the existing dialog. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. Locked gym copy stays digit-free, including “Finance is locked. Unlock to see measurements.” An empty workout list still says “No workouts yet.”

## Verification

Commands ran in `/tmp/vivek-room-11` on `89b0fb1d4331a8c913d69cbe848ceda4df5eb1cf`. `make test-fast` and `make e2e` used `PATH="/tmp/vivek-room-11/.venv/bin:$PATH"`. Karma and Playwright used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-11` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (17) and not executed by this gate. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 521 SUCCESS. Statements 63.39% (7777/12267), branches 49.51% (3445/6958), functions 59.31% (1856/3129), lines 66.83% (6867/10275). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 628 SUCCESS. Statements 77.75% (9664/12428), branches 65.53% (4352/6641), functions 79.73% (2010/2521), lines 82.81% (8401/10144). |
| `make build-frontends` | PASS. Release hash above. Initial total 680.17 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 177 passed (1.7m). |
| `npx playwright test --project=suite` | PASS. 61 passed (46.6s). |
| `make e2e` | PASS. 281 passed, 5 skipped (2.0m). |
| `/tmp/room-11-browser` Playwright, not part of the launch list | PASS. 4 passed. 390×844 and 1280×800, light and dark, reduced motion, including lock mid-set. Screenshots stayed in `/tmp/room-11-browser/shots` and are not committed. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/570. The body is only the leaf keyword for #461.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the floor stays separate from these passing checks.
- Next actor: wait for required checks, then merge.
