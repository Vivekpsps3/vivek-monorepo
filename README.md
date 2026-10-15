# vivek-monorepo

Personal finance app: balance-sheet net worth (assets & liabilities), portfolio with cached/live prices, transactions and bank CSV import, recurring cashflow (income / fixed expenses / subscriptions), planning (Monte Carlo + Stock Lab), and app-native multi-user auth—Angular 21 + FastAPI + SQLite.

## Quick start

```bash
make install   # Python venv + npm (first time only)
make dev       # Backend :8000 + frontend :4200
```

Open **http://localhost:4200** (dev proxy talks to the API). Create the first admin on `/login`, then create/unlock your vault. Finance plaintext stays in the browser; the backend stores encrypted records.

| Command | What it does |
|---------|----------------|
| `make help` | All targets |
| `make backend` | API only → http://127.0.0.1:8000/docs |
| `make frontend` | UI only |
| `make test` | pytest + frontend tests |
| `make docker-up` | Full website → http://127.0.0.1:8080 |
| `make clean` | Caches / dist (keeps your `finance.db`) |

Details: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**

## Features

- **Home** — Three numbers: what you have, this month, what repeats
- **What you have** (`/have`) — Assets, debts, and holdings
- **Spending** (`/spending`) — Card and bank list plus a calendar. Does not change net worth
- **Recurring** (`/recurring`) — Pay, bills, and subscriptions. Does not change net worth
- **Planning** (`/planning`) — What-if path, growth, and stocks. Does not change real balances
- **Auth / vault / admin** — Username plus vault-passphrase challenge login, open self-signup, browser-owned encrypted vault, `/admin/users` for admins

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Angular 21, plain CSS design tokens, Chart.js, RxJS |
| Backend | FastAPI, SQLAlchemy, SQLite, Alembic |
| Prices | Memory → SQLite EOD → yfinance |

## Project layout

```
vivek-monorepo/
  apps/finance/backend      # FastAPI
  apps/finance/frontend     # Angular finance UI and the private Hub
  apps/travel/              # trip planner (separate DB)
  apps/media/               # private media journal (separate DB)
  apps/site/                # vivekpanchagnula.com
  packages/auth             # shared passwordless crypto
  packages/ui               # shared light/dark CSS and components
  .env.example              # finance runtime configuration
  docs/
```

Doc index: **[docs/README.md](docs/README.md)** · Agent handoff: **[AGENTS.md](AGENTS.md)**

## Configuration

Copy **`.env.example`** → **`.env`**. Compose and `_control` both read that one file.

| Variable | Default |
|----------|---------|
| `DATABASE_URL` | `sqlite:///./finance.db` |
| `CORS_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` |
| `PRICE_CACHE_TTL` | `120` (seconds, in-memory) |
| `EOD_CACHE_HOURS` | `24` |
| `LOG_LEVEL` | `INFO` |
| `API_KEY` / `FINANCE_API_KEY` | unset. Optional extra gate for non-browser clients; browser app uses session cookies |
| `SESSION_COOKIE_SECURE` | set `1` on HTTPS |
| `ALEMBIC_STRICT` | `1` (default): fail startup if Alembic upgrade fails on file DB |

## Data model

Adding banks: **[docs/ADDING_A_BANK_IMPORT.md](docs/ADDING_A_BANK_IMPORT.md)**. See **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** for table and formula details.

- **Net worth** = manual assets + portfolio market value − liabilities (computed client-side after vault unlock).
- **Transactions** — income, expenses, and browser-side card CSV imports for tracking; not part of net worth.
- **Recurring cashflow** — job income, fixed expenses, subscriptions; cashflow views only.
- **Planning** — speculative; does not mutate balance sheet or transactions.

Local database: `apps/finance/backend/finance.db` (not committed; see `.gitignore`). Docker default: `data/finance.db`.

## Travel

Trip planner in `apps/travel/`: one trip from the day you leave through the day you come back, with flights, drives, a calendar, day plans, parking, budget, and a PTO projection. It keeps its own SQLite file. On the suite it is served at `/travel/` and accepts the finance session cookie. See [docs/TRAVEL.md](docs/TRAVEL.md).

## Media

Private journal in `apps/media/` for movies, series, books, songs, albums, and games. Ratings, reviews, and progress stay in `media.db`. Search can use public metadata, and a title can always be added by hand. On the suite it is served at `/media/`. See [docs/MEDIA.md](docs/MEDIA.md).

## Tests & CI-style check

```bash
make test-backend
cd apps/finance/frontend && npx ng build --configuration development
```

## Docker website

```bash
docker compose up --build
```

Open http://127.0.0.1:8080/hub. Finance is http://127.0.0.1:8080/finance/. Travel is http://127.0.0.1:8080/travel/. Media is http://127.0.0.1:8080/media/.
The `web` container serves the Hub and Finance and proxies `/api`, `/travel/`, and `/media/`.
`/api/health` stays on that path. Docker stores finance at `data/finance.db`,
travel at `data/travel.db`, and media at `data/media.db`. Local finance dev defaults to
`apps/finance/backend/finance.db`. Override finance with `DATABASE_URL` and a
matching Compose volume when needed.

## Production checklist

See **[docs/DEPLOY.md](docs/DEPLOY.md)**. In short: TLS in front of the web container, create the first admin with username + vault passphrase, set `CORS_ORIGINS` and `SESSION_COOKIE_SECURE=1`, back up the SQLite file.

## Troubleshooting

- If the UI shows API errors, confirm the backend is running on `127.0.0.1:8000`, restart `ng serve`, and check `apps/finance/frontend/proxy.conf.js`.
- If you are not logged in, open `/login` (bootstrap first admin on an empty DB).
