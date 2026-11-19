# TUX-02 — Support bounded advance-flight lookup with preserved overrides
- Stable key: `TUX-02`
- GitHub leaf: [#407](https://github.com/Vivekpsps3/vivek-monorepo/issues/407)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `TUX-01`
- Conflict groups: `travel-provider`
- Verification profiles: `docs`, `travel_back`, `server_back`
- Design: owner-selected 2026-11-17; planning only, no implementation claimed.

## Outcome

Extend existing flight owner with the selected schedule endpoint.

TUX-01 selects FlightAware AeroAPI v4, already the host in
`apps/travel/backend/services/flights.py`. Implement the contract below in that
owner. Do not add a second provider, a scraper, or a credential.

## Selected adapter contract (TUX-01)

Inspected 2026-11-19. No AeroAPI call was made. A missing account or key is
external configuration.

Sources:

- OpenAPI `info.version` 4.17.1 from <https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml>, sha256 `3023e7a0c54c86be61d130eacf9a420516574569d43c4feb62444e0b38611da5`. Server URL `https://aeroapi.flightaware.com/aeroapi`. The only `env` value is `aeroapi`. Auth is the `x-apikey` header.
- Commercial tiers and per-query fees: <https://www.flightaware.com/commercial/aeroapi/>. The page says prices may change.
- FAQ: <https://www.flightaware.com/commercial/aeroapi/faq.rvt>. v2 and v3 were sunset October 2023. `GET /history/*` reaches 2011-01-01. Other endpoints generally allow 10 days of history through `start` and `end`. A response contains one result set unless `max_pages` asks for more. A cursor lives 5 minutes and is not a cache.
- v2/v3 end of life 31 October 2023: <https://www.flightaware.com/news/article/Legacy-AeroAPI-Version-2-and-Version-3-Accounts-are-Being-Sunset/1566>.
- `fa_flight_id` on schedules: OpenAPI and <https://support.flightaware.com/hc/en-us/articles/33161341318935-Why-Is-A-Frequently-Used-Endpoint-Returning-A-Null-Value>. Flights more than a few days ahead have a null FlightAware flight id.
- Historical data is a Standard and Premium feature: the commercial tier table and <https://go.flightaware.com/aeroapi-historical-flight-data>.

### Version and configuration the app can actually set

The client host stays `https://aeroapi.flightaware.com/aeroapi`. The app cannot
choose v2, v3, a tier, or a base URL. The only secret is the existing key:
non-empty `FLIGHTAWARE_API_KEY`, otherwise the signed-in user's
`flightaware_api_key` setting. The key stays on the server. This packet does
not add a key, an account, or a production call.

### Which call, by UTC departure date

`today` is the server UTC date, as `lookup_bounds` already uses. `depart_on`
is the date the user entered. Query bounds are UTC instants at `T00:00:00Z`.
`end` is exclusive. Do not convert a schedules timestamp into an airport-local
date; that payload has no timezone.

| Departure | Call | Query |
| --- | --- | --- |
| Before 2011-01-01 | None. `schedule_unavailable`. | |
| On or after 2011-01-01 and before `today - 10 days` | `GET /history/flights/{ident}` | `ident_type=designator`, `start={depart_on}T00:00:00Z`, `end={depart_on+1 day}T00:00:00Z`, `max_pages=1`. Span is 1 day. The OpenAPI allows at most 7 days, from now back to 2011-01-01T00:00:00Z, and forbids a future `end`. |
| `today - 10 days` through `today + 1 day` | Existing `GET /flights/{ident}` | Same ident, `ident_type=designator`, and the current `lookup_bounds` start/end, plus `max_pages=1`. OpenAPI: each of `start` and `end` must be no further than 10 days past or 2 days ahead. |
| `today + 2 days` through a schedules end on or before `today` plus one calendar year | `GET /schedules/{depart_on}/{depart_on+1 day}` | `airline` is the 2- or 3-letter prefix, `flight_number` is the trailing integer, `include_codeshares=true`, `include_regional=true`, `max_pages=1`. |
| Schedules `date_end` later than `today` plus one calendar year | None. `schedule_unavailable`. | |

`today + 2 days` is supported. The operational call cannot form a non-empty
window on that date because `end` would equal `start` at the 2-day ceiling, so
the schedules call is the one that serves it. A date months ahead whose
exclusive end is still on or before the calendar-year ceiling is a schedules
call. Example, with `today` 2026-11-19: departure 2027-05-19 uses
`GET /schedules/2027-05-19/2027-05-20`. Departure 2027-11-20 is unsupported
because its exclusive end falls after 2027-11-19. A provider 400 on the exact
anniversary bound is `schedule_unavailable`.

Schedules also documents a past bound of 3 months and a maximum span of 3
weeks. This contract does not use schedules for dates older than the
operational window. Those dates use history, because a schedules row "may not
reflect actual flight information (even after the flight has occurred)."
Airport history endpoints, including any 10-to-15-day airport-pair gap, are
out of this adapter.

A schedules ident must match a 2- or 3-letter carrier plus a numeric flight
number, such as `UA837` (`airline=UA`, `flight_number=837`) or `UAL837`.
Leading zeros are not significant because `flight_number` is an integer. A
future or `today + 2 days` ident that does not split that way, such as a tail
number, returns field error `invalid` on `ident` and does not call the
provider. Operational and history calls still send the normalized ident with
`ident_type=designator`.

### Fields the adapter may return

One candidate list. Ignore meal service, seat counts, route, runway,
registration, and Foresight. Do not invent a null field from another field.

| Field | `flights` and `history` | `schedules` |
| --- | --- | --- |
| `source` | `flights` or `history` | `schedules` |
| `fa_flight_id` | Provider string. History keeps it. | String or null. Null is expected more than a few days ahead. |
| `ident`, `ident_icao`, `ident_iata` | As returned | As returned |
| `actual_ident`, `actual_ident_icao`, `actual_ident_iata` | Null | As returned. This is the operating ident when `ident` is a codeshare. |
| `codeshares`, `codeshares_iata` | Arrays, or empty | Empty. Codeshare identity is `actual_ident*`. |
| `operator`, `operator_iata`, `flight_number` | As returned | Null. The query already carries the number. |
| `aircraft_type` | As returned | As returned |
| `origin_iata`, `origin_icao`, `destination_iata`, `destination_icao` | Airport object | The schedules string fields |
| City, name, timezone for each airport | Airport object, or null | Null. Do not call `GET /airports/{id}` to fill them. |
| `scheduled_out`, `scheduled_in` | As returned | As returned |
| `estimated_out`, `estimated_in`, `actual_out`, `actual_in` | As returned | Null |
| `status`, gates, terminals, baggage, delay seconds, `cancelled`, `diverted` | As returned. History does not populate `inbound_fa_flight_id`; do not require it. | Null |

`source=schedules` is a published timetable, not live status. The preview says
so and shows the fetch time. A missing timezone stays unlabeled. Scheduled,
estimated, and actual times stay separate fields.

### Occurrence, codeshares, and refresh

Keep every candidate that differs by origin or destination. Do not collapse
rows that share a flight number. A row matches the typed designator when that
designator equals `ident`, `ident_icao`, `ident_iata`, an `actual_ident*`, or
an entry in `codeshares` / `codeshares_iata`.

Saving stores the ident the user chose, the operating ident when it differs,
the origin and destination codes, and `scheduled_out`. `fa_ident` is 20
characters and cannot hold a FlightAware flight id. When `fa_flight_id` is
non-null, persist it in one new nullable column rather than truncating it.
When it is null, match a later refresh on the chosen ident, operating ident,
origin, destination, and scheduled instant. The same non-null `fa_flight_id`
is the same occurrence. More than one saved leg matching a refresh does not
auto-update.

A later operational refresh is a new user action with its own one-call budget.
It may explain a changed scheduled time and update provider fields. It must
not overwrite a user-edited departure or arrival. "Use flight schedule"
remains the explicit reset. One outbound leg still does not invent a return,
a lodging, or PTO.

### One budget, cost, and errors

Release the database session before the provider call. One lookup is one GET
with a 20-second timeout and `max_pages=1`. Do not follow `links.next`, and do
not cache the body. If `links.next` is set, return the parsed page with
`incomplete: true` and let the user choose or type the times. A timeout is an
error, never an empty candidate list.

Published fees, one result set of 15 records, `max_pages=1`:

| Call | Fee per result set |
| --- | --- |
| `GET /flights/{ident}` | $0.005 |
| `GET /schedules/{date_start}/{date_end}` | $0.020 |
| `GET /history/flights/{ident}` | $0.020 |

Published tier limits, not something the app stores:

| Tier | Result-set rate | Monthly minimum | Historical flights |
| --- | --- | --- | --- |
| Personal | 10 per minute | None. Up to $5 free per month, or $10 for an ADS-B feeder. | Not included |
| Standard | 5 per second | $100 | Included, 500,000 result sets per month |
| Premium | 100 per second | $1,000 | Included, 500,000 result sets per month |

The commercial table does not list schedules as a Personal exclusion. This
contract does not claim that a Personal key returns schedules. That check
needs an account.

| Condition | Code | Remedy |
| --- | --- | --- |
| No key in the environment or settings | `provider_unconfigured` (503) | Add a FlightAware AeroAPI key in Settings. Type the times yourself. |
| Provider 401 | `provider_auth` (502) | FlightAware rejected the API key. Type the times yourself. This is not a suite sign-in failure. |
| Date outside the table above | `schedule_unavailable` (422) | FlightAware has no schedule for that date. Type the times yourself. |
| Schedules route, ident is not a carrier plus a flight number | `invalid` on `ident` (422) | Future schedules need an airline flight number such as UA 837. Type the times yourself. |
| History route, and the provider refuses with a status other than 400, 401, 404, or 429 | `provider_entitlement` (502) | This FlightAware account does not include historical flights. Type the times yourself. The OpenAPI documents 400 for a bad history bound and does not document the entitlement status. |
| Provider 404, or an empty `flights` / `scheduled` array | 200, empty list | No matching flight on that date. Type the times yourself. |
| More than one occurrence, or `incomplete: true` | 200, candidates | Choose the matching flight. Do not save automatically. |
| Provider 429 | `provider_throttled` (429) | FlightAware rate limit reached. Try again shortly. Keep `retry_after` when it is an integer from 0 through 86400. |
| Timeout | `provider_timeout` (504) | FlightAware took too long. Type the times yourself. |
| Other transport or provider failure | `provider_unavailable` (502) | FlightAware could not look up that flight. Type the times yourself. |

A schedules 400 for an invalid airline or flight number, after the date and
ident checks above passed, is an empty match. A schedules or history 400 for a
date bound is `schedule_unavailable`.

## Requirements

- Extend existing flight owner with the selected schedule endpoint.
- preserve flight/date/route occurrence and codeshares.
- use one end-to-end budget and distinct errors.
- Follow the selected direct-selection 2.5D design; compact Hub is home; applicable domain data/crypto/date semantics remain authoritative.
- Dependencies require merged outcomes on fresh main, not issue closure alone. [TUX-01 / #406](https://github.com/Vivekpsps3/vivek-monorepo/issues/406)
- Planning package paths: `planning/product-revamp/design.md`, `planning/product-revamp/acceptance.md`; exact packet under `planning/implementation/issues/KEY.md`. These local paths become GitHub source links only after a planning merge.

## Source paths

- `apps/travel/backend/services/flights.py`
- `apps/travel/backend/routers/integrations.py`

## Target paths

- `apps/travel/backend/services/flights.py`
- `apps/travel/backend/routers/integrations.py`

## Steps

1. Read root/app/planning guidance, fresh main, source behavior and live claims. Preserve existing user changes; one isolated worktree/PR for this leaf.
2. Extend existing flight owner with the selected schedule endpoint.
3. preserve flight/date/route occurrence and codeshares.
4. use one end-to-end budget and distinct errors.
5. Prove the specific acceptance scenarios, error/return/lifecycle behavior and actual removal below. Record exact evidence in the existing per-leaf template; run launch profiles and all actual-diff root gates locally before a PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| TUX-02-A1 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | Future schedule then operational refresh resolves one leg occurrence without duplicate save. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-02-A2 | Named synthetic starting records and source states | Exercise this leaf's documented boundary | no key, unsupported date, ambiguity, throttle and timeout have different safe remedies. | Executed app/API/model journey plus screenshot or request/revision assertions as applicable |
| TUX-02-LIFE | Relevant slow/error/conflict or locked/other-owner state | Retry, leave, lock or change owner while work is pending | No losing response mutates current state; private drafts clear on invalidation and recoverable same-session input survives ordinary failure. | Held-response/owner test on the actual changed boundary |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded presentation, copied state or no-op paths in this exact slice | Migrate real consumers and delete replaced paths in the same PR; if no prior implementation exists, record none and the reason. Preserve immutable migrations, supported records and useful regression assertions. | Feature replacement; additions reported honestly | Consumer/path ledger, before/after responsibility and surviving behavior tests |

## Non-goals

- No app implementation as part of publishing this issue; this packet authorizes only its future named leaf, not parent completion, merge or deployment.
- No duplicate domain store/calculation, universal life-event warehouse, new crypto protocol, lowered gate, real private test fixture or unrelated feature expansion.

## Test scenarios

- Future schedule then operational refresh resolves one leg occurrence without duplicate save.
- no key, unsupported date, ambiguity, throttle and timeout have different safe remedies.

## Risks

- Fresh main may already satisfy a row. Verify merged evidence instead of recreating it. Coordinate actual shared files; split before work if this one responsibility cannot fit a reviewable PR.
- Connector/discovery rows must report unavailable owner configuration honestly. Synthetic fixtures never prove a real credential, paid entitlement, hosted service or production activation.

## Completion evidence

- Record tested SHA, current base, acceptance IDs, fixture/source boundaries, exact passed/failed/not-run commands, deletion proof and handoff in `planning/implementation/evidence/TUX-02.md`.
- Close only this leaf from its implementation PR. Parent scopes remain open until all retained and expanded requirements have verified outcomes. Owner visual review and actual activation remain distinct.
