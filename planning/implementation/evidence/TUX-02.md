# TUX-02 — implementation evidence

- Leaf issue and parent(s): [#407](https://github.com/Vivekpsps3/vivek-monorepo/issues/407) TUX-02; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. OPS-06 / #277 was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-02`; `/tmp/vivek-tux-02`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `08bf5671d9d6cf49bc3e830d2a0205580a81eb91` (TUX-01, pull request #533). The verification commands passed on this worktree before the implementation commit. The follow-up evidence commit names that SHA after `make test-fast`.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-19 still returned `08bf5671d9d6cf49bc3e830d2a0205580a81eb91`. TUX-01 is on that commit: one AeroAPI v4 host, the schedules/history/flights date table, one 20-second page, and preserved overrides. `gh pr list --state open` returned only #534 (`agent/orchestrator-roadmap-archive`). No open `travel-provider` pull request. `FLIGHTAWARE_API_KEY` is unset. Tests use a synthetic key and `httpx` mock responses. No live AeroAPI call.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-02-A1 | Today 2026-11-19, departure 2027-05-19. The first lookup is `GET /schedules/2027-05-19/2027-05-20` with `airline=UA`, `flight_number=837`, `include_codeshares=true`, `max_pages=1`. The save stores one transport, the typed `depart_at` `2027-05-19T09:15`, and a null `fa_flight_id`. A later lookup on an operational today uses `GET /flights/UA837`. `resolve_refresh` returns `update` for that one saved leg. PATCH keeps the same row id and the edited time, and stores the operational id and gate. Exactly two provider calls. | PASS | `apps/travel/backend/tests/test_flights.py` `test_future_schedule_then_operational_refresh_keeps_one_leg`. Browser: `apps/travel/e2e/flights.spec.js` `a published schedule stays unlabeled and saves one leg`. |
| TUX-02-A2 | Missing key is 503 `provider_unconfigured` with no call. Departures 2027-11-20 and 2010-12-31 are 422 `schedule_unavailable` with no call. Tail `N12345` on a schedules date is 422 `invalid` on `ident` with no call. A schedules 400 on the anniversary bound 2027-11-18/2027-11-19 is `schedule_unavailable`. A schedules 400 for flight 999 is an empty 200. History 403 is 502 `provider_entitlement`. A 429 keeps `retry_after` 12. A timeout is 504 `provider_timeout`, not an empty list. | PASS | `test_distinct_lookup_remedies_do_not_call_the_provider_when_they_cannot` and `test_lookup_reports_a_timeout`. Browser: `a missing key, a timeout, and no match stay distinct and editable`. |
| TUX-02-LIFE | A lookup epoch is captured at start. Success and error callbacks no-op when `lookupStillCurrent` fails, including a late response after invalidate, settings navigation, or session clear. `clearPrivateDraft` drops provider fields. An ordinary failure does not invalidate, so the typed departure remains. A failed lookup does not change a saved override. `refresh_saved_leg` restores `depart_at` and `arrive_at` after overlaying non-null provider fields. | PASS | `apps/travel/backend/static/tests/flight.test.mjs` `a late lookup does not replace the draft, and ordinary failure keeps the typed time`. `test_a_failed_lookup_leaves_the_saved_override_in_place`. Browser: the timeout spec keeps `2026-11-02T09:15`, and `opening FlightAware settings cancels a held lookup in an existing trip editor`. |

Fixture: synthetic AeroAPI JSON only. The string `synthetic-key` is asserted absent from the lookup response. No private itinerary.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| One operational `GET /flights/{ident}` for every date inside `apps/travel/backend/services/flights.py` | `POST /travel/api/flights/lookup` and the transport editor | The same `lookup_flights` function. `lookup_route` chooses history, flights, or schedules. | The out-of-window path now returns `schedule_unavailable` or calls history/schedules. No second client, scraper, or cache. | `test_flights.py` asserts the path and that dates outside the table make no call. `rg` of `AEROAPI_ROOT` stays in `flights.py`. |
| Shell 12-second deadline on a flight lookup | `requestPolicyInterceptor` wraps every travel request | The same interceptor. Calendar refresh stays 30 seconds. Every other URL stays 12 seconds. Flight lookup waits 20 seconds, matching the component `timeout(20000)` and the server `httpx` timeout. | The 12-second branch no longer applies to `/travel/api/flights/lookup`. `flightProblem` maps interceptor code `timeout` and status 504 to the FlightAware timeout sentence. | `request-policy.interceptor.spec.ts` `keeps a flight lookup open through the shared travel budget until 20 seconds`. Travel Playwright timeout spec. |

- Candidate class and protected counterexamples: feature replacement inside the existing flight owner. Manual entry, one outbound leg, and "Use flight schedule" as the explicit reset stay. A null `fa_flight_id` still matches on ident, operating ident, origin, destination, and scheduled instant. Two saved hits do not auto-update.
- Comparison base SHA and full replacement closure (including new files): `08bf5671d9d6cf49bc3e830d2a0205580a81eb91`. Closure is `flights.py`, `integrations.py`, transport read/write (`models.py`, `schemas.py`, `records.py`, `assemble.py`), `site_flight_occurrence_v1`, the flight form and `flight-model.mjs`, and the shell lookup deadline.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat --find-renames 08bf5671 -- apps packages scripts` counts tracked production +610/−126. New `apps/server/alembic/versions/site_flight_occurrence_v1.py` is +34. Net production about +518. Numstat includes comments and blank lines. `docs/TRAVEL.md` is +1/−1 and is not in that production count.
- Independent equivalent implementations before/after: 1 / 1. `lookup_flights` still owns the only `httpx` client.
- State/cache owners and public entry points before/after: lookup remains `POST /travel/api/flights/lookup`. The session is released before the provider call. One GET, `max_pages=1`, no `links.next` follow, no body cache. `incomplete: true` when `links.next` is set. New nullable `transports.fa_flight_id` `String(80)`. `fa_ident` stays `String(20)`.
- Remaining old symbol/path search, including config and discovery: `AEROAPI_URL` is still the operational flights URL. Schedules and history URLs are built beside it. No scraper module.
- Follow-up change: which production files and independent policy owners now need editing: a later schema head must chain from `site_flight_occurrence_v1`. TUX-03 had no open pull request when this leaf started. No other domain owner.
- Tests/docs/generated changes separately: tracked tests +628/−53, plus `test_flight_occurrence_migration.py` at 78 lines. `docs/TRAVEL.md` +1/−1. No generated bundle is committed. The production image build warns that the initial bundle is 674.67 kB against the existing 650 kB budget; the build still exits 0. Coverage floors were not pinned.
- Net production delta and specific reviewed safety/compatibility exception if positive: about +518 production lines. This is the feature: three routes, occurrence identity, preserved overrides, distinct errors, and one 20-second budget through the shell. The positive delta is the implementation, not a simplification exception.
- No behavior/data/meaningful assertion silently removed: confirmed. Existing flight, date-line, ambiguity, and settings browser tests still pass. The missing-key sentence now says to add a FlightAware AeroAPI key in Settings.

## Verification

Commands ran in `/tmp/vivek-tux-02`. Python gates used `PATH="/tmp/vivek-tux-02/.venv/bin:$PATH"`. Karma and Playwright used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` because this machine has no system Chrome. The first Karma launch failed with no `CHROME_BIN`; the rerun below is the result. An earlier server coverage run failed `test_baseline_database_is_stamped_then_upgraded` because the new revision records `site_town_ownership_v1` as a compatible head. The expectation was updated and the rerun passed. The first full Travel Playwright run had 149 passed and 2 failed: the shell 12-second timeout beat the 20-second lookup, and the schedule save assertion read the trip before the row existed. Both were fixed and the suite below passed. Coverage notices were not pinned.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-02/.venv/bin:$PATH" make test-fast` | working tree on `08bf5671` | PASS. Doc paths OK. Planning validation PASS (104 active packets, 24 parents, 83 completed packets, forty TD owners). 135 unittest tests OK. Node tests 21 pass / 0 fail. |
| `make lint-python` | working tree on `08bf5671` | PASS. 250 files already formatted. Ruff 90 match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | working tree on `08bf5671` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh travel` | working tree on `08bf5671` | PASS. 196 passed. Total coverage 88.41% (floor 80.41%). `flights.py` 85.97% (335 statements, 47 missed). Notice: rose from 81.41%; suggested floor 87.41% was not pinned. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | working tree on `08bf5671` | PASS. 50 pass / 0 fail. |
| `./scripts/coverage-gate.sh server` | working tree on `08bf5671` | PASS on the rerun. 422 passed. Total coverage 79.39% (floor 61.53%). Perf gate 1 passed. Notice: rose from 61.87%; suggested floor 78.39% was not pinned. The earlier 421-passed failure is not this result. |
| `make db-check` | working tree on `08bf5671` | PASS. `schema_drift_check` ok at `site_flight_occurrence_v1`. |
| `make lint-web` | working tree on `08bf5671` | PASS. eslint-finance 345, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. |
| `make typecheck-web` | working tree on `08bf5671` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=…/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | working tree on `08bf5671` | PASS on the rerun. 418 SUCCESS. Statements 72.6% (5824/8022). |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | working tree on `08bf5671` | PASS on the rerun. 151 passed. |
| `make docker-build` | image context is this worktree; build-arg `SITE_RELEASE` is still `08bf5671` because that commit did not exist yet | PASS. Image `sha256:44b52c060951222197091e429c6c754275ed87ad9903357aab1799e23eced15a`. Bundle writer release `e0847dc028bfad1d64a95637830521c1e20c6793b60a35649a414d142c534181`. Initial-bundle warning 674.67 kB. |
| `make db-validate-seeded` | that image. Adopt from `8dc554e8`. Upgrade from `08bf5671` | PASS. Adopt `stamp_and_upgrade` to `site_flight_occurrence_v1`. Upgrade action `upgrade`. Both schema diffs empty. Smoke routes 200. |
| `PYTHON=/tmp/vivek-tux-02/.venv/bin/python PLAYWRIGHT_CHROMIUM_EXECUTABLE=…/chrome npx playwright test --config apps/web/e2e/playwright.config.ts` | working tree on `08bf5671` | PASS. 121 passed (Town, Pixels, World, and Hub). |

Finance Playwright, Media Playwright, Finance Karma, and site Karma were not run: the diff has no Finance or Media screen. `make coverage-pin` was not run.

## Handoff

- PR URL (leaf closure keyword only): pending. The pull request will use `Closes #407` only.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed. No production AeroAPI call was made. A missing account or key stays external configuration.
- Remaining external prerequisites or approved scope decisions: an AeroAPI account, key, and any paid historical tier stay outside the repo. #304, #134, and #277 stay open.
- Next actor: open the pull request, wait for green required checks, then merge with a merge commit.
