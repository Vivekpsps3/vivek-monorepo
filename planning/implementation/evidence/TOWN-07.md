# TOWN-07 — implementation evidence

- Leaf issue and parent(s): TOWN-07 / #255. Parent #81 and roadmap #134 stay open.
- Agent/context, branch/worktree: sole implementer, `/tmp/vivek-town-07`, branch `agent/town-07`.
- Base main SHA, current tested SHA: base `c5bfd45411796d85a9b0ccc04df9c801ced46b17`. Implementation `c90a1730e49ae03a566638779462721c8950027a`. Gates below ran on that tree before this evidence file.
- Fresh-main/prerequisite/active-PR checks: `origin/main` was `c5bfd454` at branch time and again before commit. TOWN-02 `86d2c60f` is an ancestor; `passive_days` on that tree groups owner-scoped Media and Travel queries. No open PR touched `schema-head`, `town-models`, or `town-writes`. #255 had no earlier claim.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| OWNDB1 | Two owners, boundary rows (styles forge/garden/cottage, slot 0 and 5, per_week 1 and 7, name and name_key length 40, an archived habit reusing slot 0), one check-in and one cadence. Upgrade keeps the row digest and `model_diff == []`. Head rejects cross-owner and orphan children, style `castle`, per_week outside 1..7, slot outside 0..5, and empty or 41-character name/key. Same-owner check-in on the other user's habit is accepted. API create of Morning returns 201; `castle` returns 422 `field_errors.building_style`; another user's check-in returns 404 `habit_not_found`. | PASS | `apps/server/tests/test_town_ownership.py` |
| OWNDB2 | `DELETE` of a habit that still has a check-in or cadence raises `IntegrityError` and leaves the habit. `delete_user_account` removes only that user's check-ins, cadences, and habits, in that order, and `PRAGMA foreign_key_check` is empty. The other owner's rows remain. | PASS | `test_habit_delete_is_restricted_until_children_are_gone`, `test_account_delete_removes_only_that_owners_town_rows` |
| MIG1 | One head `site_town_ownership_v1`. No applied revision file was edited. Preflight failures leave the database at `site_calendar_feeds_v1`, keep the bad row, and create no `_new_*` table. Offline `--plan` uses `CASE WHEN EXISTS (...) THEN 1/0` and does not `DELETE` or `UPDATE` the three Town tables. Downgrade and re-upgrade preserve the digest. Seeded adopt and upgrade plans keep identical file bytes; the upgraded database matches the models. | PASS | `test_town_ownership.py`, `make db-check`, `make db-validate-seeded` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Unnamed single-column `habit_id` foreign keys (`habit_checkins` ON DELETE RESTRICT, `habit_cadences` NO ACTION) | Town models and `site_town_v1` | `fk_habit_checkins_owner` and `fk_habit_cadences_owner`, both `(habit_id, user_id)` → `habits(id, user_id)` ON DELETE RESTRICT, plus `uq_habits_id_user` | Replaced in `site_town_ownership_v1`. Downgrade restores the single-column keys. | `test_upgrade_preserves_multi_owner_history_and_is_the_only_head` |
| Application name/style/cadence validators and `_owned` 404 | Town writes and `GET` check-ins | `apps/server/town/writes.py`, `engine.py`, `service.py` | Retained. A CHECK or foreign-key failure is `IntegrityError`, not the public 422 `field_errors` or 404 `habit_not_found`. | `test_api_keeps_422_for_style_and_404_for_another_users_habit` |
| `check_integrity` habit-owner JOIN | `apps/server/migrate.py` | Same function | Retained. It is still the mismatch detector for a database that has not reached this revision. Tests call it at `site_town_v1`. | `apps/server/tests/test_town_migration.py` (unchanged, passed in the server gate) |

- Candidate class and protected counterexamples: safety repair. Account deletion stays an ordered `DELETE` by `user_id` (check-ins, cadences, habits). It is not an `ON DELETE CASCADE` from `users`. Habit deletion with children stays RESTRICT. No historical date or XP column changes. No destructive cleanup of existing rows.
- Comparison base SHA and full replacement closure (including new files): `c5bfd45411796d85a9b0ccc04df9c801ced46b17`. Closure is `apps/server/town/models.py` and `apps/server/alembic/versions/site_town_ownership_v1.py`. Head pins and fixtures that stored `cabin`, slot ids above 5, or a cross-owner check-in were updated in the same commit. `writes.py`, `schema.py`, and `identity/admin.py` were not edited.
- Production added/deleted/moved; comments/blank-only churn separately: `models.py` +34/−6. New revision 266 lines, of which 24 are blank. The revision is the rebuild, the preflight, and the compatibility inserts. Alembic 1.14 does not emit CHECK constraints, so the revision is hand-written; `model_diff == []` does not by itself prove the CHECKs. Tests read `sqlite_master` and reject illegal inserts.
- Independent equivalent implementations before/after: one parent/child ownership path before (single-column habit key plus the migrate scan) and one after (composite keys plus the same scan). Public 422 validation stays in the Town write validators. Authorization stays the owner lookup.
- State/cache owners and public entry points before/after: rows stay in `habits`, `habit_checkins`, and `habit_cadences`. Column lists are unchanged. `sqlite_autoindex_habit_checkins_1` remains the first unique index on check-ins. `GET`/`POST` Town routes are unchanged. `ix_habit_cadences_user_id` is new.
- Remaining old symbol/path search, including config and discovery: the composite names `fk_habit_checkins_owner` and `fk_habit_cadences_owner` are the live child keys. The old unnamed habit foreign keys exist only in revisions before `site_town_ownership_v1` and in this revision's downgrade SQL.
- Follow-up change: which production files and independent policy owners now need editing: none in this packet. The migrate scan can stay until every supported database is past this revision.
- Tests/docs/generated changes separately: new `test_town_ownership.py` (522). Updated birthday drift labels, schema compatible-head set, world and leave-accrual head pins, Pixels slots, Town run fixtures, and the World style default. `docs/carryovers.md` +5/−7. Evidence is this file. No generated bundle is committed. Coverage floors were not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: production +300/−6, net +294. The positive delta is the constraint rebuild and the model declarations that Alembic compares. It is the safety repair, not a second copy of the validators.
- No behavior/data/meaningful assertion silently removed: owner streak math still compares to `evaluate_streak` on the owner's days. Cross-owner check-ins are now rejected instead of stored and ignored. Pixels still scopes sparse days with legal slots 0 and 1. World isolation still uses `cottage`.

## Verification

Local gates from `/tmp/vivek-town-07`. `python3` on `PATH` was `/tmp/vivek-town-07/.venv/bin/python` (symlink to the repo virtualenv) because the worktree has no interpreter of its own and system `python3` has no Alembic. `make` targets that call `$(PY)` used that symlink. Floors in `quality/coverage.txt` were not changed.

| Command | Result |
| --- | --- |
| `PATH="/tmp/vivek-town-07/.venv/bin:$PATH" make test-fast` | PASS. 135 unittest tests OK, node suites 21 passed. |
| `make lint-python` | PASS. Ruff 90 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. Mypy 79 findings match the baseline. Rerun after the fixture edits. |
| `./scripts/coverage-gate.sh server` | PASS. 422 passed. Coverage 79.39% (floor 61.53). `GET /api/town` p50 130.88 ms (min 130.03, max 184.16). |
| `./scripts/coverage-gate.sh travel` | PASS. 190 passed. Coverage 86.05% (floor 80.41). Run because `test_leave_accrual_migration.py` changed. |
| `make db-check` | PASS. `schema_drift_check` ok at `site_town_ownership_v1`. |
| `make db-validate-seeded` | PASS on the rerun. Adopt `stamp_and_upgrade`, 2527 rows, plan bytes unchanged. Upgrade from `c5bfd454` / `site_calendar_feeds_v1` to `site_town_ownership_v1`, 2976 rows, plan bytes unchanged, `foreign_key_check` empty, model diff empty, smoke routes 200. The seeded files contain 0 Town rows, so Town digest preservation is the ownership test. The first local run failed because image `personal-site:development` (built 2026-11-18) stopped at `site_calendar_feeds_v1`. Rebuilt that tag from this worktree and reran. |

Finance, Media, Karma, and Playwright gates were not run. This diff does not change those apps' screens or production code. CI still runs them.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/532 (`Closes #255` only).
- Roadmap #134 append-only status-note URL: pending until merge.
- Merged/activation status (actual evidence, not assumption): PR #532 is open. Local gates passed. CI has not been recorded yet. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this packet. Merge is authorized after required GitHub checks are green.
- Next actor: watch checks, merge with a merge commit, comment on #134, remove the worktree.
