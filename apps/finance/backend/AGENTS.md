# Finance backend

Follow the [root handoff](../../../AGENTS.md) and keep this API consistent with the canonical [architecture](../../../docs/ARCHITECTURE.md), [data model](../../../docs/DATA_MODEL.md), [security model](../../../docs/SECURITY_MODEL.md), and [lifecycle](../../../docs/LIFECYCLE.md).

- This scope owns FastAPI, SQLAlchemy models, SQLite setup, Alembic migrations, routers, and market data.
- Keep finance records server-blind: browser plaintext is stored as ciphertext through /api/vault/*. Do not add plaintext finance endpoints or log decrypted records.
- Auth stores account/session metadata and public keys. Never accept vault passphrases or private keys; admins cannot recover vault access.
- Public market lookup receives ticker symbols. Keep that disclosure accurate and do not expose encrypted holdings, values, or account details.
- Preserve the current-only balance-sheet formula. Transactions, recurring cashflow, and planning must not alter net worth. Keep cash-sweep double counting as a documented user choice.
- Prefer additive endpoints and guarded migrations. Do not restore tax document/BLOB storage.
- Run make test-backend for backend changes; use focused migration and security tests for schema or auth changes.
