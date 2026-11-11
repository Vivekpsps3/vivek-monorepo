# OPS-03 — implementation evidence

- Leaf issue and parent(s): [OPS-03](../issues/OPS-03.md) / [#274](https://github.com/Vivekpsps3/vivek-monorepo/issues/274). Parent [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stays open.
- Agent/context, branch/worktree: Cursor Grok implementer, branch `agent/ops-03`, worktree `/tmp/vivek-ops-03`.
- Base main SHA, current tested SHA: base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Local gates below ran on that base plus this worktree's uncommitted adapter change, before the product commit. No real off-host destination was configured.
- Fresh-main/prerequisite/active-PR checks: OPS-02 #273 is closed (merged as PR #330, `fb76cf46ac55a57bf53a2e7092143224b09a62c2`). No other open PR was touching the backup, monitor, or compose files at claim time. #274 was open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | Dry-run does not read a snapshot or call the destination. A fake transport encrypts, stores, and decrypts one snapshot back to the source bytes and authenticated metadata. The file destination does the same, and a second delivery of that snapshot sends zero bytes and leaves one object. | PASS | `scripts/test_backup_offhost.py`: `test_a01_dry_run_sends_nothing`, `test_a01_fake_transport_roundtrip_restores_bytes_and_metadata`, `test_a01_file_destination_roundtrip_and_idempotence` |
| A02 | An interrupted transfer retries once, then both the previous remote object and the new snapshot verify. Three failures stop, leave the previous remote object, and keep the new local snapshot with `restore_checked` true. A swapped object is `corrupt`. A flipped ciphertext or wrong key is `authentication`. Missing, short, world-readable, or unknown (`s3`) configuration fails before any snapshot or destination write. The CLI prints only `config`. | PASS | `test_a02_interruption_retries_and_preserves_last_good`, `test_a02_exhausted_transfer_keeps_local_and_remote_state`, `test_a02_corruption_and_authentication_are_explicit`, `test_a02_config_failure_sends_nothing`, `test_a02_cli_config_failure_is_redacted` |
| A03 | Plaintext, token, and key markers are absent from the manifest, ciphertext text, exception text, printed JSON, CLI stderr, and metric lines. Dry-run does not advance off-host success. A dry-run receipt with `transferred: true` does not count. A later failure does not keep a success time. `site_backup_offhost_configured` is 0 for dry-run and 1 only when the environment names `file` plus a directory and a key file. | PASS | `test_a03_failure_diagnostics_omit_markers_and_freshness_is_honest` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Independent off-host scheduler, controller, or parallel backup implementation | None. `backup()` was the only producer. `backup_loop` in `apps/server/monitor.py` and the Compose `backup` service were the only triggers. | The same `backup()` now calls `deliver_offhost` after the verified snapshot is published. The maintenance loop and the Compose backup service are unchanged as schedulers. Off-host status is a field on the existing snapshot manifest. | No second producer, ledger, daemon, or remote prune was added. No duplicate transfer code was found to delete. Compose only passes `SITE_BACKUP_OFFHOST` through, default `off`, and does not mount a destination. | `test_deletion_one_producer_and_scheduler_and_docs_do_not_claim_activation`. Seeded rehearsal backup JSON was `"offhost": "off", "offhost_transferred": false`. |

- Candidate class and protected counterexamples: required deletion of a parallel implementation. None was present. Vault signing and vault AES-GCM records were not edited. Pre-migration retention and the hourly age-plus-minimum rule stay in `backup()`.
- Comparison base SHA and full replacement closure: `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Closure: `scripts/backup-site.py`, `scripts/backup-site.sh`, `compose.yml`, `apps/server/monitor.py`, `docs/BACKUP.md`, `docs/OPERATIONS.md`, `scripts/AGENTS.md`, `Makefile` (test discovery only), `scripts/test_backup_offhost.py`, this evidence file.
- Production added/deleted/moved: `scripts/backup-site.py` +353 / -9, `apps/server/monitor.py` +78 / -3, `compose.yml` +11 / -1, `scripts/backup-site.sh` +9 / -0. Moved 0. The adapter is the new production code.
- Independent equivalent implementations before/after: one snapshot producer and one maintenance loop before. The same two remain. One off-host adapter was added. There is still no second scheduler.
- State/cache owners and public entry points before/after: no new daemon, database, or status file. `backup()` and the CLI remain the entry points. `backup-site.sh --dry-run` only forces `SITE_BACKUP_OFFHOST=dry-run` for the existing Compose backup service. Success and failure times are read from the existing `site-*.json` manifests.
- Remaining old symbol/path search: `def backup(` once, `def backup_loop(` once, one Compose `backup-site.py` command, one `apps.server.monitor` command. `SITE_BACKUP_OFFHOST` defaults to `off` in both services.
- Follow-up change: which production files and independent policy owners now need editing: activating a destination is OPS-06, using the existing variables and an owner-supplied mount. It is not another adapter. A retention change still edits `scripts/backup-site.py` and the Compose keep values together.
- Tests/docs/generated changes separately: `scripts/test_backup_offhost.py` is 620 lines. `docs/BACKUP.md` +2. `docs/OPERATIONS.md` +33 / -2. `scripts/AGENTS.md` +3 / -1. Makefile +1 / -1. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: production grows by the adapter, the manifest field, the metric lines, and the opt-in environment wiring. This is a feature. It is not a simplification claim. The growth is the bounded encrypt-and-transfer path, redacted errors, and honest freshness.
- No behavior/data/meaningful assertion silently removed: hourly retention tests still pass. Default mode `off` still publishes a verified local snapshot and transfers nothing, which the seeded rehearsal observed. Vault protocol files were not modified.

## Verification

| Command | Tested revision | Result |
| --- | --- | --- |
| `python3 -m unittest scripts.test_backup_offhost scripts.test_backup_retention` | worktree on `a7e16c6fa5bd5543514081e0834022fe38dcd1d1` | PASS. 28 tests. |
| `make test-fast` | same worktree | PASS. Doc paths OK. Planning validation 94 packets. Unittest 91 OK, including the 13 adapter tests and the 15 retention tests. |
| `make lint-python` | same worktree | PASS. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | same worktree | PASS. Mypy 87 findings match the baseline. |
| `node scripts/test-release-manifest.mjs` | same worktree | PASS. 15 pass, 0 fail. |
| `make docker-build` | Image build-arg `SITE_RELEASE` was `a7e16c6fa5bd5543514081e0834022fe38dcd1d1` because the product commit did not exist yet. The build context copied this worktree's `scripts/backup-site.py` and `apps/server`. | PASS. |
| `make test-suite-routes` | That image | PASS. Unified checks passed. |
| `make db-validate-seeded` | That image. Adopt from `8dc554e8094237419571551ff82b0fbfe115bfbd`. Upgrade from `origin/main`. | PASS. Modes `adopt` and `upgrade`. Adopt action `stamp_and_upgrade`. Upgrade action `current`. Upgrade schema diff empty. Smoke routes returned 200. Both backup runs printed `"offhost": "off", "offhost_transferred": false`. |
| `./scripts/coverage-gate.sh server` | same worktree | PASS. 874 passed, 2 xfailed. Total coverage 79.02%. The suggested floor increase was not applied. |

`python3 planning/implementation/plan.py launch OPS-03` printed these commands. Each distinct command is listed once. The coverage floor was not lowered.

## Handoff

- PR URL (leaf closure keyword only): opened from `agent/ops-03` with `Closes #274` after the checks above. Parent #125 is referenced and stays open.
- Roadmap #134 append-only status-note URL: appended after the PR exists. The issue body was not edited.
- Merged/activation status: not merged at the time these commands ran. Not deployed. No real off-host destination, alert recipient, or production activation was configured or claimed. Dry-run and the fake file destination are synthetic. OPS-06 remains the activation evidence.
- Remaining external prerequisites or approved scope decisions: an owner-supplied destination directory, a separate 32-byte mode-0600 recovery key, a mount that this Compose file does not add, and a real transfer plus disposable restore under OPS-06. No alert recipient is configured.
- Next actor: CI on the PR, then squash-merge of this leaf only.

No unstated decision from this context is necessary to continue.
