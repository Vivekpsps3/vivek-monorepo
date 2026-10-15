# Finance frontend

Follow the [root handoff](../../../AGENTS.md) and use [frontend conventions](../../../docs/FRONTEND.md), the [design guide](../../../docs/DESIGN_GUIDE.md), the [security model](../../../docs/SECURITY_MODEL.md), and the [finance ownership map](../../../docs/FINANCE_UX_AUDIT.md).

- Keep finance plaintext in the browser vault. Route finance reads and writes through the encrypted client store; never cache decrypted records in a service worker.
- Preserve one editing destination per fact: balances and positions in What you have, transactions in Spending Activity, import accounts/coverage in Spending Imports, jobs in Recurring Jobs & pay, bills and subscriptions in Recurring, and assumptions in Planning.
- Transactions, recurring rows, Planning, and Stock Lab must not change net worth or recorded holdings.
- Keep pages operational and information-dense. Use shared ui-* components where practical, avoid redundant native hover titles, and retain visible financial meaning, privacy disclosures, and source provenance.
- Price refresh and research send ticker symbols to the market service; keep the disclosure visible. Preserve source dates separately from fetch and calculation times.
- Bank and Fidelity imports are client-side encrypted flows. Raw bank CSV contents stay in the browser.
- Build from the repo root with cd apps/finance/frontend && npx ng build --configuration development. Run relevant frontend tests when requested or needed by the task.
