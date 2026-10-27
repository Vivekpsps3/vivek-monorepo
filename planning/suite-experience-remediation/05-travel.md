# Travel implementation plan

Target feature UI is app-owned `apps/travel/frontend` routes inside the one web build. Existing pure models can be retained and incrementally typed; custom hash router, HTML string renderer, global event delegation, shell, and per-app theme/account code are deletion targets after parity. Backend trip/PTO/provider behavior stays under `apps/travel/backend`.

## TRV-01 — One understandable trip composer

Sources: `static/modules/views/composer.mjs`, `composer-model.mjs`, `views/new-trip.mjs`, `actions/forms.mjs`, `static/app.css`; regression starting points `static/tests/tr3.test.mjs`, E2E `blockers.spec.js` and `screenshots.spec.js`.

- [ ] Reproduce the reported split appearance and title confusion before UI changes at 390/768/1280px. Record pointer, touch, and keyboard behavior.
- [ ] Use dates first with an explicit start/end input alternative to calendar picking. Show the selected span in plain text.
- [ ] Label the first field Destination city. Generate trip title from destination(s); offer one Rename trip disclosure. There is only one canonical editable title.
- [ ] Replace ambiguous Split… with Change city on [date] / Add destination. Chosen boundary is the first day at the next destination; labels, preview, model and persistence agree.
- [ ] Show a small preview of all destination date segments. Specify same-day trips, first/last day, adjacent changes, deleting middle stops, and changing trip range.
- [ ] Validate every retained destination segment. Do not silently discard an unnamed segment; focus the missing city and retain all inputs.
- [ ] Preserve title, cities, transport draft, PTO selections, focus, and range through split/merge/resize/validation/retry. Require deliberate handling of data falling outside shortened dates.
- [ ] Keep calendar vertical touch scrolling usable; dragging is optional. Native keyboard selection and visible focus must work.
- [ ] Scope listeners to component lifetime; destroy route subscriptions/listeners on exit.
- [ ] Add pending save state and duplicate-submit protection; retry a failed response without accidentally creating a second trip. Consider a small client operation ID for creation rather than a general idempotency subsystem.

Acceptance example: Oct 24–30 with Kyoto until Oct 26 and Osaka from Oct 27 produces two named saved stays, one trip title, and retained draft state. Blank Osaka blocks save with an inline error. Removing the change gives a clear single-city range.

## TRV-02 / DB-01 — PTO by date

Sources: `models.py::Trip/PtoEntry`, `schemas.py::TripCreate/TripPatch`, `services/pto.py`, `services/assemble.py`, `routers/pto.py`, `views/pto.mjs`, `views/trip.mjs`.

- [ ] Freeze per-date contract and legacy allocation rules with DB owner before UI work. Use one canonical amount per trip/date; avoid both a derived aggregate and editable aggregate competing as sources of truth.
- [ ] Default Monday–Friday to one day and Saturday/Sunday to zero when PTO is enabled. Expose PTO / Not PTO per day; optional half-day values can follow the same amount model.
- [ ] Provide Select weekdays / Clear actions and a live total. Explain weekends briefly. No holiday calendar or nonstandard workweek engine is required for the requested baseline.
- [ ] Trip-wide off zeroes effective usage without discarding stored selections; re-enable restores them. Specify this behavior consistently.
- [ ] Deduct on each selected date. A trip starting before balance_as_of still deducts selected dates after it. Preserve accrual precision and documented end-of-balance-date convention.
- [ ] Reconcile overlap: recommended one daily total bounded by workday capacity across trip/manual entries, with an explicit conflict instead of silent double use. Record intentional exceptions rather than silently capping legacy values.
- [ ] Define cancellation, deletion, start/end edits, and manual leave interaction. Preserve intersecting selections; preview removed dates; new dates get default policy.
- [ ] Update trip cards, detail summary, Hub summary where relevant, calendar, PTO forecast, policy preview, and negative-balance warning from the same backend calculation.
- [ ] Keep the legacy aggregate total and label until explicitly allocated if it cannot be losslessly assigned to dates. Never fabricate which days a prior custom amount used.
- [ ] Preserve recorded automatic weekday totals and existing personal input. Moving deductions from trip start to selected dates intentionally corrects some capped-accrual and mid-trip-balance projections; show before/after forecast differences in migration evidence rather than calling forecast behavior lossless. Preserve explicit zero, fractional totals, weekend-only trips and manual PTO records.

Acceptance: Fri–Mon defaults to two PTO days; marking Friday Not PTO leaves one. Mid-trip known balance deducts only later selected days. Date extension adds sensible defaults and leaves prior selections intact. Totals match in every view and after reload.

## TRV-03 — Automatic flight schedule with clean override

Sources: `services/flights.py`, `routers/integrations.py`, `actions/flight.mjs`, `views/new-trip.mjs`, `actions/ui.mjs`; models/schemas store local schedule and FlightAware fields today.

- [ ] Reuse FlightAware adapter initially. Verify current endpoint date horizon, ident/codeshare behavior, key requirements and schedule limits; evaluate one equivalent source only if a measured requirement is unsupported.
- [ ] Start with flight number and departure date, using trip date as an editable suggestion. A bounded debounced lookup after valid input or an explicit refresh fills schedule; never request on every keystroke.
- [ ] Cancel/ignore obsolete requests. Number/date/provider changes invalidate stale candidates without wiping manual values.
- [ ] If one unambiguous candidate matches local departure day, fill a schedule preview. Multiple matches require clear selection with airline, airports, local date/time, timezones and overnight arrival.
- [ ] Preserve scheduled, estimated and actual timestamps separately; do not relabel best-known operational time as the original schedule. Store provider flight identity, fetch time and provenance.
- [ ] Edit manually opens clean editable fields. Manual override flags prevent later lookup/refresh overwriting the changed values. Use flight schedule explicitly clears the chosen overrides after preview.
- [ ] Ensure identical behavior in creation, quick Add transport and full edit; delete parallel flight form implementations.
- [ ] Distinguish missing key, bad provider key, no matching flight/date, future schedule unavailable, network timeout, provider throttling and suite sign-in expiration.
- [ ] Manual entry always remains possible; missing paid credentials should not disable trip saving.
- [ ] Cover airport timezone DST, date line crossings, arrivals on earlier local date, ambiguous local time, IATA/ICAO identifiers, canceled/diverted flights and missing timestamps.

Do not promise keyless FlightAware scraping or unlimited future schedules. The provider capability spike yields an explicit fallback message and decision, not invented timings.

## TRV-04 — Maps that render and explain failure

- [ ] Reproduce under unified production-like security headers; standalone Travel harness currently lacks the suite's global header behavior.
- [ ] Check tile Referer, status, CSP violation reports, Leaflet assets and dimensions independently. CSP currently permits the OSM tile host; do not fix by allowing arbitrary image/script origins.
- [ ] Resolve the global same-origin referrer conflict using an effective policy on the loaded private document or supported per-tile image `referrerPolicy`, exposing at most the site origin. A Travel response header alone cannot fix Hub/Finance→Travel client navigation. Test both transitions without reload, plus direct Travel load, and verify no trip path/query disclosure.
- [ ] Use an explicit location-confirmation interaction; ambiguous cities show candidates. Keep automatic enrichment bounded and avoid provider IO while a SQLite write transaction is held.
- [ ] Replace swallowed provider errors with structured no-match/timeout/throttled/unavailable states and useful Retry/Choose location actions.
- [ ] Give geocoder results a bounded TTL; failures use short retry windows; successful no-match is not cached forever.
- [ ] Enforce the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): aggregate maximum one request/second, identifying user agent, caching, switchable service, no autocomplete against the public endpoint. Select another endpoint/self-hosting if the intended interaction cannot meet those constraints.
- [ ] Keep a map placeholder for unresolved locations. Missing map library, zero coordinates, geocoder failure and tile failure are distinct states.
- [ ] Show on map first opens its disclosure/sheet, resizes the map and focuses or announces the selected place.
- [ ] Retain readable places and external map links during tile outage; visible OSM contributors attribution follows [tile policy](https://operations.osmfoundation.org/policies/tiles/).
- [ ] Tear down map/listeners on route changes. Verify repeated visits, one/many pins, collapsed→open, resize, partial tile failure and recovery.

## TRV-05 — Quiet itinerary and obvious forms

- [ ] Empty trip shows destination/dates, PTO total and compact Add transport / Add activity actions.
- [ ] Render populated transport groups; hide empty outbound/inbound/connection sections. Mode-first editor reveals flight fields only for flights.
- [ ] Show populated days and a compact date strip/unplanned-day summary. Selecting any day offers Add activity without mounting a form for every date.
- [ ] Keep existing activity content discoverable after collapsing; distinguish deliberately free time from missing required input.
- [ ] Parking, notes, reminders and extra budget entries are optional sections opened from a concise Add menu. Populated sections remain visible.
- [ ] Put raw coordinates, confirmation codes, optional costs, currency and extensive notes behind relevant details. Preserve multi-currency accounting; never add unlike currencies together.
- [ ] Use visible labels, required markers, focus restoration, single save row and retained errors across all editors.
- [ ] Delete superseded quick/full builder variants and global action cases after each new editor passes parity tests.

Verification must include Travel Python coverage, static pure-model Node tests, Travel Playwright, shared/platform gates for integration/header/migration changes, and the [full acceptance matrix](11-verification.md).
