# FIXUP-24 — Make Travel trip detail start at the selected day

- Leaf issue and parent(s): [#612](https://github.com/Vivekpsps3/vivek-monorepo/issues/612) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-24`, worktree `/tmp/vivek-fixup-24`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/612#issuecomment-7225676161). No subagents. The shared checkout was not edited. Town, Finance, Media, and server files were not edited.
- Base main SHA `3d83c2671a02d32d69214c587cdf0a61ee031935` after FIXUP-21. Tested product SHA `ed7905af1d114f8a37cbc15b200af6dbef124b50`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree (`26ae69b33a442e4c2a38d29e00f006a4ae2c3a77`) and again after FIXUP-21 merged. TUX-06 (#411, `bcaad64d`), ROOM-05 (#455, `27c99dc2`), and NAV-02 (#387, `8126d6ef`) are ancestors. Itinerary projection, harbor rooms, and return paths are present. GAME-08 (#476) and FIXUP-21 (#609) were in progress on other worktrees and were not edited here. FIXUP-21 merged before this commit. GAME-08 merged afterward and is taken as a merge commit without editing Town files.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-24-A1 | Synthetic booked Harbor week, 18–26 Nov 2026, with a Lisbon stay, an SFO–LIS flight, and Museum hour on 23 Nov. Direct `?day=2026-11-23` at 390×844 and 1280×800, light and night, touch and keyboard, reduced motion. The day heading and Add on that day are in view. Earlier lodging-only days stay off the page. Browsing to 24 Nov keeps 23 Nov open. Edit activity is titled Edit activity, saves Museum visit, and returns focus to `itinerary-day-2026-11-23`. A draft with the same day shows the free-day sentence and the same add control. | PASS | `apps/travel/e2e/trip-day.spec.js` journey “the named day, edit, and reminder stay together”. |
| FIXUP-24-A2 | On that draft, an empty reminder save shows “Name the reminder.” under the title. A held 503 shows “Save unavailable” inside the dialog and keeps the title. Retry saves Pack light on 23 Nov at `T00:00`, within the day, and focus returns to that day. Edit reminder saves Pack lighter on the same due time. A held trip GET shows “Loading trip…”, Retry, then a 503 “Couldn't load this trip.” with Retry, then the day. PTO, both time zones, trip dates, and the locked Finance link stay. No Finance write. | PASS | The same spec, plus “a held or failed load can be retried”, at all four viewports. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Lodging-only day panels and the extra “Add a plan” / “Add activity on” buttons | Every open day rendered lodging and two more add controls | `itineraryDayOpen` keeps agenda days open and opens a lodging-only day only when it is selected. One “Add on {day}” menu sits at the top of that day. | Removed the repeated buttons and `addPlan()`. | `week.test.mjs` and `trip-day.spec.js` expect the earlier lodging sections and those buttons to be absent. DAY2 still adds an activity on the selected day. |
| Detached `travel-trip-reminders` card | Trip detail rendered a second reminder form below the itinerary | Add and edit reminder use the trip dialog. The saved row is listed on its due day. `groupReminders` stays in `reminders.mjs`. | Deleted `trip-reminders.component.ts` and `.css`. The packet source bullet for the deleted file was removed so planning validation still passes. | Specs expect `travel-trip-reminders` count 0. Undo, toggle, and overdue sorting still use the itinerary row. |

- Candidate class and protected counterexamples: replacement of the detached reminder form and the repeated lodging-day actions. PTO allocation, transport time zones, Finance linkage, and supported trip routes stay.
- Comparison base SHA `3d83c2671a02d32d69214c587cdf0a61ee031935`. Replacement closure is the trip component, calendar open helper, travel CSS, and `docs/TRAVEL.md`. No new production file.
- Production added/deleted: 141 lines added and 219 removed across the seven production files. Net −78. Comments were not stripped to reach that. This is a repair plus a deletion.
- Independent equivalent implementations before/after: one reminder editor. The itinerary remains the only list.
- State/cache owners and public entry points before/after: the selected day stays in the `day` query. Records stay on the trip API. A superseded trip load cannot replace a newer result. No new store.
- Remaining old symbol/path search: `travel-trip-reminders` and `TripRemindersComponent` are gone from production. Historical evidence still names the old file.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: tests add 348 lines and remove 55, including new `trip-day.spec.js` (329 lines). `docs/TRAVEL.md` changes one sentence. The packet drops the deleted source path. No bundle is committed.
- Net production delta and exception: −78 production lines. No positive-delta exception.
- No behavior/data/meaningful assertion silently removed: overdue sorting, done toggle, failed restore, PTO, time zones, and the locked Finance link remain. Empty-trip copy without a `day` query still does not invent a selected day.

## Verification

Commands ran from `/tmp/vivek-fixup-24` on the tree committed as `ed7905af1d114f8a37cbc15b200af6dbef124b50`, before this evidence file. `make test-fast` and Playwright used `PATH="/tmp/vivek-fixup-24/.venv/bin:$PATH"`. Karma used `CHROME_BIN` and Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

The first `trip-day.spec.js` run failed because the next day was measured before scroll, the loading status name was not scoped to `main`, and the activity title is rendered as “10:00 Museum visit”. Those assertions and the reveal retry were corrected. A phone reminder row sat 4px past the viewport; the day reveal now scrolls that row with `block: nearest`. The recorded Playwright run is the rerun after that fix. `make build-frontends` was run again for that bundle before the full suite.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-24` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, root Karma, Travel node tests, `make build-frontends`, and Travel Playwright. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets). 135 unittest tests OK. Node script tests 21 pass. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Rerun after the final component edit. |
| `make typecheck-web` | PASS. Web, Finance, packages, and site. Rerun after the reveal change. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 749 SUCCESS. Statements 77.95% (12472/15998), branches 65.93% (5643/8559), functions 80.18% (2723/3396), lines 83.25% (10860/13045). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 95 pass, 0 fail. |
| `make build-frontends` | PASS. Production web bundle written to `dist/web`. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 225 passed (2.8m), including `trip-day.spec.js` at 390×844 and 1280×800, light and night. |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request is opened. The body is only `Closes #612`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none.
- Next actor: merge this leaf after GitHub checks pass.
