# Unified personal site operations

The public portfolio and private Finance, Travel, and Media tools are one site,
one application image, one FastAPI process, and one SQLite database. nginx-edge
is the existing shared TLS edge. Finance ciphertext remains browser encrypted.
Travel and Media are internal modules; authentication no longer crosses HTTP.

## Where things live

| Item | Authoritative source / deployed location |
| --- | --- |
| Application and operational source | This repository; root Dockerfile and compose.yml |
| Unified application | apps/server; domain modules stay under apps/{finance,travel,media}/backend |
| Public UI | apps/site, built into the same image as Finance UI |
| Production configuration | /home/vivek/Deployments/personal-site-config/site.env, mode 600 |
| Installed deploy controller and Compose | /home/vivek/Deployments/personal-site-config/ |
| Database | /home/vivek/Deployments/personal-site-state/data/site.db, mode 600 |
| Verified backups | /home/vivek/Deployments/personal-site-state/backups/, mode 700 |
| Release identity and history | personal-site-state/current.json and history.jsonl |
| Migration / old-stack recovery material | personal-site-state/legacy/, mode 700 |
| Scheduler log | personal-site-state/logs/scheduler.log, bounded rotating log |
| Edge vhost source | ops/nginx/site.conf, copied into existing nginx conf.d |
| TLS state and renewal | Existing nginx/certs/letsencrypt and existing certbot container cron |
| Optional stronger host controls | ops/install-host.py and ops/systemd, REVIEW ONLY, not installed |

The existing runner account and passwordless Docker access are retained by user
choice. Config/state are outside the checkout and private to that account; this
is not an isolation boundary against that runner. See SRE-FOLLOWUPS.md.

## Request and data flow

Browser -> nginx-edge HTTPS -> loopback :8085 -> unified site :8000.
The site serves portfolio assets at / and /home, shared identity at /auth and
/api/auth, the Hub at /hub, Finance at /finance/, Travel at /travel/, and Media
at /media/. One database has all domain tables with enforced owner references.
Private API responses are not cached. Hashed static bundles are immutable;
HTML is no-store. Missing static assets return 404, never an HTML shell.

Travel/Media validate the same session and CSRF token directly against the
shared engine. No session-validation HTTP client, backend service DNS, inner
nginx, or startup ordering between applications remains. The legacy finance
hostname redirects to the apex. Root serves the public portfolio.

The portfolio encryption demo is browser-only ECDH/HKDF/AES-GCM. The retired
Flask/Socket.IO/LLM integration is not part of production.

## Release

CI tests the domains, both production frontend builds, migration safety, and
the assembled image's authenticated reads/writes, CSRF, user isolation, and
account deletion. Only a successful trusted push on main produces a deployable
artifact. Deploy rejects stale SHAs and promotes that tested image, without
installing packages, building on production, or checking out a live tree.
Manual deployment also requires a successful main CI artifact.

The controller is copied to private configuration by scripts/install-user-site.py.
Config changes are reviewed and installed explicitly; normal application
releases cannot silently change host configuration. installed.json records
source hashes for drift comparison. The current operating account can still
modify these files; stronger separation is deferred.

The controller serializes deployment, backup, and recovery with a lock; runs
image self-checks without network or production data; backs up the database;
starts the new image; verifies exact release readiness and HTTPS routes; and
restores the preceding image if probes fail. It never restores an older database
automatically after users may have written data. Images and release history
must be retained for rollback; never run indiscriminate Docker prune commands.

Commands (run as vivek):

```sh
python3 /home/vivek/Deployments/personal-site-config/release-site.py status
python3 /home/vivek/Deployments/personal-site-config/release-site.py backup
sudo -n docker logs --tail 100 personal-site-site-1
curl -fsS http://127.0.0.1:8085/health/ready
```

Production does not depend on the monorepo working tree after image build.
The old _control finance-tracker stack is retired. Do not start it alongside the
unified site; both would contend for :8085 and could resume stale databases.

## First consolidation

1. Rehearse migration from read-only online snapshots into a disposable file.
2. Verify the image in a disposable container and browser before touching live services.
3. Preserve old container image IDs, Compose config, vhost, env file, and all data.
4. Stop all old writers. Take final SQLite backups and migrate those snapshots.
5. The migration refuses existing destinations, missing tables, unexpected nonempty
   tables, unsupported Finance revisions, invalid ownership, or integrity errors.
   It copies every domain row and compares counts and content digests, preserving
   IDs, vault ciphertext, wrapped keys, sessions, and metadata. It publishes a new
   database atomically and writes a private migration report. Originals are untouched.
6. Start the unified release against the new database, switch the vhost, validate
   nginx before reload, then check TLS and browser behavior.
7. Retain the stopped original containers and data until the recovery window expires.

A rehearsal of a live source does not provide a coordinated final snapshot;
only the final migration with all old writers stopped is the cutover source.

## Backups and restore

The user-level scheduler runs every minute and performs a verified online backup
when the last one is an hour old. Backup uses SQLite's backup API, checks integrity
and foreign keys, then opens a separate restored copy and checks it again. Files
are private and atomically published. Retention is 30 days with at least seven
snapshots. Missing databases fail backup instead of silently skipping it.

Target recovery point: about one hour plus scheduler delay, subject to monitoring.
Recovery time is not yet established by a complete replacement-host exercise.
Backups remain on this host by explicit user preference. Disk failure, host loss,
or operator/runner compromise can destroy primary and backups together.
Off-host encrypted backups are an explicit TODO.

To restore: stop the site first, preserve the current database and any WAL/SHM
files together, verify the selected backup with scripts/verify-backup.sh, copy it
to a new private data directory, set matching owner permissions, start the exact
compatible image, and verify readiness plus authenticated reads/writes. Restore
all domains together. Never replace a live SQLite file or combine an old database
with unrelated newer WAL files. Retain the pre-restore state until validation.

Schema version is explicit. Startup refuses missing/wrong versions and never runs
DDL. Version 1 consolidates the current schema; future changes require a reviewed
migration and compatibility plan before rollout. The historical Finance Alembic
chain remains for legacy upgrades only, not unified production startup.

## Monitoring and recovery

Application metrics describe requests, latency, and process resources. A separate
unprivileged probe exporter checks public HTTPS, all domain health endpoints,
readiness, TLS expiry, and backup freshness. Prometheus scrapes both on its existing
private monitoring network. /metrics and internal health endpoints are blocked at
the public edge. Alerts cover failed probes, missing exporters, error ratio, latency,
backup age, and certificate expiry.

Probes run on this host and are not an independent external availability monitor.
Alert delivery to an external recipient remains a TODO. Do not interpret a rule
existing in Prometheus as proof that anyone receives a notification.

The scheduler only restarts a continuously unhealthy site container, at most once
per fifteen minutes. It logs failures; it does not repeatedly roll back data or
restart unrelated services. Actual host reboot and replacement-host recovery need
scheduled exercises. Site edge logs use the existing bounded Docker logging driver.

## Development

```sh
make install
make build-frontends
make dev
```

This serves the same topology at http://127.0.0.1:8000 with a disposable .local/data
file. make test runs domain tests separately to keep their fixtures isolated.
make docker-up uses a separate project, port, subnet, and database from production.
make test-suite-routes executes release integration checks inside the built image.
The browser test is scripts/test-site-browser.mjs and accepts SITE_TEST_URL and
CHROME_BIN. It checks desktop/mobile navigation, login, and the crypto demo.
