# Backup

See [Operations — backup and recovery](OPERATIONS.md#backup-and-recovery).
The unified site database is backed up online about hourly by the maintenance container and before deployment;
each backup is integrity-checked and restored into a separate verification copy.
Backups are private. Current Compose configuration keeps one verified hourly
snapshot (`SITE_BACKUP_KEEP=1`), plus pre-migration snapshots that retain the newest
copy for each of at least three revisions. There is no 30-day hourly history today.

[Operations #125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) selects
off-host encrypted backups, recovery drills and a future 30-day/minimum-seven
snapshot policy. That backlog does not change the current retention setting or
prove an off-host destination is active. All current copies remain vulnerable
to loss or compromise of this machine.
