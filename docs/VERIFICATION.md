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
| Release manifest | `node --test scripts/test-release-manifest.mjs` |
| Built image and assembled routes | `make docker-build test-suite-routes` |
| Migration/data preservation | `bash scripts/validate-seeded-adoption.sh` |
| Production browser policy | `SITE_TEST_URL=http://127.0.0.1:PORT node scripts/test-site-browser.mjs` against an empty disposable image database |

Domain wrapper configs remain for CI and existing commands; every one uses `tests/e2e/config.ts` and `tests/e2e/server.py`. Retries stay zero. Screenshots are always discovered. Use `CHROME_BIN` for Karma and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an installed Chromium if automatic discovery cannot find it.

[Quality](QUALITY.md) owns floors/ratchets and coverage limitations. Do not omit moved identity source files from Finance's original logical coverage set. Replace obsolete source-string/widget assertions only after recording their behavior replacement; fewer discovered tests do not prove parity.

[Lifecycle](LIFECYCLE.md) records historical Finance database generations. [Migrations](MIGRATIONS.md) and [Operations](OPERATIONS.md) own production upgrades, premigration backups and restore. The seeded rehearsal covers pinned unadopted history, forward upgrades, unchanged original values, explicit backfill provenance, schema drift, foreign keys and authenticated smoke. `BATCH_PROOF=1` also verifies batch-recreation child preservation and old-image compatibility behavior. Run it only with its disposable data/volumes.

Finance invariants remain part of unit and browser acceptance: browser-owned encryption, ciphertext-only server storage, wrong-user isolation, lossless/resumable imports, edited-row-safe undo, net worth from balance-sheet facts, and speculative planning that never mutates actual records. See [Security](SECURITY_MODEL.md), [Data model](DATA_MODEL.md), and [Frontend](FRONTEND.md).
