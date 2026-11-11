# OPS-02 — implementation evidence

- Leaf issue and parent(s): [OPS-02](../issues/OPS-02.md) / [#273](https://github.com/Vivekpsps3/vivek-monorepo/issues/273). Parent [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stays open.
- Agent/context, branch/worktree: OPS-02 in `/tmp/vivek-ops-02`, branch `agent/ops-02`.
- Base main SHA, current tested SHA: work started at `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. `origin/main` then fast-forwarded to `1b4f35a80784a3181da809784fa80b33c13c6e60` (#322, Finance price preference only) before the product commit. OPS-01 `8b9f0998` is an ancestor. Product revision under test: `316b500b050ac30d9993240bc625324be710cabd`.
- Fresh-main/prerequisite/active-PR checks: OPS-01 is merged on this base. No other open PR owned `scripts/backup-site.py`, `compose.yml`, or the backup sections of the operations docs at implementation time. FIN-01 does not touch those files.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | Dated synthetic snapshots older than 30 days, inside 30 days, and exactly 30 days old. Retention keeps the age window and at least seven verified hourly copies. A bad checksum or missing manifest does not fill a slot. Four pre-migration revisions older than 30 days stay in place during hourly retention, and a later pre-migration run still keeps three revisions. `SITE_BACKUP_KEEP=7` does not widen that floor. | PASS | `scripts/test_backup_retention.py`: `test_a01_keeps_verified_copies_inside_thirty_days_past_the_minimum`, `test_a01_keeps_seven_verified_copies_when_all_are_older_than_thirty_days`, `test_a01_exact_thirty_day_boundary_stays_and_older_copies_can_go`, `test_a01_bad_checksum_or_missing_manifest_does_not_consume_a_keep_slot`, `test_a01_pre_migration_revisions_stay_outside_the_hourly_window`, `test_a01_hourly_environment_does_not_widen_pre_migration_retention` |
| A02 | A new backup whose verification fails, a missing source, a corrupt source, a foreign-key violation, and a manifest link that raises all leave the previous verified snapshot readable. No new success manifest remains. The CLI missing-source path exits non-zero with an empty directory. | PASS | `test_a02_failed_verification_does_not_publish_a_manifest`, `test_a02_missing_corrupt_and_foreign_key_sources_keep_the_last_good_snapshot`, `test_a02_interrupted_manifest_publish_removes_the_partial_snapshot`, `test_a02_cli_missing_source_exits_without_a_success_manifest`. Server `test_latest_backup_replaces_previous_only_after_verification` still requires a successful publish before an aged copy is removed. |
| A03 | One process holds the directory lock inside verification. The second process does not publish a database or a second temporary directory until the lock is released. After both finish, each published file has a matching manifest. A second pair, started together against nine snapshots older than 30 days, keeps both new files and seven verified copies with matching checksums. | PASS | `test_a03_directory_lock_blocks_the_second_job_until_publish_can_finish`, `test_a03_overlapping_prune_keeps_each_published_snapshot_and_its_manifest` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Count-only hourly prune (`snapshots[keep:]`) and the docs/Compose text that said production keeps one hourly snapshot while #125 named a future 30-day/minimum-seven policy | `backup()` hourly calls, Compose `backup` and `maintenance` services, `docs/BACKUP.md`, `docs/OPERATIONS.md`, `docs/MIGRATIONS.md`, `docs/SRE-FOLLOWUPS.md` | One hourly rule in `scripts/backup-site.py`: keep verified `site-*` snapshots within `SITE_BACKUP_KEEP_DAYS` and at least `SITE_BACKUP_KEEP` of them. Defaults are 30 and 7. Compose sets both. Pre-migration retention stays the newest file of each of the last three revisions. | Deleted the count-only hourly branch. Did not add a second prune implementation. `scripts/backup-site.sh` had no prune logic and is unchanged. Unverified files are left on disk so they cannot evict a good copy. | `test_deletion_minimum_one_still_keeps_the_age_window`, `test_deletion_docs_and_compose_use_one_age_and_minimum_policy`, and the A01 matrix. `apps/server/tests/test_migration.py` still proves hourly deletion does not remove `premigrate-*` files. |

- Candidate class and protected counterexamples: duplicate live policy. The old count-only path and the written 30-day policy described different behavior. Pre-migration revision grouping, restore verification, and the directory lock stay. No money, date, or vault meaning changed.
- Comparison base SHA and full replacement closure: `1b4f35a80784a3181da809784fa80b33c13c6e60` after fast-forward from `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Closure: `scripts/backup-site.py`, `compose.yml`, `apps/server/migrations.py` (comment only), `scripts/AGENTS.md`, `Makefile` (test discovery), the docs above, `apps/server/tests/test_migration.py`, `scripts/test_backup_retention.py`, this evidence file.
- Production added/deleted/moved: `scripts/backup-site.py` +132 / -44, including 13 added blank lines and comments +4 / -3. Non-comment code net about +74. `compose.yml` +3 / -2. `migrations.py` comment +4 / -4. Moved 0.
- Independent equivalent implementations before/after: hourly retention was a count slice, and the docs also described a different future policy. After this change there is one hourly decision and one pre-migration decision.
- State/cache owners and public entry points before/after: no new daemon, ledger, or status file. `backup()` and the CLI remain the entry points. Maintenance still calls the script without a count flag. The directory flock is still the lock.
- Remaining old symbol/path search: `SITE_BACKUP_KEEP` remains the minimum count. `SITE_BACKUP_KEEP=1` is not the Compose value. `scripts/backup-site.sh` still runs the Compose backup service.
- Follow-up change: which production files and independent policy owners now need editing: a retention change edits `scripts/backup-site.py` and the Compose `SITE_BACKUP_KEEP` / `SITE_BACKUP_KEEP_DAYS` values together, then `docs/BACKUP.md` and `docs/OPERATIONS.md`.
- Tests/docs/generated changes separately: `scripts/test_backup_retention.py` is 520 lines. `test_migration.py` +22 / -8. Makefile +1 / -1. Docs and `scripts/AGENTS.md` are the reconciled policy text. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: production grows in `backup-site.py` and by one Compose line. The growth is the safety policy: age plus minimum count, checksum-matched manifests, and publishing the manifest with the database or leaving neither behind. This is not a simplification claim.
- No behavior/data/meaningful assertion silently removed: failed verification still keeps the previous snapshot. Pre-migration runs still keep three revisions and still do not delete `site-*` files. An explicit minimum of one still keeps the 30-day window instead of deleting recent copies.

## Verification

| Command | Tested revision | Result |
| --- | --- | --- |
| `python3 -m unittest scripts.test_backup_retention` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. 15 tests. |
| `make test-fast` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. Doc paths OK. Planning validation 94 packets. Unittest 78 OK, including the 15 retention tests. Node script tests 15 pass, 0 fail. |
| `make lint-python` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. Mypy 87 findings match the baseline. |
| `node scripts/test-release-manifest.mjs` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. |
| `make docker-build` | Image label `org.opencontainers.image.revision=3954d1f27aa8ad0766eac9a7e9667f68d3c76571` because `316b500` did not exist yet. Backup and Compose sources in the build context are this change. | PASS. |
| `make test-suite-routes` | That image | PASS. Unified checks passed. |
| `make db-validate-seeded` | Same image. Adopt from `8dc554e`. Upgrade from `1b4f35a`. | PASS. Modes `adopt` and `upgrade`. Upgrade action `current`. Upgrade schema diff empty. Smoke routes returned 200. The backup service published one verified snapshot. |
| `./scripts/coverage-gate.sh server` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. 874 passed, 2 xfailed. Total coverage 80.12%. Required floor 61.53% reached. The suggested floor increase was not applied. |
| Server backup tests `pytest apps/server/tests/test_migration.py apps/server/tests/test_schema_migrations.py -k "backup or premigrate or retention or latest_backup"` | `316b500b050ac30d9993240bc625324be710cabd` | PASS. 7 passed, 28 deselected. |

`python3 planning/implementation/plan.py launch OPS-02` printed the commands above. Each distinct command is listed once.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/330 (`Closes #273`). Parent #125 is referenced and stays open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6789153765
- Merged/activation status: not merged. Not deployed. This change does not prove an off-host destination or an alert path. A running host keeps its previous environment until this Compose file is the one it was started from.
- Remaining external prerequisites or approved scope decisions: off-host encrypted backup, a measured replacement-host drill, and an external notification destination stay on #125. They are not done here.
- Next actor: review and CI, then squash-merge of this leaf only.

No unstated decision from this context is necessary to continue.
