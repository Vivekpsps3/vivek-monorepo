# Finance Tracker Frontend

Angular 21 standalone app for the encrypted client-side finance store.

Run one command at a time from the repo root:

```bash
make frontend
(cd apps/finance/frontend && npx ng build --configuration development)
(cd apps/finance/frontend && npm test -- --watch=false --browsers=ChromeHeadless)
(cd apps/finance/frontend && npm run e2e)
```

Routes, shared UI conventions, and vault-era behavior are documented in
[../../../docs/FRONTEND.md](../../../docs/FRONTEND.md). General setup is in
[../../../README.md](../../../README.md).
