# Progress, lost create, optional editors, weekend PTO, and date-line flights — 2026-10-27

Five scoped follow-ups. They do not close TRV-04, ERR-01, NAV-01, ARC-05,
SRC-02, or the deletion ledger. No commit, push, PR, or deployment was made.
The coverage floor stays 80.41% even though the gate reported 85.22%.

## Media in-flight progress

`detail.component.ts` already captured the field snapshot at save time and,
when the form moved during the request, restored the newer progress and unit
after adopting the server detail. `apps/media/e2e/phase0.spec.ts` now types 40
pages during the first patch, changes that to 55 percent before the response
returns, and checks both patch bodies plus the saved item. The unit control's
accessible name is Unit. An exact label lookup also sees the option text, so
the spec uses the combobox role.

## Lost trip-create response

`TripCreate.client_request_id` accepts 8 to 80 letters, numbers, hyphens, or
underscores. Blank becomes omitted. A short id is 422 and inserts nothing.
`apps/travel/backend/services/create_attempts.py` remembers the key only after
the trip row exists, capped at 500 entries in this process. A replay returns
that trip with HTTP 201, including when the second body has a different title.
A missing trip is forgotten and the same key can create again. There is no new
column or migration.

The new-trip screen keeps the same `crypto.randomUUID()` while the JSON payload
is unchanged and rotates it when the payload changes. Save stays disabled until
the response settles. The browser proof aborts the first response after the
server has committed it. The form shows "Failed to fetch", Kyoto stays typed,
and the second save opens that one Kyoto trip. Home lists one Kyoto title.

An overlapping insert that starts before the first key is recorded can still
create two trips. A process restart forgets every key.

## Optional trip editors

`apps/travel/e2e/optional-forms.spec.js` fails the first POST for a drive,
activity, note, reminder, parking spot, cost, and destination with
"Save unavailable". Each typed value remains, and the retry leaves one saved
item. The note dialog is modal, so the Travel navigation is inert while it is
open. Cancel asks to discard the draft. Keep editing leaves "Still typing" in
the open note. Discard changes closes the editor, and the trip has no note
entry.

## Weekend-only trip

Saturday 2026-11-07 through Sunday 2026-11-08 in Honolulu already used the
weekday rule: both dates start as Not PTO and the total is 0. Angular's
`ngValue` exposes the zero option as `0: 0`, so the browser story checks the
selected option text. After save, the trip heading line says 0 PTO days and
the reopened PTO editor still shows Not PTO for both dates.

## Date-line and repeated local hour

`apps/travel/backend/static/tests/flight-model.test.mjs` imports the live
`apps/travel/frontend/src/flight-model.mjs`. A Tokyo departure at
2026-11-03 00:00 local and a Honolulu arrival at 2026-11-02 10:00 local produce
"Arrives on an earlier local date". The same New York 01:30 local hour on
either side of the DST fallback keeps different offsets. An unknown zone
reports UTC. `apps/travel/e2e/flights.spec.js` shows that sentence and both
local times on one preview for a trip that starts 2026-11-03.

## Checks

| Check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright | 58 passed, no skips | /tmp/suite-travel-browser.log |
| Full Media Playwright | 44 passed, no skips | /tmp/suite-media-browser.log |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | 70 passed, no skips | /tmp/suite-travel-node.log |
| `./scripts/coverage-gate.sh travel` | 70 passed; 85.22%, floor 80.41% | /tmp/suite-travel-coverage.log |
| `pytest apps/travel/backend/tests/test_trip_create_attempt.py` | 4 passed | /tmp/suite-create-attempt.log |
| Ruff on the create-attempt Python files | Passed | /tmp/suite-ruff-create.log |
| `ng build web --configuration production` | Passed, 2026-10-27 05:52:01 UTC | /tmp/suite-five-build.log |

The passing browser runs served that bundle. Spec locator fixes after the build
did not need another one.

Trip stories, a zero rating, search pages, and Unicode title order are recorded in
[trip stories and title-sort evidence](travel-stories-title-sort.md).
