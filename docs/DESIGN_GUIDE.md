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

Home starts with three clickable blocks, followed by a first-steps checklist for an empty vault and charts:

- current net worth with a holdings / assets / debts split
- recorded pay and spend for this month
- scheduled recurring pay and spend
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
- Calendar: monthly posted spending, income, net cashflow, active days, plus separately marked upcoming recurring due dates. Highest-purchase and selected-day rows preserve month/date and open the chosen Activity editor; keep the calendar Add action's selected date.
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

Display recurring due dates as future scheduled events, distinct from posted ledger activity. Use `due_day` for fixed-expense scheduling and `next_bill_date` for subscription schedules. Cashflow and calendar views label scheduled amounts as estimates; posted totals remain based on posted transactions by default.

Planning separates fixed, variable, and irregular annual spending, identifies the source and period for each estimate, and lets users exclude recurring charges already represented in schedules. Show the live net-worth, holdings, income, and scheduled-cost owners near the question selector; use genuine balance, position, and quote dates, and label missing or future dates unknown. Warn when fixed schedules omit variable card costs. Offer a three-completed-month suggestion only when selected accounts and categories have complete confirmed coverage; require explicit acceptance and refuse the estimate when coverage is incomplete. Preserve manual saved values while live-source fields follow refreshed facts. Goals start with $0 saved and debt starts with $0 manual balance; only an explicitly selected single liability may fill the debt calculator. Scope annual cashflow events to baseline, scenario, or both, and offer zero-amount starting templates for purchases and time off so users provide their own values. Keep advanced assumptions expandable. A new total annual cashflow replaces calculated income less spending and any legacy add-on; absent that override, preserve the older additive contribution behavior. Data edits mark existing results stale instead of rerunning them. The retirement timeline labels its straight-line approximation and excludes investment growth. Portfolio projections compare the existing monthly contribution with a user-entered dollar increase. Advanced percentage inputs display percentages while storing decimal rates.

## Chart Rules

- Use Chart.js through existing chart utilities.
- Use token-based colors from `apps/finance/frontend/src/theme/chart-colors.ts`.
- Every chart needs a meaningful empty state.
- Every chart needs a nearby numeric summary so the user does not have to hover.
- Cashflow charts keep Recorded activity and Scheduled cashflow as separate views; do not combine them into one total.
- Category charts use transaction-kind effects over the full ledger, independent of transaction-list paging.
- Recorded monthly/category chart values have accessible drilldown links and matching chart-click behavior. Scheduled values go to Recurring. A collapsed synthetic `Other` tail expands categories instead of pretending to be a real category named `Other`.
- Keep net worth charts sourced from the current balance-sheet formula, never
  from transaction sums.
- Investment-insights projections are speculative client-side charts, not
  stored net worth history.

## Visual Style

- Light, airy, operational UI. Paper canvas `#F4F2EC`, card `#FFFEFA`, ink
  `#1C1B18`, pine accent `#3F6F5C`. Dark is an explicit Light / Dark split.
- Content width is 72rem. No shadows or glows. No `NW` / `CF` / `ACT+CF` / `PLAN` chips.
- Hierarchy from type weight, alignment, and hairline borders — not shadows or
  accent glows. Cards sit on a slightly lighter surface than the canvas.
- Cards are for real grouped surfaces, not decorative nesting.
- Modest radii (6–12px). Pills are for buttons and chips only.
- Use responsive grids for metric tiles.
- Keep tables horizontally safe on mobile.
- Avoid oversized hero sections, ornamental gradients, and marketing copy.
