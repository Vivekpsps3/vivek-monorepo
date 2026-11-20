# TUX-03 — implementation evidence

- Leaf issue and parent(s): [#408](https://github.com/Vivekpsps3/vivek-monorepo/issues/408) TUX-03; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. OPS-06 / #277 was not edited. TUX-02 / #407 stays merged as #535.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-03`; `/tmp/vivek-tux-03`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `1187e37e21921b4c6ad5cb1bacce7b2b70d00930` (TUX-02 merge, pull request #535). `make test-fast` passed on `791fa952951930d9cb5d82f2cda3ce09db070c54` before this sentence named that commit.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-19 still returned `1187e37e21921b4c6ad5cb1bacce7b2b70d00930`. TUX-02 is on that commit. `gh pr list --state open` returned no pull requests. No open `schema-head` or `travel-records` pull request. One new revision, `site_trip_draft_v1`, chains from `site_flight_occurrence_v1`. No applied migration file was edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-03-A1 | Synthetic outbound drive SFO to NRT, departure 2026-06-01, arrival `2026-06-02T14:30`, return left blank. The stored draft has `end_date` null, `destination_label` null, lifecycle `draft`, and no PTO row. Inferred proposals stay on `trip_draft_proposals` and are not copied onto the draft end date. A typed return is stored and still creates no PTO charge. `POST /api/trips` for a complete trip titled Complete, 2026-06-03 to 2026-06-04, still creates a PTO entry. Home titles stay empty for the draft and list only Complete after the complete save. | PASS | `apps/travel/backend/tests/test_trip_drafts.py`. Browser: `apps/travel/e2e/trip-draft.spec.js` `an outbound draft saves no invented return and no PTO charge`. The posted body has `end_date` null and omits `pto_dates`, `stays`, and `counts_as_pto`. The form stays on `/travel/trips/new`. |
| TUX-03-A2 | A Lisbon week trip, 2026-04-06 through 2026-04-10, with a stay, transport UA100, plan item, budget line, PTO entry, and one `trip_pto_days` override, is snapshotted at `site_flight_occurrence_v1`. Upgrade to `site_trip_draft_v1` leaves those rows byte-for-byte equal. The new draft tables are empty. `end_date` on `trips` stays required. Downgrade drops only the new tables and the new compatibility rows. Seeded adopt and upgrade rehearsals report original values preserved. | PASS | `apps/travel/backend/tests/test_trip_draft_migration.py`. `SITE_IMAGE=personal-site:tux03-local make db-validate-seeded`. |
| TUX-03-LIFE | The same `client_request_id` returns the original draft and ignores a later body. A stale `revision` is 409 and does not write. Another owner gets 404 and an empty list. A concurrent same-key insert stores one draft. A 502 keeps the typed leg and the retry reuses the attempt key. A held response stores the submitted departure while the form keeps a newer date. Sign-out clears the private form and does not show a discard dialog. | PASS | `test_trip_drafts.py` retry, conflict, other-owner, and concurrent tests. `apps/travel/backend/static/tests/draft-model.test.mjs`. Browser: failed save, late response, and session expiry in `trip-draft.spec.js`. `apps/server/tests/test_trip_draft_owner.py` deletes one owner and keeps the other draft, leg, and proposal. |

Fixtures are synthetic: UA837, SFO/NRT, Lisbon week, UA100, and Synthetic/Kept/Deleted addresses at example.invalid. No private itinerary is stored in tests, logs, or the issue.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior incomplete-draft store. A complete trip required `trips.end_date` and `sync_trip_pto`. | `POST /travel/api/trips` and the Plan a trip submit button. | The same complete-trip route and `sync_trip_pto`. Drafts are a new table family and never call `sync_trip_pto`. | Nothing replaced. `trips.end_date` stays NOT NULL so the upgrade does not rebuild `trips`. Proposals are a side table, not columns on the trip. | `test_a_complete_trip_still_charges_pto` and the migration snapshot equality. `rg` of `sync_trip_pto` has no draft caller. |
| Account deletion must remove draft children because `users` has no ON DELETE CASCADE onto drafts. | `delete_user_account`. | The same function deletes proposals, legs, then `trip_drafts` before `trips`. | No old draft path existed to remove. | `test_trip_draft_owner.py`. |

- Candidate class and protected counterexamples: feature addition. There was no incomplete-draft implementation to delete. Complete trips, PTO allocation, stays, costs, and applied migrations stay. `trips.end_date` stays required. A proposal with source `confirmed` is rejected.
- Comparison base SHA and full replacement closure (including new files): `1187e37e21921b4c6ad5cb1bacce7b2b70d00930`. Closure is `trip_drafts` / `trip_draft_legs` / `trip_draft_proposals`, `site_trip_draft_v1`, draft router and service, Plan a trip Save draft, `draft-model.mjs`, account deletion, and the restore-drill owner list.
- Production added/deleted/moved; comments/blank-only churn separately: numstat on the closure is about +948/−25 production lines, net about +923. That count includes `site_trip_draft_v1.py` (134) and `draft-model.d.mts` (46), and it includes comments and blank lines. `scripts/test_restore_drill.py` is a test (+1) and is not in the production net. Docs are +5 (`apps/travel/AGENTS.md` +3, `docs/TRAVEL.md` +2) before this evidence file.
- Independent equivalent implementations before/after: 0 / 1. One draft writer, `apps/travel/backend/services/drafts.py`. The client builds the body in `draft-model.mjs` and does not invent a second store.
- State/cache owners and public entry points before/after: complete trips stay `POST /travel/api/trips`. Drafts are `GET/POST/PATCH /travel/api/trip-drafts` and `GET /travel/api/trip-drafts/{id}`. No `/travel/drafts/:id` route. The in-memory form clears on session invalidation. `client_request_id` is stored only on create. `revision` starts at 1 and increments on an accepted patch.
- Remaining old symbol/path search, including config and discovery: `sync_trip_pto` remains the complete-trip owner. Draft responses have no `pto` key. `rg` of a second draft table or a null `trips.end_date` migration finds neither.
- Follow-up change: which production files and independent policy owners now need editing: a later schema head must chain from `site_trip_draft_v1` and copy compatibility rows the same way. No other domain owner.
- Tests/docs/generated changes separately: tests about +764/−14, plus this evidence file. No generated bundle is committed. `npm run build` exited 0. The existing initial-bundle warning remains (674.67 kB against the 650 kB budget). Coverage floors were not pinned. Suggested floors 87.90 and 78.40 were left as notices.
- Net production delta and specific reviewed safety/compatibility exception if positive: about +923 production lines. This is the feature: an expand-only draft lifecycle, unknown return left null, proposals kept off confirmed fields, and no PTO charge. The positive delta is the implementation, not a simplification exception.
- No behavior/data/meaningful assertion silently removed: confirmed. Complete-trip create, PTO, and the prior flight-occurrence migration assertions still pass. Head pins that assumed `site_flight_occurrence_v1` was the only head now expect `site_trip_draft_v1` and the empty draft tables.

## Verification

Commands ran in `/tmp/vivek-tux-03`. Python gates used `PATH="/tmp/vivek-tux-03/.venv/bin:$PATH"` when the Makefile invoked `python3`. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. The worktree `.venv` is a symlink to the shared virtualenv. `node_modules` is a local install. Two seeded rehearsals failed before the pass below: one used the default image `personal-site:development` (still stamped `site_flight_occurrence_v1`), and one was started from the shared checkout instead of this worktree. The recorded pass is the worktree command with `SITE_IMAGE=personal-site:tux03-local`. The first full Travel Playwright run, overlapping that docker rehearsal, had 154 passed and 1 failed on a blank Appearance page. The idle rerun below passed. Coverage notices were not pinned.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-03/.venv/bin:$PATH" make test-fast` | `791fa952951930d9cb5d82f2cda3ce09db070c54` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. The same command was re-run immediately before the commit that names that SHA. |
| `make lint-python` | working tree on `1187e37e` | PASS. 255 files already formatted. Ruff 90 match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | working tree on `1187e37e`, then again after the CI fix | PASS on the rerun. mypy 79 findings match the baseline. The first GitHub Backend run on `bfbc73ca` failed this command: new `dict-item` 2 in `apps/server/tests/test_path_ids.py`, because the draft body added a leg list and a revision integer to a `dict[str, str]`. The body is now annotated `dict[str, object]`. `pytest apps/server/tests/test_path_ids.py` then passed 86. The baseline was not raised. |
| `./scripts/coverage-gate.sh travel` | working tree on `1187e37e` | PASS. 202 passed. Total coverage 88.90% (floor 80.41%). Notice: rose from 81.41%; suggested floor 87.90% was not pinned. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | working tree on `1187e37e` | PASS. 55 pass / 0 fail. |
| `./scripts/coverage-gate.sh server` | working tree on `1187e37e` | PASS on the rerun after head-pin expectations included the draft tables. 425 passed. Total coverage 79.40% (floor 61.53%). Perf gate 1 passed. Notice: rose from 61.87%; suggested floor 78.40% was not pinned. The earlier 4-failed run is not this result. |
| `make db-check` | working tree on `1187e37e` | PASS. `schema_drift_check` ok at `site_trip_draft_v1`. |
| `SITE_IMAGE=personal-site:tux03-local make db-validate-seeded` | image `sha256:1e4cf992d20f2ed1631a2b00824820a61a96f1b4dc7ff924ab6e8d246ab860ef`, `SITE_RELEASE=tux03-local`. Adopt from `8dc554e8`. Upgrade from `1187e37e` | PASS. Adopt `stamp_and_upgrade` to `site_trip_draft_v1`. Upgrade action `upgrade` from `site_flight_occurrence_v1`. Both schema diffs empty. Both say original values preserved. Smoke routes 200. |
| `make lint-web` | working tree on `1187e37e` | PASS. eslint-finance 345, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. |
| `make typecheck-web` | working tree on `1187e37e` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=…/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | working tree on `1187e37e` | PASS. 418 SUCCESS. Statements 72.6% (5824/8022). |
| `npm run build` | working tree on `1187e37e` | PASS. Output `/tmp/vivek-tux-03/dist/web`. Initial-bundle warning 674.67 kB. Exit 0. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | working tree on `1187e37e` | PASS on the idle rerun. 155 passed. The four `trip-draft.spec.js` tests passed in that run and in an earlier focused run. |
| `docker build --build-arg SITE_RELEASE=tux03-local --tag personal-site:tux03-local .` | worktree context | PASS. Image sha256 above. |

Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run: the diff has no Finance, Media, or Town screen. `make coverage-pin` was not run. `make e2e` is the Finance Playwright gate and was not run.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/536 (`Closes #408` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
