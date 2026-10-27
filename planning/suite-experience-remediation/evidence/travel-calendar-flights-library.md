# Calendar, flight lookup, and library recovery — 2026-10-27

Three scoped follow-ups after the verified map-recovery pass. They do not close
TRV-03, TRV-04, NAV-01, ARC-05, or the rest of the old-to-new audit. No commit,
push, PR, or deployment was made.

## Travel calendar

The default month used `toISOString()`, so a local evening near the UTC date
line opened the next month. Retry navigated to the same month query, and
`queryParamMap` did not emit again, so the failed request was never repeated.

The calendar now uses the browser's local year and month. A missing `month`
query is written with `replaceUrl` before the fetch. Retry signals an explicit
refresh subject, so the same month is requested again. The month input is
one-way, so assigning the query value does not fetch twice.

Browser proof in `apps/travel/e2e/calendar.spec.js`:

- Honolulu, frozen at `2026-11-01T07:30:00Z` (still 2026-10-31 locally), opens
  October and puts `month=2026-10` in the URL.
- A 503 calendar response shows "Calendar offline". Retry loads the October
  trip and issues a second request. The assertion targets that message because
  the shell also exposes an empty `role="alert"` toast region.

## Flight disambiguation and adverse states

`flightProblem` now reads the Angular `HttpErrorResponse` body (`error.error`)
as well as `TimeoutError`. The transport editor previews a single same-day
flight, lists multiple matches without selecting one, and tells the user to
type times when the list is empty. A typed departure is locked and kept when a
later lookup returns a different schedule.

`apps/travel/backend/static/tests/flight-model.test.mjs` imports the frontend
model. A nested 503 `provider_unconfigured` body is `missing_key`, and
`TimeoutError` is `timeout`. The legacy static `flight.test.mjs` still covers
the old module and was not given the Angular body shape.

Browser proof in `apps/travel/e2e/flights.spec.js`:

- UA 837 on 2026-11-02 offers SFO→NRT and LAX→HND and leaves departure empty
  until SFO is chosen. Typing `2026-11-02T09:15` and looking up UA 838 keeps
  that time and shows "Edited by you. New lookups preserve your times."
- A missing AeroAPI key, a client timeout, and an empty result stay distinct.
  The departure field stays editable and Save transport stays available.
  Messages are read from `.local-error` so the empty shell status region is
  not part of the assertion.

## Library retry focus and scroll

The Library heading is focusable. Retry focuses it before the failed-load
button unmounts, then increments the reload subject. Scroll is remembered from
a scroll listener and stored on the current history entry at `NavigationStart`.
Returning to the library restores that offset, retrying through animation
frames until the document is tall enough or one second has passed. A failed
child-load also restores.

Browser proof in `apps/media/e2e/library-recovery.spec.ts`:

- The first library GET fails. Retry focuses the Library heading and removes
  the retry button.
- After scrolling a tall title-sorted library, opening Zebra and going back
  returns to `/media/library` near the same scroll offset. The click is
  dispatched on the title link without scrolling it into view. The test waits
  for the item page `h1`, because the library card's `h2` is also named Zebra.

## Verification

The production bundle at `dist/web` was built at 2026-10-27 04:19:55 UTC, after
these component changes. Later edits were spec locators and the library
navigation wait only, so the passing browser runs used that bundle.

| Check | Result | Log |
| --- | --- | --- |
| Full Travel Playwright | 53 passed, no skips | /tmp/suite-travel-browser.log |
| Full Media Playwright | 43 passed, no skips | /tmp/suite-media-browser.log |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | 69 passed, no skips | /tmp/suite-travel-node.log |

Map recovery's eleven cases passed in that same Travel run, including both
390px light cases. An earlier attempt that ran two Travel Playwright processes
at once lost trace files under `apps/travel/e2e/test-results` and is not the
result above.

In-flight progress, lost trip creation, optional editors, the weekend-only trip,
and the live date-line flight are recorded in
[progress, create, forms, weekend, and date-line evidence](travel-create-progress-forms.md).
The deletion ledger remains open.
