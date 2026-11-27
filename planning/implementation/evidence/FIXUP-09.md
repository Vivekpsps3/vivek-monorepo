# FIXUP-09 — implementation evidence

- Leaf issue and parent(s): [#587](https://github.com/Vivekpsps3/vivek-monorepo/issues/587) FIXUP-09. Parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. OPS-06 / #277 was not closed.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/fixup-09`; `/tmp/vivek-fixup-09`. The shared checkout was not edited. GAME-05's worktree was not edited.
- Base main SHA, current tested SHA: base `fbd9685ed5050ada3b8f7f3795954e2ff8f50816`. The implementation and these command results are `58c9982ba4081f875645e8538a83ce5f55dc824e`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` before the worktree returned `fbd9685ed5050ada3b8f7f3795954e2ff8f50816`. TUX-03 (#408, merge #536 `1b933def`), TUX-04 (#409, merge #537 `aadda6b9`), TUX-05 (#410, merge #538 `54674e87`), and TUX-07 (#412, merge #540 `6586c344`) are ancestors of that SHA. Their evidence files and the outbound-draft, flight-review, calendar-preview, and postcard behavior are on this tree. #587 was open with no pull request and no earlier claim. Claim comment: https://github.com/Vivekpsps3/vivek-monorepo/issues/587#issuecomment-7220854843.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-09-A1 | At 390×844 and 1280×800, light and night, reduced motion, the three radios are in the viewport below `ui-section-nav` and at least 44px tall. Arrival mounts no flight, calendar, or date field. Touch or click opens Flight number, then the calendar file, then Departure date, each inside the viewport, with the other forms absent. Keyboard ArrowRight twice from Flight/date opens Manual and the departure date. A manual Kyoto trip for 2026-12-01 through 2026-12-03 saves those dates and city and no transport. UA837 on 2026-11-02 proposes SFO → NRT, then Save draft posts `end_date` null and no PTO. A synthetic UA837 calendar file previews the leg and saves one draft with `end_date` null and no PTO. | PASS | `apps/travel/e2e/trip-start.spec.js` viewport, keyboard, manual, outbound, and calendar tests. Full Travel Playwright: 223 passed. |
| FIXUP-09-A2 | A 503 `provider_unconfigured` lookup keeps UA 837 and 2026-11-02, leaves manual dates empty, and writes no draft or trip. A bad calendar file stays a rejection across a mode switch. Manual dates, the flight preview, and that rejection survive leaving and returning; the flight lookup is not repeated. A 502 trip save keeps Kyoto and the dates across Flight/date and back. FlightAware settings keeps `synthetic-key-fixup-09` on Keep editing, then Leave settings restores the same proposal. The settings dialog makes the rest of the page inert, so the mode control cannot move while the key draft is open. | PASS | `trip-start.spec.js` mode-switch, missing-provider, failed-save, and settings tests. `flight-start.spec.js` failed-draft retry still passes. |
| FIXUP-09-VIEW | 390×844 night and day, 1280×800 night and day, reduced motion (`animation-name: none` on a choice). Axe color-contrast, serious, and critical violations are empty on arrival. 320×844 keeps the three choices in view with no horizontal overflow. 1280×900 at a 32px root font keeps each choice at least 44px wide inside the viewport after scroll, with `scrollWidth` no wider than the viewport. Suite 200% zoom on `/travel/trips/new` has no horizontal overflow and no axe violations. | PASS | Four viewport tests in `trip-start.spec.js`, the 320/200% test, `axe.spec.js`, and `tests/e2e/suite.spec.ts` (11 passed). |

Browser bounds after the change, measured on the built bundle with the controls settled:

| Viewport | Flight/date | Calendar booking | Manual | First input of the chosen mode |
| --- | --- | --- | --- | --- |
| 390×844 | y301 h44, bottom 345 | y301 h44, bottom 345 | y349 h44, bottom 393 | Departure y546; Flight number y540; calendar file y561. Section nav bottom 165. |
| 1280×800 | y279 h44 | y279 h44 | y279 h44 | Departure y480; Flight number y453; calendar file y453. Section nav bottom 129. |

Before, on audited `27c99dc2` at 390×844, Flight started near y322 and Calendar near y1014, with the manual fields further down. Source order in `new-trip.component.ts` was `travel-flight-start`, then `travel-calendar-import`, then the departure field. `scrollWidth` matched the viewport in every measured after state. No screenshot is the proof; the Playwright expectations above are.

Fixtures are synthetic: UA837 / UAL837, SFO/NRT, Kyoto 2026-12-01 to 2026-12-03, `synthetic-ua837.ics`, `synthetic-broken.ics` containing `hello`, and `synthetic-key-fixup-09`. Lookups are Playwright `route.fulfill` bodies. No live FlightAware call and no private itinerary.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Always-stacked flight form, calendar form, and manual dates on `/travel/trips/new` | `new-trip.component.ts` rendered all three on arrival. Playwright filled dates or a file without choosing a path. | `NewTripComponent` owns the trip draft. `FlightStartComponent` and `CalendarImportComponent` own lookup and preview memory and restore it when their mode returns. | Arrival shows three radios and one help sentence. Exactly one form is in the document. | `trip-start.spec.js` counts the inactive inputs as 0. Existing flight, calendar, draft, and form specs choose a mode first. |
| Repeated “You can still type the trip below.” and the new-trip intros “Start with a flight” and “Import a calendar booking” | Those sentences sat above the stacked forms. | Mode help `#trip-start-help` states the next action. Terminal still uses `travel-flight-start` with `showIntro` true, minus the removed sentence. | Removed from the active new-trip mode. Intro markup remains behind `showIntro` for the terminal desk. | `trip-start.spec.js` expects the old sentence count 0. `terminal-hall.spec.js` passed unchanged. |
| `public-api.ts` route `trips/new` | Shell route to Plan a trip. | Same route and `NewTripComponent`. | Retained. The file was not edited. | `git diff` for that path is empty. Terminal handoff still navigates to `/travel/trips/new`. |

- Candidate class and protected counterexamples: presentation and entry replacement. Canonical flight and calendar editors, FlightAware provider handling, draft and PTO semantics, routes, and supported records stay. Real credential activation is out of scope. An unsubmitted transport editor closes when Manual is left; submitted transport rows stay on the trip draft.
- Comparison base SHA and full replacement closure (including new files): `fbd9685ed5050ada3b8f7f3795954e2ff8f50816`. Closure is `new-trip.component.ts`, `flight-start.component.ts`, `calendar-import.component.ts`, `travel.css`, and the browser tests that open Plan a trip. `public-api.ts` was checked and left unchanged.
- Production added/deleted/moved; comments/blank-only churn separately: `git show --numstat 58c9982ba4081f875645e8538a83ce5f55dc824e` production lines are calendar-import +75/−6, flight-start +93/−7, new-trip +102/−13, travel.css +13/−0. Net production +257. Comments and blank lines are inside that count. `docs/TRAVEL.md` is +1/−1 and is not production.
- Independent equivalent implementations before/after: 1 / 1 flight lookup client and 1 / 1 calendar preview client. The new-trip page is another mount of those same components, not a second provider.
- State/cache owners and public entry points before/after: one draft owner, `NewTripComponent`. Flight and calendar snapshots are in-memory on that owner and clear with the session. Routes stay `/travel/trips/new`, `POST /travel/api/flights/lookup`, `POST /travel/api/calendar-bookings/preview`, `POST/PATCH /travel/api/trip-drafts`, and `POST /travel/api/trips`. A terminal flight with an empty return opens Manual directly.
- Remaining old symbol/path search, including config and discovery: `travel-flight-start` remains in `terminal-hall.component.html` and, when Flight/date is chosen, in `new-trip.component.ts`. `travel-calendar-import` remains on the calendar choice. `rg` finds no “You can still type the trip below.”
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf. A later leaf that changes the trip draft contract must edit `NewTripComponent`, not a second start form.
- Tests/docs/generated changes separately: `trip-start.spec.js` +390. Other Travel e2e files and `dates.mjs` teach the existing journeys to choose a mode (+69/−22 across those files). `tests/e2e/suite.spec.ts` +1. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +257 production lines. This is not a pure deletion. The positive delta is the safety and compatibility exception the acceptance requires: one visible form, no hidden fields, and retained drafts across mode changes, settings, and failed writes. Terminal booking and Plan as a new trip still reach Manual with the accepted leg.
- No behavior/data/meaningful assertion silently removed: confirmed. Empty-return and empty-PTO assertions moved from “the other form is blank” to “the other form is absent,” and the write-body assertions stayed. `flight-start.spec.js` and `calendar-import.spec.js` still check `end_date` null and empty PTO entries.

## Verification

Commands ran in `/tmp/vivek-fixup-09`. `make test-fast` used `PATH="/tmp/vivek-fixup-09/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. The first `make test-fast` without that PATH failed in `scripts/test_restore_drill.py` with `No module named 'alembic'`; the PATH rerun passed. The first production build failed because the template read private `startStamp`; it is now a public signal and the rebuild passed. The first `trip-start.spec.js` run had 8 passed and 5 failed: destination city is not in the document until dates exist, and the draft list was read before the save response. Those assertions were fixed. The full Travel Playwright run includes the fix. No Python file changed, so Python lint, mypy, and coverage gates were not run.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH=".../.venv/bin:$PATH" make test-fast` | `58c9982ba4081f875645e8538a83ce5f55dc824e` | PASS. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. |
| `make lint-web` | same | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. The baseline was not raised. |
| `make typecheck-web` | same | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=.../chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | same | PASS. 729 SUCCESS. Statements 77.95% (12414/15925), branches 65.66% (5586/8507), functions 80.14% (2697/3365), lines 83.23% (10802/12978). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | same | PASS. 94 pass / 0 fail. |
| `make build-frontends` | same, after the `startStamp` visibility fix included in this SHA | PASS. Output `/tmp/vivek-fixup-09/dist/web`. Initial-bundle warning 731.00 kB against the 650 kB budget. Exit 0. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | same | PASS. 223 passed, including `trip-start.spec.js`, `flight-start.spec.js`, `calendar-import.spec.js`, `terminal-hall.spec.js`, and `axe.spec.js`. |
| `npx playwright test --config playwright.config.ts --project=suite tests/e2e/suite.spec.ts` | same | PASS. 11 passed. This extra gate covers the one-line Manual choice in the forced-colors test and the 200% zoom visit to `/travel/trips/new`. |

`make lint-python`, `make typecheck-python`, and the Python coverage gates were not run: the diff has no Python. Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run: the diff has no Finance, Media, or Town screen. `make e2e` is the Finance Playwright gate and was not run.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/639 (`Closes #587` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #578, #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
