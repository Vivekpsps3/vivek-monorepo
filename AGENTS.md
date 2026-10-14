# AI Agent Handoff

Read this before changing code. This app is meant to be easy for future AI agents
to resume with minimal rediscovery.

## Product Story

Personal, self-hosted finance tracker. The user wants first-class support for:

- current net worth
- spending activity and transaction imports
- investments and portfolio imports
- recurring cashflow (job income, fixed expenses, subscriptions)
- planning/retirement analysis
- multi-user accounts (implemented); deeper household sharing may come later
- later SimpleFIN; not Plaid

Deployment target is a domain-hosted website on a Raspberry Pi or similar. SQLite
is acceptable and should default to a repo-local DB file, configurable with
`DATABASE_URL`.

## Hard Invariants

Do not blur these data planes:

1. Net worth = current manual assets + portfolio market value - liabilities.
2. Transactions are a card/spending ledger and do not change net worth.
3. Net worth is current-only; history is not stored. It is never a transaction
   rollup.
4. Planning is speculative and must not mutate assets, liabilities, holdings, or
   transactions.
5. Imported brokerage cash sweeps and manual cash assets can double count; the
   app currently leaves that choice to the user and documents it.
6. Job income, fixed expenses, and subscriptions are recurring cashflow data.
   They may feed cashflow summaries and planning inputs but do not change net
   worth.
7. Tax document storage was intentionally removed. Do not reintroduce document
   vault/BLOB storage unless the product direction changes explicitly.

## Current Stack

- Backend: FastAPI, SQLAlchemy, SQLite, Alembic, yfinance price lookup.
- Frontend: Angular 19 standalone components, plain CSS design tokens, Chart.js.
- Auth: passwordless username + vault-passphrase challenge sessions (cookie + CSRF), roles admin/user, `/admin/users`.
- Bank imports today: Capital One, Chase, Amex CSV transactions.
- Brokerage import today: Fidelity CSV positions.
- Planned later: SimpleFIN. Plaid is not expected to work for this user.

## Where To Look

- `docs/ARCHITECTURE.md`: one-page architecture.
- `docs/LIFECYCLE.md`: active/retired/reserved API and schema ownership.
- `docs/DATA_MODEL.md`: financial formulas and table semantics.
- `docs/FRONTEND.md`: Angular routes, shared UI, design conventions.
- `docs/DESIGN_GUIDE.md`: page-level metrics, chart rules, visual standards.
- `docs/DEPLOY.md`: production/domain deployment checklist.
- `docs/ADDING_A_BANK_IMPORT.md`: add a new CSV bank importer.
- `apps/finance/backend/models.py`: ORM tables.
- `apps/finance/frontend/src/app/crypto/client-finance.ts`: net worth and cashflow math.
- `apps/finance/frontend/src/app/services/finance.service.ts`: frontend API contract.
- `apps/finance/frontend/src/app/app.routes.ts`: routes.
- `apps/finance/frontend/src/app/stock-lab/`: Stock Lab UI; `apps/finance/backend/services/market_data.py` +
  `/api/market/research/*` for public ticker research; encrypted scenarios in
  vault collection `stock_lab_scenarios`.

## Recent Direction

The user clarified:

- all major finance surfaces matter; do not optimize for only budgeting or only
  investments
- current net worth must stay separate from transaction history
- transactions are mostly card-based; rent/utilities-style items are first-class
  fixed expenses (and subscriptions) without mutating net worth
- CSV import is fine now; SimpleFIN later; Plaid later is not desired
- domain access is required
- DB location should be configurable, defaulting to a repo-local SQLite file
- backups are user-managed for now
- app-native multi-user auth is in place; treat shared household product features
  as later, not as “no auth yet”
- tax document storage no longer makes sense for this app and has been removed
- user-level encryption is server-blind storage: browser-owned plaintext
  (WebCrypto AES-GCM + PBKDF2 vault), backend-owned ciphertext only via
  `/api/vault/*`. All users use the encrypted path; plaintext finance HTTP is
  unmounted. See `docs/SECURITY_MODEL.md`.
- Stock Lab (`/stock-lab`) is shipping: speculative stock/ETF analysis with
  public market research and encrypted scenario inputs; it must not mutate
  holdings or net worth. Spec: `docs/superpowers/specs/2026-07-09-stock-lab-design.md`.
- Passwordless login unwraps a browser-held signing key with the vault passphrase
  and signs a server challenge. Public keys, sessions, and challenge hashes are
  backend data; passphrases, private keys, and finance plaintext never leave the
  browser. No recovery-key path—lost passphrase means lost vault data. Password
  login survives only for bounded legacy migration; admins cannot reset vault
  access. Open self-signup is passwordless (username + vault passphrase).
- Schema-v1 records migrate in-browser to schema-v2 authenticated-record AAD;
  verify encrypted replacement before deleting legacy plaintext, then checkpoint
  WAL and `VACUUM`.
- Market prices refresh automatically once per authenticated, unlocked browser
  session, including configured employer tickers. Portfolio refresh and Stock
  Lab research also disclose ticker symbols to the backend/yfinance. The shared
  refresh status explains this; shares, values, account details, and saved
  scenarios remain encrypted. Do not describe ticker symbols as server-blind
  after use. Source trading dates remain separate from fetch/calculation times.
- Financial facts have one editing destination: balances/positions in What you
  have, transactions in Spending Activity, accounts/coverage/receipts in
  Spending Imports, jobs and dated compensation in Recurring Jobs & pay, and
  bills/subscriptions in Recurring's combined commitments list. Planning stores
  speculative assumptions only; other surfaces link to owners or show derived
  summaries. See `docs/FINANCE_UX_AUDIT.md` for the map and user journeys.

## Implementation Notes

Prefer additive API changes. Preserve current endpoints unless intentionally
migrating them with tests and docs. Add tests for any financial invariant.

For UI work, keep operational density. Avoid marketing/landing pages. Use shared
`ui-*` components where practical and keep cards for real grouped surfaces.
Avoid redundant native hover titles. Put useful field guidance and financial
semantics in concise visible text; keep meaningful chart values, privacy
disclosures, and source provenance.

Before finalizing a substantial change, run:

```bash
make test-backend
cd frontend && npx ng build --configuration development
```

If frontend tests need Chrome and fail due environment setup, report that
explicitly.

## Other apps

Travel lives in `apps/travel/` and is documented in `docs/TRAVEL.md`. The suite
serves Finance at `/finance/` and Travel at `/travel/` on one origin. The web
container keeps `/api/` as the finance API, including `GET /api/health`.

Travel authorizes each request with the browser's `finance_session` cookie by
calling finance `GET /api/auth/me` for reads and `POST /api/auth/session` for
writes. Writes also require the finance `X-CSRF-Token`. Travel does not open
`finance.db`, the vault, or net worth. Trip plans and PTO stay in `travel.db`,
scoped by the finance user id. `make travel-dev` serves Travel at `/` on port
8090. Sign-in and the `/finance/` paths live on the suite origin.
