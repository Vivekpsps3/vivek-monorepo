# Surface Lifecycle Map

Canonical ownership for API routers, schema modules, and schema authorities.
Alembic history is retained. The active schema is server-blind; empty legacy
plaintext Finance tables are retired at head `e0f6a2b3c4d5` after a preflight
guard confirms they contain no rows and no password-only users remain.

## Lifecycle labels

| Label | Meaning |
|-------|---------|
| **active** | Product path in normal encrypted deployments |
| **migration-only** | Exists for upgrade/enroll paths; not a daily product surface |
| **reserved** | Schema/table present; no product HTTP/UI |

## HTTP routers (`apps/finance/backend/app.py`)

| Surface | Module | Lifecycle | Owner |
|---------|--------|-----------|-------|
| Health | `routers/health.py` | active | ops |
| Auth / admin users | `routers/auth_routes.py` | active | auth |
| Password → passwordless enroll | `auth_routes` migrate path | migration-only; legacy accounts require previous release because current startup preflight blocks password-only users | auth |
| Vault ciphertext API | `routers/vault.py` | active | vault |
| Market quotes / research | `routers/market.py` | active | market |
| Plaintext Finance migration API | — | retired | — |

Plaintext finance HTTP (transactions, assets, holdings, imports, planning, cashflow) is unmounted.

## Schema modules

| Module | Lifecycle | Notes |
|--------|-----------|-------|
| `schemas_auth.py` | active | Passwordless + admin invitation contracts |
| `schemas_vault.py` | active | Ciphertext records, indexes, sync |
| `schemas_market.py` | active | Quotes and research (ticker disclosure intentional) |

## Schema authorities

| Authority | Path | Role |
|-----------|------|------|
| Startup preflight | `legacy_schema_guard.py` | Refuses schema changes if legacy plaintext finance rows or password-only users remain |
| ORM `create_all` | `database.py` | Creates active model tables after preflight |
| Alembic | `alembic/versions/*` | Versioned upgrades to head `e0f6a2b3c4d5`; retires empty plaintext tables |

Startup order: inspect existing DB and run the preflight guard → `create_all` →
fresh DBs stamp current head; existing DBs run Alembic `upgrade head`. The
guard runs before any schema mutation. A blocked upgrade leaves the original
database tables and rows untouched. Startup no longer runs lightweight
plaintext-table backfills, and `create_all` cannot recreate the retired tables.

## Encrypted collections

| Name | Lifecycle | Semantics |
|------|-----------|-----------|
| vault collection `stock_lab_scenarios` | active | Encrypted speculative scenarios; non-mutating |

`planning_runs` is not an allowed collection. Monte Carlo is ephemeral in the browser.

## Frontend product path

| Surface | Lifecycle |
|---------|-----------|
| Encrypted store + vault API | active |
| Client bank CSV import | active |
| Client Fidelity portfolio import | active |
| Client Monte Carlo planning | active |
| Stock Lab | active (ticker disclosure to market API) |

## Supported database generations (BE-002)

Named generations have fixture coverage in `apps/finance/backend/tests/test_migrations.py` and `test_legacy_schema_guard.py`:

| Generation ID | Starting state | Fixture |
|---------------|----------------|---------|
| `legacy-holdings-history` | Historical holdings-only fixture upgraded through prior revision `b7c9d2e4f601` | `test_alembic_upgrade_head_on_legacy_holdings_sqlite` |
| `vault-present-f2d8` | Vault tables + alembic `f2d8c6a4b913` | `test_vault_migration_is_idempotent_after_create_all` |
| `partial-passwordless-history` | Partial historical auth schema upgraded through prior revision `b7c9d2e4f601` | `test_passwordless_migration_recovers_partial_sqlite_state` |
| `legacy-blocked` | Any retired plaintext table with rows, or password-only accounts | `test_head_upgrade_refuses_legacy_data_before_any_schema_changes` and guard tests |
| `clean-current` | Empty legacy tables and passwordless users; cleanup removes old tables and restart does not recreate them | `test_cleanup_preserves_ciphertext_and_keys_and_stays_clean_on_restart`; `test_fresh_file_startup_creates_only_current_schema` |

The previous migration head `b7c9d2e4f601` remains available for historical
fixture setup; current head is `e0f6a2b3c4d5`.

Vault schema-v1 → schema-v2 ciphertext replacement remains browser-owned. The
server-side plaintext Finance migration path has been removed; the final
revision drops empty legacy tables only after preflight (see
[SECURITY_MODEL.md](./SECURITY_MODEL.md#migration-ordering)).

## Preserve

- Alembic revision history
- Schema-v1 → schema-v2 vault record migration in browser
- No reintroduction of tax-document BLOB storage
