# Agent handoff

Finance is the primary app. Travel and the public portfolio site are separate apps; keep their data and behavior isolated.

## Architecture boundaries
- Put app-neutral reusable code in `packages/`; keep domain behavior and app entry points in their owning `apps/` folder. Packages must never import from apps, and apps must not import source directly from another app.

## Finance preferences and invariants
- Keep all major surfaces first-class: net worth, spending/imports, investments, recurring cashflow, and planning.
- Net worth is current-only: manual assets + portfolio market value − liabilities. Do not derive it from transactions or store history. Transactions, recurring cashflow, planning, and Stock Lab do not mutate net worth or real balances.
- Imported brokerage cash sweeps and manual cash can double count; leave that choice to the user and explain it.
- Tax document storage was removed. Do not restore a document vault or BLOB storage without a product decision.
- Use CSV imports today; SimpleFIN is the intended future aggregator, not Plaid. Domain access is required. SQLite defaults to a repo-local file and is configurable with `DATABASE_URL`; backups remain user-managed.

## Security and UI preferences
- App-native multi-user auth is implemented; deeper household sharing is future work. Follow [SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for passwordless auth, migration, and recovery boundaries.
- Finance plaintext belongs in the browser; the backend stores ciphertext via `/api/vault/*` plus necessary auth and sync metadata.
- Ticker symbols are sent to the market service during price refresh and research; never describe them as server-blind. See [holdings price privacy](docs/SECURITY_MODEL.md#holdings-price-privacy).
- For Finance UI, keep pages operational and information-dense. Use shared ui-* components where practical, use cards for real grouped surfaces, avoid marketing layouts and redundant hover titles, and show useful guidance, financial meaning, chart values, privacy disclosures, and source dates.
- Keep one editing destination for each financial fact; other pages link to its owner or show derived summaries. See [FINANCE_UX_AUDIT.md](docs/FINANCE_UX_AUDIT.md).

## Where to continue
- [Architecture](docs/ARCHITECTURE.md) · [data model](docs/DATA_MODEL.md) · [lifecycle](docs/LIFECYCLE.md)
- [frontend conventions](docs/FRONTEND.md) · [design guide](docs/DESIGN_GUIDE.md) · [deployment](docs/DEPLOY.md)
- [bank imports](docs/ADDING_A_BANK_IMPORT.md) · [travel](docs/TRAVEL.md) · [media](docs/MEDIA.md) · [docs index](docs/README.md)
- App-specific guidance lives in `apps/finance/backend`, `apps/finance/frontend`, `apps/travel`, `apps/site`, and `packages`.
