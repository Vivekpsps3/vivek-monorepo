# Travel

Travel's domain code stays in `apps/travel`, with Angular presentation in `frontend` and FastAPI routers/services in `backend`. The root site serves `/travel/`; API routes retain `/travel/api`. Identity, CSRF and the request database session come from the server platform in-process. Trip costs never write Finance records or alter net worth.

Use the root workflow in [Development](DEVELOPMENT.md). There is one service and one SQLite database; there is no standalone Travel deployment. Sign-in is `/auth/login`, and the persistent Hub control returns to `/hub`. Open the username dropdown for Travel settings, account settings, theme and sign-out.

## Trips and forms

A trip spans departure through return, inclusive. Start with dates and a destination. Add destination changes on the first date at the next city; keep one optional trip-name editor. Every destination needs a name. Reversed dates cannot save. Same-day and one-night trips have explicit wording.

Transport and activities appear only on request. Notes, reminders, parking and extra costs use optional editors. Failed saves keep drafts; route and document exit guards protect unsaved changes. A completed create retries the same database-backed user/request key, including after process restarts and concurrent submissions. Missing keys intentionally create separate trips. Deleting a trip removes its children and PTO usage after confirmation; individual rows offer Undo with a retained snapshot and an explicit retry if restoration fails.

Costs on transport, plan and parking rows roll up automatically. Extra budget lines represent other costs. Totals stay separate by currency. Parking records whether it is necessary and booked. Home lists open reminders, needed unbooked parking and PTO overlaps.

## Flights and maps

A valid flight number and departure date trigger bounded FlightAware AeroAPI lookup. Multiple candidates need an explicit choice. Scheduled, estimated and actual times stay distinct; local timezone/offset and date-line wording remain visible. Manual edits survive lookup; Use flight schedule deliberately resets overrides. Missing key, provider authentication, throttling, timeout and no match remain separate from suite authentication. Keys stay on the server.

Places resolve only after explicit search and selection. Normal trip reads never geocode. Nominatim requests use an identifying User-Agent, aggregate one-second pacing and a cache with positive/empty expiry. Maps use the app-owned Leaflet DOM adaptation under the enforced private CSP and Trusted Types policy. Tiles receive only the site origin as Referer. Tile/library failures explain the failure, retain a textual place list and expose recovery. Tests use synthetic tiles.

## PTO

Each trip date stores 0, 0.5 or 1 PTO days. Weekdays start at 1; Saturday/Sunday start at 0. Turning PTO off retains selections. Date edits retain intersecting choices and default newly added dates. Trip, calendar, home and forecast use the same dated charges. Overlaps are reported with dates and labels rather than silently merged.

A saved balance is the balance at the end of `balance_as_of`. Accrual begins the next day: annual amount /365, monthly amount ×12/365, semimonthly ×24/365, biweekly /14 and weekly /7. Hours convert using `hours_per_day`; a cap pauses accrual while reached. Dated trip charges apply on their dates; historical/manual aggregate usage retains its recorded start-date semantics.

Legacy custom trip totals remain explicitly unallocated until the owner confirms a dated allocation. Migration preserves the original total, including zero/fractions. It never guesses which dates a custom amount meant. This is a planning projection, not payroll. [Migrations](MIGRATIONS.md) documents the unified schema.
