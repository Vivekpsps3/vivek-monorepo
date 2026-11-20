# TUX-05 — implementation evidence

- Leaf issue and parent(s): [#410](https://github.com/Vivekpsps3/vivek-monorepo/issues/410) TUX-05; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-05`; `/tmp/vivek-tux-05`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `aadda6b9bf43cd79d41973d5e18841678199dde7` (TUX-04 merge, pull request #537). The implementation and these command results are `IMPLEMENTATION_COMMIT`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `aadda6b9bf43cd79d41973d5e18841678199dde7`. TUX-03 trip drafts and TUX-04 flight-first review are on that tree (`POST /travel/api/trip-drafts`, `travel-flight-start`, `apps/travel/e2e/trip-draft.spec.js`, `apps/travel/e2e/flight-start.spec.js`). STYLE-02 44px controls are on that tree (`packages/ui/src/ui-button/ui-button.component.css`). `gh pr list --state open` returned no pull requests. No open `travel-forms` or `travel-ui` pull request.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-05-A1 | Synthetic `UID:synthetic-ua837-20261102`, `DTSTART;TZID=America/Los_Angeles:20261102T100000`, `DTEND;TZID=Asia/Tokyo:20261104T073000`, summary `UA837 SFO-NRT`. Preview shows UA837 · SFO → NRT, departure `2026-11-02 10:00 America/Los_Angeles`, arrival `2026-11-04 07:30 Asia/Tokyo`, and "Proposed. Not saved yet." Departure and return inputs stay empty. Save draft posts `end_date` null, no `counts_as_pto`, no `pto_dates`, and one outbound leg whose confirmation is the UID. Home trips and PTO entries stay empty. Importing the same file again offers the existing draft leg and does not post. "Use the existing leg" focuses that status. A saved Lisbon week leg with the same UID wins over a draft. Adding the booking to Lisbon week keeps `2026-04-06` through `2026-04-10` and one transport. The second import offers that leg and does not add another. | PASS | `apps/travel/backend/tests/test_calendar_booking.py` preview, draft-match, and trip-wins tests. `apps/travel/backend/static/tests/calendar-booking.test.mjs`. Browser: `apps/travel/e2e/calendar-import.spec.js` confirmation, second import, and existing-trip tests. |
| TUX-05-A2 | `hello`, a floating `DTSTART`, and 32,769 `x` characters each stay on the preview card with "Nothing was saved." The save button is absent. Drafts, trips, and the write log stay empty. The API also rejects an unclosed calendar, `PST`, an unknown zone, two TZIDs, a floating arrival, a hotel summary, `VALUE=DATE`, two calendars, a `VTODO`, two events, `RRULE`, a missing clock, an empty UID, a 50-character UID, and 31 February. Each response is HTTP 200 with `booking` null and `existing` null. Counts do not change. | PASS | Parametrized rejection tests in `test_calendar_booking.py`. Browser: `calendar-import.spec.js` bad-file test. |
| TUX-05-LIFE | A held UA837 preview does not replace the later UA838 card. A 502 keeps the file name and the proposed leg; the retry stores one draft with `end_date` null and the same UID. A held save of UA837 does not mark the newer UA838 card saved. Session expiry removes the booking text, shows no discard dialog, and leaves drafts empty. Another owner and a drive confirmation do not match the flight UID. `previewApplies` and `settleImport` drop a stale epoch and an inactive session. `clearCalendarImport` drops the private text. | PASS | `calendar-booking.test.mjs` late, failed, and clear tests. `test_calendar_booking.py` other-owner and drive test. Browser: late preview, failed save, late save, and session tests in `calendar-import.spec.js`. |
| TUX-05-VIEW | 390×844 dark touch and 1280×800 light keyboard, reduced motion. A floating file is rejected, focus returns to the file input, and "Choose a different booking" returns focus there by tap or Enter. The accepted preview shows both zone labels. The file input and save button are at least 44px. Axe color-contrast, serious, and critical violations inside `.calendar-import` are empty. `animation-name` is `none`. Keyboard and touch save leave `end_date` null and PTO empty. The return date field stays empty. | PASS | Both viewport tests in `calendar-import.spec.js`, including AxeBuilder. Screenshots `calendar-import-phone.png` and `calendar-import-desktop.png` in the Playwright output. |

Fixtures are synthetic calendar text only. No live calendar, credential, or private itinerary.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior calendar import. Plan a trip started with a flight number or typed dates. | `new-trip.component.ts`, `POST /travel/api/trip-drafts`, `POST /travel/api/trips/{id}/transports`. | The same draft and transport routes. The manual form and flight-first section stay. | Nothing replaced. The calendar section is additive. | `forms.spec.js`, `trip-draft.spec.js`, and `flight-start.spec.js` passed with the new section on the page. |
| A second trip store or a schedule lookup for this file. | Trip and draft tables. FlightAware stays on `POST /travel/api/flights/lookup`. | `POST /travel/api/calendar-bookings/preview` reads one VEVENT and matches `confirmation`. Confirm uses the existing draft and transport routes. | No new table, column, or provider call. | `calendar_bookings.py` returns `preview_booking` only. `rg` of `FlightAware` in the new calendar files is empty. |

- Candidate class and protected counterexamples: feature addition. There was no calendar-import path to delete. Manual dates, flight-first review, draft save, and complete-trip PTO stay. The arrival day stays on the leg. It is not `end_date` and not a PTO charge.
- Comparison base SHA and full replacement closure (including new files): `aadda6b9bf43cd79d41973d5e18841678199dde7`. Closure is `calendar_booking.py`, `calendar_bookings.py`, `CalendarBookingIn`, the router registration, `calendar-booking.mjs`, `calendar-booking.d.mts`, `calendar-import.component.ts`, the Plan a trip wiring, and the file-input style.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat is +1114/−3, net +1111. New files are `calendar_booking.py` (373), `calendar_bookings.py` (20), `calendar-booking.mjs` (111), `calendar-booking.d.mts` (90), and `calendar-import.component.ts` (483), 93 of those lines blank. Wiring is `app.py` +10/−1, `schemas.py` +8, `new-trip.component.ts` +12, and `travel.css` +7/−2. Docs before this evidence file are `apps/travel/AGENTS.md` +3/−3 (296 words) and `docs/TRAVEL.md` +3/−1.
- Independent equivalent implementations before/after: 1 / 1 trip store. The preview is a read. Confirm reuses the draft and transport writers.
- State/cache owners and public entry points before/after: preview is `POST /travel/api/calendar-bookings/preview` and writes nothing. A new draft is `POST /travel/api/trip-drafts`. An existing trip gains a leg only through `POST /travel/api/trips/{id}/transports`. Leg identity is the VEVENT UID stored in the existing `confirmation` field. The in-memory file text clears on session invalidation. A failed save keeps that text. A late response does not replace the card on screen.
- Remaining old symbol/path search, including config and discovery: no `calendar_uid` column and no second parser. Flight lookup remains the transport editor and `flight-start.component.ts`.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf.
- Tests/docs/generated changes separately: tests +787 (`test_calendar_booking.py` 331, `calendar-booking.test.mjs` 101, `calendar-import.spec.js` 355), plus this evidence file. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (674.96 kB against the 650 kB budget).
- Net production delta and specific reviewed safety/compatibility exception if positive: +1111 production lines. This is the feature: bounded VEVENT parsing, a read-only preview, and confirm through the existing trip writers. The positive delta is the implementation, not a simplification exception.
- No behavior/data/meaningful assertion silently removed: confirmed. Manual trip entry, flight-first review, draft save, and complete-trip PTO assertions still pass.

## Verification

Commands ran in `/tmp/vivek-tux-05`. `make test-fast` used `PATH="/tmp/vivek-tux-05/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. The first full Playwright run had 10 failed and 164 passed because `getByLabel('Calendar booking')` also matched the section named "Import a calendar booking". The spec now uses an exact label and scopes the failure alert to `.calendar-import`. The full suite below includes that correction. A focused `calendar-import.spec.js` run after the label change had 9 passed and 1 failed on the empty toast region; the scoped alert assertion is in the full pass.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-05/.venv/bin:$PATH" make test-fast` | `IMPLEMENTATION_COMMIT` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Rerun after the Travel overview sentence. |
| `make lint-python` | `IMPLEMENTATION_COMMIT` | PASS. 258 files formatted. Ruff 90 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | `IMPLEMENTATION_COMMIT` | PASS. mypy 79 findings match the baseline. |
| `make lint-web` | `IMPLEMENTATION_COMMIT` | PASS. eslint-finance 345, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. The baseline was not raised. |
| `make typecheck-web` | `IMPLEMENTATION_COMMIT` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `IMPLEMENTATION_COMMIT` | PASS. 418 SUCCESS. Statements 72.6% (5824/8022). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `IMPLEMENTATION_COMMIT` | PASS. 64 pass / 0 fail. Three of those are `calendar-booking.test.mjs`. |
| `./scripts/coverage-gate.sh travel` | `IMPLEMENTATION_COMMIT` | PASS. 221 passed. Total coverage 89.03% (4083 statements, 448 missing). Floor 80.41%. `calendar_booking.py` 90.22% (276 statements, 27 missing). `calendar_bookings.py` 100%. Floor was not pinned. |
| `./scripts/coverage-gate.sh server` | `IMPLEMENTATION_COMMIT` | PASS. 425 passed, then the server perf check 1 passed. Total coverage 79.40% (5675 statements, 1169 missing). Floor 61.53%. Floor was not pinned. |
| `make build-frontends` | `IMPLEMENTATION_COMMIT` | PASS. Output `/tmp/vivek-tux-05/dist/web`. Initial-bundle warning 674.96 kB. Exit 0. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `IMPLEMENTATION_COMMIT` | PASS. 174 passed. The ten `calendar-import.spec.js` tests are included. |

Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run. The diff does not change those screens. `make e2e` is the Finance Playwright gate and was not run.

## Handoff

- PR URL (leaf closure keyword only): PR_URL
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
