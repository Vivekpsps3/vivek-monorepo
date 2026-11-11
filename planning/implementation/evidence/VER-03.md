# VER-03 — implementation evidence

- Leaf issue and parent(s): [#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211). Parents [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) and [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) stay open.
- Agent/context, branch/worktree: VER-03 implementer, branch `agent/ver-03`, worktree `/tmp/vivek-ver-03`.
- Base main SHA, current tested SHA: base `85212152bda3ce6cab5cbfcc9c787b564214fc69`. Implementation commit `b8fd8993a14e9774c864ace36b3c9dadb8735e6e`. The gates ran on that diff before the commit; this SHA line is the only later edit.
- Fresh-main/prerequisite/active-PR checks: `HEAD` matched `origin/main` at `85212152bda3ce6cab5cbfcc9c787b564214fc69`. VER-01 (#209) is closed. No open pull requests. Issue #211 had no earlier claim. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/211#issuecomment-6808747732

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Injected clock `2026-10-29T12:00Z` with America/Los_Angeles accepts 2026-10-28..30 and rejects 2026-10-27, 2026-10-31, 2026-11-01, 2026-11-05, and host date 2026-11-11. The same instant in Pacific/Kiritimati accepts 2026-10-29..31, including 2026-10-31, and rejects 2026-11-01. A naive clock `2026-10-30T00:30` is UTC, so Los Angeles stays on 2026-10-29. Absent `tz` and `Not/AZone` resolve to UTC today 2026-10-29. Undo of local yesterday is 409 `checkin_locked`; undo of local today and tomorrow is 200. User 2 gets 404 `habit_not_found` on the owner's valid 2026-10-28..30 check-in and undo, and the owner's one row remains. | PASS | `test_checkin_window_follows_trusted_local_today` (`la-noon`, `kiritimati`, `naive-clock-is-utc`, `absent-zone`, `unknown-zone`) and `test_foreign_owner_cannot_use_a_locally_valid_checkin_day` in `apps/server/tests/test_town_api_write.py`, inside `./scripts/coverage-gate.sh server` |
| LOCAL2 | The two strict UTC-clamp xfails are gone. Each row below names the surviving check. `writes._server_day` is not defined. Profile 404 stays with UX-01. The pointer-only Hub strip stays with UX-03. | PASS | Deletion table. `assert not hasattr(town_writes, "_server_day")` in the local-day test |
| LOCAL3 | A reader can separate mode, denominator, floor, and historical measurement. Python `branch = false` measures statements. The server gate printed `Stmts` / `Miss` / `Cover`, total 79.10%, floor 61.53%, and a notice that the pinned 61.87% rose. Karma's loaded-source denominator and its floors are stated in `docs/QUALITY.md`. | PASS | `docs/QUALITY.md` Coverage, `quality/coverage.txt` header, `pyproject.toml` `[tool.coverage.run]`, and the server gate TOTAL line |
| LOCAL4 | Numeric rows in `quality/coverage.txt` are unchanged (`finance 84.37 83.28`, `travel 81.41 80.41`, `media 71.60 70.60`, `server 61.87 61.53`). `apps/karma.conf.js` thresholds were not edited. No test was skipped, xfailed, or retried. The server run is 887 passed and reports no xfailed. | PASS | `git diff quality/coverage.txt` comment-only; `./scripts/coverage-gate.sh server` |

`test_checkin_window_follows_local_today_at_both_edges`, `test_la_evening_checkin_matches_get_can_check_yesterday`, `test_window_idempotent_checkin_and_dst`, and `test_cross_user_and_quiet_logs` still cover the earlier local-day edges, the duplicate-insert race that finds the row, and cross-user privacy.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `test_server_day_clamps_to_the_utc_date_plus_or_minus_two` (strict xfail). It imported a missing `writes._server_day` and expected 2026-11-05 to clamp to 2026-10-31 and 2026-10-01 to clamp to 2026-10-27. | `apps/server/tests/test_town_api_write.py` only. No production caller. | Local today from `get_town_clock` plus `today_in_zone` / `resolve_tz`. Check-in window is yesterday, today, and tomorrow (`CHECKIN_WINDOW`). | Deleted the test and the `importlib` lookup. Did not add `_server_day`. | `la-noon` and `kiritimati` reject 2026-11-05 and 2026-10-01. 2026-10-31 is rejected in Los Angeles and accepted in Kiritimati at the same UTC instant. |
| `test_checkin_window_clamps_today_to_utc_plus_or_minus_two` (strict xfail). It patched `today_in_zone` to 2026-11-05 and expected 2026-10-30 and 2026-11-01 to succeed, 2026-10-29 and 2026-11-02 to fail, undo of 2026-11-01 to succeed, and undo of 2026-10-30 to lock. | Same test module. The patch was not production behavior. | The same local-day window and undo rule (`day < today` or `day > today + 1` is locked). | Deleted the test. The live route is not patched. | Same parametrized test: boundaries succeed, the next day outside fails, yesterday undo stays locked, today and tomorrow undo return 200 and leave only yesterday stored. |
| Coverage prose that treated the pinned total as the current run, or a one-point gap as the floor rule | `quality/coverage.txt` header and the Coverage section of `docs/QUALITY.md` | Statement mode, suite denominator, current floor, and historical `measured` column, written separately. Karma loaded-source totals are that run's loaded files. | Replaced the blended sentences. Numeric floors and the pinned measurements stayed. | LOCAL3 rows. Server gate notice names pin 61.87%, run 79.10%, floor 61.53%. The floor was not rewritten. |

Profile 404 is not this leaf. UX-01 (#259) replaced the explicit `GET /settings/profile` 404 expectation; the proof is [UX-01 evidence](UX-01.md). The pointer-only Hub strip is not this leaf. UX-03 (#261) replaced the hidden click target with the roving grid; the proof is [UX-03 evidence](UX-03.md) and `apps/web/e2e/hub-pixels.spec.ts`. Neither file was edited here.

- Candidate class and protected counterexamples: stale comments/docs, plus speculative tests for a helper that was never the accepted contract. Not a product removal. Owner isolation, the trusted injected clock, the local check-in window, and undo locking stay. Finance, Media, Travel, Health, and Hub files were not edited.
- Comparison base SHA and full replacement closure (including new files): `85212152bda3ce6cab5cbfcc9c787b564214fc69`. Closure: `apps/server/tests/test_town_api_write.py`, `docs/QUALITY.md`, `pyproject.toml`, `quality/coverage.txt`, this file. `apps/server/town/writes.py` and `apps/server/town/clock.py` were read and left unchanged.
- Production added/deleted/moved; comments/blank-only churn separately: production 0. `pyproject.toml` adds three comment lines above the existing `branch = false` and `omit` list. No code move.
- Independent equivalent implementations before/after: the running window was already local today. The two xfails described a second, optional UTC±2 policy. After this change there is one policy, and the tests follow it.
- State/cache owners and public entry points before/after: unchanged. `get_town_clock` remains the trusted instant. `resolve_tz` still maps a missing or unknown zone to UTC. Check-in and undo routes are unchanged.
- Remaining old symbol/path search, including config and discovery: no `test_server_day_clamps` or `test_checkin_window_clamps` under the repo. No `_server_day` symbol. The local-day test fails if that helper appears.
- Follow-up change: which production files and independent policy owners now need editing: a future check-in window change edits `apps/server/town/writes.py` (`CHECKIN_WINDOW` in `constants.py`) and `apps/server/tests/test_town_api_write.py`. VER-04 owns `scripts/coverage-gate.sh`, the Makefile, `package.json`, and CI. `apps/karma.conf.js` had no ownership defect, so it was not edited; its floors remain the current Karma gates.
- Tests/docs/generated changes separately: `test_town_api_write.py` +164/−56. `docs/QUALITY.md` +6/−4. `quality/coverage.txt` +7/−5 comment lines; the four numeric rows are unchanged. This evidence file is the new planning doc. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: production delta 0. The test file grew because the retired xfails were replaced by executed boundary, zone, owner, and insert-race checks. That growth is not a production feature. Coverage floors were not lowered. The server gate's suggested floor 78.10% was not applied.
- No behavior/data/meaningful assertion silently removed: the duplicate-insert path that finds the existing row still expects 200 in `test_window_idempotent_checkin_and_dst`. The new race test expects 500 `Internal server error` with `detail` and `request_id` only, and the stored count stays 1, when the second lookup still sees no row. Foreign-owner 404s and the quiet-log cross-user test both remain.

## Verification

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch VER-03` | printed `make test-fast`, `make lint-python`, `make typecheck-python`, `./scripts/coverage-gate.sh server` |
| `make test-fast` | PASS. Doc paths OK. Planning validation 94 packets. Unittest 98 OK. Node script tests 15 pass, 0 fail. |
| `make lint-python` | PASS. 222 files already formatted. ruff 101. suppressions 6. |
| `make typecheck-python` | PASS. mypy 87. |
| `./scripts/coverage-gate.sh server` | PASS. 887 passed, no xfailed. Statement total 79.10% (`Stmts`/`Miss`/`Cover`). Required floor 61.53% reached. Notice: pinned 61.87% rose to 79.10%; suggested floor 78.10% was not applied. Perf gate `GET /api/town` p50 131.29 ms passed. |
| `python3 -m pytest -q apps/server/tests/test_town_api_write.py -p no:xdist` | PASS. 21 passed. Focused run only; the coverage gate is the server result above. |

`apps/karma.conf.js` was not changed, so the Karma suites were not run. No screen, route, or component changed. No suite was skipped, relabelled, or given a lower gate. `SUITE_KARMA_COVERAGE` was not set.

## Handoff

- PR URL (leaf closure keyword only): not opened yet. The pull request will use `Closes #211` only.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status (actual evidence, not assumption): not pushed and not merged. Local gates above passed on this diff.
- Remaining external prerequisites or approved scope decisions: the optional UTC±2 clamp is rejected. Local today from the trusted clock and the resolved zone is the contract. UX-01 keeps Profile 404. UX-03 keeps the Hub pointer/keyboard strip. VER-04 keeps the coverage script, Makefile, package.json, and workflow. Parents #199 and #81 stay open.
- Next actor: push `HEAD:agent/ver-03`, open the pull request, append the #134 note, watch Backend, Frontend, Unified Site Release, and Playwright, then squash-merge. Record the squash SHA on #211 and #134.
