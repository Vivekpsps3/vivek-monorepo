# Backup

See [Operations — backups and restore](OPERATIONS.md#backups-and-restore).
The unified site database is backed up online about hourly and before deployment;
each backup is integrity-checked and restored into a separate verification copy.
Backups are private and retained for 30 days with at least seven snapshots.

Off-host encrypted backup is an explicit user-deferred TODO. All current copies
remain vulnerable to loss or compromise of this machine.
