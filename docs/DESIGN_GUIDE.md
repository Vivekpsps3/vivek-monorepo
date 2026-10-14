# Design Guide

This app is an operational finance dashboard, not a marketing site. Every page
should answer useful money questions quickly with dense, readable metrics and
clear graphs.

## Product Principles

1. Show the most relevant metrics directly on each page.
2. Prefer charts and summaries over raw tables alone.
3. Keep financial data planes separate: net worth, transactions, recurring
   cashflow, and planning each have different meanings.
4. Make the UI useful before it is decorative.
5. Optimize for future AI agents: if a page has unusual behavior, document the
   invariant near the code or in the relevant doc.

## Dashboard Standard

Home starts with two clickable blocks, followed by a first-steps checklist for an empty vault and charts:

- current net worth with a holdings / assets / debts split
- this month's pay, spending, and net, with card activity and repeating pay and bills counted once
- portfolio summary with source dates and a portfolio allocation chart; detailed holdings remain on What you have
- embedded cashflow, category, and allocation charts

## Subpage Standard

Each major subpage should have page-level metrics at the top:

- Activity: recorded income, spend, net cashflow, full matching transaction count, and exact account/merchant/category/date filters. Persist filters in the URL and calculate totals/exports over the full match set rather than the visible page.
- Imports: per-file outcome, confirmed account mapping, row state, coverage, and recovery actions. Make corrected CSV reattachment distinct from classifying ambiguous credits.
- Jobs & pay: annual/monthly gross and net, active jobs.
- Bills: monthly/annual total, active count, largest items.
- Subscriptions: monthly/annual total, next bills, active count.
- Balance sheet: total assets, liabilities, net worth, stale balances.
- Portfolio: market value, account allocation, largest holdings, price freshness.
- Investment insights: portfolio value, growth assumptions, projected value, withdrawal-rate income (client-side; speculative).
- Calendar: one month of pay and spending. Posted transactions and repeating bills share the same days; a bill that already matches a posted amount is not shown twice. Highest-purchase and selected-day transaction rows preserve month/date and open the chosen Activity editor; repeating rows open Recurring. Keep the calendar Add action's selected date.
- Planning: current balance-sheet/cashflow facts with source links, then a clear question selector, scenario success rate, median ending value, risk bands, and assumptions.
- Stock Lab: primary ticker price, price return, total return, dividend income, purchase scenario value, scorecard warnings, and comparison tickers.

Tables are acceptable for detail, but a page is incomplete if it only exposes a
table when a summary or graph would answer the natural question faster.

## Ledger and import coverage

Keep recorded activity as the default for spending totals. `purchase` contributes to spend, `refund` reduces spend, `payment` and `transfer` affect neither spend nor income, and `ambiguous_credit` is excluded from totals until classified. Preserve the original source description when showing a normalized merchant.

Import receipts show the confirmed account mapping, import state, selected/completed/unresolved row counts, and observed date coverage. Coverage informs estimates, but a date span is evidence about rows in the file, not proof that the bank statement is complete. Receipt undo removes only unchanged rows created by that receipt; surface edited rows that remain and show that coverage was withdrawn. Never show or persist the raw CSV as a receipt.

Activity filters are exact account and normalized category/merchant groups; support unassigned accounts and blank merchants. Query changes must update on browser history navigation. Give CSV export and totals the full filtered dataset even when the visible list is paginated.

Label the selected period and data coverage so a short import is not mistaken for a complete month. If a partial-month equivalent is displayed, calculate it only from comparable covered days. Ledger analysis must not change the current balance sheet.

## Freshness and valuation provenance

- Show manual asset/liability `as_of_date` beside the amount and position valuation dates with their sources. Mark quotes stale after more than three calendar days. If a value is undated, show freshness as unknown.
- For Fidelity, keep imported snapshot date, market value/price source, cost basis, and later market quote date/source/fetch time distinct. Derive price from market value divided by shares when available, otherwise use a supplied market price. Label cost-basis fallback as provisional; do not calculate gains when basis is unknown.
- Preview account-level replacement and let the user confirm it before a Fidelity staged replacement commits.

## Recurring and planning estimates

Use `due_day` for fixed-expense dates and `next_bill_date` for subscription dates. Cashflow, Home, and Calendar treat posted activity and those repeating amounts as one stream: a paycheck close to job pay (within 20%) counts once, and a bill within four days and 2% (or $1) of a posted purchase counts once. Repeating amounts with no matching post still count. Jobs, bills, and subscriptions remain the editors; Activity remains the ledger editor. Neither changes net worth.

Planning separates fixed, variable, and irregular annual spending, identifies the source and period for each estimate, and lets users exclude recurring charges already represented in schedules. Show the live net-worth, holdings, income, and scheduled-cost owners near the question selector; use genuine balance, position, and quote dates, and label missing or future dates unknown. Warn when fixed schedules omit variable card costs. Offer a three-completed-month suggestion only when selected accounts and categories have complete confirmed coverage; require explicit acceptance and refuse the estimate when coverage is incomplete. Preserve manual saved values while live-source fields follow refreshed facts. Goals start with $0 saved and debt starts with $0 manual balance; only an explicitly selected single liability may fill the debt calculator. Scope annual cashflow events to baseline, scenario, or both, and offer zero-amount starting templates for purchases and time off so users provide their own values. Keep advanced assumptions expandable. A new total annual cashflow replaces calculated income less spending and any legacy add-on; absent that override, preserve the older additive contribution behavior. Data edits mark existing results stale instead of rerunning them. The retirement timeline labels its straight-line approximation and excludes investment growth. Portfolio projections compare the existing monthly contribution with a user-entered dollar increase. Advanced percentage inputs display percentages while storing decimal rates.

## Chart Rules

- Use Chart.js through existing chart utilities.
- Use token-based colors from `apps/finance/frontend/src/theme/chart-colors.ts`.
- Every chart needs a meaningful empty state.
- Every chart needs a nearby numeric summary. Do not add hover tooltips.
- Cashflow charts show one monthly series: posted activity plus repeating pay and bills that are not already posted. Month links open Activity.
- Category charts use transaction-kind effects over the full ledger, independent of transaction-list paging.
- Recorded monthly/category chart values have accessible drilldown links and matching chart-click behavior. Scheduled values go to Recurring. A collapsed synthetic `Other` tail expands categories instead of pretending to be a real category named `Other`.
- Keep net worth charts sourced from the current balance-sheet formula, never
  from transaction sums.
- Investment-insights projections are speculative client-side charts, not
  stored net worth history.

## Visual Style

- Use a near-neutral light canvas (`#F7F7F5`), white surfaces, graphite text
  (`#222522`), and a restrained evergreen accent (`#3F6658`). Dark mode uses
  the same hierarchy with charcoal surfaces and a muted green accent.
- Keep content width near 72rem. Use alignment, type, spacing, and thin dividers
  to establish hierarchy. Reserve bordered surfaces for related content and
  shadows for overlays.
- Use 8–20px radii. Phone controls can be slightly rounder than dense desktop
  tables. Reserve strong shadows for overlays; cards use a soft shadow.
- Group Home's net worth and this month's cashflow in one section with a fine
  divider. Label source dates near the balance figures.
- Keep forms focused and concise. State the passphrase recovery limit beside
  the sign-in fields. Use content-first rows for trips and portfolio work.
- Cards group real data. Avoid decorative icon badges, nested card layouts,
  gradients, oversized hero panels, generic bento grids, and repeated copy.
- Keep focus states visible, charts accessible, and table values available for
  people who need precise numbers.

## Research and decisions

These references informed the shared visual direction and writing:

- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) — use alignment, hierarchy, and structured views with quieter chrome.
- [Nielsen Norman Group: Aesthetic and minimalist design](https://www.nngroup.com/articles/aesthetic-minimalist-design/) — keep only the elements that support the user's task while preserving recognizable controls.
- [GOV.UK: Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces) — use concise, meaningful labels and plain instructions.

Applied here: a neutral token set replaces paper-like contrast and card shadows;
Home summaries share one surface; auth uses a single compact form; Travel trips
and portfolio highlights use divided rows; navigation keeps a quiet active
indicator. Existing routes, data meanings, source dates, chart values, and
keyboard affordances remain visible.
