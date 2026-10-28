# Architecture (one page)

One Angular 21 web application, one explicit FastAPI application factory, one identity/session implementation and one SQLite database compose the public site, Hub, Finance, Travel and Media. App-owned domain code stays in its own folder. Finance plaintext remains in the browser.

## Active API surface

- Active browser finance storage uses `/api/vault/*`: the backend stores encrypted key wraps, ciphertext, sync revisions, and optional blind indexes.
- Active plaintext surfaces include shared identity/admin, health, public market metadata, and user-authorized Travel and Media records. Domain authorization keeps personal data scoped to its owner.
- Plaintext finance HTTP is gone. Full surface ownership: [LIFECYCLE.md](./LIFECYCLE.md).

## Data planes (do not mix)

| Plane | What it is | Writes | Reads for |
|-------|------------|--------|-----------|
| **Balance sheet** | encrypted per-user `assets`, `liabilities`, `holdings` collections + market prices | Browser CRUD + Fidelity CSV (holdings per brokerage account) | **Net worth** (computed client-side in `client-finance.ts` after vault unlock) |
| **Transactions ledger** | encrypted per-user `transactions` collection; legacy income/expense direction plus a typed kind | Browser CRUD + client-side staged bank CSV import | Activity, calendar, observed cashflow summaries |
| **Recurring cashflow** | encrypted per-user `job_incomes`, `fixed_expenses`, `subscriptions` collections | Browser CRUD in the vault | Income / fixed-expense / subscription pages; cashflow summary computed client-side; planning spending inputs |
| **Planning (speculative)** | Encrypted `planning_profiles` and `stock_lab_scenarios`; public market research cache | Browser-side profile CRUD and Monte Carlo; Stock Lab scenarios via vault; market research by symbol | Monte Carlo `/planning`, Stock Lab `/stock-lab` |

**Invariant:** Net worth is always balance-sheet based: manual assets + portfolio market value − liabilities. Transactions, recurring cashflow rows, and simulations **never** update net worth.

These names describe logical encrypted collections, not SQL tables. The active
SQL schema holds auth/session data, vault wraps, ciphertext and sync metadata,
blind indexes, and public market caches. The unified server checks schema readiness at startup without modifying it. Offline migrations in `apps/server/alembic` create or upgrade `site.db`, including the original Finance revision marker `e0f6a2b3c4d5`. Historical Finance preflight/upgrade fixtures remain migration-only. See [Migrations](MIGRATIONS.md) and [Lifecycle](LIFECYCLE.md).

## Finance UX and data behavior

These additions preserve the existing financial data planes:

- Transactions retain the source description and legacy `income` / `expense` direction. An optional kind distinguishes `purchase`, `refund`, `payment`, `transfer`, and `ambiguous_credit`. Refunds reduce spend; payments and transfers are excluded from spend; ambiguous credits are excluded from totals until classified. Optional merchant, receipt link, and import-edited marker support cleanup and reliable undo.
- Import receipts are encrypted, staged, and resumable. They record per-file account identity and remembered confirmed account mappings, selected/completed/unresolved rows, and user-confirmed account/date coverage, separately from observed transaction dates. Stable keys keep same-mask accounts distinct; renames use explicit account IDs. Receipt-row records contain at most 100 rows or 160 KB and vault checkpoints write at most 200 records. If initial staging is missing rows, the original CSV must be reattached before that receipt can resume or activate. Undo removes only receipt-created rows that have not been edited; edited rows remain, are reported, and their receipt coverage is withdrawn. No raw CSV is stored or sent to the backend.
- Fidelity files may supply market value and/or market price. Preserve a reported market value and use a reported market price when present; otherwise derive price from market value divided by shares. Known cost basis used as a fallback is explicitly provisional. Unknown basis makes gains unavailable; position value remains usable when market value or price is known. Record valuation source, date, and provenance, and preview account-level replacement before committing the staged replacement.
- Freshness uses recorded source dates; market quotes are stale after more than three calendar days. An undated value is unknown, not fresh. Source dates and freshness never change a financial value.
- Activity is the ledger editor and Imports keep receipt coverage. Calendar and Home show one cashflow: posted transactions plus repeating pay and bills that are not already posted. Activity is the default spending view. The ledger supports category and merchant cleanup, and import receipts retain confirmed date coverage.
- Cashflow charts use the same single series as Home. Category charts use transaction-kind effects over the full ledger, independent of transaction-list paging.
- Recurring due dates feed the same cashflow as posted activity, without a second total. Planning estimates separate fixed, variable, and irregular annual spending, retain explicit exclusions for recurring charges already represented elsewhere, and show the source and coverage behind any suggested estimate. Planning stays speculative and does not change net worth, holdings, or the ledger.

Current implementation status for fields and flows is documented in [DATA_MODEL.md](./DATA_MODEL.md) and [FRONTEND.md](./FRONTEND.md).

## Shared packages

`packages/` holds app-neutral reusable code. The source-only `@vivek/browser`
package provides browser and crypto primitives; `@vivek/ui` provides generic
Angular presentation components, services, theme preferences, and chart
colors. Root `tsconfig.json` resolves shared source. Only `apps/web` composes frontend features through their public entrypoints. Domain features inject the neutral session port from `packages/auth`/`packages/ui`; they do not import the web platform implementation or sibling internals. The server factory alone composes domain routers. Domain routes depend on server platform identity/session/database modules, which never import domains. `make test-fast` checks the allowed graph.

Tax document storage was removed. Do not add document vault/BLOB storage back without a fresh product/security decision.

Recurring cashflow (job income, rent/utilities-style fixed expenses, subscriptions) is a budget/plan plane. It can appear in cashflow summaries and planning inputs but does **not** change assets, liabilities, holdings, or net worth. Planning spending estimates distinguish fixed, variable, and irregular annual amounts; ledger-derived suggestions require confirmed import coverage and explicit acceptance. Stock grants and dated valuations stay in the encrypted job record. Dated stock-sale proceeds count as cashflow when sold; compensation analysis is available from the Recurring hub and does not turn job valuation history into net worth or recurring income.

After authenticated entry and vault unlock, the browser starts one bounded,
nonblocking market refresh per unlocked session for the deduplicated symbols in
holdings and configured employer jobs. It sends ticker symbols to the public
market endpoint; all financial records and quote results stay in the encrypted
vault. The shell shows the ticker disclosure, progress, partial failures, and
an explicit retry action. The saved quote date is the provider's trading date,
never the browser's calculation time. See [SECURITY_MODEL.md](./SECURITY_MODEL.md#holdings-price-privacy).

## Request flow

```text
Browser -> nginx-edge TLS -> apps.server.main:production_app --factory
                         -> one request session -> /data/site.db
                         -> one root web build / lazy domain features
```

The root Angular shell owns Hub, sign-in, account, theme and HTTP policy. Hub loads independent authenticated Travel/Media summaries and lazily calls the Finance facade only when the browser has an unlocked vault. Public pages prerender real content and do not request private APIs. All private SPA transitions use one strict CSP/Trusted Types policy; public/private transitions load a new document where needed.

`create_app(Settings, Dependencies)` explicitly installs domain routers and middleware once. Engines and sessionmakers belong to the app instance; imports do not open a database. Offline migrations remain separate from startup. Ordinary Media saved reads and Travel reads perform no provider IO. Explicit provider work releases the database unit of work first. See [Migrations](MIGRATIONS.md), [Security](SECURITY_MODEL.md), and [Operations](OPERATIONS.md).

## Auth And Users

- Login is passwordless: the browser uses a username and vault passphrase to unwrap a browser-held signing key, then signs a server-issued single-use challenge. Successful verification sets an HttpOnly session cookie and readable CSRF cookie.
- First-run setup generates the first admin's browser-held auth key and vault (`/api/auth/bootstrap-status`, `/api/auth/bootstrap/passwordless`). Self-signup is closed unless `AUTH_SIGNUP_MODE` is `open`, `invite`, or `allowlist`. Admins can still issue one-time enrollment links. Unauthenticated login lookup returns only the signing-key wrap for a username, not for an email alias; the vault data-key wrap is available after the session exists. A signed-in browser can read its signing-key wrap back and re-wrap a legacy iteration count on the next unlock.
- Legacy password-to-passwordless enrollment remains migration-only. A database with a password-only account must use the previous app release to complete enrollment because current startup preflight refuses that state.
- All non-health finance APIs require a valid session. Mutating requests require `X-CSRF-Token`.
- Optional legacy `API_KEY` / `FINANCE_API_KEY` middleware can also gate `/api/*` (except health) for non-browser clients.
- Auth/session/audit metadata, vault wraps, encrypted records, optional blind indexes, and public market caches live in SQLite.
- Admin lives at `/hub/admin`, outside Finance. Admins see app health, who needs a vault or an invite, leftover sessions, disable, reset contents, and delete. They cannot reset a vault passphrase or recover a user's keys. The raw SQL console is disabled. Self-delete and deleting or disabling the final active admin are blocked.
- Finance facts are user-scoped encrypted vault collections, not user-owned plaintext SQL tables.

There is no active plaintext analytics or planning router. Monte Carlo inputs and calculations run in the browser after vault unlock; saved profiles use encrypted vault collection `planning_profiles`, and runs are ephemeral. Stock Lab market research is under `/api/market/research/*`. Retired and reserved APIs are listed in [LIFECYCLE.md](./LIFECYCLE.md).

## Planning (as built)

- **Monte Carlo:** client-side and read-only; it computes paths from the unlocked encrypted financial snapshot and does not persist runs.
- **Saved inputs:** named presets in the encrypted vault collection `planning_profiles`.
- UI: `apps/finance/frontend/src/app/planning/` + `PlanningService`; route `/planning`.
- **Stock Lab:** `/stock-lab` is a speculative stock/ETF planning page. It saves encrypted scenario inputs in the vault and uses `/api/market/research/*` for public ticker research. Ticker symbols, including selected owned symbols, are intentionally disclosed for this feature; purchase assumptions remain encrypted client data.

## Imports

- **Banks:** browser-side parsers in `apps/finance/frontend/src/app/utils/bank-import.util.ts` preview CSV rows and create encrypted, staged/resumable import receipts. Receipts retain per-file account identity, selected/completed/unresolved row counts, user-confirmed account/date coverage separate from observed transaction dates, and safe undo state; stable account keys preserve distinct same-mask accounts and confirmed mappings can be reused. Initial missing row chunks require the original CSV to be reattached before resume. Raw CSV stays browser-local. Undo removes only unchanged rows created by that receipt, reports edited rows left in the ledger, and withdraws the receipt's coverage.
- **Brokerage:** client-side Fidelity CSV parsing supports optional market-value, market-price, and position-date columns. Imports retain valuation provenance and cost-basis status, label known cost-basis fallback as provisional, show unavailable gains when basis is unknown, preview account-level replacement, and stage/verify the selected-account replacement before activating it.

**SimpleFIN later:** the user wants SimpleFIN eventually. **Plaid is not the intended integration** even if placeholder env vars exist. CSV only today.

## Frontend

- Finance local navigation: `MainLayoutComponent` (five hubs: Home, What you have, Spending, Recurring, Planning); lazy feature routes in `app.routes.ts`; `authGuard` + `vaultGuard` protect the app shell. `adminGuard` protects `/hub/admin`, which is outside the Finance shell. `/admin` and `/finance/admin` redirect there.
- Vault routes: `/finance/vault/setup`, `/finance/vault/unlock`; shared sign-in remains `/auth/login`.
- State: `FinanceService` / `PlanningService` use the encrypted client store after vault unlock; `VaultService` / `EncryptedStoreService`; `AuthService`.
- Prices: manual/imported prices remain local. After authenticated entry and vault unlock, one bounded, nonblocking session refresh sends deduplicated holding and configured employer ticker symbols to `/api/market`; Portfolio retry and Stock Lab/typed lookup also disclose symbols. Shares, values, account details, and other holding fields remain encrypted. See [SECURITY_MODEL.md](./SECURITY_MODEL.md#holdings-price-privacy).
- Server-blind storage: `/api/vault/*` stores wraps + ciphertext only; backend never decrypts. Plaintext finance HTTP is unmounted.

## Where to read more

| Topic | Doc |
|-------|-----|
| Tables & formulas | [DATA_MODEL.md](./DATA_MODEL.md) |
| Routes & UI tokens | [FRONTEND.md](./FRONTEND.md) |
| Setup | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| Deploy | [DEPLOY.md](./DEPLOY.md) |
