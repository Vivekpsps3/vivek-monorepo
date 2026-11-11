# PTO-04 — implementation evidence

- Leaf issue and parent(s): [#233](https://github.com/Vivekpsps3/vivek-monorepo/issues/233) PTO-04. Parent [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) stays open.
- Agent/context, branch/worktree: Cursor Grok implementer, `agent/pto-04`, `/tmp/vivek-pto-04`.
- Base main SHA, current tested SHA: base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Application revision `ae822f10377899b0c5bd6b60fcabc77f10f07a4d` is what the local gates ran on. This handoff update does not change application code.
- Fresh-main/prerequisite/active-PR checks: origin/main was `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. PTO-02 #231 is closed by PR #337 squash `19c6b51ebdead875fad7f62f0a18a6b7a6288c94`, an ancestor of that main. PTO-01 #326 and PTO-03 #329 are merged. #233 had no prior claim. No open PR shared `travel-pto-main` or `travel-leave-api`. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/233#issuecomment-6806649288.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SICK1 | Sick and PTO policies, a past sick entry, a future sick entry, a manual PTO entry, and a future trip allocation. Cancel sends no removal. A 502 leaves every row. Success clears only Sick setup and the sick-time dismissal. | PASS | API `test_remove_sick_preserves_rows_and_a_second_request_conflicts` snapshots `LeavePolicy`, `PtoEntry`, and `TripPtoDay` before and after. Playwright `remove sick keeps history and a dated correction previews it` cancels at 390, fails once at 1280, then confirms. Ledger entries, allocations, and the PTO start balance match the before snapshot. |
| SICK2 | An old removal revision after Sick is saved again, a second POST of the spent revision, and another owner. | PASS | `test_stale_removal_cannot_erase_a_reconfigured_policy` (409, start balance stays `64`). The double POST in `test_remove_sick_preserves_rows_and_a_second_request_conflicts` (409, ledger unchanged). `test_other_owner_cannot_remove_sick` (404 with no row, 409 for a foreign revision, user 1 still `80`). `test_removal_rejects_a_bad_revision_without_writing`. Playwright opens the dialog, saves a new Sick balance, confirms the old revision, sees the dialog error, cancels, and the editor shows `64`. |
| SICK3 | After removal, Sick is saved again over the same entries. A dated impact preview is read, then the editor saves a new start balance and balance date. | PASS | `test_reconfigure_and_dated_correction_keep_history`: impact for 40 h as of 2026-01-01 is `32` hours; as of 2026-11-01 it is `40` hours; `entries_rewritten` is false; Clinic stays `1.0000` day on 2026-02-02. Playwright shows both preview sentences, then the saved policy is `40` h as of 2026-11-01 with the same entries and trip allocations. Clinic remains on the page. |
| Deletion | Ambiguous Sick reset / ledger-delete paths. | PASS | No policy DELETE route is added. `test_there_is_no_delete_policy_route` still passes inside the travel coverage gate. The new test also DELETE `/api/pto/policies/sick` and records 405, then asserts the ledger is unchanged. POST `/api/pto/policies/pto/removal` is 405 and does not write. Removal sets `configured` false and resets Sick setup fields only. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Ambiguous Sick reset actions and destructive ledger-reset paths | None on this base. `rg` found no Sick policy reset/remove handler. `test_there_is_no_delete_policy_route` already forbade `DELETE /pto/policies`. Entry removal stays the separate “Remove leave” action. | `POST /pto/policies/sick/removal` in `leave.py`, confirmed by `PtoComponent.removeSick` | No obsolete handler to delete. The new command is the only policy removal. It does not delete `PtoEntry` or `TripPtoDay` rows. | Row snapshots in `test_sick_policy_removal.py` and the Playwright ledger. |

- Candidate class and protected counterexamples: the candidate was not a live duplicate on `bc2d79e`. This is a safety/feature leaf. Historical leave, future allocations, PTO rows, and the combined chart/Home balances stay. No accrual mode was added.
- Comparison base SHA and full replacement closure: `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Closure is `leave.py`, `schemas.py`, `pto.component.ts`, `test_sick_policy_removal.py`, `pto.spec.js`, and this evidence file. `models.py` and `leave_math.py` are unchanged. `packages/ui` is unchanged. `ConfirmService.confirmAction` is called with `{ title, message, confirmLabel, cancelLabel, busyLabel, errorMessage, run }`.
- Production added/deleted/moved; comments/blank-only churn separately: `leave.py` +155/−3, `schemas.py` +15/−1, `pto.component.ts` +117/−7. Production about +287/−11, net +276. The new test file is 285 lines. Playwright `pto.spec.js` +154/−0. No generated bundle is committed.
- Independent equivalent implementations before/after: zero Sick-policy removal commands before (DELETE was rejected). One owner/revision command after. Entry delete remains a different action.
- State/cache owners and public entry points before/after: Sick revision is the existing `Setting` row `user:{id}:sick_policy_revision`, the same owner-scoped store as the sick-time prompt. It is not a new `leave_policies` column: `test_leave_carry_forward_is_the_only_head` pins the Alembic head at `site_leave_carry_v1`, so a column would require a migration this leaf must not use to move that head. The PTO page still owns the draft. Impact preview is a read of `walk_bucket` and is not a second balance engine.
- Remaining old symbol/path search, including config and discovery: no `remove_sick` or policy DELETE handler existed to retire. `DELETE /pto/policies/sick` is still not a route.
- Follow-up change: Sick removal and the dated impact preview live in `leave.py` and `pto.component.ts`. Exact balances stay in `leave_math.py`. Chart geometry and Travel Home stay as landed. Scheduled accrual stays PTO-05.
- Tests/docs/generated changes separately: tests +439/−0 (`test_sick_policy_removal.py`, `pto.spec.js`). This file is the planning doc. `dist/` from `make build-frontends` is not committed. The Karma port `9976` in `apps/karma.conf.js` was reverted before commit.
- Net production delta and specific reviewed safety/compatibility exception if positive: net about +276 production lines. This is a safety/feature leaf, not a simplification. The added lines are the revision claim, setup/dismissal reset, the read-only impact projection, and the confirm-and-run dialog. They exist so a stale or foreign retry cannot erase a reconfigured policy and so a dated correction can be previewed without rewriting entries.
- No behavior/data/meaningful assertion silently removed: `test_there_is_no_delete_policy_route` still passes. Existing PTO Playwright cases passed in the 156-test run.

## Verification

Local execution on the application tree above. CI, merge, and deployment were not run yet.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-python` | PASS (217 files already formatted; Ruff 101 findings match the baseline; suppressions 6 match) |
| `make typecheck-python` | PASS (mypy 87 findings match the baseline) |
| `./scripts/coverage-gate.sh travel` | PASS. 208 passed. Total coverage 87.91% (floor 80.41%). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS (63 tests) |
| `make lint-web` | PASS (eslint ratchets match baselines) |
| `make typecheck-web` | PASS |
| `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 710 SUCCESS. Statements 83.28% (5521/6629), branches 70.25% (2123/3022), functions 83% (1109/1336), lines 86.93% (4777/5495). Karma listened on port 9976; that line was removed before commit. |
| `make build-frontends` | PASS |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROME_BIN npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 156 passed on the first application tree. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js apps/travel/e2e/pto.spec.js` | PASS. 24 passed after the impact assertion was changed. CI job 130794118664 had failed the new test with `Network.getResponseBody`: Chrome had already given the impact body to the page. The test now copies that JSON inside the route and fulfills the page from the copy. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/343 (`Closes #233`). Parent #110 is referenced and not closed.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6806896982. The roadmap body was not edited.
- Merged/activation status (actual evidence, not assumption): PR #343 is open. Not merged. Not deployed. Local verification passed on `ae822f10377899b0c5bd6b60fcabc77f10f07a4d`.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #110 stays open for the rest of its scope, including PTO-05.
- Next actor: watch the follow-up CI on PR #343 and squash-merge only after Backend, Frontend, Unified Site Release, and Playwright are green. The first Playwright run failed only on the impact response body; Frontend's first failure was the existing World controller test, which also failed on docs-only main `bc2d79e` and passed on rerun.

Issue / parent / local packet: PTO-04 / #233 / #110 / `planning/implementation/issues/PTO-04.md`.

Branch, worktree, base main SHA, current SHA: `agent/pto-04`, `/tmp/vivek-pto-04`, base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`.

Owned files and conflict groups; other active PRs checked: `travel-pto-main`, `travel-leave-api`. No open PR shared those files. `packages/ui` was not edited. The combined chart and Travel Home were not edited.

Completed acceptance rows with direct evidence: SICK1, SICK2, SICK3, and the deletion row. See the tables above.

Unfinished/failed rows and exact next action: none locally. Next action is the PR and CI.

Deletion ledger and current consumer migration: one new command, no prior Sick-reset consumer to migrate. Entry removal stays.

Commands run, results, tested SHA; required checks still pending: local commands in the verification table passed. CI, merge, and deployment are pending.

PR and roadmap note URLs; actual merge/deployment/activation state: https://github.com/Vivekpsps3/vivek-monorepo/pull/343 is open. #134 note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6806896982. Not merged. Not deployed.

External prerequisites and next actor: open the pull request. #110 remains the open parent ledger.

No unstated decision from the previous context is necessary to continue.
