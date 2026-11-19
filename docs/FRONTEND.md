# Frontend conventions

One Angular 21 application under `apps/web`, composing public and app-owned lazy features. Finance owns `apps/finance/frontend/src/app`; Travel and Media own their `frontend/src` folders.

## Stack

- **Plain CSS** with shared design tokens from `packages/ui/tokens.css` (coastal day/night palette; explicit light/dark choice)
- **Shared UI** — generic Angular components, confirmation/toast services, theme preference helpers, and chart colors live in `@vivek/ui` (`packages/ui`); Finance imports them from the package API
- Shared Angular controls own their component styles. Menu triggers reuse the button stylesheet; `packages/ui/kit.css` supplies public navigation and small global utilities, not a second card/header/button implementation. Use `ui-button` for public-page actions too.
- **State** — `FinanceService` over `EncryptedStoreService` after vault unlock (RxJS `BehaviorSubject`s for ledger, balance sheet, recurring cashflow); `PlanningService`; `AuthService`
- Stock Lab uses `MarketResearchService` for explicit ticker lookups and `EncryptedStoreService` for encrypted `stock_lab_scenarios`.
- **Charts** — Chart.js via dynamic `import('chart.js/auto')` (dashboard/charts components and planning fan chart)

## Routes

| Path | Component |
|------|-----------|
| `/embed` | Compact net-worth card — auth + vault; framing is blocked by the document policy |
| `/auth/login`, `/auth/signup` | Root shared sign-in and invitation enrollment |
| `/vault/setup` | Create encrypted finance vault — auth only, outside Finance local navigation |
| `/vault/unlock` | Unlock encrypted finance vault — auth only, outside Finance local navigation |
| `/` | Finance Home: net worth and current-month cashflow, with source/holdings detail |
| `/have` | Assets, debts, and holdings (`?t=holdings`) |
| `/spending` | Activity (default; `?t=activity&v=all|spending|income`) and Calendar (`?t=calendar`); old Review links and legacy `?t=pay` / `?t=spend` links open Activity. `?receipts=1` and `?t=imports` redirect to `/imports` |
| `/imports` | Import history, bank and Fidelity import, receipts, resume and undo, plus links to encrypted backup, restore, passphrase change and Lock Finance. `?start=bank` or `?start=fidelity` opens that import |
| `/bills` | Bills and subscriptions (`?kind=all|bill|subscription`, `?status=all|active|inactive`, `?order=soonest|latest`) |
| `/pay` | Monthly income sources, jobs and pay, and read-only compensation history. `?month=YYYY-MM` selects the income month and `?history=1` opens the report |
| `/recurring` | Redirects to Pay. Older `?t=spend`, `?t=bills`, and `?t=subs` links open Bills |
| `/planning` | Planning index and current picture. Direct tools: `/planning/retirement`, `/planning/simulation`, `/planning/savings`, `/planning/debt`, `/planning/projection`, `/planning/research`. Older `?t=growth`, `?t=stocks`, and `?tool=` links open those tools. `?t=compensation` opens Pay |
| `/hub/admin` | Suite admin: app health, people, and what needs attention. Not inside Finance. |
| `/balance-sheet`, `/portfolio` | Redirect to `/have`, with `/portfolio` opening holdings |
| `/transactions`, `/calendar` | Redirect to `/spending`, with `/calendar` opening Calendar |
| `/income` | Redirect to `/pay` |
| `/fixed-expenses`, `/subscriptions` | Redirect to `/bills` |
| `/investment-insights`, `/stock-lab` | Redirect to `/planning/projection` and `/planning/research` |
| `/charts` | Redirects to `/` |

Finance paths above are relative to `/finance`; `/auth/*` and `/hub/admin` are root routes. Public `/` is the portfolio. The root `<base href="/">` and Angular router own all navigation. `PrivateLayoutComponent` owns one app switcher with direct Hub and app links at wide widths and a named disclosure at narrow widths. The disclosure links to individual destinations. Finance, Media and Travel own the lists used by both their local navigation and this disclosure. The account button stays visible. Its dropdown opens the grouped Settings index, shows admin stats when authorized, and offers sign-out. Settings links to account and security, appearance, game and connector sections. Finance contributes its guide, vault lock and confirmed clear-data actions while its unlocked layout is active; those actions are removed when that layout is destroyed. The Finance bar links directly to Accounts, Holdings, Activity, Calendar, Bills, Pay, Planning and Imports. Media exposes Movies, Series, Books, Music and Games alongside Now, Calendar, Search, Add and All items. Existing legacy URLs still use the app's route behavior. The root dev proxy is `apps/web/proxy.conf.cjs`; all APIs use the same FastAPI process. Hash bookmarks translate once at startup into known canonical routes. Unknown assets and unknown page paths return 404 rather than an arbitrary shell.

## Browser icons

The public portfolio uses a V monogram in `apps/site/public/favicon.svg`; the private workspace uses the four-pane mark in `apps/web/public/workspace-icon.svg`. Each has a 16/32/48/64px ICO fallback and a 180px PNG touch icon. The root shell starts with the workspace mark; public prerenders and completed public-route navigation select the personal mark. Icon URLs carry a revision so browser favicon caches refresh when the artwork changes. Keep the SVG sources crisp at 16px when revising them, and regenerate their bitmap siblings together.

## Design tokens

Source of truth: `packages/ui/tokens.css`.

| CSS variable | Role |
|--------------|------|
| `--bg` | Page background |
| `--card-bg` | Cards |
| `--surface-2` | Inputs, chips |
| `--text` | Primary text |
| `--text-secondary` | Secondary text |
| `--accent` | Sea-glass teal `#126963` — links, primary actions |
| `--accent-fill` / `--on-accent` | Filled actions and their labels; separate from link text for forced colors |
| `--border` | Borders |
| `--success` / `--danger` / `--warning` | Status |

Charts: shared palette and Chart.js options live in `@vivek/ui` (`packages/ui/src/chart-theme.ts`; prefer CSS vars for axes). Chart hover tooltips are off. Values sit in the table or readout beside the chart.
Holdings mix keeps saved stale values labeled and shows the table when a missing
or signed value makes a doughnut misleading. A genuine zero remains numeric.
Holdings and the allocation table use the compact table layout. Media cards keep
their own typography and actions and share the table's coastal material edge.

**Appearance:** `tokens.css` owns the coastal `--ivory`, `--navy`, `--teal`,
`--coral`, `--brass` and `--wood` palette. Semantic surfaces/text/actions reference
those colors; night uses navy surfaces with ivory ink and lamplit brass accents.
The shell and Hub use material accents; system body text and tabular money remain.
`--font-display` is reserved for large Hub readouts. Forced colors uses system
surfaces, text, links and focus without decorative shadows. First visit follows
the OS; Settings → Appearance offers System / Light / Dark. Choice is stored in
`suite-theme`, with legacy app keys read during migration. Shared 8–20px radii,
reduced-transparency/increased-contrast support and local font loading remain.
Locale money and local-date helpers live in `@vivek/browser` (`packages/browser`).

## Viewport presentation matrix

| Viewport | Navigation | Tables / dense data |
|----------|------------|---------------------|
| 390×844 | Compact app switcher and a wrapping app-local row | One vertical scroll. Tables become labeled cards. Dialogs are bottom sheets |
| 844×390 | Wide switcher, wrapping app destinations | Same |
| 768×1024 | Wide switcher, wrapping app destinations | Card tables |
| 1024×768 | Wide app switcher and local destinations | Dense tables |
| 1280×800+ | Full labels | Dense tables |

Do **not** add a service worker that caches decrypted finance plaintext.

## Shared components

Generic components (`ui-button`, `ui-card`, `ui-input`, `ui-page-header`,
`ui-icon`, `ui-empty-state`, `ui-badge`, `ui-select`, `ui-skeleton`,
`ui-data-table`, `ui-dialog`, and `ui-confirm-dialog`) live in `packages/ui`
(`@vivek/ui`). Finance imports these directly; feature-specific presentation
and finance domain behavior remain in the app.

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

- Vault finance records are schema-v2 authenticated-record ciphertext. After login, the browser can locally decrypt existing schema-v1 ciphertext records and rewrite them as schema-v2. The former plaintext-row copy flow is retired; Alembic cleanup runs only after startup confirms legacy tables are empty and no password-only accounts remain.
- Manual/imported Portfolio prices stay local. After authenticated vault unlock, the browser automatically refreshes deduplicated holding and configured employer tickers with bounded concurrency. The shell does not show a ticker countdown. The Finance guide explains that ticker symbols are sent to the market service. Failures stay on screen with retry. Explicit retry, typed lookup, and Stock Lab research also send ticker symbols to the market-data backend/yfinance; no shares, employee purchase amounts, employer titles, account details, or scenario inputs are sent.
- Login unwraps a browser-held signing key with the vault passphrase and signs a single-use challenge. Admins issue invitations but cannot reset a user's vault passphrase or recover encrypted data.

## Home behavior

- Home begins with two clickable summaries in one divided section: current net worth, and this month's income and spending. The income summary is followed by a source list that adds to the monthly total, including recorded deposits, projected paychecks, dated compensation and stock-sale proceeds, undated estimates, and the aggregate overlap adjustment. It then shows a first-steps list for an empty vault and charts. Detailed holdings open directly from the Finance destination bar; Home keeps the holdings / assets / debts split and compact balance, position, and quote source dates, and retains the allocation chart.
- **What you have** is the current net worth total.
- **This month** is one cashflow total: posted activity, job pay and recorded share-sale proceeds, plus bills that are not already posted. Posted and projected income within 20% count once; the visible negative adjustment explains the amount removed and is not assigned to a specific deposit or payday. A bill within four days and 2% (or $1) of a posted purchase counts once. Without a payday schedule, job pay remains a date-unknown estimate; configured schedules show paycheck dates only from the saved first payday forward.
- Transactions do not change net worth. Jobs stay editable on Pay. Bills and subscriptions stay editable on Bills. None of those editors change net worth.
- Home charts use that same single cashflow series. Calendar shows posted deposits, configured paycheck dates, dated compensation and stock-sale sources on their dates, plus a monthly source list. Day net shows dated source amounts before the month-level overlap adjustment, which is intentionally not attributed to a particular day. Spending categories use purchase/refund effects across the full encrypted ledger, independent of the visible transaction page.

## Spending income view

- Spending → Activity → Income keeps the recorded-income transaction list and adds a read-only work-income source summary for the selected month, calendar date, or complete From/Through range. The summary follows that date scope and includes all recorded income for the period, independent of Activity search, account, merchant, and category filters.
- Recorded income, scheduled work income, the same period-level overlap adjustment used by Home and Calendar, and combined income are shown together so the total reconciles. The adjustment is not assigned to a specific paycheck. All months and open-ended date ranges ask for a finite period instead of extending current pay assumptions over an arbitrary history.
- Work records remain editable only in Pay → Jobs and pay. This view does not add transactions or change net worth.

## Recurring cashflow pages

- `/finance/bills` manages encrypted bills and subscriptions via `FinanceService`. Older fixed-expense, subscription and Recurring spend links route to the same workspace. `/finance/pay` manages jobs and shows dated and undated income sources for the selected month.
- These do **not** change net worth. They feed cashflow summary and can influence planning spending inputs. Jobs & pay is the owner for optional payday cadence and its first payday anchor; no paycheck dates are inferred if that schedule is absent. Salary-entry frequency remains separate from paycheck cadence, and annual bonus/equity/other estimates remain undated. Dated payments are additional; clear the annual estimate if it represents the same payout.
- Prefer the dedicated pages over inventing parallel recurring models on the transactions table.

## Bank CSV Import

- Transactions page bank import runs in the browser via `utils/bank-import.util.ts`.
- Supported slugs: `capital_one`, `chase`, `amex`, `citi`, `bank_of_america`, `x_money`.
- The import dialog accepts multiple CSVs, with an independent bank selector for every file and previews/errors grouped by filename. It detects duplicates across uploaded files as well as saved records.
- Preview uses encrypted transaction dedupe keys and commit writes encrypted transaction records through `/api/vault/records/upsert`; bank CSV contents are not sent to legacy `/api/imports/*` routes in normal vault mode.
- Failed files do not block valid rows in other files. Failed commits retain selection for a retry that rechecks saved keys.
- Activity's Import action and Import history link open `/finance/imports`. That page runs the same bank and Fidelity engines, shows receipts, and links to the existing vault recovery actions. `?start=bank` opens the bank wizard. Each receipt shows its confirmed account outcome and parsing failures; reattach a corrected CSV to the original receipt, or edit saved transactions in Activity.

The import flow stages and resumes per-file receipts in the encrypted client store. Each receipt tracks per-file source account identity, remembered confirmed account mappings, selected/completed/unresolved rows, and the user-confirmed account/date interval separately from observed transaction min/max dates. Correcting a parse-failed file replaces only that file's staged rows and diagnostics while keeping rows from other files in a combined receipt. Stable account keys keep same-mask accounts separate; renames use the selected account's explicit ID. Encrypted receipt-row chunks contain at most 100 parsed rows or 160 KB, and vault checkpoints write at most 200 records. If initial staging misses a row chunk, the receipt cannot resume or activate until the original CSV is reattached. Coverage is evidence about dates the user confirms are represented in the import, not proof of statement completeness. Undo removes only receipt-created transactions that still match their imported values; edited rows remain and are reported, and the receipt's coverage is withdrawn. Raw CSV remains browser-local.

## Finance views, valuation, and planning behavior

The `/spending` hub opens **Activity** by default and also offers **Calendar**. Imports live at `/finance/imports`; older `?receipts=1` and `?t=imports` links redirect there, while Calendar keeps `?receipts=1`. Activity filters by exact account, normalized category/merchant group, month, and date range. These filters stay in the URL and respond to browser back/forward. The totals and CSV export use the full matching ledger, regardless of the 100-row page size. Blank merchants use the shared “Unassigned merchant” group and rows without an account can be selected explicitly. Calendar's top-purchase and selected-day links preserve the selected month/date and open the chosen transaction. Recorded spend is the default. Purchases contribute to spend, refunds reduce it, payments and transfers affect neither spend nor income, and ambiguous credits are excluded from totals until classified. Optional `kind`, merchant, receipt ID, and import-edited metadata support cleanup while the source description remains unchanged. The ledger supports category/merchant cleanup. Import receipts on `/finance/imports` show outcomes and confirmed date coverage.

Home cashflow charts show one series. Posted activity and repeating job pay, bills, and subscriptions are counted once, using the same match as Home. Month values link into Activity, and chart clicks carry the same month into Activity. Category values use purchase/refund effects and link into Activity. The synthetic collapsed **Other** bucket expands the category list; it never routes as though “Other” were an underlying category. Category totals apply the same transaction-kind effects across the full ledger rather than a paged transaction-list subset.

Planning's three-completed-month variable-spending suggestion is available only when each selected confirmed account has complete receipt coverage for every day in the full three months and the user selected at least one category. Account coverage intervals are unioned day by day; staged, partial, failed, withdrawn, invalid, and unknown-account receipts do not qualify. The estimate can exclude selected recurring-charge transaction IDs and requires explicit acceptance before it is saved. The accepted profile records the period, account/category selection, exclusions, receipt IDs, acceptance time, and accepted amount. A fully covered period with no eligible spend yields a valid zero estimate.

Planning asks users to choose a question in the `tool` query parameter while retaining the outer Planning, portfolio projection, and stock research destinations. It links live net-worth, holdings, job-income, and scheduled-cost facts back to their owning pages and shows only recorded balance, quote, and position dates; missing or future dates remain unknown. Goal funding starts with no saved amount, and debt payoff starts at $0 unless the user selects one liability. The goals and debt calculators hide spending-estimate controls that do not affect those answers.

Manual assets and liabilities have an `as_of_date`; holdings carry position dates and price provenance. Market quotes become stale after more than three calendar days; undated or future-dated values have unknown freshness. These dates describe their source values and never roll balances forward automatically. Fidelity imports accept optional market-value, market-price, and position-date columns, preserve exact reported market value and keep import provenance distinct from later quote dates. Known cost-basis fallback is provisional; unknown basis makes gains unavailable while known market value/price remains usable. Selected-account replacements are previewed, staged, and verified. See [DATA_MODEL.md](./DATA_MODEL.md#fidelity-valuation-provenance).

Fixed-expense schedules use `due_day` where supplied; subscriptions use `next_bill_date`. Calendar shows those dates on the same days as posted transactions and omits a bill that already matches a posted purchase. Pay edits jobs. Bills edits bills and subscriptions. Planning spending can use recurring schedules, fixed + variable + irregular annual components, or a manual annual total. Its coverage-qualified suggestion requires explicit acceptance; individual recurring charges can be excluded to avoid double counting. Saved profiles and legacy manual totals are preserved. A live source is serialized as `null` so saved assumptions follow current facts after reopen; manual values remain saved. A new total annual cashflow replaces income less spending and any older additional-contribution amount. Without that total override, legacy additional contributions stay additive. Local or remote finance edits reload fact summaries and mark prior planning runs stale without rerunning them. Zero-amount car-purchase and time-off templates let users enter their own costs, preserve event scope, and compare baseline and scenario with one shared seed. The retirement timeline is a straight-line estimate that excludes investment growth. Stock research rates display percentage values and store decimals. Planning remains speculative and does not change recorded finance data or net worth.

## Build

Run `make build-frontends` from the root. One production build writes `dist/web/browser`, five public prerenders and the release manifest. `npm ci` installs the single root lock; app package files only forward existing test commands. Browser suites use `tests/e2e/server.py` and exercise that bundle through the production middleware. See [Development](DEVELOPMENT.md) and [Quality](QUALITY.md).
