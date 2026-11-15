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

## Disposable SQLite restore drill

`scripts/restore-drill.py` restores a synthetic verified snapshot into a new empty directory. It checks SQLite integrity, foreign keys, schema head, owner counts, and finance ciphertext preservation. The report records restore duration and the data-loss window against a 1-hour local objective, a 24-hour off-host objective, and a 4-hour restore objective. Those figures are drill measurements. They are not a production recovery time. Run `python3 -m unittest scripts/test_restore_drill.py` against temporary files only.

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
The restore verification below covers this codec, destination DEK re-encryption,
merge conflicts and staged atomic replace.

## Portable restore (SEC-06)

`recovery-restore.spec.ts` opens the actual Settings file/password/mode controls,
exports all allowed collections and restores them under a different synthetic
DEK. It verifies merge skips IDs, replace offers pre-import backup and requires
acknowledgment/typed confirmation, all decrypted values survive (including legacy
schema-1 source rows), staging is invisible to active reads, and activation locks
the vault. The same browser suite verifies wrong password/tamper/version/oversize
produce zero mutating requests, and a failed middle batch survives refresh and
resumes completed checkpoints without double uploads. Held uploads after lock,
route removal, another-tab lock and cancel cannot activate. Markers/passwords stay absent from
requests, console, browser storage and the encrypted file.

Finance Karma restore tests independently check destination-key/AAD decryption,
per-collection count/conflict preview, supported descriptors, zero-write rejection,
resume and held read/status/encrypt/write/activation results after owner change or
disposal. Existing export races still run through the shared recovery lifecycle.

Backend `test_vault_restore.py` exercises all collection writes, owner/CSRF
isolation, version/ID/count/size/quota refusal, idempotent checkpoint/activation,
delete/recreate ABA conflict, changed destination wraps, explicit empty replace,
expiry/reset cleanup, injected deletion and first/later upsert failures, real
commit failure, two competing SQLite-file activations, missing-record stale
updates and upsert/reindex reads held across activation. Old records/indexes and
pending jobs survive rolled-back activation. The migration regression preserves
existing ciphertext/revisions and proves older-image account deletion cascades
new temporary tables. Run `make db-check` on a disposable migrated database and
`make db-validate-seeded` after building a unique disposable image, plus the
packet's complete Python/Finance/root/browser gates. Evidence belongs in
`planning/implementation/evidence/SEC-06.md`.
