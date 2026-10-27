# SRE review disposition

The implementation deliberately consolidates the website into one service and
one database. Separate database-container isolation is superseded by that design;
application authorization and a single private data mount are the boundaries.

## Outstanding decisions and work

- [ ] **Off-host encrypted backups. User explicitly deferred.** Choose destination,
  independent credentials, retention and recovery-key custody; then perform a full
  restore from that destination. Current backups protect accidental changes, not
  host/disk loss or compromise.
- [ ] **Runner isolation. User chose to retain
  the existing runner.** The user also requested a stateless deployment; controller/account/timer scaffolding was removed.
  The active runner retains Docker-equivalent host privilege and access to the
  operator account's state/config. No new account, sudoers, systemd units, copied config tree, or release history files are installed.
- [ ] **External availability monitor and notification destination.** Local probes
  and Prometheus rules exist; independent detection and proven recipient delivery
  are not configured. Do not claim paging coverage.
- [ ] **Define availability/RTO and run replacement-host and reboot exercises.**
  One host, disk, router, ISP and Docker daemon remain shared failure domains.
  No HA or independent power/network path was introduced.
- [x] **Enforce CSP.** The application sends enforced public/private document policies,
  Trusted Types throughout the private Angular app, and a `/csp-report` sink.
  Map tiles and provider artwork hosts are allowlisted, including the
  archive.org hosts that Open Library and Cover Art Archive redirect through.
  Every document uses `frame-ancestors 'none'`: `/embed` is a compact route,
  and nothing in this repo frames it. Path prefixes are still not an origin
  boundary; splitting the finance host
  needs DNS and edge proxy changes recorded in [SECURITY_MODEL.md](./SECURITY_MODEL.md#content-security-policy-and-origin-isolation).
- [ ] **Provider-wide budgets and capacity exercises.** Existing provider timeouts
  and budget helpers remain. Test saturation, quota exhaustion, disconnects, and
  database contention with representative workloads before increasing workers.
- [ ] **GitHub governance.** Branch protection, workflow CODEOWNERS, reviewer policy,
  credential rotation, and environment deployment restrictions need owner review.
  The workflow itself restricts deployment to tested trusted main artifacts.
- [ ] **Broader homelab controls.** Other published service ports, Grafana anonymous
  LAN Admin access, unrelated cron upgrades, host patching, firewall rules, legacy
  host certbot failure, and non-site nginx logs require a separate host-wide change.
  They were not modified as collateral changes to the website.
- [ ] **Image/OS and frontend dependency security policy.** Runtime Python lock is
  audited and base images are pinned. Maintain scheduled scans and digest updates;
  a pin is reproducible, not permanently secure. Review npm advisories before updates.
- [ ] **Retention for Docker images and GitHub release artifacts.** Keep preceding
  image digests for rollback and establish a measured disk budget before pruning.
  CI artifacts currently retain 14 days; this is not disaster recovery storage.
- [x] **Site schema migrations.** Alembic history for the unified database starts
  at baseline `site_schema_v1`. An existing production database is stamped onto
  that baseline with no application-data changes; a fresh database is created by
  the revisions. Deploy backs up, then the migrate job writes a separate
  `premigrate-*` snapshot (three kept) and runs `python -m apps.server.migrations`.
  Startup does not migrate; it accepts this image's head or a newer revision
  that recorded this head as forward-compatible. Image rollback still does not
  roll back the database, so a future revision needs an expand/contract window
  before it is merged.
  Do not run `create_all` or the historical Finance Alembic chain against `site.db`.

- [x] **Recovery-copy retention decision.** User explicitly requested deletion of
  old backups and legacy recovery material. Only the latest verified unified
  snapshot is kept; historical point-in-time recovery is intentionally unavailable.
  Pre-migration snapshots are the exception: three `premigrate-*` files are kept
  apart from that hourly snapshot.

## Traceability to the 80-point review

| Original issues | Disposition |
| --- | --- |
| 1–2 shared mounts / file access | Superseded by one service and one private owner-readable database; no cross-service data mounts remain. Runner boundary remains deferred. |
| 3–5 coverage / verification / schedule | One database, verified backup plus separate restore check, hourly scheduling, bounded retention, hard failure on missing state. |
| 6–9 off-host / consistency / recovery material | Coordinated all-domain migration and restore documentation; off-host and full-host drills remain explicit TODOs. Historical recovery copies removed by user choice. |
| 10 code and state colocated | Only Docker-managed database and backup volumes persist; the tracked Compose file is the deployment definition. |
| 11–12 sensitive build contexts | Root and domain Docker exclusions; assembled image checked for local DBs/env/venvs. |
| 13–18 release reproducibility | One tracked Compose/vhost source, hashed runtime lock, pinned bases, and CI-built artifact promotion; no installed controller or copied configs. |
| 19–28 live checkout / partial deploy / rollback / provenance | No production checkout or package installs; exact SHA probes, tested artifact, stale guard, trusted push gate, manual CI-artifact requirement, image rollback. Database rollback remains deliberate. |
| 29–32 resource and host failure | CPU/memory/PID/log bounds and no host builds; single-host availability remains accepted with drill TODOs. |
| 33–37 runner / secrets / root containers | Non-root, read-only, capability-free runtime; secrets in the existing private .env, data/backups in Docker volumes; stronger host controls deferred by user. |
| 38–41 HTTP auth dependency | Removed: direct shared session validation with one engine and explicit CSRF. |
| 42–45 scheme / client trust / rate limit | One proxy hop, sanitized headers, explicit trusted gateway, edge budgets, bounded application limiter state. Validate actual client identity after routing changes. |
| 46–48 origin / cookies / lifecycle | Shared-origin risk documented, SameSite=lax, common auth, cross-user tests and unified account deletion. |
| 49–51 DNS and startup ordering | Removed backend DNS and service-start dependency chains. Host reboot exercise remains TODO. |
| 52–53 health and recovery | DB/schema/frontend preflight, exact release readiness, local probes; running-unhealthy recovery is manual to avoid another privileged helper. |
| 54–58 routing and request policy | One edge route, app-owned paths, compatibility redirects, correct 404s/cache policy, request/time budgets and enforced public/private document CSP. Finance origin separation still needs DNS and the edge proxy. |
| 59–66 monitoring and logs | Metrics/probes/rules, request IDs/timing, bounded Docker logs, all-app diagnostics. External monitor and notification delivery deferred. |
| 67–70 schema / SQLite | Explicit consolidated schema, site Alembic revisions, foreign keys, WAL, busy timeout, local filesystem requirement. Load exercises remain a TODO. |
| 71–72 external providers | Existing timeout/budget behavior retained; quotas, total deadlines and stress exercises remain TODOs. |
| 73–76 ownership / docs / TLS / bootstrap | Current operations map and image/Compose bootstrap; broader TLS/host cleanup and full replacement-machine proof remain TODOs. |
| 77–78 production coverage / exercises | Both production frontends, all-domain release checks, real migration rehearsal and browser checks; comprehensive fault-injection remains TODO. |
| 79–80 patch policy / objectives | Vulnerable runtime updated and audited, pins and artifact flow added; ongoing patch/scan ownership and explicit SLO/RTO still require decisions. |
