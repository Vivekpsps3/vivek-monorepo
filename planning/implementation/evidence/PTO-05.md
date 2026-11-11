# PTO-05 — implementation evidence

- Leaf issue and parent(s): [#234](https://github.com/Vivekpsps3/vivek-monorepo/issues/234) PTO-05. Parent [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) stays open.
- Agent/context, branch/worktree: Cursor Grok implementer, `agent/pto-05`, `/tmp/vivek-pto-05`.
- Base main SHA, current tested SHA: origin/main at gate time `b7ae697cbac05fe7db5220a8ed7f2752543a854a` (fast-forward from the assigned base `85212152bda3ce6cab5cbfcc9c787b564214fc69`, Media #349 only). Application revision `8c2c041ae2fafd0a6d0a88e104692663c9a14a2d` is what the local gates ran on. This SHA line does not change application code.
- Fresh-main/prerequisite/active-PR checks: PTO-02 and PTO-04 are on this base. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/234#issuecomment-6808602212. No open PR shared the travel leave files at claim time.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ACCR1 | Legacy and default policies stay daily-prorated. Opted-in scheduled policies post the full accrual once, after the balance date, on the documented anchor for weekly, biweekly, semimonthly, monthly, and yearly, including cap, negative, zero, month-end, leap, year, and day boundaries. Same-day order is unused-hour drop, then the post, then the charge. | PASS | `apps/travel/backend/tests/test_leave_accrual.py`: `test_daily_default_keeps_the_prorated_fraction_and_posts_nothing`, `test_documented_anchors_for_every_cadence`, `test_posts_once_on_day_year_and_leap_boundaries_without_backfill`, `test_same_day_order_is_drop_then_post_then_charge_with_cap_and_zero`, `test_scheduled_segments_match_the_walk_on_every_day`, `test_api_series_matches_the_walk_and_legacy_policies_stay_daily`. Those six passed inside `./scripts/coverage-gate.sh travel` (217 passed). |
| ACCR2 | Changing the mode shows the impact. Cancel writes nothing. Confirm stores the version and anchor that were shown, and does not rewrite entries or allocations. | PASS | API `test_mode_change_previews_confirms_and_does_not_backfill` in `test_leave_accrual.py` (preview hours differ, cancel keeps daily version 0, confirm stores scheduled anchor `2026-01-31` at version 1, a stale version is 409, entries stay). Browser `apps/travel/e2e/pto.spec.js` `scheduled accrual previews, cancels, and confirms without backfill`: the impact body is shown, Keep current accrual sends no PUT, Save schedule sends one PUT with mode `scheduled`, anchor `2026-01-31`, and version 0, and the reloaded balance matches the preview with the same entries and allocations. Playwright: 169 passed. |
| ACCR3 | Upgrade keeps every synthetic policy and allocation, one migration head, and the old daily semantics. | PASS | `apps/travel/backend/tests/test_leave_accrual_migration.py` `test_upgrade_preserves_rows_and_keeps_one_daily_head` (passed in the travel gate). `make db-check` reported `schema_drift_check` ok at `site_leave_accrual_v1`. `make db-validate-seeded` after `make docker-build`: adopt `stamp_and_upgrade`, upgrade from `site_leave_carry_v1` to `site_leave_accrual_v1`, upgrade schema diff empty, smoke routes 200. `apps/server/tests/test_world_migration.py` `test_leave_accrual_is_the_only_head` passed in the server gate (880 passed). |
| Deletion | Implicit “every cadence prorates” becomes an explicit mode. One server owner posts scheduled hours. Charts and components do not grow a second balance engine. | PASS | Daily golden `test_daily_default_keeps_the_prorated_fraction_and_posts_nothing` plus the existing segment walk tests in the travel gate. `pto-model.test.mjs` `a schedule needs an explicit anchor and daily does not send one`. Frontend search: `walk_bucket` and `posting_dates` are absent under `apps/travel/frontend`. `pto-chart.mjs` does not compute a balance. The PTO page only sends mode, anchor, and version. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Implicit cadence proration as the only accrual behavior, and any component-side scheduled balance math | `leave_math.Bucket.daily` (from `pto.PERIOD_DAYS`) was the only hours projection. `pto.py` `walk` is the separate day-unit trip projection. No component scheduled algorithm existed. | `leave_math.posting_dates` and `walk_bucket` choose daily or scheduled from `accrual_mode`. Daily remains the default. | The implicit default is now the stored mode `daily`. Scheduled posting exists only in `leave_math`. No component math branch was added, so none was deleted. `pto.py` was not edited: trip leftovers stay daily even for a scheduled hours policy. | ACCR1 daily fixture and API series parity. Frontend search above. Playwright confirms the page saves the server schedule instead of projecting one. |

- Candidate class and protected counterexamples: feature leaf. Hours-per-workday, carry, cap, reset, and history stay. Existing rows gain `accrual_mode=daily`, a null anchor, and version 0. No silent backfill.
- Comparison base SHA and full replacement closure: `b7ae697cbac05fe7db5220a8ed7f2752543a854a`. Closure: `leave_math.py`, `models.py`, `schemas.py`, `leave.py`, `pto.component.ts`, `pto-model.mjs`, `pto-model.d.mts`, `travel.models.ts`, `site_leave_accrual_v1.py`, travel leave tests, `pto.spec.js`, `docs/TRAVEL.md`, and this file. Trip components, new-trip, transport-editor, `packages/ui`, the combined chart, and Travel Home were not edited.
- Production added/deleted/moved; comments/blank-only churn separately: `leave_math.py` +271/−2, `leave.py` +20/−0, `models.py` +10/−0, `schemas.py` +3/−0, `pto.component.ts` +124/−23, `pto-model.mjs` +29/−0, `pto-model.d.mts` +6/−0, `travel.models.ts` +3/−0, new migration 64 lines. `docs/TRAVEL.md` +1/−1.
- Independent equivalent implementations before/after: one daily hours implementation before. After, one daily implementation and one scheduled implementation, both in `leave_math`. The component still does not project balances.
- State/cache owners and public entry points before/after: `leave_policies.accrual_mode`, `accrual_anchor`, and `accrual_version` are the schedule. Version bumps only when mode or anchor changes. PUT of a stale version returns 409 and writes nothing. Omitted mode and anchor keep the stored values. Impact stays `POST /pto/policies/{bucket}/impact`.
- Remaining old symbol/path search, including config and discovery: no frontend `walk_bucket` or `posting_dates`. `pto.py` `walk` remains the day-unit trip projection on purpose.
- Follow-up change: scheduled hours live in `leave_math.py` and the policy PUT in `leave.py`. The PTO form only collects the choice. Chart geometry and Travel Home stay as landed.
- Tests/docs/generated changes separately: new `test_leave_accrual.py` (508 lines) and `test_leave_accrual_migration.py` (171). `pto.spec.js` +99. `pto-model.test.mjs` +27. `pto.component.spec.ts` +6. Server head pin and compatibility set updated. `dist/` is not committed. Karma `port: 9991` was added only for the run and reverted; `git diff apps/karma.conf.js` is empty.
- Net production delta and specific reviewed safety/compatibility exception if positive: about +505 production lines including the migration. This is a feature, not a simplification. The extra lines are the explicit mode, the anchor requirement, the version conflict, and the confirm dialog so a schedule cannot backfill or apply a stale confirm.
- No behavior/data/meaningful assertion silently removed: the daily fraction fixture is unchanged in result. Existing PTO Playwright cases passed in the 169-test run. Sick removal still resets the new schedule fields to daily / null / version 0.

## Verification

Local execution from `/tmp/vivek-pto-05` with `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointed at the Playwright chromium 1248 binary, and `PYTHON` pointed at the shared virtualenv. `make` used the worktree `.venv` symlink. CI, merge, and deployment were not run yet.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 64 passed. |
| `make lint-python` | PASS. 224 files already formatted. Ruff 101 findings match the baseline. Suppressions 6 match. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh travel` | PASS. 217 passed. Total coverage 89.03% (floor 80.41%). The gate printed a rise notice and was not re-pinned. |
| `./scripts/coverage-gate.sh server` | PASS. 880 passed, 2 xfailed. Total coverage 79.08% (floor 61.53%). Rise notice, not re-pinned. |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 712 SUCCESS. Statements 83.25% (5537/6651), branches 70.21% (2124/3025), functions 82.81% (1108/1338), lines 86.92% (4794/5515). Port 9991 for that run only. |
| `make build-frontends` | PASS. Output `dist/web`. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 169 passed, including `scheduled accrual previews, cancels, and confirms without backfill`. CI run 43117540234 then failed `remove sick keeps history and a dated correction previews it` because a still-visible "Sick policy saved." toast made the second exact-text assertion match two toasts. The assertion now waits for a new toast. The same run's Media scroll failure is `library-recovery.spec.ts`, which this leaf does not edit. |
| `make db-check` | PASS. `schema_drift_check` ok, revision `site_leave_accrual_v1`. |
| `make db-validate-seeded` | First run FAIL: the existing `personal-site:development` image migrated only to `site_leave_carry_v1`. Repaired by `make docker-build` from this worktree, then rerun PASS. Adopt action `stamp_and_upgrade`. Upgrade action `upgrade` to `site_leave_accrual_v1`, schema diff empty, smoke routes 200. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/351 (`Closes #234`). Parent #110 is named in the body and stays open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6809336590. The roadmap body was not edited.
- Merged/activation status (actual evidence, not assumption): PR #351 is open. Not merged. Not deployed. Local gates above passed on `8c2c041ae2fafd0a6d0a88e104692663c9a14a2d`.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #110 stays open.
- Next actor: watch CI on PR #351 and squash-merge only after Backend, Frontend, Unified Site Release, and Playwright are green.

Issue / parent / local packet: PTO-05 / #234 / #110 / `planning/implementation/issues/PTO-05.md`.

Branch, worktree, base main SHA, current SHA: `agent/pto-05`, `/tmp/vivek-pto-05`, base `85212152bda3ce6cab5cbfcc9c787b564214fc69`, origin/main `b7ae697cbac05fe7db5220a8ed7f2752543a854a`, application `8c2c041ae2fafd0a6d0a88e104692663c9a14a2d`.

Owned files and conflict groups; other active PRs checked: travel leave math, models, schemas, router, PTO component, one Alembic revision, travel leave tests, `pto.spec.js`, this evidence file. Trip UI, `packages/ui`, the combined chart, and Travel Home were not edited.

Completed acceptance rows with direct evidence: ACCR1, ACCR2, ACCR3, and the deletion row. See the tables above.

Unfinished/failed rows and exact next action: none locally. Next action is the pull request and CI.

Deletion ledger and current consumer migration: one server schedule owner. No component scheduled algorithm existed to delete. Daily proration remains the default and the only daily implementation.

Commands run, results, tested SHA; required checks still pending: local commands in the verification table. The first seeded rehearsal failed on a stale image and the rerun after `make docker-build` passed. CI, merge, and deployment are pending.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/351 is open. #134 note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6809336590. Not merged. Not deployed.

External prerequisites and next actor: watch CI on PR #351. #110 remains the open parent ledger.

No unstated decision from the previous context is necessary to continue.
