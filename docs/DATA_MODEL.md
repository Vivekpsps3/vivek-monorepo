# Data model

Code truth: `apps/finance/backend/models.py`, `apps/finance/frontend/src/app/crypto/client-finance.ts`,
`apps/finance/frontend/src/app/services/planning.service.ts`.

## Users and ownership

App-native auth uses three security tables:

| Table | Purpose |
|-------|---------|
| `users` | Email, display name, role, active flag, password hash, timestamps |
| `user_sessions` | Hashed session tokens, CSRF token hashes, expiry/revocation metadata |
| `audit_events` | Login, logout, user create/update, password reset, and related account events |

The first account created by the app setup flow is an admin. All finance data that belongs to a person is scoped by `user_id`: transactions, bank accounts, import batches, assets, liabilities, holdings, brokerage accounts, job incomes, fixed expenses, subscriptions, planning profiles, and planning runs. Provider tables (`banks`, `brokerages`) and ticker quote cache are global. Admin metrics read from the same SQLite database.

Deleting an account is destructive: the admin API removes that user, their sessions, and all rows in user-owned finance tables. It does not delete global provider/cache tables. The API refuses self-delete and refuses deleting an account only when that account is the final active admin. Inactive admins can be deleted when at least one other active admin remains.

## Net worth

```
other_assets  = sum(Asset.current_value)
portfolio     = sum(holding shares × market price)
liabilities   = sum(Liability.balance_owed)
total_assets  = other_assets + portfolio
net_worth     = total_assets − liabilities
```

Always **current** — computed client-side after vault unlock by `computeNetWorth()` from assets + portfolio market value − liabilities. There is no net-worth HTTP endpoint.

**Not** derived from transactions, imports, job income, fixed expenses, or subscriptions.

Net worth history is not stored. The current total exists only as the client-side computed value in the browser.

Expenses, income, card payments, rent, utilities, transfers, and bank imports remain
transaction/cashflow data. They only affect net worth after the corresponding current
asset/liability value is updated.

### Avoid double-counting cash

`computeNetWorth()` in `apps/finance/frontend/src/app/crypto/client-finance.ts` **adds** `other_assets` (all manual `assets` rows) and **portfolio** (all `holdings` rows valued at market or purchase fallback). There is **no** deduplication between a manual cash/checking asset and brokerage sweep or money-market positions (e.g. **SPAXX**, **SWVXX**, **VMFXX**) that appear in Fidelity or other imports.

| User mistake | Effect on net worth |
|--------------|---------------------|
| Manual “Cash” or checking asset **and** SPAXX (or similar) in `holdings` for the same dollars | Both count toward `total_assets` — **inflated** net worth |
| Only SPAXX in `holdings` (brokerage cash) | Correct if that is where cash lives |
| Only manual `assets` for bank cash | Correct if you do not import sweep positions |

**Guidance:** Pick one representation per pool of money. Either track bank cash as manual assets **or** rely on brokerage CSV positions (including sweeps), not both for the same balance. The app does not infer overlaps; keeping both is allowed and sums both amounts by design.

## Manual balance sheet

| Table | Purpose |
|-------|---------|
| `assets` | Cash accounts, property, vehicles, other (`AssetCategory` enum) |
| `liabilities` | Mortgages, loans, credit cards (`LiabilityCategory` enum) |

Each row has `name`, `category`, value (`current_value` or `balance_owed`), `as_of_date`, optional `notes`.

## Investments

`holdings` — equities/ETFs and brokerage cash sweeps with live/cached prices via `market_data`. Counted inside **portfolio** only; they are **not** subtracted from or merged with manual `assets` (see [Avoid double-counting cash](#avoid-double-counting-cash)).

Optional `brokerage_accounts` / `brokerages` group imported positions; nickname can be set via import API.

## Transactions ledger

Encrypted transaction records — per-user `income` and `expense` (manual or `source=import` from browser-side bank CSV). Powers calendar, dashboard period views, and monthly expense/income totals on the Transactions page. **Does not** update net worth.

The user mostly transacts by card. Rent and utilities can be modeled as fixed expenses (below) rather than only as one-off transactions; neither path directly mutates net worth.

Imports: see [ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md). Built-in browser-side bank slugs today: `capital_one`, `chase`, `amex`, `citi`, `bank_of_america`, `x_money`. Brokerage Fidelity plaintext import is retired until moved client-side.

SimpleFIN is the likely future aggregation path. Plaid placeholders may exist in env examples, but Plaid is not the intended integration for this user.

## Recurring cashflow (not net worth)

Separate from the transaction ledger and balance sheet. Code: `models.py`, `apps/finance/frontend/src/app/crypto/client-finance.ts`.

| Table | Purpose |
|-------|---------|
| `job_incomes` | Employer/pay configuration (frequency, base pay, bonus/equity, taxes/deductions) |
| `fixed_expenses` | Named recurring bills (rent, utilities, etc.) with frequency and date range |
| `subscriptions` | Recurring subscription amounts with `next_bill_date` |

The cashflow summary is computed client-side after vault unlock (`apps/finance/frontend/src/app/crypto/client-finance.ts`):
it combines period **transaction** totals with pro-rated/planned job income and scheduled
fixed-expense/subscription occurrences for the selected range. There is no cashflow-summary
HTTP endpoint. This is a cashflow view only: it does **not** write assets, liabilities, holdings, or net worth.

Job records retain `effective_date` as the employment start date and add optional
`end_date`, `promotions` (date, replacement annual base pay, optional role), and
`compensation_payments` (payment/vesting date, bonus/equity/other kind, gross amount,
optional label). Optional `stock_grants` record bonus or equity awards paid in shares
(grant date, label, quantity, and grant price), with partial sales (date, shares,
fixed total cash proceeds). Optional `stock_purchases` record employee-funded ESPP lots
(purchase date, label, quantity, employee-paid price, optional market price at purchase,
and partial sales). Employee-paid amounts are funding basis; stock compensation is the
shares' economic value less those contributions. Existing equity-grant basis remains
unchanged. A job may have an optional public `stock_symbol`; quote refresh sends only
that ticker to the public market endpoint. A job-level `stock_valuations` list stores
dated manual prices and saved market quotes, including quote source and fetch time when
available. Market date is stored separately from fetch time. A new price replaces the
same-day price, preserving other dates.
These fields live inside the existing encrypted `job_incomes` payload; no plaintext
schema or server API migration is needed. Older records with no history retain their
prior calculation behavior.

Valuations can be entered manually for private or unsupported shares, or refreshed from
a public ticker. A historical cutoff uses only the latest valid price dated on or before
that cutoff; a market quote fetched after a lot was acquired can mark that lot from its
observed date. A quote's market date may precede the job start, but the quote is not used
for a lot until the quote has been observed and that lot has been acquired. A future-dated
valuation never affects an earlier snapshot. A grant
falls back to its grant price. An ESPP lot falls back to its market price at purchase
when present, otherwise to its employee-paid price. A stock snapshot equals fixed cash
proceeds from sales through the cutoff plus the value of shares still held. ESPP employee
contributions are subtracted from that economic value when calculating compensation.
For a selected compensation period, stock compensation is the ending net snapshot less
the net snapshot from the day before the period. This counts grant value and any same-year
change in the grant year; later years count only the period's gain or loss, avoiding
carry-forward double counting. Sale proceeds remain fixed when later valuations change.
All-history realized proceeds, remaining-share value, and employee ESPP contributions
are shown separately from the selected period's stock-compensation change.

Recorded stock-sale proceeds count as dated cashflow in the sale period, even when the
job is disabled. Grant value and unrealized share growth do not enter recurring income,
retirement income inputs, or planned cashflow. Current annual pay estimates are
unchanged. Stock grants, sales, and valuations do not update assets, holdings,
transactions, or net worth.

Current income and Path inputs only include enabled jobs whose start/end dates
contain today. Scheduled cashflow prorates recurring pay across inclusive job
boundaries and applies each promotion from its date. Dated payments count once
in their selected period, including final payments after employment ends.
Annual taxes/deductions remain recurring estimates; dated payments do not carry
an additional withholding estimate.

Planning → Compensation (`/planning?t=compensation`) groups gross compensation
by employer (trimmed, case insensitive), including inactive/past jobs. Its range
defaults to all recorded history through today; a calendar-year selector and date
range are available, and future ranges are labeled as projections. Base, annual
bonus/equity/other, and withholding estimates use the existing annual-rate / 365.25
convention. Individual payments are additional to annual estimates, so users must
avoid recording the same amount in both places. Stock awards appear as separate
period compensation, with cumulative sale proceeds and the remaining-share snapshot
shown through the selected end date.
Starting base pay stays intact when promotions are added. This view can edit the
same job records as Recurring → Pay and never writes net-worth or ledger data.

Planning reads recurring annual fixed expenses and subscriptions into its input snapshot for
spending estimates when useful.

## Planning lab (speculative)

Separate from net worth and the transaction ledger. Code: `apps/finance/backend/models.py`, `apps/finance/frontend/src/app/services/planning.service.ts`.

| Table | Purpose |
|-------|---------|
| `planning_assumption_profiles` | Named assumption sets (`payload_json`: returns, spending, tax ids, retirement age, etc.) |
| `planning_scenario_runs` | Schema reserved for persisted runs; **current** `POST /api/planning/v1/runs` returns results with `id=None` and does **not** insert rows |

- **Does not** update `assets`, `liabilities`, `holdings`, `transactions`, or recurring cashflow tables.
- **Does not** affect net worth.
- API: `/api/planning/v1/*` — all responses include speculative disclaimers.
- Only tool wired: `mc_net_worth_paths`.

### Stock Lab scenarios

`stock_lab_scenarios` is an encrypted vault collection, not a plaintext SQL finance table. It stores saved speculative inputs such as primary symbol, comparison symbols, purchase budget, share count, target price, return assumptions, dividend assumptions, and projection horizon.

Stock Lab scenarios do not mutate holdings, assets, liabilities, transactions, recurring cashflow, or net worth. Public ticker research is cached separately as symbol-level market data and must not include user budgets, share counts, scenario names, holdings IDs, or user IDs.
