# Verification

Run the affected checks locally before opening a PR. CI is the second run. The suite refactor affects every domain, so the full matrix applies.

| Concern | Local command |
| --- | --- |
| Docs, boundaries and scripts | `make test-fast` |
| Python formatting/lint/types | `make lint-python typecheck-python` |
| Web lint/types | `make lint-web typecheck-web` |
| Four backend coverage gates | `make test-backend` |
| Finance, public and root/shared Karma | `make test-frontend` |
| All unit/pure-module checks above | `make test` |
| Production bundle and Finance browser | `make e2e` |
| All browser projects including cross-app/a11y | `make build-frontends` then `npm run e2e` |
| One domain's browser checks | `npx playwright test --project=finance`, `--project=travel`, or `--project=media` |
| Root/public acceptance | `npx playwright test --project=suite` |
| Release manifest | Once inside `make test-fast` (`scripts/test-release-manifest.mjs`). Not a second command. |
| Built image and assembled routes | `make docker-build test-suite-routes` |
| Migration/data preservation | `bash scripts/validate-seeded-adoption.sh` |
| Production browser policy | `SITE_TEST_URL=http://127.0.0.1:PORT node scripts/test-site-browser.mjs` against an empty disposable image database |

Domain wrapper configs remain for CI and existing commands; every one uses `tests/e2e/config.ts` and `tests/e2e/server.py`. Retries stay zero. Screenshots are always discovered. Use `CHROME_BIN` for Karma and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an installed Chromium if automatic discovery cannot find it.

[Quality](QUALITY.md) owns floors/ratchets and coverage limitations. Do not omit moved identity source files from Finance's original logical coverage set. Replace obsolete source-string/widget assertions only after recording their behavior replacement; fewer discovered tests do not prove parity.

[Lifecycle](LIFECYCLE.md) records historical Finance database generations. [Migrations](MIGRATIONS.md) and [Operations](OPERATIONS.md) own production upgrades, premigration backups and restore. The seeded rehearsal covers pinned unadopted history, forward upgrades, unchanged original values, explicit backfill provenance, schema drift, foreign keys and authenticated smoke. `BATCH_PROOF=1` also verifies batch-recreation child preservation and old-image compatibility behavior. Run it only with its disposable data/volumes.

Finance invariants remain part of unit and browser acceptance: browser-owned encryption, ciphertext-only server storage, wrong-user isolation, lossless/resumable imports, edited-row-safe undo, net worth from balance-sheet facts, and speculative planning that never mutates actual records. See [Security](SECURITY_MODEL.md), [Data model](DATA_MODEL.md), and [Frontend](FRONTEND.md).

## Encrypted recovery export (SEC-05)

Use synthetic data only. `recovery-export.spec.ts` opens the actual Finance
Settings form, seeds a marker in each server-policy collection, downloads the
file and independently decrypts its authenticated header/body in Node. It checks
complete counts, no marker in the encrypted file, requests, console or browser
web storage, cleared password fields, wrong current passphrase and invalid-form
focus. Held snapshot and encryption cases cover cancel, lock and route disposal.

The Finance Karma `recovery-bundle.spec.ts` and `recovery-export.spec.ts` cover
legacy/current record schemas, new registered descriptors, wrong backup password,
tamper, unknown bundle/record version, excessive KDF work, duplicate IDs, count
mismatch, malformed and oversized data, held reads/decrypt/encryption and
owner/logout cancellation. `vault.service.spec.ts` verifies the fresh passphrase
without replacing the held DEK, including wrong passphrase, foreign wraps and
lock. Backend `test_recovery_snapshot.py` proves ownership, all-collection and
newly registered collection enumeration, whole-snapshot version/size refusal and
zero write side effects.

Run the packet launch commands and actual-diff gates; focused browser iteration:
`npx playwright test --config apps/finance/frontend/playwright.config.ts recovery-export.spec.ts`.
The format and synthetic body are specified in [Security](SECURITY_MODEL.md#portable-encrypted-recovery-export).
SEC-06 must use this codec and verify decrypt/validation before writes, destination
DEK re-encryption, merge conflicts and staged atomic replace; these export tests
do not claim that restore is implemented.
