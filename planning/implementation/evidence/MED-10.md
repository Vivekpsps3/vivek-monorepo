# MED-10 — implementation evidence

- Leaf issue and parent(s): [#285](https://github.com/Vivekpsps3/vivek-monorepo/issues/285); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: implementer, `agent/med-10`, `/tmp/vivek-med-10`
- Base main SHA, current tested SHA: base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Local gates below ran on this working tree immediately before the commit that adds this file.
- Fresh-main/prerequisite/active-PR checks: worktree HEAD matched `origin/main` at the base above. `gh issue view` showed MED-01 #235, MED-08 #242, and MED-02 #236 closed, and #285 open with no prior claim. No open pull requests. MED-08 (`d858f3d`) and MED-02 (`0c6e6bf`) are in this base. Catalog lookup and the tag editor were not reworked.

## Acceptance

MQA1 is one row. Each retained #128 Media finding is listed under it. Held responses use a Playwright route gate, not a sleep, except the save deadline, which is the product 12s timeout. Fixtures are synthetic library rows (`First story`, `Second story`, `Third story`, `Toast story`, `Preflight story`, album portrait) and the API client in `test_library_sort.py`. No live provider call.

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| MQA1 / third-item late failure | Open First story, hold its PATCH, choose Third story from the library, type a note, then release the first save as HTTP 500 | PASS | `detail-races.spec.ts` › `selecting the third item before an old failure resolves keeps that item and its draft`. Third heading and `Third draft` stay; no alert and no toast; Third story persists; First story's saved note stays `Kept note` and its unsent draft is restored with no alert |
| MQA1 / Monday composer header | `suite-week-start=1` makes the trip composer header Monday and the Media week labels start with Mon; October 2026's first cell moves with that setting | PASS | already on this base. `node --test apps/travel/backend/static/tests/week.test.mjs` (`the live trip composer follows the shared week setting`, 5 passed) and `format.test.mjs` (`Media calendar follows the shared week setting`) inside the media node run (53 passed). No new grid |
| MQA1 / preflight timeout | Hold the save PATCH. The note stays, the alert says timed out, Save changes is enabled, and retry persists the note. Request log has no `/api/summary` or `/api/auth/csrf` call and exactly one PATCH before retry, then two | PASS | `detail-races.spec.ts` › `a held save times out without a summary preflight and keeps the draft` |
| MQA1 / toast retirement | A 500 save shows `Save failed.` in `main [role=alert]` and `.toast` count is 0. The next successful save shows `Changes saved.`, clears the alert, and still has no toast | PASS | `detail-races.spec.ts` › `a failed save stays inline and the next success retires it without a toast` |
| MQA1 / sticky_status cache | Search status is this response's outcome. A failure, then rows, then a failure report error, ok, error for tmdb | PASS | `test_bundle_m.py` › `test_provider_line_does_not_contradict_the_rows`, inside `./scripts/coverage-gate.sh media` (207 passed) |
| MQA1 / duplicate-review no-op | One PATCH of the same note, including a stale `review_base` and a whitespace-only clear of an empty note, returns 200 and issues zero INSERT/UPDATE/DELETE. `review_updated_at` and `updated_at` stay put. A different note with a stale base is still 409. The same note plus another field still checks the base | PASS | `test_library_sort.py` › `test_same_review_text_with_a_stale_base_is_a_noop`, `test_stale_review_base_is_a_conflict`, `test_identical_review_does_not_skip_the_base_check_for_other_fields` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `sticky_status`, `_HEALTH`, `HEALTH_TTL` at base `a7e16c6` | `providers.search` `accept`, `test_provider_status_matches_this_response`, `conftest._clear_provider_health` | `accept` assigns `"ok"` or `"error"` from this response | Removed the cache and the unit test that only called it. Search behavior test kept | `rg sticky_status` and `rg _HEALTH` under `apps/media` are empty. `test_provider_line_does_not_contradict_the_rows` passed |
| Identical-review fall-through in `patch_entry` | `assert_review_base` returned before the 409 check, then `patch_entry` still assigned fields and `db.flush()` | `assert_review_base` returns True and `patch_entry` returns the entry before snapshot or flush | Removed the write path for a review-only identical body. Conflict and mixed-field checks stay | `_request_writes` saw one PATCH and `writes == []` for the text replay and the blank replay |
| Detail mutation that could still apply after the reader left | `save`, `action`, `remove`, and episode refresh checked `generation` but were not cancelled when `load` switched items | `load` bumps `generation` first, then unsubscribes load, photo, link, mutation, and progress requests. Inline `error` / `message` remain the item failure owner. Media API toasts stay suppressed by `SILENT_ERROR_TOAST` in the existing request policy. Next-episode Undo toasts stay; they are a different action | Cancelled the stale subscription. No replacement cache or retry layer | Third-item, toast, and held-save tests above. Existing portrait race, conflict note, and outage tests still passed in Media Playwright (84 passed) |

- Candidate class and protected counterexamples: duplicate live policy for the review no-op and the provider status line; verified orphan for the health cache (it always returned the state just stored). Membership migration SQL, catalog versus personal entry, and owner/revision checks were not touched.
- Comparison base SHA and full replacement closure: `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Closure is `providers.py`, `records.py`, `detail.component.ts`, their tests, `detail-races.spec.ts`, and this evidence file. `drafts.service.ts` needed no change: drafts stay keyed by owner and item, and a cancelled mutation does not clear them.
- Production added/deleted/moved: `git diff --numstat` against the base: `providers.py` +1/−19, `records.py` +11/−8, `detail.component.ts` +13/−5. Net production −7. No comment-only file. The providers deletion includes the dead function's docstring.
- Independent equivalent implementations before/after: provider status 2 (cache plus the assignment that ignored it) → 1. Review-only identical save 2 (no-op return inside `assert_review_base`, then the full patch) → 1. Item failure display stays the inline alert; the generation check and the unsubscribe are one owner, not a second copy.
- State/cache owners and public entry points before/after: `_HEALTH` removed. Public search status is the `providers` object on the search response. `PATCH /media/api/entries/{id}` still enters `records.patch_entry`. Detail `load` / `save` remain the screen owners.
- Remaining old symbol/path search, including config and discovery: no `sticky_status` or `_HEALTH` under `apps/media`. No summary CSRF preflight in the detail save (request count in the held-save test).
- Follow-up change: a new detail save still edits `detail.component.ts` and `records.patch_entry`. A search status change edits `providers.accept` only.
- Tests/docs/generated changes separately: tests `conftest.py` +1/−3, `test_bundle_m.py` +0/−12, `test_library_sort.py` +34/−6, `detail-races.spec.ts` +108/−1. This evidence file is the only doc. No generated bundle committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: −7. The `records.py` and `detail.component.ts` additions are the early return and the in-flight cancel. Both have callers (`patch_entry`, `load` / `save` / `action` / `remove` / `refreshEpisodeProgress`).
- No behavior/data/meaningful assertion silently removed: conflict 409, mixed-field base check, provider error/ok/error sequence, portrait late-save race, stalled-save phase0 test, and next-episode Undo toasts remain. The removed `test_provider_status_matches_this_response` only called the deleted function.

## Verification

All commands from `/tmp/vivek-med-10` with `PYTHONDONTWRITEBYTECODE=1` and `PYTHON=$PWD/.venv/bin/python`. Karma used `port: 9944` in this worktree's `apps/karma.conf.js` and `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. That port line was reverted before commit. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to the same Chrome. Coverage reporter loaded; `SUITE_KARMA_COVERAGE` was left unset only in the sense that it was not needed.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch MED-10` | printed the profile commands below |
| `make test-fast` | PASS |
| `make lint-web` | PASS (eslint baselines unchanged) |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 675 SUCCESS, statements 82.6% |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS, 53 |
| `node --test apps/travel/backend/static/tests/week.test.mjs` | PASS, 5 (Monday header; not a profile command) |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 84 |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, 78 |
| `npx playwright test --project=suite` | PASS, 24 |
| `make lint-python` | PASS (format, ruff 101, suppressions 6) |
| `make typecheck-python` | PASS (mypy 87 baseline) |
| `./scripts/coverage-gate.sh media` | PASS, 207 tests, 84.33% (floor 70.6%) |

Focused `detail-races.spec.ts` was 4 passed before the full Media run. Not run: Finance/Travel/site Karma, Finance/Travel Playwright, server coverage. This diff does not touch those screens. Deployment was not run.

## Handoff

- PR URL (leaf closure keyword only): pending in this commit; `Closes #285` only. #85 is referenced and stays open.
- Roadmap #134 append-only status-note URL: pending until the PR exists.
- Merged/activation status: not merged. Local verification only.
- Remaining external prerequisites or approved scope decisions: none. Monday composer header was already implemented (`weekdayHeads` / `weekDayLabels`); this leaf did not add a second calendar.
- Next actor: open the PR, watch CI, squash-merge, then record the squash SHA here and on #285 and #134.
