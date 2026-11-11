# SRE review disposition

The implementation deliberately consolidates the website into one service and
one database. Separate database-container isolation is superseded by that design;
application authorization and a single private data mount are the boundaries.

## Outstanding decisions and work

- [ ] **Off-host encrypted backups.** Implementation is selected in
  [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125), superseding the
  historical code-backlog deferral. Destination, independent credentials and
  recovery-key custody still need configuration and a measured restore. Current
  local backups do not protect against host/disk loss or compromise; selected
  off-host support is not evidence of an active destination.
- [ ] **Runner isolation evidence.** Test, release, and production label routing
  is defined in [Local runner](LOCAL-RUNNER.md) and the workflows. Unmodified
  fork pull requests are sent to GitHub-hosted runners. A pull request that
  edits the workflow can request another label. Fork approval and branch
  protection are repository settings, not files in this tree. The production
  runner's host Docker privilege and the privileged release daemon remain
  trusted-code boundaries. No installed controller, sudoers, copied config tree,
  or release history file was added.
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
- [ ] **GitHub governance.** Branch protection, rulesets, workflow CODEOWNERS, and
  production-environment reviewers are not defined in the tracked workflows.
  The deploy job's own conditions are the code guard. Record a fresh read-only
  check before treating those settings as present. Credential rotation remains
  a separate owner action.
- [ ] **Broader homelab controls.** Other published service ports, Grafana anonymous
  LAN Admin access, unrelated cron upgrades, host patching, firewall rules, legacy
  host certbot failure, and non-site nginx logs require a separate host-wide change.
  They were not modified as collateral changes to the website.
- [ ] **Image/OS and frontend dependency security policy.** The manual review
  cadence is [Dependency and image review](OPERATIONS.md#dependency-and-image-review).
  CI audits the runtime lock and production npm dependencies. No scheduled
  scanner or update bot is installed. A pin is reproducible, not a current
  advisory clearance.
- [ ] **Retention for local Docker images and build cache.** Keep preceding
  image digests for rollback and establish a measured disk budget before pruning.
  CI no longer uploads GitHub Actions artifacts. Deployment rebuilds each tested
  commit locally; Docker images and build cache are not disaster recovery storage.
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
  #125 selects a future 30-day/minimum-seven snapshot policy; it is not the
  current Compose setting. Reconcile and document the policy before rollout.

## Traceability to the 80-point review

| Original issues | Disposition |
| --- | --- |
| 1–2 shared mounts / file access | Superseded by one service and one private owner-readable database; no cross-service data mounts remain. Runner boundary remains deferred. |
| 3–5 coverage / verification / schedule | One database, verified backup plus separate restore check, hourly scheduling, bounded retention, hard failure on missing state. |
| 6–9 off-host / consistency / recovery material | Coordinated all-domain migration and restore documentation; off-host and full-host drills remain explicit TODOs. Historical recovery copies removed by user choice. |
| 10 code and state colocated | Only Docker-managed database and backup volumes persist; the tracked Compose file is the deployment definition. |
| 11–12 sensitive build contexts | Root and domain Docker exclusions; assembled image checked for local DBs/env/venvs. |
| 13–18 release reproducibility | One tracked Compose/vhost source, hashed runtime lock, pinned bases, and CI-checked source rebuilt during deployment; no installed controller or copied configs. |
| 19–28 live checkout / partial deploy / rollback / provenance | Temporary exact-SHA checkout and Docker build; exact SHA probes, stale guard, trusted push gate, manual successful-CI requirement, image rollback. Database rollback remains deliberate. |
| 29–32 resource and host failure | CPU/memory/PID/log bounds for runtime; deployment builds on the shared host; single-host availability remains accepted with drill TODOs. |
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
| 79–80 patch policy / objectives | Pins, lockfile audits, and the manual review cadence in Operations are the current policy. No update bot is installed. SLO/RTO and a scheduled advisory feed remain open. |
