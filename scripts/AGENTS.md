# Repository scripts

Scripts are existing workflow entry points, not an invitation to add another task
runner. Check the root [Makefile](../Makefile) and current caller before adding one.
Keep flags, working-directory expectations and failure status explicit.

Quality checks must reject the counterexample and accept supported behavior. Preserve
coverage/lint floors, migration history checks and actual test discovery. Do not
replace behavior evidence with a source substring that merely resembles it.
Keep policy in its existing gate; reuse a small check instead of creating a registry.

Operations and migration commands must use disposable synthetic fixtures for local
verification. Preserve backup retention/recovery and transaction invariants. Hourly
backups keep a 30-day window and at least seven verified copies. Pre-migration backups
keep the newest file of each of the last three revisions. A passing
fixture or configured adapter is not proof a live destination, recipient or restore
has been activated. `SITE_BACKUP_OFFHOST` on that same backup command is the
off-host adapter: `off` and `dry-run` send nothing, and `file` needs an
owner-supplied directory plus a separate 32-byte key file. Use [OPERATIONS](../docs/OPERATIONS.md) and
[MIGRATIONS](../docs/MIGRATIONS.md) for those changes.

For instruction maintenance, the existing [doc check](check-doc-paths.sh) validates
links and AGENTS.md size budgets; [guidance policy](../docs/AGENT_GUIDANCE.md) owns the
rationale. Keep those checks together. Run root gates for scripts changed, including
applicable Python lint/type checks. Add focused positive/negative fixtures when a
quality gate's accepted/rejected behavior changes.
