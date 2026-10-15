# Verification tiers

Named quality gates for local development and CI (TEST-001).

| Tier | Command | Covers | Owner |
|------|---------|--------|-------|
| **fast** | `make test-fast` | Doc paths (OPS-002) and shared-package/app import boundaries | docs/packages |
| **finance** | `make test-finance` | Balance sheet, planning non-mutation, client-finance, migrations matrix | finance |
| **security** | `make test-security` | Vault/openapi/auth + client-finance and evidence-labels specs | privacy |
| **full** | `make test-full` | Finance, Travel (Python and static-module Node tests), and site backend tests; both Angular unit suites and builds; release-manifest fixtures; Docker Compose build and suite-route integration | release |

## Migration matrix (BE-002)

Supported DB generations and fixtures: [LIFECYCLE.md](./LIFECYCLE.md) and the
migration fixture tests in `apps/finance/backend/tests/test_migrations.py`
(`test_alembic_upgrade_head_on_legacy_holdings_sqlite`,
`test_passwordless_migration_recovers_partial_sqlite_state`,
`test_password_hash_migration_allows_passwordless_users`).

## Backup and restore (OPS-001)

1. Backup: `./scripts/backup-db.sh` (also used on deploy).
2. Integrity: `./scripts/verify-backup.sh data/backups/finance.db.<timestamp>.bak`
3. Restore drill (staging): stop stack → copy backup over data file → start → `curl` health → record date in ops notes.
4. Details: [BACKUP.md](./BACKUP.md), [DEPLOY.md](./DEPLOY.md).

## Privacy gate for local intelligence (SEC-001)

See [SECURITY_MODEL.md](./SECURITY_MODEL.md) § Local intelligence privacy gate.
No local signal/detector code currently ships; any future client-side analytics
must stay network-zero and non-mutating. `test-security` covers the
client-finance (`client-finance.spec.ts`) and evidence-labels
(`evidence-labels.util.spec.ts`) specs.

## Planning / Stock Lab evidence (INNO-003)

Shared fact / inference / scenario cards in `apps/finance/frontend/src/app/utils/evidence-labels.util.ts`.
Speculative surfaces must not mutate holdings or net worth; Stock Lab discloses tickers only.

## CI mapping

`.github/workflows/ci.yml` runs separate Finance, Travel, and site backend
pytest jobs, Travel static-module Node tests, the fast documentation/package
boundary gate, Finance and site browser tests and development builds, and a
Docker build followed by the suite-route integration check. Local
`make test-full` covers those app test suites and builds plus `test-fast` and
Finance release-manifest fixtures.

The optional `make test-release-cache` exercises production Nginx cache headers
and release rollover in a real Chromium context. It requires Docker, the
Finance frontend npm dependencies, and Playwright Chromium, so it is not part
of the default full tier or CI.

Install the full local test dependencies with `make install`. It creates
separate `.venv` environments for Finance, Travel, and the site Flask backend,
and installs npm dependencies for both Angular apps. The focused setup commands
are `make travel-install` and `make site-install`; their test targets require
those environments to exist.
