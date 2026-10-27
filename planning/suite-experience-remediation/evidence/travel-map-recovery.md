# Travel map failure and recovery follow-up — 2026-10-27

The owner requested one more task and an updated handoff. This follow-up covers
Travel map failure/recovery and explicit location-search states within TRV-04
and ERR-01. It does not close those entire parent work packages, the deletion
ledger or final production acceptance. One agent implemented and checked it;
no independent agent review is claimed.

## Reproduced defects and implementation

The first new browser regression failed because showing a place during a tile
outage replaced the error with `1 chosen location.` The old `mapPlaces()`
binding also created a new input array on every render, rebuilding pins and
fitting the viewport during unrelated shell/form updates. A second regression
confirmed that Retry removed its focused button without returning keyboard
focus to the map. A third showed that a successful empty location search
displayed the initial prompt rather than a no-match result.
Screenshot review and a geometry regression also reproduced a selected popup
behind the sticky header: its top was 77.94px while the header ended at 129px.

The implementation now:

- Separates tile loading/failure from selection announcements, keeping failures
  visible through Show on map, theme changes and unrelated trip saves.
- Derives locations with a computed signal and repaints only when their values
  change. Zoom and popup state survive unrelated renders and reads.
- Redraws failed tiles on Retry and returns focus to the map canvas. Selection
  and Retry center the canvas before focusing so the popup clears the header.
- Offers Reload map page when the library module could not load. This starts a
  new document after a failed dynamic import; native unload protection still
  preserves unsaved PTO when the user cancels the reload.
- Keeps readable places, external map links and attribution during outages.
- Leaves unresolved places as a placeholder and sends no tile requests until
  there is a chosen valid coordinate. Zero latitude/longitude remain valid.
- Distinguishes timeout, throttling, no-match, invalid query and matching
  candidates. Searches remain explicit; typing cancels/clears obsolete work
  without requesting autocomplete. A result is saved only after selection.
- Removes tile listeners and the map instance on collapse/route exit. Repeated
  visits create a single map and detached prior canvases stay detached.

No provider, schema, API shape, dependency or security-header change was made.
The strict production CSP/Trusted Types policy and origin-only tile referrer
remain enforced. Popup labels use DOM text and preserve literal angle brackets.

Changed implementation:

- [Map component](../../../apps/travel/frontend/src/map.component.ts)
- [Trip component](../../../apps/travel/frontend/src/trip.component.ts)
- [Trip template](../../../apps/travel/frontend/src/trip.component.html)

## Acceptance evidence

[Eleven browser cases](../../../apps/travel/e2e/map-recovery.spec.js) cover:

1. Full tile outage, readable links/attribution, selection announcements, Retry
   recovery and restored keyboard focus at 390px/light and 1280px/dark.
2. Keyboard zoom through a shell render, three collapse/reopen cycles, detached
   old canvases, route exit and return at both sizes/themes.
3. Partial tile failure through a note save and subsequent retry at both sizes.
4. Unresolved coordinates, no automatic tile/geocoder calls, invalid query,
   timeout, throttling, no-match, ambiguous choices and deliberate selection at
   both sizes/themes.
5. Actual cancellation of a delayed old query and exclusion of its obsolete
   candidate after a newer response.
6. Multiple pins, resize, selected-place focus and literal popup text.
7. A failed built module fetch, cancellation of reload with unsaved PTO, then
   deliberate reload and recovery when that module is available.

The tile-outage cases run axe without rule exclusions. Successful map flows
check zero page errors/CSP violations and verify origin-only tile Referer,
including when the private trip URL has a query. The existing Hub-to-Travel
native map test remains enabled. All tiles and geocoder results are synthetic;
automation does not contact the public OSM/Nominatim services or production
data. Tile screenshots demonstrate UI states, not real geographic imagery.

Before-fix logs:

- `/tmp/suite-map-before.log`: outage incorrectly reported a chosen location.
- `/tmp/suite-map-search-before.log`: empty search lacked a no-match message.
- `/tmp/suite-map-retry-focus-before.log`: map canvas was inactive after Retry.
- `/tmp/suite-map-focus-scroll-before.log`: selected popup overlapped the header.

The first full-suite attempt shared `apps/travel/e2e/test-results` with a
second Travel Playwright process. Two 390px light cases then failed while
closing the browser, with missing trace files. They are not product failures.
A later single Travel Playwright run passed all eleven map cases inside the
53-test suite. Local gates and that result are in the latest
[STATUS.md checkpoint](../STATUS.md). Other logs:

| Check | Result | Log |
| --- | --- | --- |
| Root production build | Passed; 5 prerendered pages | /tmp/suite-map-build.log |
| Web lint and all configured TypeScript checks | Passed; allowances unchanged | /tmp/suite-map-web-quality.log |
| Travel backend coverage | 66 passed; 85.07%, unchanged 80.41% floor | /tmp/suite-map-travel-coverage.log |
| Travel Node suites | 68 passed, no skips | /tmp/suite-map-travel-node.log |
| Root/shared UI Karma | 88 passed, unchanged floors | /tmp/suite-map-web-karma.log |

A later Travel Node run, including the frontend flight-problem test, passed 69.
That result is in the latest STATUS checkpoint.

## Remaining work

Full old-to-new story reconciliation, Finance-to-Travel production transitions,
the immutable-image/browser smoke, broad visual/interaction acceptance and
legacy renderer deletion remain open. These tests do not prove heap-level
absence of leaks or current live provider availability. Existing backend place
tests cover provider error classification, identifying headers, pacing, cache
expiry and zero-coordinate validation; those contracts were not changed here.

The calendar month/retry follow-up, flight disambiguation, and library
focus/scroll follow-up are recorded in
[calendar, flights, and library evidence](travel-calendar-flights-library.md).
In-flight progress, lost trip creation, optional editors, the weekend-only trip,
and the live date-line flight are recorded in
[progress, create, forms, weekend, and date-line evidence](travel-create-progress-forms.md).

No commit, push, PR or deployment was made. Preserve the uncommitted branch.
