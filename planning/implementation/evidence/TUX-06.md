# TUX-06 — implementation evidence

- Leaf issue and parent(s): [#411](https://github.com/Vivekpsps3/vivek-monorepo/issues/411) TUX-06; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-06`; `/tmp/vivek-tux-06`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `54674e87023a08d2bfe2bfd3b25cca114623a0a0` (TUX-05 merge, pull request #538). The implementation and these command results are `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `54674e87023a08d2bfe2bfd3b25cca114623a0a0`. NAV-02 return paths are on that tree (`packages/ui/src/return-context.ts`, `returnPath` used by search and Pixels). STYLE-03 dense holdings and media cards are on that tree (`apps/finance/frontend/e2e/dense-holdings.spec.ts`, `apps/media/e2e/dense-collection.spec.ts`). `gh pr list --state open` returned no pull requests. No open `travel-forms` or `travel-ui` pull request.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-06-A1 | Synthetic trip "Chosen day", 2026-12-12 through 2026-12-14. The day menu on 2026-12-13 adds a drive and an activity. The editors have no Trip name and no Return date. The saved trip title and dates stay the same. `depart_at` contains 2026-12-13 and the plan `on_date` is that day. DAY1 still orders a red-eye, linked parking, an activity, and an unscheduled row. Lodging, notes, and reminders share the local day in `week.test.mjs`. | PASS | `apps/travel/e2e/itinerary.spec.js` chosen-day test and DAY1. `apps/travel/backend/static/tests/week.test.mjs` lodging, notes, and reminders test. |
| TUX-06-A2 | A flight that departs 2026-12-13 10:00 and arrives 2026-12-12 18:00 shows "Arrives on an earlier local date" once on the earlier day, and the later day still shows 10:00 AM before 6:00 PM. DAY1 covers the overnight red-eye. A 503 on the activity save keeps "Keep this draft" and 2026-12-13, with focus inside the dialog; the retry saves that draft. Undo of the removed activity returns focus to `itinerary-day-2026-12-13`. A midnight drive with no arrival stays unscheduled on that local day. A reversed stay does not invent the days between its endpoints. | PASS | `itinerary.spec.js` date-line, chosen-day undo, and failed-save tests. `week.test.mjs` midnight and reversed-stay test. |
| TUX-06-LIFE | A held activity save does not replace "Second title" or 2026-12-13. The response is ignored when the epoch moved or the visible activity fields differ from the request. Session expiry clears the activity title and the private note, shows no discard dialog, and lands on the login page. `settleItineraryWrite` drops a stale epoch, an inactive session, and a different trip. `clearItineraryDraft` empties the private fields. A failed reminder toggle reverts the checkbox and shows "Toggle unavailable" on the trip alert. PTO typed during a save stays a draft. | PASS | `itinerary.spec.js` late-response and session tests. `week.test.mjs` settle and clear test. `reminders.spec.js` failed toggle at 390 and 1280. `undo.spec.js` PTO race. |
| TUX-06-VIEW | 390×844 dark touch and 1280×800 light keyboard, reduced motion. One local day shows the drive and the activity, with no Transport or Parking heading. Add, the day tab, and Add on that day are at least 44px. Axe serious, critical, and color-contrast violations are empty. `animation-name` on the day is `none`. Keyboard Tab reaches Add on that day; Enter and ArrowDown open Activity with the title focused and the date already 2026-12-13; Escape and Discard changes return focus to Add on that day. Touch follows the same add and discard path. | PASS | `itinerary.spec.js` VIEW touch night and VIEW keyboard day, including AxeBuilder. |

Fixtures are synthetic trips only. No private itinerary is in the tests, logs, or the issue.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Separate Transport, Parking, and Notes cards on trip detail | `trip.component.html` headings and `.trip-detail-transport` / `.trip-detail-parking` | The itinerary card. Trip notes render once. Parking and transport rows keep Edit and Remove. | Removed the three cards. The same trip payload still owns the rows. | `trip-actions.spec.js` ACT2 expects those three headings to be absent at 390 and 1280. DAY3 expects Transport and Parking counts of 0. |
| Reminder soon, later, and done lists, and the native `toggle` output | `trip-reminders.component.ts` and `.trip-reminders` checkboxes | `groupReminders` stays in `reminders.mjs`. Each reminder renders once in the itinerary. The Reminders card keeps the inline add form. | Removed the three lists and the checkbox column from the reminders card. | `reminders.spec.js` expects Due soon, Later, and Done headings to be absent. `optional-forms.spec.js` expects one Pack checkbox in the itinerary and none in `.trip-reminders`. The eslint-finance baseline dropped the removed `no-output-native` finding (345 to 344). |
| A second itinerary store or an invented return, charge, or checkout | Trip assemble payload | `projectItinerary` in `calendar-model.mjs` is a view. Lodging uses `arrive_on` and `leave_on`. | No new table, column, or router. | `week.test.mjs` projects the existing payload. Destination headings stay city names. |

- Candidate class and protected counterexamples: feature replacement. Destinations stay a map plus a place list, with the city as the level-3 heading. Undo snapshots, optional editor discard, and the trip payload stay. A reversed stay does not fill invented days. A date-only midnight is not shown as 12:00 AM.
- Comparison base SHA and full replacement closure (including new files): `54674e87023a08d2bfe2bfd3b25cca114623a0a0`. Closure is `calendar-model.mjs`, `calendar-model.d.mts`, `trip.component.ts`, `trip.component.html`, `trip-reminders.component.ts`, `trip-reminders.component.css`, `transport-editor.component.ts`, and `travel.css`. No new production file.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat is +742/−470, net +272. That includes `calendar-model.d.mts` (+53/−2) and `docs/TRAVEL.md` (+1/−1). The trip component is +371/−28. The reminders component is +12/−232 and its stylesheet is +0/−77.
- Independent equivalent implementations before/after: 1 / 1 trip store. The itinerary is a projection of the loaded trip.
- State/cache owners and public entry points before/after: saves still use the existing trip, plan, stay, transport, parking, note, and reminder routes. Editor text lives on the trip component. A keystroke during a save, or a visible activity field that differs from the request, makes that response stale. Session invalidation clears the private fields without a discard prompt. Undo still posts the captured snapshot.
- Remaining old symbol/path search, including config and discovery: no second itinerary route. `groupReminders` remains the tested grouping helper and is not a second list on the page.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf.
- Tests/docs/generated changes separately: tests +377/−46 (`week.test.mjs`, `itinerary.spec.js`, `reminders.spec.js`, `optional-forms.spec.js`, `trip-actions.spec.js`), plus this evidence file. The eslint-finance baseline lost one stale line. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (675.62 kB against the 650 kB budget).
- Net production delta and specific reviewed safety/compatibility exception if positive: +272 production lines. This is the feature: one local-day reading surface, contextual add, and the draft, undo, and late-response guards. The positive delta is the implementation, not a simplification claim.
- No behavior/data/meaningful assertion silently removed: confirmed. Destination city headings, undo for each row kind, optional-editor retry, reminder add, and the existing trip routes still pass.

## Verification

Commands ran in `/tmp/vivek-tux-06`. `make test-fast` used `PATH="/tmp/vivek-tux-06/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. One full Playwright run had 179 passed and 1 failed because the day heading included the city, so the Kyoto destination heading matched three elements. The day heading is now the date only, and the city is a following paragraph. A later full run had 179 passed and 1 failed on the held activity save: the response could arrive before the input listener. The success path now also compares the visible activity fields with the request. The full suite below includes both corrections. A focused late-activity run after that comparison passed 8 of 8.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-06/.venv/bin:$PATH" make test-fast` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. |
| `make lint-web` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. The baseline was shrunk by the removed finding and was not raised. |
| `make typecheck-web` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. 418 SUCCESS. Statements 72.6% (5824/8022). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. 67 pass / 0 fail. |
| `make build-frontends` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. Output `/tmp/vivek-tux-06/dist/web`. Initial-bundle warning 675.62 kB. Exit 0. The Playwright run used that bundle. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `f373cafdcdd5fc36beb1b4fb2ed1b45f417ddfc9` | PASS. 180 passed. |

Python lint, Python typecheck, and the travel and server coverage gates were not run. The diff does not change Python. Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run. The diff does not change those screens.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/539 (`Closes #411` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
