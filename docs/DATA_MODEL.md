# Data model

Code truth: `apps/finance/backend/models.py`, `apps/finance/frontend/src/app/crypto/client-finance.ts`,
`apps/finance/frontend/src/app/services/planning.service.ts`.

## Users and ownership

App-native auth and vault metadata use SQL tables:

| Table | Purpose |
|-------|---------|
| `users` | Email, display name, role, active flag, password hash, timestamps |
| `auth_challenges`, `auth_enrollments` | Hashed, expiring, single-use login challenges and admin enrollment invitations |
| `user_sessions` | Hashed session tokens, CSRF token hashes, expiry/revocation metadata |
| `audit_events` | Login, logout, user create/update, password reset, and related account events |
| `user_vaults` | Encrypted key wraps; public-key auth metadata is stored on `users` |

The first account created by the app setup flow is an admin. Auth and sync metadata live in SQL tables (`users`, `auth_challenges`, `auth_enrollments`, `user_sessions`, `audit_events`, and `user_vaults`). Finance facts are browser-owned encrypted records in `encrypted_records`, scoped by `user_id` and a logical collection name. The logical collections include `transactions`, `bank_accounts`, `import_batches`, `assets`, `liabilities`, `holdings`, `brokerage_accounts`, `job_incomes`, `fixed_expenses`, `subscriptions`, and `planning_profiles`; these names are not SQL tables. Optional blind-index tokens live in `encrypted_record_indexes`. Public ticker data lives in global `ticker_quotes` and `market_research_cache` tables.

Deleting an account is destructive: the admin API removes that user, sessions, vault wraps, encrypted records, and their blind-index rows. It does not delete global market caches. The API refuses self-delete and refuses deleting an account only when that account is the final active admin. Inactive admins can be deleted when at least one other active admin remains.

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

### Source dates and freshness

Current assets/liabilities have `as_of_date`; holdings retain position dates and quote source/date metadata. A dated market quote is stale after more than three calendar days; an undated or future-dated value has unknown freshness. These dates describe recorded source values; freshness never changes a financial value or creates history.

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

| Encrypted collection | Purpose |
|-------|---------|
| `assets` | Cash accounts, property, vehicles, other (`AssetCategory` enum) |
| `liabilities` | Mortgages, loans, credit cards (`LiabilityCategory` enum) |

Each row has `name`, `category`, value (`current_value` or `balance_owed`), `as_of_date`, optional `notes`.

## Investments

`holdings` — equities/ETFs and brokerage cash sweeps with live/cached prices via `market_data`. Counted inside **portfolio** only; they are **not** subtracted from or merged with manual `assets` (see [Avoid double-counting cash](#avoid-double-counting-cash)).

Optional `brokerage_accounts` / `brokerages` group imported positions; nickname can be set via import API.

### Fidelity valuation provenance

Fidelity CSV parsing accepts optional market-value, market-price, and position-date columns. A supplied market value is preserved as the exact position value; a supplied market price is retained, and when only market value is supplied, per-share price is derived as value divided by shares. Cost basis is retained separately from market valuation. If neither market value nor price is present, known cost basis supplies a clearly provisional value. Unknown basis always makes gains unavailable; position value remains available when market value or price is known, and is unavailable only when neither market valuation nor usable cost basis is present. Imported valuation source and position date remain distinct from later market quote source, market date, and fetch time. The importer previews existing versus replacement value per account, stages and verifies the selected accounts, then activates the replacement. Portfolio value and net worth use available position values with their provenance visible.

## Transactions ledger

Encrypted transaction records — per-user `income` and `expense` (manual or `source=import` from browser-side bank CSV). Current records include date, direction, category, amount, optional description, source, and optional account display. They power the spending/activity list, calendar, dashboard period views, and monthly expense/income totals. **They do not** update net worth.

The encrypted ledger preserves `description` as the source description and supports optional `kind`, `merchant`, `import_receipt_id`, `import_edited`, and stable bank-account identity fields. `kind` supports `purchase`, `refund`, `payment`, `transfer`, `income`, and `ambiguous_credit`; legacy rows without a kind retain their income/expense direction. Purchases contribute to spending, refunds reduce spending, and payment/transfer rows affect neither spending nor income. Ambiguous credits are excluded from totals until classified. Merchant normalization never replaces the source description.

The user mostly transacts by card. Rent and utilities can be modeled as fixed expenses (below) rather than only as one-off transactions; neither path directly mutates net worth.

Imports: see [ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md). Built-in browser-side bank slugs today: `capital_one`, `chase`, `amex`, `citi`, `bank_of_america`, `x_money`.

Bank CSV preview reports parsed, new, duplicate, skipped, and error row counts across multiple files. Each encrypted import receipt is staged/resumable and tracks per-file source account identity, confirmed account mapping, selected/completed/unresolved rows, and explicitly confirmed account/date coverage. Stable account keys let the app remember confirmed mappings; different keys remain separate even when the bank slug and displayed account mask match, and renames use the explicit account ID. Coverage records the user-confirmed statement interval, separately from the file's observed transaction min/max dates; a latest transaction date alone never establishes coverage. Coverage describes the dates the user confirms are represented by a file, not proof of statement completeness. Receipt rows are encrypted in chunks of at most 100 parsed rows or 160 KB, with vault writes capped at 200 records per checkpoint. If the first staging checkpoint is missing rows, the receipt cannot activate or resume until the original CSV is reattached and staged again. Raw CSV files remain browser-local and are never included in a receipt.

Receipt undo removes only transaction rows created by that receipt that still match their imported values. Edited rows remain in the ledger and are reported during undo; the receipt's coverage is withdrawn so an edited or incomplete import cannot qualify as verified history. A transaction edited after import is marked `import_edited`. Bank-account identities and receipt details are encrypted client-side.

SimpleFIN is the likely future aggregation path. Plaid placeholders may exist in env examples, but Plaid is not the intended integration for this user.

## Recurring cashflow (not net worth)

Separate from the transaction ledger and balance sheet. Code: `apps/finance/frontend/src/app/crypto/client-finance.ts`. These are logical encrypted collections, not SQL tables.

| Encrypted collection | Purpose |
|-------|---------|
| `job_incomes` | Employer/pay configuration (base-pay unit, optional paycheck schedule, bonus/equity, taxes/deductions) |
| `fixed_expenses` | Named recurring bills (rent, utilities, etc.) with frequency and date range |
| `subscriptions` | Recurring subscription amounts with `next_bill_date` |

The cashflow summary is computed client-side after vault unlock (`apps/finance/frontend/src/app/crypto/client-finance.ts`).
`total_income`, `total_expenses`, and `net_cashflow` are one stream: posted transaction effects plus projected job pay, dated compensation payments, stock-sale proceeds, and bill/subscription occurrences that are not already posted. Job pay and posted income within 20% count once, keeping the larger figure; the smaller side appears as a negative, undated aggregate adjustment. That adjustment is not matched to a specific paycheck or deposit. A bill within four days and 2% (or $1) of a posted purchase counts once. `observed_*` remains the ledger alone and `scheduled_*` remains the full repeating projection. Home and Calendar show each income source and its date, or explicitly mark timing as unknown; those rows add to `total_income`. Spending → Activity → Income uses the same summary for a selected month, day, or finite date range, and shows recorded, scheduled work income, overlap adjustment, and combined income together. It does not project an all-history or open-ended period. There is no cashflow-summary HTTP endpoint. This is a cashflow view only: it does **not** write assets, liabilities, holdings, transactions, or net worth.

`fixed_expenses.due_day` places occurrences on the configured day within each period when present; `start_date` and frequency define the schedule, and `end_date` bounds it. Subscriptions use `next_bill_date` as their schedule anchor. Recurring shows the next dates for editing. Home, charts, and Calendar include occurrences that do not already match a posted purchase.

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
dated market quotes, including quote source and fetch time when available, and the one
current manual share price. Market date is stored separately from fetch time. Saving a
manual price replaces prior manual marks and any market quote for the same date, while
retaining market quotes from other dates. Older encrypted records with multiple manual
marks remain readable until the user saves a manual price; that save keeps only the new
manual mark. There is no manual price history.
These fields live inside the existing encrypted `job_incomes` collection; no plaintext
schema or server API migration is needed. Older records with no history retain their
prior calculation behavior.

Paycheck timing is optional and separate from `pay_frequency`, which describes the
unit used to enter base pay and per-period withholding. `payday_frequency` can be
weekly, biweekly, semimonthly, or monthly; `first_pay_date` anchors projected paychecks
forward, and semimonthly schedules also store `second_pay_day` (1–31, clamped to the
month's last day). The app does not infer paydays before the anchor. Without a schedule,
base salary remains a monthly accrual estimate with unknown dates. With a schedule,
base salary appears as dated estimated net paychecks; annual bonus/equity/other amounts
remain separate undated estimates. Dated payments are additional amounts; clear an annual
estimate when it represents the same payout to avoid counting it twice.

The current manual price can be entered for private or unsupported shares; public ticker
quotes are refreshed separately. Manual prices have an as-of date and apply to snapshots
on or after that date. A historical cutoff uses the latest valid mark dated on or before
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
contain today. Without a payday schedule, cashflow prorates base and annual pay
estimates across inclusive job boundaries and applies each promotion from its date.
With a schedule, projected base pay appears only on configured dates after the anchor;
annual bonus/equity/other estimates remain date-unknown and are prorated across eligible
job days. For enabled jobs, dated payments count once in their selected period, including final payments
after employment ends. Annual taxes/deductions remain estimates; a scheduled paycheck
spreads the existing annualized withholding across its payday cadence, and dated payments
do not carry an additional withholding estimate.

Recurring → Jobs & pay compensation history groups gross compensation
by employer (trimmed, case insensitive), including inactive/past jobs. Its range
defaults to all recorded history through today; a calendar-year selector and date
range are available, and future ranges are labeled as projections. Base, annual
bonus/equity/other, and withholding estimates use the existing annual-rate / 365.25
convention. Individual payments are additional to annual estimates, so users must
avoid recording the same amount in both places. Stock awards appear as separate
period compensation, with cumulative sale proceeds and the remaining-share snapshot
shown through the selected end date.
Starting base pay stays intact when promotions are added. This is a read-only
report; edit the source job in Recurring → Jobs & pay. The legacy
`/planning?t=compensation` deep link redirects there and opens the history
section. Compensation history never writes net-worth or ledger data.

`PlanningService.getInputs()` builds its default spending estimate from active fixed expenses and subscriptions, annualized from their configured frequency. Active job records supply estimated income. The default recurring input includes transaction count in its snapshot hash but does not derive its estimate from transactions.

Planning profiles support three explicit spending modes: active recurring schedules, a composed fixed + variable + irregular annual total, or a manually entered legacy-style annual total. A variable-spending suggestion uses the last three completed browser-local calendar months. Every selected confirmed account must have complete, confirmed receipt coverage for every day in those months, checked by the union of that account's eligible receipt intervals; staged, partial, failed, withdrawn, invalid, or unknown-account coverage does not count. Selected categories constrain the estimate, refunds reduce spend, and payments, transfers, and ambiguous credits are excluded. A fully covered zero-spend period is a valid zero suggestion. Users can exclude individual recurring-charge transaction IDs, then explicitly accept and save the estimate. The encrypted profile stores the selected accounts/categories, exclusions, coverage receipt IDs, period, acceptance time, and accepted amount while preserving legacy manual values and saved profiles.

Annual cashflow events can be scoped to the baseline, scenario, or both; legacy unscoped events apply to both. The app compares both simulations using the same seed and otherwise identical assumptions, with only their event scope differing. Portfolio projections compare a flat monthly contribution with a user-entered dollar increase. Advanced rate controls display percentages and store decimal rates. These estimates and scenarios do not mutate transactions, recurring records, assets, liabilities, holdings, or net worth.

## Planning lab (speculative)

Separate from net worth and the transaction ledger. Code: `apps/finance/frontend/src/app/services/planning.service.ts`. Profiles use encrypted vault collections; the retired plaintext SQL tables are not part of the active schema.

| Encrypted collection | Purpose |
|-------|---------|
| `planning_profiles` | Named assumption sets (returns, spending, tax ids, retirement age, etc.) |
| — | Scenario runs are ephemeral in the browser and are not persisted |

- **Does not** update balance-sheet, transaction, or recurring cashflow collections.
- **Does not** affect net worth.
- Monte Carlo runs in the browser and are not sent to a planning API.
- Only tool wired: `mc_net_worth_paths`.

The browser builds the current planning facts from the encrypted balance sheet and recurring schedules. Net worth uses current assets + holdings market value − liabilities; active job income and scheduled fixed expenses/subscriptions provide the default annual pay and cost inputs. Transactions remain a separate card ledger: they can support a user-accepted variable-spend suggestion, but do not silently become the spending assumption. The displayed source dates are the record dates (`as_of_date`, holding `quote_date`, and `position_as_of`); calculation time and market fetch time do not establish source freshness. Missing or future source dates are reported as unknown.

Profiles save assumptions, not frozen copies of live financial facts. When a live-source option is selected, its profile/run field is `null`, so reopening the profile uses current facts. Non-null manual overrides remain saved. Older profiles with `extra_contributions.annual_contribution` continue to add that amount to annual income minus spending. The newer optional `net_annual_cashflow_override` is the complete current annual net cashflow and replaces both that calculated difference and any legacy additional contribution when present. For example, $60,000 income, $40,000 spending, and a $10,000 total override contributes $10,000 per year; without the override, a $5,000 legacy addition contributes $25,000. This keeps the FIRE estimate and Monte Carlo model on the same current cashflow.

The inferred growth allocation is portfolio value divided by gross assets (`net worth + liabilities`), clamped to 0–100%; a no-portfolio or no-assets case uses 0%. The displayed estimate and simulation share this calculation. Goal funding starts with $0 already saved until the user enters an amount. Debt payoff starts with a $0 manual estimate and can explicitly select one saved liability; total net worth and all liabilities are never treated as the amount for one goal or one debt. The retirement timeline is a straight-line gap/current-cashflow estimate and does not include investment growth. A saved scenario run is not stored; source edits mark visible prior results stale rather than rerunning them.

### Stock Lab scenarios

`stock_lab_scenarios` is an encrypted vault collection, not a plaintext SQL finance table. It stores saved speculative inputs such as primary symbol, comparison symbols, purchase budget, share count, target price, return assumptions, dividend assumptions, and projection horizon.

Stock Lab scenarios do not mutate holdings, assets, liabilities, transactions, recurring cashflow, or net worth. Public ticker research is cached separately as symbol-level market data and must not include user budgets, share counts, scenario names, holdings IDs, or user IDs.

## Site schema revisions

Unified SQL changes are Alembic revisions under `apps/server/alembic`, applied by `python -m apps.server.migrations`. Startup does not apply them. An older image serves a newer revision only when `site_revision_compatibility` lists that image's head for the database revision. The procedure and the reason the historical Finance chain is not reused are in [MIGRATIONS.md](./MIGRATIONS.md).

These recovery-key columns are removal candidates. This change does not drop them. Auth and vault routes still read and write them, often as empty strings, and `user_vaults.recovery_wrapped_dek_b64` is `NOT NULL`. Dropping either column is a later revision that has to change those writers in the same release.

| Column | Why it is a candidate |
| --- | --- |
| `users.auth_recovery_wrapped_private_key_b64` | No recovery flow unwraps it. Signup still stores the client-supplied value or an empty string. |
| `user_vaults.recovery_wrapped_dek_b64` | No recovery flow unwraps it. Vault setup still persists it. |

The historical Finance revision row in `alembic_version` (`e0f6a2b3c4d5`) stays so that adopting the site baseline does not rewrite it. It is not a site revision. Do not run `apps/finance/backend/alembic` against `site.db`.
