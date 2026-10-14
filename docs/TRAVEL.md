# Travel

Travel is a separate app in `apps/travel/`. It is a local-network trip planner. It does not read or write finance tables, the encrypted vault, or net worth.

## Trip

A trip is one span: `start_date` is the day you leave and `end_date` is the day you come back, inclusive. Multi-city trips are `stays` whose dates sit inside that span. Outbound, inbound, connection, and local rides are `transports` (`flight`, `drive`, `train`, `bus`, `ferry`, `other`).

Day plans (`plan_items`) are restaurants, activities, lodging, and similar items on a date. Notes and reminders belong to the trip. Parking says whether a spot is necessary, whether it is booked, and whether the arrangement is self-park, drop-off, pickup, rideshare, or none.

## Budget

Costs typed on a transport, plan, or parking row are rolled up automatically. Extra `budget_lines` are only for costs that are not already on the trip. Outbound flights, inbound flights, and other categories stay labeled. Totals are never added across currencies.

These amounts do not create finance transactions and do not change net worth.

## Flights and maps

Flight lookup calls FlightAware AeroAPI `GET /flights/{ident}` with the ident and a two-day window. The API key stays on the server (`FLIGHTAWARE_API_KEY`, or a settings row if the environment variable is unset). The browser receives the normalized schedule, airports, gates, terminals, aircraft, and delay.

Map search calls OpenStreetMap Nominatim only when you use Find on map. Results are cached. The map tiles also come from OpenStreetMap.

## PTO

PTO is a projection. The saved balance is the balance at the **end** of `balance_as_of`. Accrual starts the next day and is spread evenly:

- yearly: that many days across the next 365 days
- monthly: 12 periods per 365 days
- semimonthly: 24 periods per 365 days
- biweekly: one period per 14 days
- weekly: one period per 7 days

Hours are converted with `hours_per_day`. An optional cap pauses accrual while the balance is already at the cap. PTO that starts after the balance date is subtracted on its start date.

A trip that counts as PTO uses the weekday count (Monday–Friday) unless `pto_days` is set. The trip page shows the balance on the morning you leave and the leftover at the end of the return date. Weekend-only trips count as 0 days until you override them.

Lost or changed assumptions are not payroll. Set the balance date to the day you know the balance, before the vacation you want projected.
