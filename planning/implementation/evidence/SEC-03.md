# SEC-03 — implementation evidence

- Leaf: #268; parent: #121. Safety repair, not a simplification claim.
- Context: Codex, branch `agent/sec-03`, isolated worktree `/tmp/vivek-sec-03`.
- Base main: `f01716ac17633250b186f06956d5537f3e135a10`.
- Tested implementation: `fc25cb8ee91b722385b2eccbe43d7748af8d0746` (subsequent commits update this evidence only).
- Fresh-main/claims: fetched origin/main; no open PRs or leaf claims before starting. Claimed #268 with branch/worktree/base. Verified merged SEC-01 (#324, `939984de389b9e33510aecb12a80eb50ff3ef06b`), SEC-02 (#334, `1c3ae26cb15f8bf149da0e70d22efeaed3f30f81`) and CON-03 (#350, `04a5dac19356b3a6e6871a920b34fce0b843d08d`) ancestry and current origin/purpose, CSRF, and collection-policy implementations.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| A01 | `test_rotation_rewraps_the_same_keys_without_changing_any_collection_or_index`: real synthetic P-256 signing key and DEK rewrapped under a new passphrase; coherent GET/POST, revision +1, exact all-collection recovery snapshot and blind-index tuples unchanged; new wraps decrypt to original raw keys, old passphrase rejects. Current session remains usable, second owner session receives 401, foreign owner's session remains usable, committed proof replay rejects. | PASS |
| A02 | `test_second_write_or_commit_failure_rolls_back_both_wraps_revision_proof_and_sessions`: injected failure after both writes flush, and injected commit failure, each return 500 and retain exact prior wraps/revision/session revocations; same fresh proof can retry because its transaction rolled back. `test_stale_revision_rejects_both_writes_and_preserves_sessions` tests whole-operation conflict after an intervening legacy writer. `test_concurrent_expected_revision_has_one_committed_winner` uses two real file-backed SQLite transactions synchronized before CAS: one 200, one 409, revision advances exactly once. | PASS |
| A03 | Parameterized rejection matrix: foreign-owner proof, missing CSRF, login/rename purpose, expired proof, forged signature, foreign origin, below-floor auth/vault KDF, invalid auth/vault salt/wrap base64, and unexpected plaintext field. Wraps/revision/records/revocations unchanged. Legacy reads retain 310k iterations; rotation preserves nonempty legacy recovery columns. Anonymous credential reads reject. | PASS |
| Schema | `test_wrap_revision_upgrade_and_downgrade_preserve_existing_rows`: old credentials/KDF/recovery, encrypted Health record, blind index and session preserved, default revision 1 for existing and old-image inserts, no model drift or FK violations. Full adoption/upgrade rehearsal preserves original values and passes application smoke checks. | PASS |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Two independent wrap saves for a passphrase change | No passphrase-change UI existed. `VaultService.applyKdfUpgrade` still makes separate signing and DEK calls for same-passphrase automatic upgrades. | New authenticated `/api/auth/passwordless/credentials` GET/POST; `advance_wrap_revision` is shared with both compatibility writers. | Added one atomic operation. Intentionally retain legacy endpoints/caller until SEC-04 adoption, as the packet requires. Existing legacy KDF upgrade/recovery tests pass. No false claim that a frontend call path was deleted. |
| `_store_auth_wrap` persistence body | Bootstrap, signup, invitation enrollment and signing-wrap PUT | `store_auth_wrap` in identity's credential persistence module; also used by rotation | Moved the existing persistence decision once, including legacy recovery preservation; old implementation removed. This is a move, not executable savings. |

- Whole replacement closure: identity challenge purpose/model/schemas/routes/persistence helper, Finance vault compatibility route, one new migration, security/migration docs, server guidance, rotation/migration regressions and exact head/drift/compatibility expectations.
- Production physical delta against base: +209/-18, net +191 including the +32/-0 additive migration. No generated output, formatter sweep, or minification. New guards, transaction orchestration and CAS are necessary safety code. The moved auth persistence body is included in both sides, not counted as removed policy.
- Tests: +407/-2. Documentation/guidance before this evidence: +43/-1. No meaningful assertions removed; historical revision drift/compatibility assertions now name the new column/head exactly.
- Implementations: new atomic rotation 0 to 1; separate KDF upgrade endpoints remain 2 to 2 for compatibility. No second key/record store, cache, listener, timer, ledger or runtime framework.
- State ownership: wraps remain on `users`/`user_vaults`, ciphertext/indexes remain Finance-owned; one added revision on `users`. Requesting session keeps its cookie/CSRF; other owner sessions revoke only in the successful transaction.
- Follow-up: SEC-04 must adopt this single request, browser-local same-key rewrapping and existing lock lifecycle, and retire its replaced UI orchestration. No signing public-key, DEK, record version/AAD or index migration.
- Compatibility limits: remote held keys cannot be erased. Finish old-process rollout before enabling rotation UI; older images ignore the additive revision. No deployment/activation claim.

## Verification

All commands ran locally against the implementation above. The worktree uses uncommitted symlinks to the existing virtualenv/node_modules; lockfiles are unchanged. `PATH` includes `.venv/bin` for Python invoked by fast script checks. Separate `COVERAGE_FILE` paths avoid concurrent suite artifact collisions. No baseline, coverage floor, retry or assertion gate was lowered.

| Command | Final result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS: doc/planning paths, boundaries, 111 Python script tests and 21 Node script tests; browser project listing only (not browser execution) |
| `make lint-python` | PASS: formatting; Ruff 91 and suppressions 6 match existing baselines |
| `make typecheck-python` | PASS: mypy 82 findings match existing baseline |
| `COVERAGE_FILE=/tmp/sec03-finance.coverage ./scripts/coverage-gate.sh finance` | PASS: 159 tests; 82.32%, floor 81.03% |
| `COVERAGE_FILE=/tmp/sec03-server.coverage ./scripts/coverage-gate.sh server` | PASS: 357 tests; 74.27%, floor 61.53%; included performance gate 1 passed, Town p50 132.21 ms |
| `make db-check` | PASS: empty drift at `site_credential_wrap_revision_v1` |
| `make docker-build` | PASS: branch image built; synthetic rehearsal only |
| `make db-validate-seeded` | PASS: adopt and upgrade; source main `f01716ac17633250b186f06956d5537f3e135a10`, plan leaves file hash unchanged, original values preserved, empty model/FK checks, all smoke routes pass |
| `git diff --check` | PASS |

Earlier failures were corrected and rerun: the sandbox could not start commands (used approved escalation); fast checks needed the virtualenv on PATH; the first rehearsal lacked a local image (built it); ownership check caught an unreviewed app import (kept composition in the existing route seam); full checks caught exact schema expectations and an accidentally duplicated login argument (fixed code/assertions); focused failure tests were corrected to assert the server's generic 500 and subsequent rollback. Those attempts were not counted as passes.

Rehearsal artifact: `/tmp/seed-validation-report.json` contains synthetic fixtures only. Adopt preserved 2,527 original rows; upgrade preserved 2,855 application rows with 1,200 encrypted records and 300 blind indexes. No real data, credentials or artifacts are committed.

## Handoff

- PR URL: pending creation after final documentation check; closes #268 only, references #121.
- Roadmap #134 scoped status note: pending PR creation.
- Actual state: implemented and locally verified; not merged or deployed. SEC-04 still requires this contract merged on current main under the execution workflow.
- Next actor: review/merge this leaf, then execute SEC-04 from fresh main. Keep root checkout's existing World changes untouched.
