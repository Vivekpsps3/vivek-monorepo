# Development guide

## Prerequisites

- **Python 3.11+** (3.12 OK)
- **Node.js 20+** and npm
- **make** (GNU Make)

## Quick start

From the repo root:

```bash
make install   # once: Finance, Travel, Media, site Flask, and both Angular dependencies
make dev       # Finance API + UI + Media, with local login skipped
```

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:4200/hub | Hub (no login while local dev auth is on) |
| http://127.0.0.1:4200/ | Finance app |
| http://127.0.0.1:8091/ | Media journal |
| http://127.0.0.1:8000/docs | OpenAPI / Swagger |
| http://127.0.0.1:8000/api/health | Health check |

`make dev` sets `LOCAL_DEV_AUTH=1` for the Finance API process. On loopback that
signs the browser in as the deterministic user `local-dev`
(`local-dev@localhost`, display name Local Dev, admin on this machine only) and
the development UI unlocks that user's vault. Media reads the same finance
session, so http://127.0.0.1:8091/ opens without `/auth/login`. Travel is still
`make travel-dev` and is not started by `make dev`.

The repo `.env` is the Docker file (`DATABASE_URL` under `/data`,
`SESSION_COOKIE_SECURE=1`). `make dev` does not use that database. It uses
`apps/finance/backend/finance.db` and non-secure `SameSite=lax` cookies so the
http dev server can keep the session. Override either on the command line
(`make dev DATABASE_URL=... SESSION_COOKIE_SECURE=1`). `make backend` by itself
still loads `.env` as before.

Use real login, including the vault passphrase, with:

```bash
make dev LOCAL_DEV_AUTH=0
```

On a fresh database that path still starts at `/login` (or `/auth/login` on the
suite), then a vault at `/vault/setup`. Finance routes require the vault to be
unlocked.

### Local dev auth (`LOCAL_DEV_AUTH`)

The flag is read in `apps/finance/backend/local_dev.py`. It defaults **off**.
Unset, `0`, `false`, `no`, and `off` all leave authentication in place.
Docker Compose does not pass the variable, and production builds set
`localDevAuth: false` in `environment.production.ts`.

The bypass turns on only when the flag is explicitly `1`, `true`, `yes`, or
`on`, **and** one of these is true:

- the request `Host` is `localhost`, `127.0.0.1`, or `::1`, or
- `apps/finance/backend/.env.development` exists, sets `LOCAL_DEV_AUTH` to an
  on value, and was loaded at startup (any host). That file is gitignored.
  Do not copy it onto a deployed host. A file that does not set the flag does
  not count.

When the bypass is on:

- a missing session becomes the `local-dev` account (no password is stored)
- the development UI calls `GET /api/auth/local-dev/vault` and runs the normal
  vault KDF for that account only. The passphrase is generated into
  `apps/finance/backend/.local-dev/vault-passphrase` (gitignored, mode `0600`).
  It is not a source-code secret and it cannot unwrap anyone else's vault.
- Media's actor check uses this finance session, so the journal UI loads

When the flag is off, or the host is not local and `.env.development` is not in
use, `/api/auth/me` stays 401, the hub and finance app still go to login, vault
unlock is still required, and Media still answers 401 until you sign in. A real
session cookie is never replaced by `local-dev`.

### Optional API key (non-browser clients)

If `API_KEY` or `FINANCE_API_KEY` is set in `apps/finance/backend/.env`, every `/api/*` route except **`GET /api/health`** also requires `X-API-Key: <key>` or `Authorization: Bearer <key>`. Leave both unset for normal local browser dev (`make dev`). The web app uses **session cookies + CSRF**, not a baked-in frontend API key.

The UI calls the API at **`/api/...`** (see `environment.development.ts` `apiUrl: '/api'`). `proxy.conf.js` forwards `/api/**` to the backend. **Restart `ng serve` after proxy changes** (a stale dev server keeps serving HTML for `/api/*`).

## Make targets

See `make help`. Common:

- `make dev` — Finance API, Finance UI, and Media together. Prints the hub, finance, and media URLs. `LOCAL_DEV_AUTH=1` unless you pass `LOCAL_DEV_AUTH=0`. Uses `apps/finance/backend/finance.db` and http session cookies, not the Docker settings in `.env`.
- `make backend` / `make frontend` / `make media-dev` — run one side only. These do not set `LOCAL_DEV_AUTH`; login stays required unless you export the flag yourself.
- `make test` — Finance pytest + `ng test` (frontend needs a browser; set `CHROME_BIN` if ChromeHeadless is missing)
- `make test-full` — Finance, Travel, Media, and site backend suites; both Angular suites and builds; Docker build and suite-route integration
- `make travel-install` / `make media-install` / `make site-install` — install one optional backend environment without `make install`
- `make travel-test` / `make media-test` / `make site-test` — run the corresponding backend test suites
- `make test-site-frontend` / `make build-site-frontend` — site browser tests and development build
- `cd apps/finance/frontend && npm run e2e` — Playwright smoke (start `make dev` first, or let Playwright reuse an existing dev server on :4200)
- `make docker-up` — full website on http://127.0.0.1:8080 with API private behind the web proxy (see [DEPLOY.md](./DEPLOY.md))
- `make docker-down` / `make docker-logs` / `make docker-config` — common Docker operations
- `make reset-db` — delete `apps/finance/backend/finance.db` only
- `make reset-docker-db` — delete `data/finance.db` for Docker
- `make clean` — caches and `dist`; does **not** delete `finance.db` or `node_modules`
- `make build` — production frontend build

Override ports:

```bash
make dev API_PORT=8001 WEB_PORT=4300
```

## Backend layout

```
apps/finance/backend/
  main.py          # uvicorn entry
  app.py           # FastAPI app
  database.py      # engine, get_db
  models.py        # SQLAlchemy
  schemas_auth.py / schemas_vault.py / schemas_market.py
  auth.py / api_auth.py
  routers/         # health, auth/admin, vault, market
  services/        # encrypted storage, market_data, challenge_auth
```

Local DB default: `apps/finance/backend/finance.db` (gitignored). Override with `DATABASE_URL`.

Wipe all local data and start fresh:

```bash
make reset-db   # stop the API first if it is running
make backend    # creates empty tables via init_database()
```

### Database initialization order (SQLite)

On API startup, `init_database()` in `database.py` runs in order:

1. **Legacy preflight** — before any schema mutation, refuses startup if retired plaintext finance tables contain rows or password-only users remain.
2. **`Base.metadata.create_all`** — creates only tables from the current server-blind SQLAlchemy models.
3. **Alembic** — a fresh file database is stamped at current head `e0f6a2b3c4d5`; an existing file database upgrades to that head, including dropping empty retired plaintext tables. `:memory:` skips Alembic.

If Alembic fails, the API fails startup by default (`ALEMBIC_STRICT=1`). Set
`ALEMBIC_STRICT=0` only for local recovery/debugging when you understand the
schema risk.

For a blocked legacy database, back it up and use the previous app release to
finish browser-side account enrollment/data migration before restarting with
the current release. See [DEPLOY.md](./DEPLOY.md#retiring-the-plaintext-finance-schema).

## Frontend layout

```
apps/finance/frontend/
  src/app/         # features + shared/ui + auth + services
  proxy.conf.js    # dev API proxy
```

Feature folders include dashboard, transactions, income, fixed-expenses,
subscriptions, assets-liabilities, portfolio, investment-insights, stock-lab,
calendar, planning, admin.

## Environment

Copy `.env.example` → `.env` (repo root) if you need custom CORS, log levels, session cookie flags, or optional `API_KEY`.

**SEC-006:** Do not set `LOG_SQL=1` in production or on shared machines. SQL echo logs can include transaction amounts, categories, and account labels from the ledger.

### Plaid (not implemented)

There are **no** Plaid routes or SDK usage in the app today. Bank transactions come from **CSV import** ([ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md)). Variables in `.env.example` are placeholders only; safe to omit for local dev. SimpleFIN is the intended future aggregation path.

See `.env.example` for the full template. Never commit your real `.env` file.

## Tests

```bash
make test-backend
cd apps/finance/frontend && npx ng build --configuration development
```

`make install` creates separate Python environments for Finance, Travel, Media,
and the site Flask backend, and installs npm dependencies for both Angular apps.
To set up only the extra Python backends, run
`make travel-install media-install site-install`.
`make test-full` expects those environments, both frontend dependency trees, and
a ChromeHeadless-compatible browser; it runs all four backend suites, Travel
and Media static-module Node tests, both Angular test suites and builds, the
release-manifest fixture, and the Docker build with suite-route integration.

## More docs

See [docs/README.md](./README.md) — frontend conventions, bank imports, deployment, and data model notes.

## Production note

This repo targets **self-hosted** use (often a single household on one host). The app has multi-user accounts with session auth; still do not expose the API without TLS and proper cookie settings. See [DEPLOY.md](./DEPLOY.md).
