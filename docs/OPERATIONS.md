# Unified personal site

The application is disposable. The only persistent application volumes are
`personal-site_data` (one SQLite database) and `personal-site_backups` (verified
backups). There are no installed controllers, copied config trees, custom release
history files, host timers, scheduler logs, or new runner accounts.

## Configuration and boundaries

**compose.yml is the single deployment definition**: image, environment defaults,
ports, mounts, limits, health checks, backup schedule, and monitoring helper.
The root Dockerfile builds one root Angular UI and the modular FastAPI service. Its pinned
base images and hashed Python lock make builds reproducible.

No provider secrets, host environment file or application directory are required
by the default configuration. Deployment and backup scripts default to
`--env-file /dev/null`, avoiding implicit dotenv discovery. To configure optional integration
secrets, set `SITE_ENV_FILE` to an explicit private file outside Git (mode
600, parent directory mode 700). An explicit missing file fails deployment.
Do not bake secrets into Compose, the Dockerfile, or images.

Auth defaults live in the process and in `compose.yml`. `AUTH_SIGNUP_MODE` defaults to `closed` (`open`, `invite`, or `allowlist` opt in). `AUTH_INVITE_CODES` and `AUTH_SIGNUP_ALLOWLIST` are comma-separated and empty by default. `AUTH_IP_RATE_LIMIT_PER_MIN` defaults to 60. `AUTH_PAIR_RATE_LIMIT_PER_MIN` defaults to 20 and applies to challenge and verify for one username from one client address. `AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN` defaults to 60 and counts failed verifies for that username from every address. `AUTH_ACCOUNT_RATE_LIMIT_PER_MIN` defaults to 20 and applies to signup and bootstrap only. Lookup is limited per IP, not per account. `AUTH_DECOY_SECRET` is optional; when it is unset the server writes `auth-decoy-secret` beside the database file so unknown-user responses stay stable across restarts. A missing or short file is replaced. An unreadable file is left in place and logged, so a restore with the wrong owner does not rotate the decoys. Put that secret in the private env file if a database restore should keep the same decoys. `RATE_LIMIT_PER_MIN` remains the optional shared cap. Passwordless sign-in takes the enrolled username. An email address is not an alias and gets a decoy wrap, so existing users must sign in with the username, not the account email.

`FORWARDED_ALLOW_IPS` must be the gateway of `SITE_SUBNET` (today `10.85.0.1` for `10.85.0.0/28`). Uvicorn only trusts forwarded client addresses from that peer. If the value does not match the gateway, every visitor shares one per-IP bucket. nginx overwrites `X-Forwarded-For` with `$remote_addr`, and the application does not read that header itself. The CSP report log uses `request.client.host`, which is that uvicorn address, and does not read `X-Forwarded-For` either.

The shared nginx-edge and its Let's Encrypt certificates remain existing host infrastructure. The site's edge vhost source is ops/nginx/site.conf. The deploy workflow does not install that file. Other hostnames are unaffected. Never add an enforced `Content-Security-Policy` on the edge: the application sends the one enforced policy, and a second enforced policy would be applied as well. When a release changes the vhost, use this order:

1. Deploy the app.
2. `curl -sI https://vivekpanchagnula.com/media/` and confirm there is exactly one `Content-Security-Policy` header (not Report-Only) and that it includes `*.archive.org`.
3. Update the host-managed vhost from the reviewed `ops/nginx/site.conf`, then on nginx-edge run `nginx -t && nginx -s reload`.
4. `curl -sI https://vivekpanchagnula.com/media/` again and confirm `Content-Security-Policy-Report-Only` and `X-Frame-Options: SAMEORIGIN` are gone.

If the host still uses the older vhost, it may add a report-only policy and `X-Frame-Options: SAMEORIGIN` beside the app headers. Verify the actual response before and after installing the reviewed configuration; merging application code does not update nginx-edge.

Test and release runners are the pool in [Local runner](./LOCAL-RUNNER.md). The production runner is a separate runtime registration. Deploy selects it with the `monorepo-prod` label, and this repository does not install or start it. That runner's host Docker access can change host resources and read site state. The access stays by explicit user preference. A container without the host socket does not remove it.

## Application and data flow

Browser -> nginx-edge HTTPS -> 127.0.0.1:8085 -> site :8000 -> /data/site.db.
The public portfolio is at `/`; Workspace links to `/hub`. Finance, Travel, and Media
remain at `/finance/`, `/travel/`, and `/media/`, with shared `/auth/login` and
`/api/auth`. The root web build ships in the same immutable image.

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
  backup or verification. It does not run permanently.
- **migrate**: an on-demand `ops` profile job. It mounts the data and backup
  volumes, writes a `premigrate-*` snapshot, then stamps or upgrades
  `/data/site.db`. It refuses a missing or empty production database.

Readiness checks the site schema version, the site migration revision, and all
domain tables. Startup refuses a missing database, missing frontend, non-WAL
database, a revision this image does not know how to serve, or a database
behind the image's head. It does not stamp or upgrade. The migrate job is the
only schema writer. The root filesystem stays read-only; the only database
writes are on the data volume. See [MIGRATIONS.md](./MIGRATIONS.md).

Only the app and maintenance helper restart automatically on process exit.
A running unhealthy container needs investigation; no Docker socket is exposed
to an autoheal helper.

## Release and rollback

The [local CI runner](./LOCAL-RUNNER.md) runs trusted domain tests, the root frontend production build, migration and
restore tests, runtime dependency audits, and image checks for authenticated reads,
writes, CSRF, isolation, deletion, routing, and caching. Desktop/mobile Chromium
checks run against the built image. Official Actions and image bases are pinned.

The Deploy workflow accepts a successful same-repository push of `main`, or a manual run of `main`. The candidate SHA must equal current `main`. A manual run uses the latest push CI run for that SHA, so a newer failure overrides an older success. The `Seeded schema rehearsals` step on the selected run must have concluded `success`. Fork pull requests and unsuccessful CI do not deploy. The production runner
checks out that exact SHA into a unique private directory under `RUNNER_TEMP`,
then runs scripts/deploy-site.sh to rebuild the image from that source. No
GitHub Actions artifacts are uploaded or downloaded. Base images are pinned
and npm/pip dependencies use lock files, but deployment rebuilds the source
rather than promoting the byte-identical image exercised by CI. Image checks
run again before production data is accessed.

Git authentication uses the job token through an ephemeral credential helper; no
credential is stored in Git configuration. An `always()` step removes the source
checkout on success or failure. Forced host/process termination can interrupt
cleanup; the runner also cleans its temporary area between jobs. There is no
permanent monorepo checkout or copied deployment configuration on the host.
Build dependencies are installed inside Docker build stages. Runtime code is
baked into the image, so changing the checkout does not change the running
application. Deployment allows 45 minutes for the build and rollout.

The deploy script uses a temporary lock, reads the preceding image from Docker's
existing metadata, runs image checks without production data/network, verifies a
backup, runs the migrate job, starts the new image, and checks exact-SHA
readiness plus HTTPS routes. The migrate job writes a separate pre-migration
snapshot and then stamps or upgrades the database. If that command fails, the
script exits before replacing the running container. On a failed start it
restores the prior image and its Compose definition embedded in that image.
Rollback material is temporary; release identity lives in image labels and
Docker metadata. No separate release database/history file is needed.

Database restoration is never automatic after users may have written data.
Image rollback does not roll the database back. The baseline stamp only adds
`site_alembic_version`, which the previous release ignores. Once a newer
revision exists, the previous image starts only when that revision recorded
this image's head in `site_revision_compatibility`. A database behind the
image's head fails startup instead of migrating. A later revision that changes
live tables needs an expand/contract plan before it is merged, because deploy
migrates while the previous process may still be serving and a failed probe
after a successful migration leaves the new schema in place. Keep preceding
images available; do not prune rollback images indiscriminately.

The workflow selects the GitHub `production` environment. Reviewers, a wait timer, a deployment branch policy, and branch protection are not defined in this tree. A missing setting is not protection. An earlier successful deploy is not evidence that those settings exist now.

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

By explicit user choice, legacy finance-tracker recovery copies are removed.
Hourly history follows the 30-day and minimum-seven rule in Backup and
recovery. It is not an unbounded archive. Any future secrets must remain
outside Git.

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
a private snapshot with a checksum manifest. Hourly `site-*` retention keeps
every verified snapshot within `SITE_BACKUP_KEEP_DAYS` (30 in Compose) and at
least `SITE_BACKUP_KEEP` verified snapshots (seven in Compose). A snapshot is
verified when the manifest records a successful restore check and the checksum
matches the file. Files that fail that check do not fill the minimum and are
not removed. Snapshots older than the window are removed only when more than
the minimum remain, and only after the replacement passed verification and a
separate restore check. A failed, missing, or interrupted backup leaves the
last good snapshot and does not publish a success manifest. Scheduled and
manual jobs lock the backup directory so one job cannot delete the other's
published snapshot or write that snapshot's manifest.
Pre-migration snapshots use the `premigrate-<revision>-<timestamp>` prefix and
are not part of the hourly set. Retention keeps the newest snapshot of each of
the last three revisions, including revisions older than 30 days. The manifest
records the revision. Missing source databases fail rather than silently skip.
Backup files and manifests live in the backup volume; no separate status file is
needed. Logs use the bounded Docker driver.

The newest recovery point is about one hour plus scheduling delay. Older hourly
copies stay under the 30-day/seven rule once those backups exist. All copies
remain on this machine. The checked-in Compose file is what the next deploy
starts; a host that has not applied it still uses the environment it was
started with.

Off-host transfer is an opt-in step on this same backup command, not a second
scheduler, ledger, or daemon. `SITE_BACKUP_OFFHOST` defaults to `off`. `off`
and `dry-run` send nothing. Dry-run does not read the key file. `file` encrypts
the verified snapshot with AES-GCM in a separate envelope from vault signing
and vault AES-GCM records, then writes that ciphertext to an owner-supplied
directory. The adapter retries at most three times (immediately, then after
0.5s, then after 1s). A failed attempt leaves the last verified local snapshot
and the last verified remote object in place. The adapter does not prune the
destination; local retention remains the only prune. Maintenance still has one
in-memory loop and calls the same script. Its off-host metrics count only a
manifest that records a verified transfer. Dry-run, a missing receipt, and a
failed attempt do not advance that success time. `site_backup_offhost_configured`
is 1 only when the process environment names `file` mode, a directory, and a
key file. That gauge is not a restore.

Recovery-key custody: the key is 32 bytes in a mode-0600 file outside the
repository and outside the destination. The process reads it only in `file`
mode and does not write it into the snapshot, manifest, image, or logs. It is
not the vault passphrase and it is not generated or escrowed here. Losing the
key makes the envelopes unreadable, so the owner copy stays with the owner,
separate from the destination host.

Activation prerequisites, all still unmet in this tree:

- An existing destination directory supplied by the owner. This repository does not choose a vendor or embed a URL.
- A 32-byte recovery key file, mode `0600`, stored outside the repository and outside the destination.
- `SITE_BACKUP_OFFHOST=file`, `SITE_BACKUP_OFFHOST_DIR`, and `SITE_BACKUP_OFFHOST_KEY_FILE` in the private environment of the existing backup and maintenance services.
- A mount of that directory into those services. The checked-in Compose file does not add one.
- A real transfer and a disposable restore recorded by [OPS-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/277). Until that evidence exists, leave the mode `off`.

This is not a configured destination and not production activation. No alert recipient is configured. A measured replacement-host recovery time is not established by this policy.

For restore: stop site and maintenance, preserve the current database together
with WAL/SHM, verify the chosen backup, restore into a new empty data volume with
correct ownership, then start its compatible image. Verify authenticated reads
and writes across every domain before discarding any old state. Never replace a
live SQLite file or pair an old database with unrelated WAL files. Restore all
domains together so identity and ownership remain consistent.

## Dependency and image review

No update controller is installed. The repository owner reviews pins at least monthly, and again in any change that edits a lockfile, a base-image digest, an Actions SHA, or the runner tarball pin. Review the Actions SHAs under `.github/workflows/` and `.github/actions/`, the image digests in the root `Dockerfile`, `ops/actions-runner/Dockerfile`, and `ops/actions-runner/compose.yml`, `RUNNER_VERSION` and `RUNNER_SHA256` in the runner Dockerfile, `apps/server/requirements.lock`, and the root `package-lock.json`.

CI runs `pip-audit` against the runtime lock and `npm audit --omit=dev --audit-level=high`. A pin that passes is reproducible. It is not a current advisory clearance. This tree has no Dependabot configuration and no host timer for the review. Automated advisory delivery stays unresolved.

## Monitoring and limits

The app exposes request, latency and process metrics. Maintenance checks public
HTTPS, domain health, readiness, TLS expiry and backup age. Prometheus rules in
ops/monitoring/site-alerts.yml cover availability, backup freshness, TLS, errors,
and latency. /metrics and internal health endpoints are blocked at the public edge.
Edge logs use nginx-edge's existing bounded Docker logging driver.

Local probes cannot independently detect a dead host or a lost network path.
Release and runner diagnostics stay in the Actions job log and the bounded Docker json-file logs from Compose. A failed deploy prints a short local container log tail. Do not copy those logs into an issue. No second logger is added. An external monitor and a notification destination are not configured, so existing alert rules are not proof that anyone is notified. Shared-origin XSS,
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
