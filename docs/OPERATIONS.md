# Unified personal site

The application is disposable. The only persistent application volumes are
`personal-site_data` (one SQLite database) and `personal-site_backups` (verified
backups). There are no installed controllers, copied config trees, custom release
history files, host timers, scheduler logs, or new runner accounts.

## Configuration and boundaries

**compose.yml is the single deployment definition**: image, environment defaults,
ports, mounts, limits, health checks, backup schedule, and monitoring helper.
The root Dockerfile builds both UIs and the modular FastAPI service. Its pinned
base images and hashed Python lock make builds reproducible.

Production currently has no configured API secrets and needs no host environment
file or application directory. Deployment and backup scripts default to
`--env-file /dev/null`, avoiding implicit dotenv discovery. If integrations need
secrets later, set `SITE_ENV_FILE` to an explicit private file outside Git (mode
600, parent directory mode 700). An explicit missing file fails deployment.
Do not bake secrets into Compose, the Dockerfile, or images.

Auth defaults live in the process and in `compose.yml`. `AUTH_SIGNUP_MODE` defaults to `closed` (`open`, `invite`, or `allowlist` opt in). `AUTH_INVITE_CODES` and `AUTH_SIGNUP_ALLOWLIST` are comma-separated and empty by default. `AUTH_IP_RATE_LIMIT_PER_MIN` defaults to 60. `AUTH_PAIR_RATE_LIMIT_PER_MIN` defaults to 20 and applies to challenge and verify for one username from one client address. `AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN` defaults to 60 and counts failed verifies for that username from every address. `AUTH_ACCOUNT_RATE_LIMIT_PER_MIN` defaults to 20 and applies to signup and bootstrap only. Lookup is limited per IP, not per account. `AUTH_DECOY_SECRET` is optional; when it is unset the server writes `auth-decoy-secret` beside the database file so unknown-user responses stay stable across restarts. A short or corrupt file is replaced. Put that secret in the private env file if a database restore should keep the same decoys. `RATE_LIMIT_PER_MIN` remains the optional shared cap.

`FORWARDED_ALLOW_IPS` must be the gateway of `SITE_SUBNET` (today `10.85.0.1` for `10.85.0.0/28`). Uvicorn only trusts forwarded client addresses from that peer. If the value does not match the gateway, every visitor shares one per-IP bucket. nginx overwrites `X-Forwarded-For` with `$remote_addr`, and the application does not read that header itself.

The shared nginx-edge and its Let's Encrypt certificates remain existing host infrastructure. The site's
edge vhost source is ops/nginx/site.conf; adding/replacing this vhost requires a
config test and reload. Other hostnames are unaffected.

The existing self-hosted runner and its Docker privilege are retained by explicit
user preference. It remains capable of modifying host resources and reading site
state through Docker. Stateless containers do not remove that trust boundary.

## Application and data flow

Browser -> nginx-edge HTTPS -> 127.0.0.1:8085 -> site :8000 -> /data/site.db.
The public portfolio is at `/`; Apps links to `/hub`. Finance, Travel, and Media
remain at `/finance/`, `/travel/`, and `/media/`, with shared `/auth/login` and
`/api/auth`. Both UIs ship in the same immutable image.

The three domains are modules in one process and use one engine and identity
store. Travel and Media validate sessions and CSRF directly, without HTTP auth
calls. Owner foreign keys, tenant filtering, CSRF, and complete account deletion
are tested. Combining databases preserves Finance ciphertext and wrapped keys;
it does not decrypt or transform financial records.

The portfolio encryption demo is browser-only ECDH/HKDF/AES-GCM. The historical
Flask/Socket.IO/LLM backend and standalone Docker/nginx definitions are retired.

## Runtime containers

- **site**: non-root, read-only root filesystem, bounded CPU/memory/PIDs/logs;
  only loopback :8085 is published. Its persistent mount is the data volume.
- **maintenance**: the same immutable image, no public ports or API keys. It
  performs hourly SQLite backups and exposes local probes to the existing
  Prometheus network. Its timer is in memory; backup file timestamps determine
  the last success after recreation. It mounts data for SQLite coordination and
  backups for writing. The source database connection is read-only.
- **backup**: an on-demand `ops` profile job using the same image for immediate
  backup, verification, or explicit migration commands. It does not run permanently.

Readiness checks schema and all domain tables. Startup refuses a missing database,
missing frontend, wrong schema version, or non-WAL database, and runs no DDL.
Only the app and maintenance helper restart automatically on process exit.
A running unhealthy container needs investigation; no Docker socket is exposed
to an autoheal helper.

## Release and rollback

GitHub-hosted CI runs domain tests, both frontend production builds, migration and
restore tests, runtime dependency audits, and image checks for authenticated reads,
writes, CSRF, isolation, deletion, routing, and caching. Desktop/mobile Chromium
checks run against the built image. Official Actions and image bases are pinned.

The Deploy workflow accepts only successful trusted main push artifacts. It
rejects stale SHAs; manual runs also require a successful main artifact. The
existing runner downloads the image and checks out the exact tested SHA into a
unique private directory under `RUNNER_TEMP`, then runs scripts/deploy-site.sh.
Git authentication uses the job token through an ephemeral credential helper; no
credential is stored in Git configuration. An `always()` step removes the source
and image artifact on success or failure. Forced host/process termination can
interrupt cleanup; the runner also cleans its temporary area between jobs. There
is no permanent monorepo checkout or copied deployment configuration on the host. It does not build images
or install npm/pip packages on production. Runtime code is baked into the image,
so changing the checkout does not change the running application.

The deploy script uses a temporary lock, reads the preceding image from Docker's
existing metadata, runs image checks without production data/network, verifies a
backup, starts the new image, and checks exact-SHA readiness plus HTTPS routes.
On failure it restores the prior image and its Compose definition embedded in
that image. Rollback material is temporary; release identity lives in image labels
and Docker metadata. No separate release database/history file is needed.

Database restoration is never automatic after users may have written data. Future
schema changes require explicit migration and backward-compatibility planning.
Keep preceding images available; do not prune rollback images indiscriminately.

Commands from any directory on the host (as vivek):

```sh
sudo -n docker ps --filter label=com.docker.compose.project=personal-site
sudo -n docker logs --tail 100 personal-site-site-1
curl -fsS http://127.0.0.1:8085/health/ready
sudo -n docker exec personal-site-maintenance-1 python /app/backup-site.py --source /data/site.db --directory /backups
```

For Compose administration, use a temporary checkout of the running image
revision or extract `/app/compose.yml` from that image into a temporary directory.
Pass `--env-file "${SITE_ENV_FILE:-/dev/null}"` and select the running
image explicitly; do not accidentally build/start the default development image.
Docker restart policies restore containers after reboot without source files.

The old `_control` finance-tracker stack must stay stopped; do not start its old
containers against retired databases or compete for :8085.

By explicit user choice, legacy recovery copies and old backups are removed.
Only the latest verified unified backup is retained; there is no historical
point-in-time recovery window. Any future secrets must remain outside Git.

## First database consolidation

Rehearse with read-only online snapshots before changing production. Final cutover:
stop every legacy writer, preserve the old image IDs/config/env/vhost and data,
then migrate the offline files into a **new** site.db. The migration refuses an
existing destination, missing or unexpected data, unsupported Finance revisions,
invalid ownership, or integrity errors. It preserves all IDs and compares every
copied table's row count and content digest. A private report is recovery material,
not runtime state. Originals remain untouched until the recovery window expires.

Transfer the new file into the named data volume with owner 10001 and mode 600.
Start the tested image, test/reload the new edge vhost, then verify public TLS,
all apps, existing sessions, and browser behavior. Preserve old data as rollback
backup material; do not treat old database files as active production databases.

## Backup and recovery

Maintenance checks once a minute and backs up when the most recent verified
backup is an hour old. It uses SQLite's online backup API, checks integrity and
foreign keys, restores into a separate verification copy, and atomically publishes
a private snapshot with a checksum/verification manifest. `SITE_BACKUP_KEEP: "1"`
in Compose retains only the latest verified snapshot, by user choice. Scheduled
and manual jobs lock the backup directory to serialize publication and pruning.
Older snapshots are removed only after the replacement passes verification and
a separate restore check. Failed backups preserve the preceding snapshot. Missing
source databases fail rather than silently skip.
Backup files and manifests live in the backup volume; no separate status file is
needed. Logs use the bounded Docker driver.

The intended recovery point is about one hour plus scheduling delay. All copies
remain on this machine by user choice. Off-host encrypted backup and a measured
replacement-host recovery time are explicit TODOs.

For restore: stop site and maintenance, preserve the current database together
with WAL/SHM, verify the chosen backup, restore into a new empty data volume with
correct ownership, then start its compatible image. Verify authenticated reads
and writes across every domain before discarding any old state. Never replace a
live SQLite file or pair an old database with unrelated WAL files. Restore all
domains together so identity and ownership remain consistent.

## Monitoring and limits

The app exposes request, latency and process metrics. Maintenance checks public
HTTPS, domain health, readiness, TLS expiry and backup age. Prometheus rules in
ops/monitoring/site-alerts.yml cover availability, backup freshness, TLS, errors,
and latency. /metrics and internal health endpoints are blocked at the public edge.
Edge logs use nginx-edge's existing bounded Docker logging driver.

Local probes cannot independently detect a dead host or Internet connection.
An external monitor and proven notification delivery remain TODOs. Existing alert
rules alone are not proof that anyone receives a notification. Shared-origin XSS,
resource contention with the homelab, one disk/host/router/ISP, and the existing
runner's Docker access remain deliberate constraints, tracked in SRE-FOLLOWUPS.md.

## Development

```sh
make install
make build-frontends
make dev
```

Local Python development uses .local/data/site.db. Docker development uses a
separate project, subnet, port and named volumes. make test runs domain tests in
separate processes and browser/unit checks. make test-suite-routes exercises the
assembled image. scripts/test-site-browser.mjs accepts SITE_TEST_URL and CHROME_BIN.
