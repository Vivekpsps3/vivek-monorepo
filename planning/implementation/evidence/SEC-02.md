# SEC-02 — implementation evidence

- Leaf issue and parent(s): [#267](https://github.com/Vivekpsps3/vivek-monorepo/issues/267); parent [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121) stays open
- Agent/context, branch/worktree: SEC-02 in `/tmp/vivek-sec-02`, branch `agent/sec-02`
- Base main SHA, current tested SHA: started at `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Product gates below ran on this worktree before the evidence file. SEC-01 `939984de` is an ancestor.
- Fresh-main/prerequisite/active-PR checks: SEC-01 is merged. Open work at claim time was #322 (FIN-01), which does not edit identity session or the web session client. Issue #267 had no prior claim.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | A stale CSRF cookie on `GET /api/auth/me` is compare-and-set and committed before `set_csrf_cookie`. A second connection already holds that hash when the cookie is attached. A missing cookie does not rotate the hash, and `POST /api/auth/session` with the original header is not 403. A matching cookie is echoed unchanged. After repair, the same mutation with the emitted token returns 200. A failed commit emits no CSRF cookie and leaves the stored hash. | PASS | `apps/finance/backend/tests/test_csrf_repair.py::test_repair_commits_the_hash_before_the_cookie_and_a_mutation_works`; `::test_repair_commit_failure_does_not_publish_a_cookie`. Existing missing/matching coverage also remains in `test_change_username.py`. |
| A02 | Two repairs of one session wait on one barrier, then compare-and-set the same observed hash. One response sets `finance_csrf`. That value hashes to the committed row. The other response sets no CSRF cookie. A concurrent refresh of the previous cookie does not publish that previous token over the winner. | PASS | `::test_concurrent_repairs_publish_only_the_committed_token`; `::test_refresh_does_not_overwrite_the_repair_winner` |
| A03 | A username change that receives 403 refreshes `GET /api/auth/me` once. Network, 500, and 401 refresh responses do not send lookup or `PATCH /api/account/username` again. The visible message is the generic server/network sentence or the session-expired sentence, and the planted server string is absent. A 500 on the mutation itself does not refresh. Another tab's `suite-session-ended` event and a refresh that names a different user do not retry or replace this browser's user. Karma renders the generic sentence for a 500 detail and for a raw `Error`. | PASS | `auth.service.spec.ts` request-count tests; `username-change.component.spec.ts` redaction and live-region tests. Full web Karma: 660 passed. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Independent CSRF repair (`UPDATE` by session id, then `set_csrf_cookie` before commit) and the client branch that returned a string `detail` before the 5xx/network check | `GET /api/auth/me` via `repair_csrf_cookie`; `SessionService.changeUsername` / `UsernameChangeComponent` via `usernameChangeMessage` and `err.message` | `commit_csrf_repair` plus `emit_committed_csrf` for both repair and refresh. `usernameChangeMessage` checks network/5xx, then mapped status, then a typed field, then a client string. The component uses that classifier. | The id-only update and the detail-before-5xx return are gone. Missing and matching cookie behavior stays. `routes.py` still calls `repair_csrf_cookie`. | `rg` finds no id-only CSRF update under `apps/`. Finance gate 137 passed, including the older missing/matching assertions in `test_change_username.py`. Failed-refresh request counts are in `auth.service.spec.ts`. |

- Candidate class and protected counterexamples: duplicate live policy, replaced in this safety repair. Signing, AES-GCM, challenge origin binding, and `consumed_at` compare-and-set stay. No second ledger. Synthetic accounts only.
- Comparison base SHA and full replacement closure: `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Closure is `apps/server/identity/session.py`, `apps/web/src/app/platform/session.service.ts`, `apps/web/src/app/platform/auth/username-change.ts`, `apps/web/src/app/hub/username-change.component.ts`, and the tests named above. `routes.py` is unchanged and remains the repair caller. No edit to hub load, private layout, vault collection policy, or `bound_challenge_origin`.
- Production added/deleted/moved: `session.py` +80/−14, `session.service.ts` +19/−12, `username-change.ts` +29/−20, `username-change.component.ts` +2/−2. Added 130, deleted 48, net +82. The new helper docstrings sit in that delta. No blank-only file. Moved: cookie publication into `emit_committed_csrf`, used by repair and refresh.
- Independent equivalent implementations before/after: one id-only repair and one detail-before-5xx return, then one committed-hash publisher and one ordered classifier.
- State/cache owners and public entry points before/after: `user_sessions.csrf_token_hash` remains the only CSRF revision. No new table, cookie name, or client store. `GET /api/auth/me` and the username-change client stay the entry points.
- Remaining old symbol/path search: the id-only CSRF update is absent under `apps/`. String details for unmapped 4xx still pass through after the 5xx check. `usernameChangeMessage(500, detail)` does not return that detail.
- Follow-up change: which production files and independent policy owners now need editing: HUB-01 owns visible focus and copy wiring. A later passphrase change that needs an expected revision uses its own column; it should call this cookie rule rather than grow a second CSRF writer.
- Tests/docs/generated changes separately: `test_csrf_repair.py` 316 lines, `auth.service.spec.ts` +142/−1, `username-change.component.spec.ts` +36/−2. This file is the evidence record. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +82. The increase is the compare-and-set, the committed-hash read, and the ordered classifier. The previous repair could publish a token that lost the race, and a 5xx string was shown before the generic sentence. That is the boundary this leaf closes, not a simplification quota.
- No behavior/data/meaningful assertion silently removed: missing-cookie, matching-cookie, birthday rollback, and session-slide tests still pass inside the finance gate (137 passed). A failed refresh no longer retries; the old retry-after-success path still runs once.

## Verification

`PYTHON` was this worktree's `.venv` symlink to the main checkout interpreter. `node_modules` was the same kind of symlink. Neither symlink is part of the commit. Coverage floors were not changed. The printed rise (finance 84.37% → 86.04%, server 61.87% → 79.91%) is the gate's notice only.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-python` | PASS. ruff 101 findings match the baseline; suppressions 6 match |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline |
| `./scripts/coverage-gate.sh finance` | PASS. 137 passed. Total coverage 86.04% (floor 83.28%) |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total coverage 79.91% (floor 61.53%). Perf gate `GET /api/town` passed |
| `make lint-web` | PASS. eslint ratchets match the baseline |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 660 passed. Coverage statements 82.55%, branches 68.69%, functions 82.10%, lines 86.09% |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/web/e2e/playwright.config.ts --workers=1` | PASS. 76 passed |
| `npx playwright test --project=suite` | PASS. 24 passed |

The default 4-worker Town Playwright command timed out once on the unchanged `town-checkin.spec.ts` visibility case while other files were running. That spec passed in the serial run above. It does not exercise CSRF repair.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/334 (`Closes #267`, reference #121)
- Roadmap #134 append-only status-note URL: posted with this PR
- Merged/activation status: not merged. Not deployed
- Remaining external prerequisites or approved scope decisions: parent #121 stays open. HUB-01 still owns account-form focus and copy wiring
- Next actor: CI, then squash-merge after Backend, Frontend, Unified Site Release, and Playwright are green
