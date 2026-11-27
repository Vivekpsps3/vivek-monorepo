# FIXUP-29 — Make repeated set logging the Gym editor’s main flow

- Leaf issue and parent(s): [#617](https://github.com/Vivekpsps3/vivek-monorepo/issues/617) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-29`, worktree `/tmp/vivek-fixup-29`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/617#issuecomment-7228047732). No subagents. The shared checkout was not edited. Chapter, quest, discovery, resident, server, Travel, Finance, and Media files were not edited.
- Base main SHA `f6782b7c7dbfaa67903ac743ecec1ffd15f2b97b`. Tested product SHA `37e7798e95536f12652e5a4766d812099d035ae2`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree. FIT-03 (#433, PR #556, `e8ff90ea`), FIT-04 (#434, PR #559, `e7a5e16b`), and FIT-07 (#438, PR #600, `e5e1fde3`) are ancestors of that base and of `origin/main` `bb7666003280c4817d563f278df2a8669c9feb9d`. Session floor, routine/session copy, and the local rest timer stay. On fresh main a blank Add session was still `completed` and offered Save plus Complete session; Load and Reps sat under the rest timer; Add set left focus on the button; saved rows had reorder and remove without an in-place correction. GAME-04 (#479) merged as #651 while this leaf was open. Its Town chapter files are not in this diff. FIXUP-27 stayed on its own worktree.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-29-A1 | Synthetic vault at `/town/gym`. Add session at 390×844, touch, night, reduced motion. Measured on is focused. There is no state select. The form is `data-session-state="draft"`. Load, Reps, and Finish session are inside the viewport, and Load and Reps share a row. Synthetic press logs 100 lb × 5 and 80 lb × 3. Focus returns to an empty Load. Add exercise Synthetic run (time-distance) logs 90 seconds and 1 mile. Focus returns to Seconds. Edit set 1 changes reps from 5 to 6. The stored kilogram preview stays `lbToKg(100)` to two decimals. Edit set 2, Move earlier, so the 3-rep set is first. Set ids are unchanged. | PASS | `apps/web/e2e/health-entry.spec.ts` “logs, corrects, and finishes sets on a phone and a desktop”, inside `npx playwright test --config apps/web/e2e/playwright.config.ts` (311 passed). Dialog and workout unit specs cover the same focus and canonical-number path. |
| FIXUP-29-A2 | The same session: Save draft, leave, Resume the draft, and the same set ids are still there. Cancel. At 1280×800, light, reduced motion, keyboard: Switch to exercise 1, type 40 lb × 4, focus Add set, Enter. Load is focused and the session has 4 sets. Finish session is focused, one vault write fails, the dialog becomes Edit session, the alert is “Could not save this workout. Try again.”, `data-session-state` is `completed`, and Finish session is gone. Exact Save stores one completed row, `data-set-count="4"`, label “Session · 2 exercises”, and no draft row. Reopen at 1280 night and 390 light still shows Load and Save draft or Finish inside the viewport. Cancel leaves no extra record. Routines and exercises still use Save. Bench Finish workout is unchanged. | PASS | Same Playwright journey, plus the updated health-entry and health-room specs for draft resume, failed finish, and routine Save. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Session state select and “Complete session” beside Save | Blank Add session defaulted to completed and showed both controls | A new or resumed session is a draft. Save draft submits and keeps the draft. Finish session validates a completed copy, then saves. An already completed session shows Save only. Exercises and routines stay on Save. | Removed the competing completion control from routine logging. `finishAtBench` still forces completed. | Specs expect zero `#health-workout-state` and zero “Complete session”. The gym journey asserts draft, then completed only after Finish. |
| Always-visible Earlier, Later, and Remove on every saved set | Each logged row exposed reorder and removal while the next set was being entered | Edit discloses one set. Earlier, Later, Remove, and the set-type select appear only while that set is open. The count-toward-progress checkbox stays visible on a completed session without opening Edit. | Removed the repeated row controls from the logging view. Deliberate edit, reorder, and removal remain. | Phone journey has no Move earlier until Edit. Room specs open Edit before reorder or remove. |

- Candidate class and protected counterexamples: replacement of the session completion control and the always-on row controls. Schema v2, kilograms, metres, seconds, set ids, revisions, `logged_on` immutability, display-unit conversion, Health badges, completion meaning, Town chapter rewards, canonical editors, and existing routes stay.
- Comparison base SHA `f6782b7c7dbfaa67903ac743ecec1ffd15f2b97b`. Replacement closure is the four named Health workout files. No new production file. `health-room.component.ts` was not edited.
- Production added/deleted/moved: 508 added and 159 deleted across the dialog template, component, stylesheet, and `workout.ts`. Net +349. The template churn is the set dock and the edit disclosure. The added TypeScript is `reviseDraftSet`, the edit buffer, and focus after a successful set. Comments were not stripped to shrink the diff.
- Independent equivalent implementations before/after: one workout dialog and one `workout.ts` record model. The room still owns save, resume, and bench finish.
- State/cache owners and public entry points before/after: `/town/gym` and the workout dialog stay. Draft state starts in `emptyWorkoutDraft` for sessions. Rest timer state stays on the dialog. A failed Finish publishes completed only after validation succeeds, so the open dialog retries with Save and does not write a fictitious record.
- Remaining old symbol/path search: “Complete session” and `#health-workout-state` remain only as negative assertions in the Gym tests. `queue.json`, the completion registry, and CI were not edited.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: tests add 306 lines and delete 32 (`health-entry.spec.ts`, `health-room.component.spec.ts`, the dialog spec, and `workout.spec.ts`). This evidence file is the documentation change. No bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +349 production lines. This is a logging repair, not a simplification quota. The extra lines keep one canonical editor, a truthful draft, a visible next-set field, and an explicit correction that does not rewrite stored numbers. Domain math was not compressed to shrink the file.
- No behavior/data/meaningful assertion silently removed: set ids, revision identity, unit conversion, draft resume, failed upsert copy, routine Save, exercise Save, and bench Finish workout stay asserted.

## Verification

Commands ran from `/tmp/vivek-fixup-29` on the tree committed as `37e7798e95536f12652e5a4766d812099d035ae2`, before this evidence file. `make test-fast` used `PATH="/tmp/vivek-fixup-29/.venv/bin:$PATH"`. Karma used `CHROME_BIN` and Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

`python3 planning/implementation/plan.py launch FIXUP-29` printed `make test-fast`, `make lint-web`, `make typecheck-web`, `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`, `make build-frontends`, `npx playwright test --config apps/web/e2e/playwright.config.ts`, and `npx playwright test --project=suite`.

Focused dialog Karma was used while iterating. A partial `--include` run misses coverage thresholds; that is not the gate. The recorded Karma command is the full web suite. The gym Playwright case failed earlier on a locator that still named “Resume session” after Finish had already published a completed edit. The assertion now uses the Edit session dialog. No product code changed after the recorded full suites.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. |
| `make lint-web` | PASS. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 766 SUCCESS. Statements 78.01%, branches 66.1%, functions 80.22%, lines 83.3%. |
| `make build-frontends` | PASS. Pre-existing web bundle budget warning (732.75 kB vs 650 kB) and unused Finance dashboard imports. Exit 0. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 311 passed (3.5m), including the gym journey. |
| `npx playwright test --project=suite` | PASS. 75 passed (1.3m). |

## Handoff

- PR URL (leaf closure keyword only): opened from `agent/fixup-29`. The body is only `Closes #617`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. Shared dialog and scene layout were not edited, so 320px and 200% text were not added as a new stress. GAME-04 chapter files stay on main and are not part of this change.
- Next actor: review and merge this leaf only. #277 remains open.
