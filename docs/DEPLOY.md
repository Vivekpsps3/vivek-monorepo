# Production / domain deployment checklist

This app is **local-first with app-native user accounts**. Use this list when the UI/API is reachable beyond your own machine.

The current intended deployment is a domain-accessible website on a Raspberry Pi
or similar host:

```
domain / LAN / VPN
  → web container (Nginx serves Angular and proxies /api)
  → api container (FastAPI, private Compose network)
  → SQLite DB file
```

## Before exposing the API

| Step | Action |
|------|--------|
| 1 | Put TLS in front of the web container and keep the API private to Compose or loopback. |
| 2 | Open `/login` on a fresh database and create the first admin with a username and vault passphrase (lost passphrase = lost vault data). Open self-signup is also available at `/signup`. |
| 3 | Set **`CORS_ORIGINS`** to your UI origin(s) only (comma-separated). Avoid `*`. |
| 4 | Keep **`allow_credentials=True`** and explicit origins because browser auth uses cookies. |
| 5 | Set **`SESSION_COOKIE_SECURE=1`** for HTTPS deployments. Use `0` only for local HTTP development. |
| 6 | Set **`DISABLE_OPENAPI=1`** to hide `/docs` and `/redoc` on exposed hosts. |
| 7 | Optional **`RATE_LIMIT_PER_MIN=60`** to throttle heavy POSTs (planning runs, imports, and other rate-limited routes). |
| 8 | **`ALEMBIC_STRICT=1`** (default): fail startup if migrations cannot upgrade. |

## Data & backups

- SQLite file (production): `data/finance.db` (local dev default: `apps/finance/backend/finance.db`; see [BACKUP.md](./BACKUP.md)).
- Copy the DB before upgrades or `make reset-db`.
- **OPS-009:** Single SQLite file = no built-in HA or replication; use file backups and one writer process.

## Docker website (localhost)

```bash
docker compose up --build
```

UI: http://127.0.0.1:8080 by default. Production currently uses
http://127.0.0.1:8085 because nginx routes `finance.vivekpanchagnula.com` to
that loopback port.

The API is private to the Compose network and is reached through the web
container at `/api`.

Default Docker persistence is repo-local:

```bash
data/finance.db
```

The app reads `DATABASE_URL`, so you can override the DB location:

```bash
DATABASE_URL=sqlite:////absolute/path/to/finance.db docker compose up --build
```

If the DB path is outside the repo/container default, update the Compose volume
mount too. The default bind mount is the parent data directory:

```yaml
./data:/data
```

The API container uses `sqlite:////data/finance.db`, so the SQLite database is
still a normal file on the host.

## Domain reverse proxy recipe

Run Compose on the host, then proxy HTTPS traffic to the loopback web port. Finance Tracker uses username plus vault-passphrase challenge login inside the app; the server receives the public key and challenge signature, never the passphrase or browser-held private key.

```caddyfile
finance.vivekpanchagnula.com {
  reverse_proxy 127.0.0.1:8085
}
```

Create the first admin by opening `/login` after the API starts, or use open self-signup at `/signup`. Admins cannot reset another user's vault access.

## GitHub Actions production deployment

Production deploys use the `.github/workflows/deploy.yml` workflow. CI runs on
GitHub-hosted runners, then deployment runs on a self-hosted runner installed on
the production machine.

The production runner must have these labels:

```text
self-hosted
linux
finance-prod
```

The runner should run on the production host because the deployment builds from
the checked-out repo, backs up the local SQLite database, and restarts the local
Docker Compose stack.

The workflow runs entirely on the production host against the live repo tree at
`/home/vivek/Deployments/vivek-monorepo` (`MONOREPO`), the repo root `.env`
(`ENV_FILE=/home/vivek/Deployments/vivek-monorepo/.env`), and the external
`_control` Makefile (`CONTROL=/home/vivek/Deployments/_control`):

1. Resolve the deployed SHA (CI `workflow_run` on `main`, or manual `workflow_dispatch`).
2. Sync the live tree to that SHA: `git fetch` + `git checkout -B main <sha>`.
3. Source the repo root `.env` and create `$FINANCE_DATA_DIR` and `$FINANCE_BACKUP_DIR`.
4. Verify Docker access: `sudo -n docker compose version`.
5. Back up the SQLite database with `scripts/backup-db.sh`.
6. Build and restart Finance: `make -C "$CONTROL" build STACK=finance-tracker`, then `make -C "$CONTROL" up STACK=finance-tracker`.
7. Deploy the personal site: `make -C "$CONTROL" site-deploy`.
8. Health-check `http://127.0.0.1:8085/api/health`.

There is no `.env.production` and no `docker-compose.prod.yml`; runtime
configuration comes from the repo root `.env` (plus the `production`
GitHub environment's protection rules). The web container publishes on
`127.0.0.1:8085`; keep this aligned with
`/home/vivek/Deployments/nginx/conf/conf.d/finance.vivekpanchagnula.com.conf`,
which proxies the public domain to `http://127.0.0.1:8085`.

This host currently expects passwordless sudo for Docker. Verify that before
running the deployment:

```bash
sudo -n docker compose version
```

If this fails, fix sudoers or add the runner user to the Docker group and restart
the runner service. The workflow intentionally uses `sudo -n` so it fails instead
of hanging on a password prompt.

### Run the self-hosted runner as a service

After registering the GitHub Actions runner, install it as a systemd service from
the runner directory on the production host:

```bash
cd /home/vivek/Downloads/actions-runner
sudo ./svc.sh install vivek
sudo ./svc.sh start
```

Check service status:

```bash
cd /home/vivek/Downloads/actions-runner
sudo ./svc.sh status
```

Useful service commands:

```bash
cd /home/vivek/Downloads/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start
sudo ./svc.sh uninstall
```

Also confirm GitHub sees the runner online in the repo settings:

```text
Settings → Actions → Runners
```

Expected runner state:

```text
amd7600-server: online
labels: self-hosted, Linux, X64, finance-prod
```

If the runner was already installed before Docker permissions changed, restart
the service so it picks up the new user groups:

```bash
cd /home/vivek/Downloads/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start
```

## Environment reference

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite path (default `sqlite:///./finance.db`) |
| `API_KEY` | Optional legacy shared secret for non-browser API clients; normally unset for the web app |
| `CORS_ORIGINS` | Allowed browser origins |
| `RATE_LIMIT_PER_MIN` | Optional POST throttle |
| `DEBUG_HEALTH=1` | Include `cache_size` in `/api/health` (dev only; BE-017 / OPS-008) |
| `LOG_SQL` | **Avoid in prod** — logs SQL with financial row data (SEC-006) |
| `ALEMBIC_STRICT` | `1` (default) fail startup on migration errors |
| `DISABLE_OPENAPI` | `1` hides `/docs` on exposed hosts |
| `SESSION_DAYS` | Session lifetime in days |
| `SESSION_COOKIE_SECURE` | `1` for HTTPS, `0` only for local HTTP |
| `SESSION_COOKIE_SAMESITE` | Cookie SameSite setting, default `lax` |

## Logging (OPS-011)

- Uvicorn access logs go to stdout; rotate or ship via your process manager (systemd `journald`, Docker logging driver, or a sidecar).
- Application logs use the `finance_api` logger family; set `LOG_LEVEL=WARNING` in production to reduce noise.
- Access logs redact `search=` on `/api/transactions` (SEC-007). HTTP exception handlers may still log `detail` strings (SEC-008); avoid putting user PII in raised `HTTPException` messages.

## Config validation (OPS-012)

Before go-live, confirm:

- First admin exists, can log in, and can open `/admin/users`.
- There is no recovery-key path; lost vault passphrase means encrypted data cannot be recovered.
- `SESSION_COOKIE_SECURE=1` on HTTPS deployments.
- `CORS_ORIGINS` lists only your UI origin(s).
- `DATABASE_URL` points at a backed-up SQLite file or mounted volume.
- `ALEMBIC_STRICT=1` and startup logs show successful migration.
- `LOG_SQL` unset; `DEBUG_HEALTH` unset on exposed hosts.
- Optional `RATE_LIMIT_PER_MIN` for heavy POST endpoints.

## Current non-goals

- No automated backup job yet; the user manages backups manually for now.
- No Plaid integration planned. SimpleFIN is the likely future aggregation path.
