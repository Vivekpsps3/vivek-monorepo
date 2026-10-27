# Development

Use Python 3.12, Node 24, npm and GNU Make. Run commands from the repository root. One Python environment, root npm lock, Angular workspace and FastAPI process serve the entire suite.

```sh
make install
make build-frontends
make dev
```

Open http://127.0.0.1:8000. The public portfolio is `/`; shared sign-in is `/auth/login`; `/hub`, `/finance/`, `/travel/` and `/media/` are private routes. The first account becomes the administrator. Finance's vault is browser-owned; Travel and Media require a session but do not require the Finance vault to be unlocked.

`make dev` upgrades `.local/data/site.db` before starting `apps.server.main:production_app --factory`. Startup checks the schema and built frontend; it never migrates. This local file is separate from production. Authentication stays enabled. Set `SESSION_COOKIE_SECURE=0` only for local HTTP (the Make target does this).

For frontend editing, leave the API running and use `npm start` in another terminal. Open http://127.0.0.1:4200. `apps/web/proxy.conf.cjs` forwards `/api/**`, `/travel/api/**` and `/media/api/**` to the same API, retaining their paths. `API_PROXY_TARGET` can change that server address. Restart the dev server after proxy changes. The production-like path is the built app through port 8000.

## Ownership

| Folder | Responsibility |
| --- | --- |
| `apps/web` | Browser composition, public/private layouts, Hub/account, session and HTTP policy |
| `apps/site/src` | Public page features and local encryption demo |
| `apps/finance/frontend/src` | Finance routes, validation, computations, imports and vault |
| `apps/travel/frontend` | Travel routes, forms, maps and pure trip/flight models |
| `apps/media/frontend` | Media library, search, detail, progress and recovery drafts |
| `apps/server` | Explicit backend composition, identity, database lifecycle, security and migrations |
| Domain `backend` folders | App-owned models, routers, services and providers |
| `packages` | Neutral UI, identity types, dates, money formatting and crypto primitives |

Only `apps/web` composes frontend features through their public entrypoints. Features inject `SESSION_CONTEXT` instead of importing the root session implementation. Packages cannot import apps. `make test-fast` checks these boundaries. Finance validation belongs to Finance; shared browser code does not know about jobs, holdings or planning profiles.

## Verification

```sh
make test-fast
make lint typecheck
make test
make e2e
npx playwright test --config apps/travel/e2e/playwright.config.js
npx playwright test --config apps/media/e2e/playwright.config.ts
make docker-build test-suite-routes
bash scripts/validate-seeded-adoption.sh
```

`make test` runs all four Python coverage gates, Finance/public/root Karma, pure domain/shared Node tests and fast checks. Browser suites use one production server harness at `tests/e2e/server.py`, with temporary databases and deterministic provider fixtures. Screenshots run at 390/768/1280 in both themes. Outputs are isolated by domain under `test-results/`. Set `CHROME_BIN` for Karma and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for Playwright when using an existing Chromium installation. Existing `npm test --prefix apps/finance/frontend` and `--prefix apps/site` commands forward to the root suites; they need no separate installation.

Coverage floors and the command-equivalence contract are in [Quality](QUALITY.md). Run every applicable local gate before opening the one integrated PR. CI repeats those checks.

## Schema and configuration

```sh
make db-revision MESSAGE="describe the change"
make db-upgrade
make db-check
```

The authoritative chain is `apps/server/alembic`; keep applied revision identifiers. Build the root frontend before `make db-seed-dev`. Use a fresh disposable database for seeding; `SEED_ARGS` can set `--port` and `--session-file` for an isolated rehearsal. Use disposable data for the seeded-adoption rehearsal. Never point the historical Finance Alembic environment at `site.db`. [Migrations](MIGRATIONS.md) explains adoption, data preservation, backups and restore-based rollback.

Optional provider keys stay server-side. `.env.example` lists them; `make dev` reads exported variables, so export a key explicitly when testing a provider. Production uses the explicit private `SITE_ENV_FILE` workflow in [Operations](OPERATIONS.md). Do not enable SQL echo on shared or production state. Bank imports are browser-local CSV; see [Adding a bank import](ADDING_A_BANK_IMPORT.md).
