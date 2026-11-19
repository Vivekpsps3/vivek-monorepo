# TUX-01 — implementation evidence

- Leaf issue and parent(s): [#406](https://github.com/Vivekpsps3/vivek-monorepo/issues/406) TUX-01; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-01`; `/tmp/vivek-tux-01`.
- Base main SHA, current tested SHA: base `af0b2f0709eeebfe165823ed01af5a044ece3e51`. `make test-fast` passed on `244c19318975db2904d61c129d77fcee26755b69` before this sentence named that commit.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-19 returned `af0b2f0709eeebfe165823ed01af5a044ece3e51` (TOWN-07, pull request #532). Packet dependencies: none. #406 was open with no comments before the claim. Open pull requests: `gh pr list --state open` returned `[]`. No competing `planning-discovery` pull request. OPS-06 / #277 was not edited. The shared checkout was not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-01-A1 | UTC today 2026-11-19, departure 2027-05-19. That date is months ahead and its exclusive schedules end 2027-05-20 is on or before today plus one calendar year (2027-11-19). The contract routes it to `GET /schedules/2027-05-19/2027-05-20`. Departure 2027-11-20 is explicit unsupported with no provider call. Departure on today+2 days uses schedules because the operational window cannot be formed. | PASS | [TUX-02 contract](../issues/TUX-02.md) date table. OpenAPI 4.17.1 schedules and flights bounds. No application call. |
| TUX-01-A2 | No `FLIGHTAWARE_API_KEY` and no saved key is `provider_unconfigured` before HTTP. This leaf did not call AeroAPI and does not record a production success or failure. Account tier and a real key stay outside the repo. | PASS | Contract configuration and error table. `apps/travel/backend/deps.py` `flightaware_key` and `integrations.py` missing-key branch, read on this base and left unchanged. |

Fixture: published AeroAPI documents and the current flight owner on the base SHA. No synthetic itinerary, key, or provider response body was committed.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Advance-flight client, scraper, or a second provider module | None. `flights.py` only calls `GET /flights/{ident}`. | The same flight owner. TUX-02 extends it from the contract. | Not created. No production path removed. | `git diff --name-only` has no `apps/` file. |

- Candidate class and protected counterexamples: no prior advance lookup existed, so there is nothing to delete. The operational flights path, manual entry, and the missing-key error stay.
- Comparison base SHA and full replacement closure (including new files): `af0b2f0709eeebfe165823ed01af5a044ece3e51`. Closure is the TUX-02 contract, the flight planning paragraphs, `docs/TRAVEL.md`, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: production 0 / 0 / 0.
- Independent equivalent implementations before/after: 0 / 0. No second flight client.
- State/cache owners and public entry points before/after: unchanged. Lookup remains `POST /travel/api/flights/lookup`. The contract forbids a response cache and a second provider call.
- Remaining old symbol/path search, including config and discovery: `AEROAPI_URL` is still the operational flights URL. No schedules client was added.
- Follow-up change: which production files and independent policy owners now need editing: TUX-02 may edit `apps/travel/backend/services/flights.py` and `apps/travel/backend/routers/integrations.py`, plus the flight form that displays the new error codes. No other domain owner.
- Tests/docs/generated changes separately: planning and `docs/TRAVEL.md` only. No generated bundle.
- Net production delta and specific reviewed safety/compatibility exception if positive: production delta 0. No safety exception.
- No behavior/data/meaningful assertion silently removed: confirmed. Every TUX-02 requirement bullet and acceptance row is still in that packet.

## Sources inspected

Retrieved 2026-11-19. No account, key, or live flight query.

| Source | What it fixed |
| --- | --- |
| OpenAPI 4.17.1, sha256 `3023e7a0c54c86be61d130eacf9a420516574569d43c4feb62444e0b38611da5`, <https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml> | Host, `x-apikey`, `GET /flights/{ident}` 10-day/2-day bounds, `GET /schedules/{date_start}/{date_end}` one-year/three-month/three-week bounds and fields, `GET /history/flights/{ident}` from 2011-01-01 with a 7-day span. |
| <https://www.flightaware.com/commercial/aeroapi/> | Personal, Standard, and Premium limits and the three per-query fees. Prices may change. |
| <https://www.flightaware.com/commercial/aeroapi/faq.rvt> | v2 and v3 sunset October 2023. History from 2011-01-01. Default one result set. Cursor lifetime 5 minutes. |
| <https://www.flightaware.com/news/article/Legacy-AeroAPI-Version-2-and-Version-3-Accounts-are-Being-Sunset/1566> | v2 and v3 end of life 31 October 2023. |
| <https://support.flightaware.com/hc/en-us/articles/33161341318935-Why-Is-A-Frequently-Used-Endpoint-Returning-A-Null-Value> | Schedules flight id is null more than a few days ahead. |
| <https://go.flightaware.com/aeroapi-historical-flight-data> | Historical flights require Standard or Premium. |

`acceptance.md` has no separate flight table. The common rule that a timeout is not an empty result is restated on the contract. `design.md` Travel paragraph now points at the contract.

## Verification

Record command, tested SHA, result and meaningful counts. A failed command stays FAIL until genuinely repaired and rerun.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `make test-fast` | `244c19318975db2904d61c129d77fcee26755b69` | PASS |

Passing worktree run on `244c19318975db2904d61c129d77fcee26755b69`: doc paths OK; planning validation PASS (104 active packets, 24 parents, 83 completed packets, forty TD owners); blame-ignore revisions OK; shared boundaries OK; Finance UX F1 OK; 135 Python unittest tests OK; e2e discovery guard OK (projects listed, not executed); Node tests 21 pass / 0 fail. The same command was re-run on the worktree immediately before the commit that names that SHA, after this paragraph was updated. An earlier `make test-fast` was started in the shared checkout without its virtualenv and stopped in `test_restore_drill` with `No module named 'alembic'`. That run is not this tree. The worktree command above was rerun with `.venv` on `PATH` and passed. `git diff --check` is recorded with the commit.

App Karma, Playwright, Python coverage, Ruff, and mypy were not required. The diff has no `apps/`, `packages/`, or `scripts/` file.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/533 (`Closes #406` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed. No flight client was added. No production AeroAPI call was made.
- Remaining external prerequisites or approved scope decisions: an AeroAPI account and key, and any paid tier, stay outside the repo. Personal tier does not include historical flights. TUX-02 implements the contract. #304, #134, and #277 stay open.
- Next actor: review and merge this discovery pull request. Do not start TUX-02 from this worktree.
