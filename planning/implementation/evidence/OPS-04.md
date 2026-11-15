# OPS-04 — implementation evidence

- Leaf issue and parent(s): [OPS-04](../issues/OPS-04.md) / [#275](https://github.com/Vivekpsps3/vivek-monorepo/issues/275). Parent [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stays open.
- Agent/context, branch/worktree: Cursor Grok implementer, branch `agent/ops-04`, worktree `/tmp/vivek-ops-04`.
- Base main SHA, current tested SHA: rebased onto `c461fe791251b13e02a05911531246f01f0e8290`. Drill implementation `11864ff98eb83b2fff893711543169517859116a`. The gates below ran on that revision. This evidence file is a later docs-only commit.
- Fresh-main/prerequisite/active-PR checks: OPS-03 (#274) is merged. SEC-05 (#362) is on this base and was not edited. No competing claim was on #275 at claim time. The drill was not pointed at a live `site.db`, a backup volume, or an off-host destination.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | A migrated synthetic database with identity, finance ciphertext, travel, media, town, and world rows is backed up and restored into a new `restore-drill-*` directory. Schema head, owner counts, ciphertext digest, integrity, and foreign keys match. Duration and the data-loss window are recorded against the 1h / 24h / 4h objectives. A sealed local envelope decrypts the same snapshot. An aged manifest records a local-objective miss without setting any production flag. | PASS | `scripts/test_restore_drill.py`: `test_a01_seeded_restore_matches_schema_owners_ciphertext_and_duration`, `test_a01_sealed_snapshot_decrypts_without_activating_offhost`, `test_a01_old_snapshot_records_local_objective_miss_without_production_claim`, `test_objectives_stay_unclaimed_on_either_side_of_the_limits` |
| A02 | A nonempty directory, an existing empty directory, a `personal-site_backups` path, `.local/data/site.db`, a bad checksum, an old schema revision, schema version 2, a malformed image, and a wrong seal key are refused. The synthetic source and the published snapshot bytes stay unchanged, and no drill directory is left behind. | PASS | `test_a02_nonempty_and_existing_targets_refuse_before_write`, `test_a02_production_targets_and_live_database_are_refused`, `test_a02_corrupt_checksum_wrong_version_and_unsupported_preserve_backups`, `test_a02_bad_seal_refuses_before_a_destination_exists` |
| A03 | An injected interrupt deletes only the drill directory. Repeating the same destination after cleanup succeeds, a second cleanup is a no-op, and removing one drill directory leaves the other. Unmarked directories, symlinks, directories that contain a snapshot, `personal-site_data`, and `/data/...` are not removed. | PASS | `test_a03_interrupt_removes_only_the_drill_directory`, `test_a03_repeat_and_cleanup_are_idempotent_and_refuse_foreign_paths` |

The command-line report and refusal also omit the synthetic ciphertext, vault, index, and email markers (`test_cli_report_and_refusal_omit_synthetic_markers`). `test_deletion_keeps_one_drill_entrypoint_and_the_backup_producer` shows `backup()` still publishes the snapshot and the drill is a separate reader.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Duplicated manual recovery/rehearsal steps | No separate drill script existed. `backup()` still makes its own pre-publish restore copy. The production restore paragraph in Operations remains the live procedure. `docs/BACKUP.md` previously left every recovery drill on #125 and described the disposable restore as only OPS-06. | `scripts/restore-drill.py` is the one monthly drill entrypoint. It calls `verify`, sealed open, schema head, and owner tables from the existing backup and migration modules. | No drill script was deleted because none was present. The stale Backup sentences now point at the Operations drill and leave real off-host transfer on OPS-06. The production restore steps stay. No Compose profile was added. | Repeated synthetic drill and the safe-target tests above. `backup()` still writes `restore_checked`. |

- Candidate class and protected counterexamples: required retirement of a duplicate drill procedure. The search found no second drill script. The backup command's internal restore check and the production restore steps are different procedures and stay. Vault signing, vault AES-GCM records, applied revisions, and SEC-05 recovery files were not edited.
- Comparison base SHA and full replacement closure: `c461fe791251b13e02a05911531246f01f0e8290`. Closure: `scripts/restore-drill.py`, `scripts/test_restore_drill.py`, `Makefile` (test discovery only), `docs/OPERATIONS.md`, `docs/VERIFICATION.md`, `docs/BACKUP.md`, `scripts/AGENTS.md`, this evidence file.
- Production added/deleted/moved: `scripts/restore-drill.py` +567 / -0. Moved 0. Docs and guidance are separate below.
- Independent equivalent implementations before/after: one snapshot producer (`backup()`) before and after. One new drill command reads a verified snapshot. There is still no second scheduler, ledger, or off-host sender.
- State/cache owners and public entry points before/after: no new daemon, database, or status file. The drill writes only a directory it creates, named `restore-drill-*`, and removes it only when that directory carries its marker. `backup()` remains the snapshot publisher.
- Remaining old symbol/path search: `def backup(` once. `def drill(` and `def cleanup(` live in `scripts/restore-drill.py`. No Compose service calls the drill.
- Follow-up change: which production files and independent policy owners now need editing: a real off-host transfer and a restore of that copy remain OPS-06, using the existing backup command. A schema-head change still belongs to the migration owner; the drill reads `head_revision()` and does not add a revision.
- Tests/docs/generated changes separately: `scripts/test_restore_drill.py` +712. `docs/OPERATIONS.md` +17 / -1. `docs/VERIFICATION.md` +4, in its own section above the SEC-05 recovery section. `docs/BACKUP.md` +2 / -2. `scripts/AGENTS.md` +1 / -1. `Makefile` +1 / -1. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: production grows by the drill command. This is a safety/feature leaf, not a simplification claim. The growth is the refusal policy, the preservation report, and the measured objectives. No duplicate executable drill was available to delete.
- No behavior/data/meaningful assertion silently removed: backup retention and off-host tests still pass inside `make test-fast`. Default off-host mode still transfers nothing, which the seeded rehearsal observed. The SEC-05 verification section remains.

## Verification

| Command | Tested revision | Result |
| --- | --- | --- |
| `python3 -m unittest scripts/test_restore_drill.py` | `11864ff98eb83b2fff893711543169517859116a` | PASS. 12 tests. |
| `make test-fast` | same revision, with the worktree virtualenv and a local `node_modules` link so the TypeScript resolver can import `typescript` | PASS. Doc paths OK. Planning validation 95 packets. Unittest 110 OK, including the 12 drill tests. Node tests 21 pass. |
| `make lint-python` | same revision | PASS. Ruff format clean. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | same revision | PASS. Mypy 87 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | same revision | PASS. 887 passed. Total coverage 79.10%. The suggested floor increase was not applied. |
| `make docker-build` | Image build-arg `SITE_RELEASE` was `11864ff98eb83b2fff893711543169517859116a` | PASS. |
| `make test-suite-routes` | That image, `--network none` | PASS. Unified checks passed. |
| `make db-check` | same revision | PASS. `schema_drift_check` ok at `site_leave_accrual_v1`. |
| `make db-validate-seeded` | same revision. Adopt from the pinned unadopted commit. Upgrade from `c461fe791251b13e02a05911531246f01f0e8290`. Disposable compose project `seed-validate`. | PASS. Adopt action `stamp_and_upgrade`. Upgrade action `current`. Upgrade schema diff empty. Smoke routes returned 200. Backup JSON was `"offhost": "off", "offhost_transferred": false`. |

`python3 planning/implementation/plan.py launch OPS-04` printed these commands. Each distinct command is listed once. The coverage floor was not lowered. No alert was sent and `SITE_BACKUP_OFFHOST` was not left configured.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/366 (`Closes #275`). Parent #125 is referenced and stays open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6887981570. The issue body was not edited. Leaf note: https://github.com/Vivekpsps3/vivek-monorepo/issues/275#issuecomment-6887981807.
- Merged/activation status: not merged when this note was written. Not deployed. No production restore, real alert, or off-host activation was performed. The drill's `production_restore`, `production_rpo_established`, and `production_rto_established` fields stay false.
- Remaining external prerequisites or approved scope decisions: OPS-06 still owns a real off-host transfer and a restore of that copy. No host timer was installed for the monthly drill. No alert recipient is configured.
- Next actor: CI on the PR, then squash-merge of this leaf only.

No unstated decision from this context is necessary to continue.
