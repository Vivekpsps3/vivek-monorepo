# Site schema migrations

The unified site database is one SQLite file. Production mounts it at
`/data/site.db` (`SITE_DATABASE_URL=sqlite:////data/site.db` in `compose.yml`).
Local development uses `.local/data/site.db`. Revisions are Alembic scripts in
`apps/server/alembic/versions`, applied by `python -m apps.server.migrations`.

## Why Alembic, and why a new history

Alembic is already pinned in the runtime lock (`alembic==1.14.1`) and the
schema is SQLAlchemy metadata (`apps/server/schema.py`). `stamp` records a
revision without running its DDL, and autogenerate is the model/migration
drift check.

The historical Finance chain under `apps/finance/backend/alembic` is not this
history. Its head is `e0f6a2b3c4d5`, and that row is already stored in the
production `alembic_version` table. Reusing that table would either refuse the
unknown revision or overwrite the Finance row. Site revisions use a separate
table, `site_alembic_version`. Finance's environment refuses to run when
`site_schema` or `site_alembic_version` is present.

Do not call `metadata.create_all` or `apps/finance/backend` Alembic against
`site.db`.

## What the baseline does

`site_schema_v1` is a frozen copy of the schema `metadata().create_all`
produced when this framework landed, including the recovery-key columns. It
also inserts `site_schema (1, 1)` and the historical Finance revision marker.

- An existing database whose tables match that baseline is **stamped**. The
  only new object is `site_alembic_version`. Application rows, including the
  Finance `alembic_version` row, are not rewritten.
- A missing database is **created** by running the revisions. `make init-db`
  and `python -m apps.server.migrate` take this path.
- A database that does not match the baseline and has no site revision is
  refused. Nothing is written.
- Each upgrade runs in one SQLite transaction. A failing revision rolls back
  instead of leaving a half-applied schema. The process exits non-zero.

Startup in `apps/server/main.py` repeats the upgrade before it serves traffic.
The container root filesystem is read-only and the process is uid 10001. The
database file is on the `data` volume, which is writable. Alembic does not need
to write revision scripts at runtime (`PYTHONDONTWRITEBYTECODE` is set).

## Deploy

`scripts/deploy-site.sh` keeps the previous order, then migrates before
replacing the running container:

1. Image checks, with no production database mounted.
2. `backup` profile job: online backup of `/data/site.db` into the backups volume.
3. `migrate` profile job: the same image, still read-only except for the `data`
   and `backups` volumes, with `SITE_BACKUP_DIR=/backups`. It backs up again
   and then stamps or upgrades. `--require-existing` refuses to invent a new
   production file. If this command fails, deploy exits and the running
   container stays.
4. `compose up` and the route probes. Startup upgrades again; at that point the
   database is already at head.

Image rollback does not restore the database. The baseline stamp is safe for
the previous release because that release ignores `site_alembic_version`. A
later revision that changes columns the running process uses needs an
expand/contract plan: the migrate job runs while the previous process may
still be serving, and a probe failure after a successful migration leaves the
new schema behind.

## Commands

From the repository root, after `make install`:

```sh
make db-revision MESSAGE="describe the change"
make db-upgrade
make db-check
```

`make db-revision` writes a new file under `apps/server/alembic/versions` by
comparing `.local/data/site.db` with the models. Review the file. Do not edit
`site_schema_v1_baseline_schema.py` to follow later model changes.

`make db-upgrade` creates `.local/data/site.db` or applies pending revisions.
`make dev` does this before uvicorn starts, and the process upgrades again on
startup.

`make db-check` upgrades a temporary database and fails if autogenerate finds
a difference. CI runs the same command in the unified site job. The server
tests also upgrade an empty database and stamp a fixture built the way
production was built (`create_all`, `site_schema` version 1, Finance revision
`e0f6a2b3c4d5`).

Equivalent invocations:

```sh
SITE_DATABASE_URL=sqlite:////absolute/site.db python -m apps.server.migrations
SITE_DATABASE_URL=sqlite:////absolute/site.db python -m apps.server.migrations revision --autogenerate -m "describe the change"
python -m apps.server.migrations --check
```

The URL must be an absolute SQLite path. Set `SITE_BACKUP_DIR` to take a
verified backup before touching a database that already has tables. A backup
failure aborts before the stamp or upgrade. The site service does not mount
`/backups`, so its startup upgrade does not take one; the deploy migrate job
does.

## Removal candidates

Do not drop these in a drive-by revision. They are still read and written by
the auth and vault routes, and the vault column is `NOT NULL`.

| Column | Notes |
| --- | --- |
| `users.auth_recovery_wrapped_private_key_b64` | No recovery flow unwraps it. Signup stores the supplied value or `""`. |
| `user_vaults.recovery_wrapped_dek_b64` | No recovery flow unwraps it. Vault setup still persists it. |

A removal revision has to change those writers in the same release and follow
the expand/contract note above.
