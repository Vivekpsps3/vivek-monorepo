# Travel app

Follow the [root handoff](../../AGENTS.md) and [Travel docs](../../docs/TRAVEL.md).

- Travel is a separate app with its own SQLite data in travel.db. It must not read finance.db, the finance vault, or net worth, and its budgets do not create finance transactions.
- The suite uses the finance_session cookie. Reads authorize through finance GET /api/auth/me; writes use POST /api/auth/session and the finance CSRF token.
- Shared sign-in lives at /auth/login on the suite origin. make travel-dev serves the app directly on port 8090 and does not serve that route.
- Keep trip costs and PTO projections in Travel. Preserve the documented trip date, currency, and accrual semantics.
- Run make travel-test for Travel backend changes. Root Makefile owns the command.
