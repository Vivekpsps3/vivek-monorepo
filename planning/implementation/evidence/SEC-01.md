# SEC-01 — implementation evidence

- Leaf issue and parent(s): [#266](https://github.com/Vivekpsps3/vivek-monorepo/issues/266); parent [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121) stays open
- Agent/context, branch/worktree: SEC-01 in `/tmp/vivek-sec-01`, branch `agent/sec-01`
- Base main SHA, current tested SHA: `origin/main` `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Gates below ran on that base plus the product diff, before this evidence file. Head SHA is the commit that contains this record; it does not change product code.
- Fresh-main/prerequisite/active-PR checks: no dependencies. Open PR at implementation time was #320 (`agent/fin-03`, Planning facts), which does not edit these files. Issue #266 had no claim comment.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | Same-site `http://testserver` (no Origin) and documented dev origins `http://127.0.0.1:4200`, `http://localhost:4200`, `http://127.0.0.1:8000`, `http://localhost:8000` issue and verify with that origin and the correct purpose. Public `https://vivekpanchagnula.com` signs in and renames when it is the only `CORS_ORIGINS` entry. `X-Forwarded-Host`, `X-Forwarded-Proto`, and `Forwarded` do not change the bound origin. Existing username and challenge suites still pass. | PASS | `test_same_site_and_development_clients_sign_in_and_rename`; finance gate also ran `test_change_username.py` and `test_auth_challenge.py` |
| A02 | Absent, malformed, foreign, and swapped allowlisted origins reject a captured proof with `401` and `Invalid or expired vault authentication challenge`. No session and no rename. The proof is not spent, so the original origin still works. Login and rename purposes cannot be swapped. Another account's proof cannot sign in or rename. Real and unknown usernames share that status and body; a valid origin still returns the same challenge keys and the same origin line. | PASS | `test_bad_origins_reject_a_captured_proof_without_spending_it`; `test_real_and_unknown_accounts_share_challenge_shapes`; `test_cross_owner_proof_does_not_rename_or_sign_in`; `test_login_challenge_cannot_rename`; `test_username_change_challenge_cannot_login` |
| A03 | Two SQLite transactions pass a `threading.Barrier` inside `_consume` and then run the `consumed_at IS NULL` update. Login: one `create_session`, session count 2 (signup plus the winner), username unchanged. Rename: one username commit, the other name is not stored, session count unchanged. | PASS | `test_concurrent_login_spend_opens_one_session`; `test_concurrent_rename_spend_changes_the_user_once` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `_origin` and `_request_origin` | `passwordless_challenge`, `passwordless_verify`, `_decoy_challenge`, `change_username` | `bound_challenge_origin` in `challenge_auth.py`. Message text is `render_challenge_message` (the previous join, now shared by real and decoy challenges). | Deleted both helpers. No third `Origin`/`base_url` fallback. | `rg` of `def _origin`, `def _request_origin`, and `request.base_url` under `apps/` finds neither helper. A01 success and A02 rejection both call `bound_challenge_origin`. |

- Candidate class and protected counterexamples: duplicate live policy. Signing, AES-GCM, decoy secret persistence, and the `consumed_at` compare-and-set stay. No second ledger.
- Comparison base SHA and full replacement closure: `0ed83e95a3727acc4f512dd2ac77211d8a622407`. Closure is `apps/server/identity/challenge_auth.py`, `routes.py`, `username_change.py`, finance `conftest.py`, `test_challenge_binding.py`, and `docs/SECURITY_MODEL.md`.
- Production added/deleted/moved: `challenge_auth.py` +74/−9, `routes.py` +11/−13, `username_change.py` +14/−7. Added 99, deleted 29, net +70. Moved: the challenge message join into `render_challenge_message`. Docstrings on the new helpers are the comment lines; no blank-only churn file.
- Independent equivalent implementations before/after: two copies of `Origin` header or `request.base_url`, then one `bound_challenge_origin`.
- State/cache owners and public entry points before/after: `auth_challenges.consumed_at` and `user_sessions` are unchanged. New entry point: `bound_challenge_origin`. `issue_challenge` and `verify_challenge` stay the protocol owner.
- Remaining old symbol/path search: `_origin` / `_request_origin` remain only as the deletion name in this packet and this file. The only production `Origin` read is inside `bound_challenge_origin`.
- Follow-up change: which production files and independent policy owners now need editing: a new challenge caller passes `bound_challenge_origin`. SEC-02 still owns CSRF repair in `session.py` and `routes.py`; it should not grow a second origin parser.
- Tests/docs/generated changes separately: `test_challenge_binding.py` +464/−1, `conftest.py` +6, `SECURITY_MODEL.md` +2. This file is the evidence record. No generated bundle.
- Net production delta and specific reviewed safety/compatibility exception if positive: +70. The increase is the allowlist parser and the single reject path. The old helpers trusted any `Origin` or `Host`. That was the boundary this leaf closes, not a simplification quota.
- No behavior/data/meaningful assertion silently removed: decoy persistence tests, legacy `@` username lookup/preflight, purpose replay, and the atomic spend assertion still pass inside the finance gate (133 passed).

## Verification

`PYTHON` was `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` because this worktree has no `.venv`. `make test-fast` used a local symlink to the main checkout's `node_modules` (lockfiles match); that symlink is not part of the commit. Coverage floors were not changed. The printed rise (finance 84.37% → 85.89%, server 61.87% → 80.12%) is the gate's notice only.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-python` | PASS. ruff 101 findings match the baseline; suppressions 6 match |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline |
| `./scripts/coverage-gate.sh finance` | PASS. 133 passed. Total coverage 85.89% (floor 83.28%) |
| `./scripts/coverage-gate.sh server` | PASS. 874 passed, 2 xfailed. Total coverage 80.12% (floor 61.53%). Perf gate `GET /api/town` passed |

Not run: browser Karma and Playwright. This leaf does not change a screen. Deployment and merge were not done.

## Handoff

- PR URL (leaf closure keyword only): filled after `gh pr create` (`Closes #266`, reference #121)
- Roadmap #134 append-only status-note URL: filled after the comment
- Merged/activation status: not merged. Not deployed
- Remaining external prerequisites or approved scope decisions: parent #121 stays open. SEC-02 still owns CSRF commit/CAS
- Next actor: reviewer. Integration owner updates the roadmap body after merge
