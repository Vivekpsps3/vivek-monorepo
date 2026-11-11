# TOWN-02 — implementation evidence

- Leaf issue and parent(s): TOWN-02 / #250. Parent #81 is referenced and stays open. Living World PLACE work stays unbuilt.
- Agent/context, branch/worktree: sole implementer, `/tmp/vivek-town-02`, branch `agent/town-02`.
- Base main SHA, current tested SHA: base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Implementation commit `80c7235ac46b076a63216babdf20ee40b31b61fa`.
- Fresh-main/prerequisite/active-PR checks: TOWN-01 `6157e6a7cd11c87b45598879fa9c5a12c970cf64` and MED-01 `29e131821d138bba224e02d5d61b77e23247e08a` are ancestors of the base. Open PRs at commit time do not edit the owned Town/Media/Travel credit files. #346 also adjusts the shared vault-listener assertion in `world.component.spec.ts`; this leaf's copy is the one the local Karma run executed.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PASSIVE1 | Owner 1 and owner 2 rows around founding, LA, and UTC. Eligible episodes need `watched_on`. Eligible movie/tv/book/game completions need `completed_on`. Reminders join the owner trip and bucket `done_at` in the request zone. Booked/done trips credit on `end_date+1` only when `created_at` in that zone is on or before `end_date`. Planning trips and late logs do not credit. Nothing credits before founding or with no town. Undo, delete, and toggle retract. Caps stay `library_day` (10) and `inn_day` (reminder 15, trip 30 outside that cap). | PASS | `apps/server/tests/test_town_passive.py` (`test_eligible_rows_credit_once_and_reversal_retracts`, `test_la_and_utc_bucket_reminders_and_late_logs`, `test_no_credit_before_founding_or_without_a_town`, `test_source_writes_retract_instead_of_stacking`). Browser: `apps/web/e2e/town.spec.ts` “passive credits name Media and Travel and retract when the source is undone”. |
| PASSIVE2 | Empty tables stay `ok` with 0 XP. A failed Media query marks only Media unavailable, drops only that XP, and leaves Travel and habits. Today names Media or Travel, and an unavailable source has no credit badge. | PASS | `test_empty_sources_stay_available_and_a_failure_drops_only_that_xp`. `town-today.component.spec.ts` “names an unavailable source beside a usable one” and the named-credit render. Playwright asserts the Media and Travel strings and the absence of `Auto`. |
| PASSIVE3 | Existing three-year fixture, serial, no coverage. Grouped counts are four `GROUP BY` statements (episodes, finished, reminders, trips) plus one `sqlite_master` probe. | PASS | `scripts/perf-gate.sh`: p50 239.32 ms (min 204.34, max 361.00). The server coverage gate ran the same script again: p50 131.55 ms (min 130.36, max 188.13). Both are under 600 ms. The 600 ms gate was not changed. `test_eligible_rows_credit_once_and_reversal_retracts` asserts the four grouped statements. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `passive_days` empty maps and TB3 comments that reported both sources available | `read_town` / `GET /api/town` | `apps/server/town/service.py` `passive_days` | Stub return and TB3 comments removed. One grouped query per count. Missing required tables are unavailable; present empty tables stay ok. | `test_town_api_read.py` now expects `unavailable` on a Town-only schema. Eligible and failure tests above. |
| Ambiguous `Auto` Today labels. No second per-row XP tally existed in the client. | `town-today.component.ts` / `.html` | Same component, one label function | `Auto ·` and `Auto ✓` replaced by Media and Travel names. | Component spec does not contain `Auto`. Playwright does not contain `Auto`. |

- Candidate class and protected counterexamples: required stub replacement (feature), not a simplification. Caps, response keys, and the engine formulas stay. No Finance or Health rows enter server Town XP. No universal source score. PLACE, Sidequests, Cards, and the coastal art direction stay unbuilt.
- Comparison base SHA and full replacement closure (including new files): `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Closure is `service.py`, completion stamps in `records.py`, reminder `done_at` in `trips.py`, Today labels, e2e clock alignment, and the tests named above. `engine.py` and `constants.py` stay as the cap owners.
- Production added/deleted/moved; comments/blank-only churn separately: production `git diff --numstat` is +211 / −9 (net +202). `records.py` +20, `service.py` +170/−6, `trips.py` +17, Today html +2/−2, Today ts +2/−1. The service growth is the query body that replaces the empty return, not comment-only churn. `tests/e2e/server.py` +12 is test harness.
- Independent equivalent implementations before/after: one stub credit path before, one query owner after. One Today label branch before and after. Engine `library_day` / `inn_day` remain the only cap math.
- State/cache owners and public entry points before/after: credits stay derived from current rows. No credit ledger. `GET /api/town` keys are unchanged. `completed_on` and `done_at` are written and cleared but are not response keys. A booked or done trip is “logged by its end” via `created_at` in the request timezone, because no `logged_at` column exists and `updated_at` moves on every edit.
- Remaining old symbol/path search, including config and discovery: `TB3`, `Auto ·`, and `Auto ✓` are gone from `apps/server/town` and `apps/web/src/app/town`.
- Follow-up change: which production files and independent policy owners now need editing: none in this packet. PLACE leaves consume these facts later.
- Tests/docs/generated changes separately: new `test_town_passive.py` (426), `test_completion_day.py` (46), `test_reminder_done_at.py` (58). Updated Town API snapshot, Today spec, `town.spec.ts` (+97), and the pre-existing world listener assertion (+6/−3). Evidence is this file. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: net +202 production lines. This is the feature that replaces an empty success stub with real reads and reversible stamps. The positive delta is the implementation, not a second copy.
- No behavior/data/meaningful assertion silently removed: Town-only unit databases now report source `unavailable` instead of a false `ok`. XP totals in that snapshot stay 0. The world spec no longer requires this visit to be the first vault-listener subscriber. Controller ownership assertions are unchanged. Base `bc2d79e` Frontend run 43094735011 already failed the old absolute count (710 tests, 1 failed).

## Verification

Local gates on this worktree, `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python`. Karma used port 9986 and that edit was reverted before commit. Chrome was `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-python` / `make typecheck-python` | PASS. Ruff 101 and mypy 87 match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 880 passed, coverage 79.08% (floor 61.53). Trailing perf p50 131.55 ms. |
| `./scripts/coverage-gate.sh media` then `./scripts/coverage-gate.sh travel` (sequential; a parallel pair mixed the coverage files and was discarded) | PASS. Media 84.37% (floor 70.60), 208 passed. Travel 88.99% (floor 80.41), 202 passed. Floors were not raised. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 63 tests. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 53 tests. |
| `make lint-web` / `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 711 SUCCESS. Statements 83.27, branches 70.24, functions 82.93, lines 86.93. Rerun after the day-refresh guard: 711 SUCCESS, statements 83.30. |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on the rerun: 79 passed. The first full run timed out once in `town-checkin.spec.ts` “visibility after the local date changes” (`waitForResponse` 60s). That test passed alone and in the full rerun. The new passive test passed in both full runs. CI run 43103047547 failed that same visibility test under the full browser matrix. A jumped clock was firing the five-minute poll once per elapsed interval while Town was still on the old day, so each tick started another `GET /api/town`. `refreshDay` now keeps one in-flight load per new local day. `town.component.spec.ts` asserts a second interval does not fetch again, and `town-checkin.spec.ts` then passed 5 tests. |
| `npx playwright test --project=suite` | PASS. 26 passed. |
| `bash scripts/perf-gate.sh` (serial, no coverage, before the coverage gate) | PASS. p50 239.32 ms. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/347 (`Closes #250` only).
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6807406790
- Merged/activation status (actual evidence, not assumption): PR #347 is open. Local gates passed. CI has not been recorded yet.
- Remaining external prerequisites or approved scope decisions: none for this packet. #346 also edits the world listener assertion; merge may need a trivial resolution if both land.
- Next actor: watch CI, squash-merge, then record the squash SHA.
