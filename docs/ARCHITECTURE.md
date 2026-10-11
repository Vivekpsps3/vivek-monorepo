# Architecture (one page)

Local-first personal finance: **Angular 19** UI, **FastAPI** API, **SQLite** persistence, app-native user accounts, and a browser-owned encrypted finance vault.

## Active API surface

- Active browser finance storage is `/api/vault/*`: the backend stores ciphertext, sync revisions, and blind indexes only.
- Active non-finance plaintext surfaces are auth/admin account management, health, and public market quote/research cache.
- Plaintext finance HTTP is gone. Full surface ownership: [LIFECYCLE.md](./LIFECYCLE.md).

## Data planes (do not mix)

| Plane | What it is | Writes | Reads for |
|-------|------------|--------|-----------|
| **Balance sheet** | per-user `assets`, `liabilities`, `holdings` + market prices | CRUD + Fidelity CSV (holdings per brokerage account) | **Net worth** (computed client-side in `client-finance.ts` after vault unlock) |
| **Transactions ledger** | encrypted per-user transactions; legacy income/expense direction plus a typed kind and optional review metadata | Browser CRUD + client-side staged bank CSV import | Spending and activity review, calendar, observed cashflow summaries |
| **Recurring cashflow** | per-user `job_incomes`, `fixed_expenses`, `subscriptions` | CRUD on those tables only | Income / fixed-expense / subscription pages; cashflow summary computed client-side; planning spending inputs |
| **Planning (speculative)** | MC profiles + encrypted `stock_lab_scenarios`; public market research cache | MC profiles; Stock Lab scenarios via vault; market research by symbol | Monte Carlo `/planning`, Stock Lab `/stock-lab` |

**Invariant:** Net worth is always balance-sheet based: manual assets + portfolio market value − liabilities. Transactions, recurring cashflow rows, and simulations **never** update net worth.

## Finance UX and data behavior

These additions preserve the existing financial data planes:

- Transactions retain the source description and legacy `income` / `expense` direction. An optional kind distinguishes `purchase`, `refund`, `payment`, `transfer`, and `ambiguous_credit`. Refunds reduce spend; payments and transfers are excluded from spend; ambiguous credits are excluded from totals and remain visible for review. Optional merchant, reviewed state, receipt link, and import-edited marker support cleanup and reliable undo.
- Import receipts are encrypted, staged, and resumable. They record per-file account identity and remembered confirmed account mappings, selected/completed/unresolved rows, and user-confirmed account/date coverage, separately from observed transaction dates. Stable keys keep same-mask accounts distinct; renames use explicit account IDs. Receipt-row records contain at most 100 rows or 160 KB and vault checkpoints write at most 200 records. If initial staging is missing rows, the original CSV must be reattached before that receipt can resume or activate. Undo removes only receipt-created rows that have not been edited; edited rows remain, are reported, and their receipt coverage is withdrawn. No raw CSV is stored or sent to the backend.
- Fidelity files may supply market value and/or market price. Preserve a reported market value and use a reported market price when present; otherwise derive price from market value divided by shares. Known cost basis used as a fallback is explicitly provisional. Unknown basis makes gains unavailable; position value remains usable when market value or price is known. Record valuation source, date, and provenance, and preview account-level replacement before committing the staged replacement.
- Freshness rules use source dates: cash/checking/savings assets need review after 30 days, other assets after 180 days, liabilities after 30 days, positions after 30 days, and market quotes are stale after more than three calendar days. An undated value is unknown, not fresh. Freshness never changes a financial value.
- Spending Review, Activity, Calendar, and Imports distinguish recorded transactions from scheduled recurring items and receipt coverage. Recorded activity is the default for spend totals. The ledger supports bulk review, category and merchant cleanup, and visible import coverage.
- Cashflow charts switch between Recorded activity and Scheduled cashflow as separate views. Category charts use transaction-kind effects over the full ledger, independent of transaction-list paging.
- Recurring due dates feed upcoming schedules. Planning estimates separate fixed, variable, and irregular annual spending, retain explicit exclusions for recurring charges already represented elsewhere, and show the source and coverage behind any suggested estimate. Planning and calendar occurrences remain estimates until recorded; none changes net worth.

Current implementation status for fields and flows is documented in [DATA_MODEL.md](./DATA_MODEL.md) and [FRONTEND.md](./FRONTEND.md).

Tax document storage was removed. Do not add document vault/BLOB storage back without a fresh product/security decision.

Recurring cashflow (job income, rent/utilities-style fixed expenses, subscriptions) is a budget/plan plane. It can appear in cashflow summaries and planning inputs but does **not** change assets, liabilities, holdings, or net worth. Planning spending estimates distinguish fixed, variable, and irregular annual amounts; ledger-derived suggestions require confirmed import coverage and explicit acceptance. Stock grants and manual private valuations stay in the encrypted job record. Dated stock-sale proceeds count as cashflow when sold; stock grant value and unrealized growth appear only in Planning → Compensation and do not affect recurring or retirement income.

## Request flow

```
Browser (:4200 dev proxy, or :8080 Docker web)
  -> login page / session cookie / CSRF token
  -> /api/*  ->  FastAPI app.py
        → routers: health, auth/admin, vault, market
        → encrypted_records ciphertext in SQLite
        → browser decrypts and computes finance views/imports/planning
  → SQLite finance.db
```

Docker production-like topology:

```
Browser/domain proxy
  -> web (Nginx static Angular + /api reverse proxy)
  -> api (FastAPI, private Compose network)
  -> SQLite finance.db
```

## Auth And Users

- Login is passwordless: the browser uses a username and vault passphrase to unwrap a browser-held signing key, then signs a server-issued single-use challenge. Successful verification sets an HttpOnly session cookie and readable CSRF cookie.
- First-run setup generates the first admin's browser-held auth key and vault (`/api/auth/bootstrap-status`, `/api/auth/bootstrap/passwordless`). Admins create invitation/enrollment records for later users; there is no self-service password signup.
- Legacy password login exists only for a bounded, unenrolled-account migration endpoint. Enrollment registers the public key, stores only encrypted wraps, and clears the password hash.
- All non-health finance APIs require a valid session. Mutating requests require `X-CSRF-Token`.
- Optional legacy `API_KEY` / `FINANCE_API_KEY` middleware can also gate `/api/*` (except health) for non-browser clients.
- `users`, `user_sessions`, and `audit_events` live in the same SQLite database as finance data.
- Admin UI route: `/admin/users`. Admins create invitations, disable, reset contents, delete, and manage users, and view metrics. They cannot reset a vault passphrase or recover a user's keys. The raw SQL console is disabled. Self-delete and deleting or disabling the final active admin are blocked.
- User-owned finance tables include `user_id`; market quote cache and provider registries stay global.

There is **no** `routers/analytics.py`. Net-worth Monte Carlo still lives under `/api/planning/v1`; Stock Lab market research is under `/api/market/research/*`.

## Planning (as built)

- **Monte Carlo tool:** `mc_net_worth_paths` — read-only ledger snapshot → MC paths (ephemeral; **not** written to `planning_scenario_runs`).
- **MC saved inputs:** `planning_assumption_profiles` (named presets).
- API prefix: `/api/planning/v1` (`tools`, `inputs`, `profiles`, `POST /runs`).
- UI: `apps/finance/frontend/src/app/planning/` + `PlanningService`; route `/planning`.
- **Stock Lab:** `/stock-lab` is a speculative stock/ETF planning page. It saves encrypted scenario inputs in the vault and uses `/api/market/research/*` for public ticker research. Ticker symbols, including selected owned symbols, are intentionally disclosed for this feature; purchase assumptions remain encrypted client data.

## Imports

- **Banks:** browser-side parsers in `apps/finance/frontend/src/app/utils/bank-import.util.ts` preview CSV rows and create encrypted, staged/resumable import receipts. Receipts retain per-file account identity, selected/completed/unresolved row counts, user-confirmed account/date coverage separate from observed transaction dates, and safe undo state; stable account keys preserve distinct same-mask accounts and confirmed mappings can be reused. Initial missing row chunks require the original CSV to be reattached before resume. Raw CSV stays browser-local. Undo removes only unchanged rows created by that receipt, reports edited rows left in the ledger, and withdraws the receipt's coverage.
- **Brokerage:** client-side Fidelity CSV parsing supports optional market-value, market-price, and position-date columns. Imports retain valuation provenance and cost-basis status, label known cost-basis fallback as provisional, show unavailable gains when basis is unknown, preview account-level replacement, and stage/verify the selected-account replacement before activating it.

**SimpleFIN later:** the user wants SimpleFIN eventually. **Plaid is not the intended integration** even if placeholder env vars exist. CSV only today.

## Frontend

- Shell: `MainLayoutComponent` (five hubs: Home, What you have, Spending, Recurring, Planning; admin/user actions in the account menu); lazy feature routes in `app.routes.ts`; `authGuard` + `vaultGuard` protect the app shell; `adminGuard` for `/admin/users`.
- Vault routes (auth only, outside shell): `/vault/setup`, `/vault/unlock`.
- State: `FinanceService` / `PlanningService` use the encrypted client store after vault unlock; `VaultService` / `EncryptedStoreService`; `AuthService`.
- Prices: manual/imported prices remain local. An explicit Portfolio refresh and Stock Lab/typed lookup disclose only ticker symbols to `/api/market` and yfinance; shares, values, account details, and other holding fields remain encrypted.
- Server-blind storage: `/api/vault/*` stores wraps + ciphertext only; backend never decrypts. Plaintext finance HTTP is unmounted.

## Where to read more

| Topic | Doc |
|-------|-----|
| Tables & formulas | [DATA_MODEL.md](./DATA_MODEL.md) |
| Routes & UI tokens | [FRONTEND.md](./FRONTEND.md) |
| Setup | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| Deploy | [DEPLOY.md](./DEPLOY.md) |
| Agent handoff | [../AGENTS.md](../AGENTS.md) |
