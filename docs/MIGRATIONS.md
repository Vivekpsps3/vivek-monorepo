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
  instead of leaving a half-applied schema, and the process exits non-zero.
  Migration connections set `PRAGMA foreign_keys=OFF` before the transaction
  starts. SQLite ignores that pragma inside a transaction, and batch mode's
  `DROP TABLE` would otherwise delete `ON DELETE CASCADE` children or reject
  non-cascade children. `PRAGMA foreign_key_check` runs before commit and
  aborts the revision on any violation. The transaction is `BEGIN IMMEDIATE`,
  so a writer already holding the file makes this job wait on `busy_timeout`
  instead of failing immediately when a read lock would otherwise be upgraded.
- `site_schema_v1` downgrade raises. Restore a backup instead of dropping tables.
  Later revisions should still implement a real downgrade only when it is safe.

The container root filesystem is read-only and the process is uid 10001. The
database file is on the `data` volume, which is writable. Alembic does not need
to write revision scripts at runtime (`PYTHONDONTWRITEBYTECODE` is set).
Startup does not migrate. `assert_ready` fails the process unless the database
is already at this image's head, or a newer revision has recorded that this
head can still serve it.

## Deploy

`scripts/deploy-site.sh` keeps the previous order, then migrates before
replacing the running container:

1. Image checks, with no production database mounted.
2. `backup` profile job: online backup of `/data/site.db` into the backups volume.
3. `migrate` profile job: the same image, still read-only except for the `data`
   and `backups` volumes, with `SITE_BACKUP_DIR=/backups`. It writes a
   `premigrate-<revision>-<timestamp>` snapshot, then stamps or upgrades.
   A database that is already at head does not get another snapshot, so a
   code-only deploy cannot rotate the pre-migration set away. Those files
   are not part of the hourly `site-*` set. Retention keeps the newest
   snapshot of each of the last three revisions, ordered by the timestamp in
   the filename. `--require-existing` refuses a missing or zero-byte
   production file.
   If this command fails, deploy exits and the running container stays.
4. `compose up` and the route probes. Startup only checks that this image can
   serve the revision already in the file.

Image rollback does not restore the database. The baseline stamp is safe for
the previous release because that release ignores `site_alembic_version`. A
later revision that changes columns the running process reads or writes needs
an expand/contract plan: the migrate job runs while the previous process may
still be serving, and a probe failure after a successful migration leaves the
new schema in place. A forward-compatible revision must create
`site_revision_compatibility(revision, compatible_head)` if needed and insert
`(new_revision, older_head)` for every older head that can still run, including
`site_schema_v1` when that is true. Startup accepts the database when
`site_alembic_version` equals this image's head, or when that table names this
image's head for the database's revision. Anything else, including a database
behind head, fails startup. A compatibility row is only valid for an
expand-only revision relative to that older head: new tables, or new columns
that are nullable or have a database default. Do not insert one for a
revision that drops, renames, retypes, or adds a `NOT NULL` column without a
default. The row is a claim the revision makes about itself; nothing in CI
boots the previous image unless you do that check before merging. Restore
the matching `premigrate-*` snapshot instead of starting the old image.

The migrate job and the old container share one SQLite file. Stamping is one
small write, and migration connections wait up to 30 seconds (`busy_timeout`)
for a writer. A later revision that recreates a table holds the write lock for
the whole copy, so the old container's writes wait and then fail. That is
acceptable only together with the expand/contract rule above.

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
`make dev` does this before uvicorn starts. The process then only checks the
revision; it does not migrate again.

`make db-check` upgrades a temporary database and fails if autogenerate finds
a difference. CI runs the same command in the unified site job. The server
tests also upgrade an empty database and stamp a fixture built the way
production was built (`create_all`, `site_schema` version 1, Finance revision
`e0f6a2b3c4d5`).

See what a database would do before changing it. The check-in script runs two
rehearsals. The mode is an argument (`REHEARSAL=adopt`, `upgrade`, or `both`);
it is not inferred from whatever `origin/main` creates today.

```sh
make db-seed-dev
bash scripts/validate-seeded-adoption.sh
```

`make db-seed-dev` creates `.local/data/site.db` with this branch's migrations,
starts the app, and inserts synthetic Finance, Travel, and Media rows through
the HTTP handlers.

`adopt` builds an unstamped v1 file from the pinned pre-adoption commit
`8dc554e8094237419571551ff82b0fbfe115bfbd` (that commit's own `create_all`
path, including the Finance `alembic_version` row), seeds it through that
app, and requires `--plan` to stamp `site_schema_v1` with an empty diff.
Later commits on `main` do not change that fixture.

`upgrade` builds a database from `UPGRADE_FROM` (default `origin/main`).
CI sets that to the pull request base, or to the push's previous commit, so
the merge rehearses the migrations that just landed against the previous
main. `--plan` must be the forward action (`current` when the revisions
match, `upgrade` when this branch is a descendant). Applying it keeps the
row counts of the tables that already existed, and the schema diff of the
result against this branch's models must be empty. A `current` plan does
not excuse a revision that was edited in place.

Both rehearsals then run backup, migrate, and the site container. `--plan`
reads its copy and does not write it. A successful adopt reports
`schema_diff` and `foreign_key_check` as empty lists. Every push to `main`
runs both rehearsals, and Deploy requires that step to have succeeded.
Pull requests run them when the diff touches models, the Alembic tree,
Compose, the image, or the deploy scripts. Files already in
`apps/server/alembic/versions/` are append-only: a pull request or push
that modifies or deletes one fails CI. New revision files are fine.

```sh
SITE_DATABASE_URL=sqlite:////absolute/site-plan.db python -m apps.server.migrations --plan --require-existing
```

The JSON line is the detected state (`empty`, `adopt`, or `managed`), the
action (`upgrade`, `stamp`, `current`, or `refuse`), and the reason. The SQL
that would run follows. `stamp` SQL is only the `site_alembic_version`
bookkeeping. `refuse` exits non-zero and prints no SQL. A foreign-key
violation on an adopt or upgrade is `refuse`, with the first
`PRAGMA foreign_key_check` rows in the detail. A zero-byte file is `empty`
and, with `--require-existing`, is refused.

Equivalent invocations:

```sh
SITE_DATABASE_URL=sqlite:////absolute/site.db python -m apps.server.migrations
SITE_DATABASE_URL=sqlite:////absolute/site.db python -m apps.server.migrations --plan
SITE_DATABASE_URL=sqlite:////absolute/site.db python -m apps.server.migrations revision --autogenerate -m "describe the change"
python -m apps.server.migrations --check
```

The URL must be an absolute SQLite path. Set `SITE_BACKUP_DIR` to take a
verified `premigrate-<revision>-<timestamp>` backup before touching a database
that already has tables. A backup failure aborts before the stamp or upgrade.
Hourly `site-*` snapshots stay on their own retention (`SITE_BACKUP_KEEP`,
one in production) and are not deleted by the pre-migration backup. The site
service does not mount `/backups` and does not migrate on startup.

## Removal candidates

Do not drop these in a drive-by revision. They are still read and written by
the auth and vault routes, and the vault column is `NOT NULL`.

| Column | Notes |
| --- | --- |
| `users.auth_recovery_wrapped_private_key_b64` | No recovery flow unwraps it. Signup stores the supplied value or `""`. |
| `user_vaults.recovery_wrapped_dek_b64` | No recovery flow unwraps it. Vault setup still persists it. |

A removal revision has to change those writers in the same release and follow
the expand/contract note above.
