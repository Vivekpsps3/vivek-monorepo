# SQLite backup and restore

The ledger, auth tables, and planning profiles live in SQLite. Paths:

| Mode | Default DB file |
|------|-----------------|
| Local dev (`make dev`) | `apps/finance/backend/finance.db` |
| Docker Compose | `data/finance.db` |
| Travel, local dev | `apps/travel/backend/travel.db` |
| Travel, Docker | `data/travel.db` |

`DATABASE_URL` can point elsewhere. These files are gitignored; you are
responsible for backups.

## Backup (recommended before upgrades or imports)

Use the repository script. It uses SQLite's online backup API, so it is safer
than copying `finance.db` and WAL sidecars while the API may be writing.

```bash
scripts/backup-db.sh
```

Defaults:

| Variable | Default |
|----------|---------|
| `FINANCE_DATA_DIR` | `./data` |
| `FINANCE_BACKUP_DIR` | `$FINANCE_DATA_DIR/backups` |

For local dev:

```bash
FINANCE_DATA_DIR=apps/finance/backend FINANCE_BACKUP_DIR=apps/finance/backend/backups scripts/backup-db.sh
```

Stopping the API before backup is still fine, but no longer required by the
script.

## Integrity check

After backup:

```bash
./scripts/verify-backup.sh data/backups/finance.db.<timestamp>.bak
```

Expects `integrity_check=ok` and presence of core tables when the backup is a full app DB.

## Staging restore drill (OPS-001)

1. Run `./scripts/backup-db.sh` and `./scripts/verify-backup.sh` on the backup file.
2. Stop the stack (`make docker-down` or stop API).
3. Copy the backup over the live DB path (keep a `.old` rename).
4. Start the stack; confirm health (`curl` `/api/health` or compose healthcheck).
5. Sign in and spot-check dashboard loads; record the drill date in ops notes.

## Restore

1. Stop the API (`Ctrl+C` on `make dev` or `make backend`).
2. Replace the database file:

```bash
mv data/finance.db data/finance.db.old   # optional safety rename
cp /path/to/finance.db.bak-YYYYMMDD data/finance.db
```

3. Start the API again. Schema is upgraded on startup via Alembic when using a file DB (`ALEMBIC_STRICT=1` by default).

## What to back up

| Item | Path |
|------|------|
| Dev ledger DB | `apps/finance/backend/finance.db` |
| Docker ledger DB | `data/finance.db` |
| Travel DB | `data/travel.db` or `apps/travel/backend/travel.db`. Separate from finance. `scripts/backup-db.sh` does not copy it. |
| Env secrets | `apps/finance/backend/.env` (not in git) |
| Users/sessions/audit | Inside `finance.db` |
| Balance sheet, holdings, transactions, recurring cashflow | Inside `finance.db` |
| Planning profiles (and any future stored runs) | Inside `finance.db` — speculative MC results are not ledger truth |

## `make reset-db` vs backup

| Command | Effect |
|---------|--------|
| **`make reset-db`** | **Deletes** `apps/finance/backend/finance.db` (and only that path). All users, ledger, and planning data are gone. Use for a fresh schema on next start—not for preserving data. |
| **`make reset-docker-db`** | **Deletes** `data/finance.db` for the Docker stack. |
| **Backup (`scripts/backup-db.sh`)** | Creates a consistent SQLite backup file so you can restore later. Always back up before risky imports or schema experiments. |

There is no undo for `reset-db`. If you need an empty DB, prefer renaming the file (`mv finance.db finance.db.old`) instead of deleting when you might want the data back.

## Related

- Reset empty DB: `make reset-db` / `make reset-docker-db` (destructive; see table above).
- Production: app-native session auth is primary; optional `API_KEY` / `FINANCE_API_KEY` for non-browser clients (see [DEPLOY.md](./DEPLOY.md)).
