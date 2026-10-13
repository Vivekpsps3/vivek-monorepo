# Frontend conventions

Angular 19 standalone app under `apps/finance/frontend/src/app/`.

## Stack

- **Plain CSS** with design tokens from `src/theme/tokens.css` (ink + dust light default; dark only via `prefers-color-scheme`)
- **Shared UI** — finance-local `shared/ui/*` (selector prefix `ui-`) plus primitives re-exported from `@vivek/ui` (`packages/ui`)
- **State** — `FinanceService` over `EncryptedStoreService` after vault unlock (RxJS `BehaviorSubject`s for ledger, balance sheet, recurring cashflow); `PlanningService`; `AuthService`
- Stock Lab uses `MarketResearchService` for explicit ticker lookups and `EncryptedStoreService` for encrypted `stock_lab_scenarios`.
- **Charts** — Chart.js via dynamic `import('chart.js/auto')` (dashboard/charts components and planning fan chart)

## Routes

| Path | Component |
|------|-----------|
| `/embed` | Chrome-less net worth card for the ops iframe — auth + vault, outside shell |
| `/login` | Auth (username + vault-passphrase challenge login; legacy password migration only) — outside shell |
| `/vault/setup` | Create encrypted finance vault — auth only, outside shell |
| `/vault/unlock` | Unlock encrypted finance vault — auth only, outside shell |
| `/` | Home — three numbers: what you have, this month, what repeats |
| `/have` | Assets, debts, and holdings (`?t=holdings`) |
| `/spending` | Spending Review (`?t=review`), Activity (`?t=activity&v=all|spending|income`), Calendar (`?t=calendar`), and Imports (`?t=imports`); legacy `?t=pay` and `?t=spend` deep links redirect to Activity filters |
| `/recurring` | Jobs & pay or bills & subscriptions (`?t=pay`, `?t=spend`) |
| `/planning` | Retirement & goals (`?t=path&tool=overview|simulation|retirement-target|savings-goal|debt-payoff`), portfolio projection (`?t=growth`), and stock research (`?t=stocks`) |
| `/admin/users` | Admin user management (admin role only) |
| `/balance-sheet`, `/portfolio` | Redirect to `/have`, with `/portfolio` opening holdings |
| `/transactions`, `/calendar` | Redirect to `/spending`, with `/calendar` opening Calendar |
| `/income`, `/fixed-expenses`, `/subscriptions` | Redirect to `/recurring` |
| `/investment-insights`, `/stock-lab` | Redirect to `/planning`, opening Growth or Stocks respectively |
| `/charts` | Redirects to `/` |

Shell: `MainLayoutComponent` (five hubs, `#main-content`). Admin and account actions live in the account menu. Dev API: `apiUrl: '/api'` + `proxy.conf.js` (`/api/**` → FastAPI).

## Design tokens

Source of truth: `apps/finance/frontend/src/theme/tokens.css`.

| CSS variable | Role |
|--------------|------|
| `--bg` | Page background |
| `--card-bg` | Cards |
| `--surface-2` | Inputs, chips |
| `--text` | Primary text |
| `--text-secondary` | Secondary text |
| `--accent` | Indigo `#5266EB` — links, primary actions |
| `--border` | Borders |
| `--success` / `--danger` / `--warning` | Status |

Charts: `src/theme/chart-colors.ts` (prefer CSS vars for axes/tooltips; segment palette in `CHART_COLORS`).

**Appearance:** light is the default token set (paper `#F4F2EC`, card `#FFFEFA`,
ink `#1C1B18`, pine accent `#3F6F5C`). Dark is `[data-theme="dark"]`. First
visit follows the OS. The account menu has a Light / Dark split. Choice is
stored in `localStorage` key `ft-theme`. Elevation is surface value, not drop shadow.
Reduced transparency and increased contrast media queries are honored.
Typography prefers the system stack (no remote font fetch). Locale money/date
helpers live in `utils/format.util.ts`.

## Viewport presentation matrix

| Viewport | Navigation | Tables / dense data |
|----------|------------|---------------------|
| 390×844 | Icon + short labels, horizontal scroll, 44px targets | Horizontal scroll (dense table); list-cells deferred |
| 844×390 | Same, landscape | Same |
| 768×1024 | Short or full labels | Dense tables |
| 1024×768 | Desktop grid nav | Dense tables |
| 1280×800+ | Full labels | Dense tables |

Do **not** add a service worker that caches decrypted finance plaintext.

## Shared components

Primitives (`ui-button`, `ui-card`, `ui-input`, `ui-page-header`, `ui-icon`,
`ui-empty-state`) live in `packages/ui` (`@vivek/ui`) and are re-exported by
`shared/ui/index.ts`. Finance-local components live under `shared/ui/`.

| Selector | Notes |
|----------|--------|
| `ui-button` | `variant`: primary \| secondary \| ghost \| danger; `(clicked)` output |
| `ui-card` | `title`, optional `[uiCardActions]` |
| `ui-badge` | `variant`: default \| success \| warning \| danger |
| `ui-input` | `[(value)]` model, `label`, `type` |
| `ui-select` | `[(value)]`, `options: UiSelectOption[]` |
| `ui-skeleton` | `variant`: lines \| block \| circle |
| `ui-empty-state` | `title`, `message` |
| `ui-page-header` | `title`, `subtitle`, `[uiPageActions]` |
| `ui-data-table` | Scroll wrapper; project table markup inside; sortable columns expose semantic order |
| `ui-dialog` | Accessible modal shell: focus trap, Escape, backdrop close, scroll lock, restore focus; use for feature modals |
| `ui-icon` | Named icons used in nav and empty states |

Use **OnPush** on new components; feature pages must call `markForCheck()` after every manual subscription or promise mutation, including loading finalization and asynchronous error paths.

## Privacy and migration

- Vault finance records are schema-v2 authenticated-record ciphertext. The browser migrates schema-v1 records after login, verifies encrypted replacements, then removes legacy plaintext rows.
- Manual/imported Portfolio prices stay local. After authenticated vault unlock, the browser automatically refreshes deduplicated holding and configured employer tickers with bounded concurrency; the shell discloses the symbol sharing, reports progress/failures, and offers retry. Explicit retry, typed lookup, and Stock Lab research also send ticker symbols to the market-data backend/yfinance; no shares, employee purchase amounts, employer titles, account details, or scenario inputs are sent.
- Login unwraps a browser-held signing key with the vault passphrase and signs a single-use challenge. Admins issue invitations but cannot reset a user's vault passphrase or recover encrypted data.

## Home behavior

- Home begins with three clickable metrics, then a first-steps checklist for an empty vault, the cross-plane review queue, and charts. Detailed holdings stay on What you have; Home keeps portfolio value and position/quote provenance in its summary and retains the allocation chart.
- **What you have** is the current net worth total.
- **This month** is recorded pay and spend for the current month.
- **What repeats** shows scheduled pay and spend from recurring rows.
- The review queue links to due balance/position reviews, unreviewed transactions and ambiguous credits, statement-coverage gaps, parse-failed imports, and upcoming annual renewals. Ambiguous credits open their transaction editor in Activity; parse failures open Imports.
- Transactions do not change net worth.
- Home charts switch between Recorded activity and Scheduled cashflow; they do not present a combined total. Spending categories use purchase/refund effects across the full encrypted ledger, independent of the visible transaction page.

## Recurring cashflow pages

- `/income`, `/fixed-expenses`, `/subscriptions` manage encrypted recurring rows via `FinanceService`.
- These do **not** change net worth. They feed cashflow summary and can influence planning spending inputs.
- Prefer the dedicated pages over inventing parallel recurring models on the transactions table.

## Bank CSV Import

- Transactions page bank import runs in the browser via `utils/bank-import.util.ts`.
- Supported slugs: `capital_one`, `chase`, `amex`, `citi`, `bank_of_america`, `x_money`.
- The import dialog accepts multiple CSVs, with an independent bank selector for every file and previews/errors grouped by filename. It detects duplicates across uploaded files as well as saved records.
- Preview uses encrypted transaction dedupe keys and commit writes encrypted transaction records through `/api/vault/records/upsert`; bank CSV contents are not sent to legacy `/api/imports/*` routes in normal vault mode.
- Failed files do not block valid rows in other files. Failed commits retain selection for a retry that rechecks saved keys.
- Activity's import action opens the canonical Imports tab and the add flag opens its wizard there. Each receipt shows its confirmed account outcome and separates parse failures (reattach the corrected CSV to the original receipt) from saved transactions that still need review (open the exact receipt's rows in Activity).

The import flow stages and resumes per-file receipts in the encrypted client store. Each receipt tracks per-file source account identity, remembered confirmed account mappings, selected/completed/unresolved rows, and the user-confirmed account/date interval separately from observed transaction min/max dates. Correcting a parse-failed file replaces only that file's staged rows and diagnostics while keeping rows from other files in a combined receipt. Stable account keys keep same-mask accounts separate; renames use the selected account's explicit ID. Encrypted receipt-row chunks contain at most 100 parsed rows or 160 KB, and vault checkpoints write at most 200 records. If initial staging misses a row chunk, the receipt cannot resume or activate until the original CSV is reattached. Coverage is evidence about dates the user confirms are represented in the import, not proof of statement completeness. Undo removes only receipt-created transactions that still match their imported values; edited rows remain and are reported, and the receipt's coverage is withdrawn. Raw CSV remains browser-local.

## Finance views, valuation, and planning behavior

The `/spending` hub separates **Spending Review**, **Activity**, **Calendar**, and **Imports**. Spending Review compares selected and prior month amounts by category or merchant and opens matching transaction details; for the current month it compares the same elapsed calendar days in the prior month. Its handoff preserves both full date ranges, the selected account/group, and the chosen transaction ID, which opens the editor directly. It also shows confirmed coverage gaps for each selected confirmed account. Activity filters by exact account, normalized category/merchant group, review state, month, and date range. These filters stay in the URL and respond to browser back/forward. The totals and CSV export use the full matching ledger, regardless of the 100-row page size. Blank merchants use the shared “Unassigned merchant” group and rows without an account can be selected explicitly. Calendar's top-purchase and selected-day links preserve the selected month/date and open the chosen transaction. Recorded spend is the default. Purchases contribute to spend, refunds reduce it, payments and transfers affect neither spend nor income, and ambiguous credits remain reviewable but excluded from totals. Optional `kind`, merchant, review state, receipt ID, and import-edited metadata support cleanup while the source description remains unchanged. The ledger supports category/merchant cleanup. Import receipts show outcomes and confirmed date coverage.

Home cashflow charts offer two distinct views: **Recorded** uses ledger activity, and **Scheduled** uses recurring job, fixed-expense, and subscription schedules. Recorded month and category values offer accessible links, and chart clicks carry the same month/category into Activity. Scheduled values open the owning Recurring tab. The synthetic collapsed **Other** bucket expands the category list; it never routes as though “Other” were an underlying category. No chart toggle combines observed and scheduled amounts. Category totals apply the same transaction-kind effects across the full ledger rather than a paged transaction-list subset.

Planning's three-completed-month variable-spending suggestion is available only when each selected confirmed account has complete receipt coverage for every day in the full three months and the user selected at least one category. Account coverage intervals are unioned day by day; staged, partial, failed, withdrawn, invalid, and unknown-account receipts do not qualify. The estimate can exclude selected recurring-charge transaction IDs and requires explicit acceptance before it is saved. The accepted profile records the period, account/category selection, exclusions, receipt IDs, acceptance time, and accepted amount. A fully covered period with no eligible spend yields a valid zero estimate.

Planning asks users to choose a question in the `tool` query parameter while retaining the outer Planning, portfolio projection, and stock research destinations. It links live net-worth, holdings, job-income, and scheduled-cost facts back to their owning pages and shows only recorded balance, quote, and position dates; missing or future dates remain unknown. Goal funding starts with no saved amount, and debt payoff starts at $0 unless the user selects one liability. The goals and debt calculators hide spending-estimate controls that do not affect those answers.

Manual assets and liabilities have an `as_of_date`; holdings carry position dates and price provenance. Default balance review intervals are 30 days for cash/checking/savings assets, 180 days for other assets, 30 days for liabilities, and 30 days for positions. Users may override review intervals. Market quotes become stale after more than three calendar days; undated or future-dated values have unknown freshness. Review prompts let users confirm or update values without rolling them forward automatically. Fidelity imports accept optional market-value, market-price, and position-date columns, preserve exact reported market value and keep import provenance distinct from later quote dates. Known cost-basis fallback is provisional; unknown basis makes gains unavailable while known market value/price remains usable. Selected-account replacements are previewed, staged, and verified. See [DATA_MODEL.md](./DATA_MODEL.md#fidelity-valuation-provenance).

Fixed-expense schedules use `due_day` where supplied; subscriptions use `next_bill_date`. Calendar and recurring views show upcoming dates as estimates, separate from posted transactions. Planning spending can use recurring schedules, fixed + variable + irregular annual components, or a manual annual total. Its coverage-qualified suggestion requires explicit acceptance; individual recurring charges can be excluded to avoid double counting. Saved profiles and legacy manual totals are preserved. A live source is serialized as `null` so saved assumptions follow current facts after reopen; manual values remain saved. A new total annual cashflow replaces income less spending and any older additional-contribution amount. Without that total override, legacy additional contributions stay additive. Local or remote finance edits reload fact summaries and mark prior planning runs stale without rerunning them. Zero-amount car-purchase and time-off templates let users enter their own costs, preserve event scope, and compare baseline and scenario with one shared seed. The retirement timeline is a straight-line estimate that excludes investment growth. Stock research rates display percentage values and store decimals. Planning remains speculative and does not change recorded finance data or net worth.

## Build

```bash
cd apps/finance/frontend
npm install
npx ng build --configuration development
```

Do not break `FinanceService` public method signatures without coordinating with apps/finance/backend/docs.
