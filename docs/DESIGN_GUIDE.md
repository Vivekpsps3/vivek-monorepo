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

Home starts with three clickable blocks, followed by its review queue, holdings, and charts:

- current net worth with a holdings / assets / debts split
- recorded pay and spend for this month
- scheduled recurring pay and spend
- cross-plane review queue for balances, positions, statement coverage, unresolved imports, and annual renewals
- top holdings
- embedded cashflow, category, and allocation charts

## Subpage Standard

Each major subpage should have page-level metrics at the top:

- Activity: recorded income, spend, net cashflow, transaction count, and review state.
- Spending Review: selected/prior month spending by category or merchant, comparable elapsed days for the current month, confirmed coverage gaps, and transaction drilldown.
- Imports: per-file outcome, confirmed account mapping, row state, coverage, and recovery actions.
- Income: annual/monthly gross and net, active jobs.
- Bills: monthly/annual total, active count, largest items.
- Subscriptions: monthly/annual total, next bills, active count.
- Balance sheet: total assets, liabilities, net worth, stale balances.
- Portfolio: market value, account allocation, largest holdings, price freshness.
- Investment insights: portfolio value, growth assumptions, projected value, withdrawal-rate income (client-side; speculative).
- Calendar: monthly posted spending, income, net cashflow, active days, plus separately marked upcoming recurring due dates.
- Planning: scenario success rate, median ending value, risk bands, assumptions.
- Stock Lab: primary ticker price, price return, total return, dividend income, purchase scenario value, scorecard warnings, and comparison tickers.

Tables are acceptable for detail, but a page is incomplete if it only exposes a
table when a summary or graph would answer the natural question faster.

## Ledger review and import coverage

Keep recorded activity as the default for spending totals. `purchase` contributes to spend, `refund` reduces spend, `payment` and `transfer` affect neither spend nor income, and `ambiguous_credit` stays visible for review while excluded from totals. Preserve the original source description when showing a normalized merchant. Make `reviewed` and edited-import state visible in bulk review tools.

Home's review queue links to due balance/position reviews, statement-coverage gaps, unresolved imports, and upcoming annual renewals. Import receipts show the confirmed account mapping, import state, selected/completed/unresolved row counts, and observed date coverage. Coverage gaps should be visible beside comparisons and estimates. A date span is evidence about rows in the file, not proof that the bank statement is complete. Receipt undo removes only unchanged rows created by that receipt; surface edited rows that remain and show that coverage was withdrawn. Never show or persist the raw CSV as a receipt.

Label the selected period and data coverage so a short import is not mistaken for a complete month. If a partial-month equivalent is displayed, calculate it only from comparable covered days. Ledger analysis must not change the current balance sheet.

## Freshness and valuation provenance

- Show manual asset/liability `as_of_date` beside the amount. Default review intervals are 30 days for cash/checking/savings assets, 180 days for other assets, and 30 days for liabilities; allow per-row overrides. A review cue does not change the entered value or create net-worth history.
- Show position valuation dates and sources; ask users to review a position after 30 days. Mark quotes stale after more than three calendar days. If a value is undated, show freshness as unknown.
- For Fidelity, keep imported snapshot date, market value/price source, cost basis, and later market quote date/source/fetch time distinct. Derive price from market value divided by shares when available, otherwise use a supplied market price. Label cost-basis fallback as provisional; do not calculate gains when basis is unknown.
- Preview account-level replacement and let the user confirm it before a Fidelity staged replacement commits.

## Recurring and planning estimates

Display recurring due dates as future scheduled events, distinct from posted ledger activity. Use `due_day` for fixed-expense scheduling and `next_bill_date` for subscription schedules. Cashflow and calendar views label scheduled amounts as estimates; posted totals remain based on posted transactions by default.

Planning separates fixed, variable, and irregular annual spending, identifies the source and period for each estimate, and lets users exclude recurring charges already represented in schedules. Offer a three-completed-month suggestion only when selected accounts and categories have complete confirmed coverage; require explicit acceptance and refuse the estimate when coverage is incomplete. Preserve the user's manually entered and saved profile values. Scope annual cashflow events to baseline, scenario, or both for items such as purchases or time off. Portfolio projections compare the existing monthly contribution with a user-entered dollar increase. Advanced percentage inputs display percentages while storing decimal rates.

## Chart Rules

- Use Chart.js through existing chart utilities.
- Use token-based colors from `apps/finance/frontend/src/theme/chart-colors.ts`.
- Every chart needs a meaningful empty state.
- Every chart needs a nearby numeric summary so the user does not have to hover.
- Cashflow charts keep Recorded activity and Scheduled cashflow as separate views; do not combine them into one total.
- Category charts use transaction-kind effects over the full ledger, independent of transaction-list paging.
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
