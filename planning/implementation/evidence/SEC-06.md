# SEC-06 — implementation evidence

- Leaf [#271](https://github.com/Vivekpsps3/vivek-monorepo/issues/271); parent [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121) remains open.
- Agent/context: explicitly assigned recovery implementation agent, branch `agent/sec-06-restore-20261114`, isolated worktree `/tmp/vivek-sec-06-restore-20261114`.
- Base/current main: `c461fe791251b13e02a05911531246f01f0e8290`. Final implementation tested: `911bd38cc56eb567c0d6b772428a6053e4862161`; subsequent delivery commits change documentation and remove one trailing space only; behavior is unchanged.
- Dependency/authorization proof: user authorized merging SEC-05 #362, then proceeding. All four CI checks succeeded on exact head `89a73dbda651b2d6cd24e36e8228a37da3e9711d`; squash merge was pinned to that head. GitHub returned merge `c461fe7`, #270 auto-closed completed at 2026-11-14 20:24 UTC, and fresh `origin/main` ancestry/source were verified before this worktree was created. [SEC-05 merged note](https://github.com/Vivekpsps3/vivek-monorepo/issues/270#issuecomment-6883696161), [scoped roadmap note](https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6883696326). SEC-05 was genuinely merged, not a stacked/unmerged prerequisite.
- SAFE-04 outcome rechecked: `bindLockNotices` validates owner/version/self-echo and disposes one shared transport; `bindLockSnapshots` clears same-tab private work. Existing lock capability and owner/epoch tests remain. SEC-06 uses these owners directly.
- Fresh claims/PRs: [SEC-06 claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/271#issuecomment-6883703200); no competing claim. Final fresh-main read remained `c461fe7`. Open #363 (DISC-01 planning) and #364 (Media detail) had no overlapping files. Recovery, Finance Settings/lifecycle, schema head, synthetic vault helper and the strict ESLint counter shrink were reserved with the coordinating parent. No global queue/parent body was regenerated.

## Acceptance

| Row | Concrete proof | Result | Tests/artifacts |
| --- | --- | --- | --- |
| A01 | Actual Settings export → merge into a separate browser context with a different DEK recovers every allowed collection, preserves colliding destination IDs, and re-encrypts legacy schema-1 source values as schema 2. Counts/schemas/conflicts match. Node independently decrypts destination ciphertext and computes its HKDF/HMAC dedupe indexes. | PASS | Browser `recovery-restore.spec.ts` different-DEK all-collection test; Finance Karma destination-key/AAD roundtrip; API all-collection activation |
| A01 replace | Preview shows existing/incoming/conflict/restore/removal counts. Pre-import backup offer focuses the existing export form. Replacement requires acknowledgment and typed `REPLACE`. Staging changes no active rows; only complete, confirmed activation applies the set. Empty replace is also explicit. Other owner data stays unchanged. | PASS | Browser replace test; API typed replace, incomplete stage, empty replace and owner-isolation tests |
| A02 | Wrong backup password, tamper, unknown envelope/record schema, corrupt descriptors/counts/IDs/duplicates, unknown current collection or oversized input fail locally before any stage writes. Oversized Blob is rejected before reading. Plaintext/password markers do not appear in requests, console, web storage or unencrypted downloads. Imported owner metadata cannot supply ownership. | PASS | Existing SEC-05 codec negatives; restore Karma negative/unknown descriptor/Blob tests; browser zero-mutating-request matrix and marker assertions; API strict bodies/owner tests |
| A02 server | One shared wire validator enforces collection, ID, ciphertext, versions and indexes for ordinary writes and inert staging. Batch/count/total-size/quota, CSRF, foreign job access, changed batches and duplicate IDs refuse safely. | PASS | `test_vault_restore.py` validation, quota/total limit, CSRF and cross-owner tests |
| A03 staging | First/later batch failures preserve all active data. Same file/mode after refresh resumes completed checkpoints without uploading them twice. Stages are invisible to normal records/counts. Completed activation replay returns the receipt without duplicate writes. | PASS | Browser middle-batch failure → refresh → resume; Karma checkpoint retry; API inert/idempotent checkpoints and activation |
| A03 transaction | Injected deletion, first/later upsert and commit failures roll back records, blind indexes and job activation status. A real HTTP commit failure returns an error and leaves the old active vault intact. Two SQLite-file activations commit once. Preview fingerprint catches changed records and delete/recreate ABA. | PASS | API failure-boundary matrix, real commit-failure, competing SQLite activation and ABA tests |
| A03 lifecycle | Held read/status/encrypt/write/activation results after owner change/disposal cannot continue or publish. Held uploads after local lock, another-tab lock, cancel or route removal cannot activate. Snapshot cleanup clears plaintext groups/forms immediately; remote delivery works in a Settings-only tab. | PASS | Restore Karma held-operation matrix; browser four held-upload cases; 29-test restore/coherence/auto-lock run; full Finance and suite cross-tab tests |
| A03 stale writes | Non-null expected revisions cannot recreate a deleted row. Upsert and reindex compare revisions in the SQL write itself; a read held before activation cannot overwrite the restored revision. Valid null-revision creates remain supported. | PASS | Direct late-update regression plus deterministic stale-ORM-read upsert/reindex tests; existing revision/AAD/reindex suites |
| Membership/deletion | New server-registered `future_review` is staged/activated, and a newly registered client descriptor roundtrips under the destination DEK without another recovery name list. | PASS | API and Karma new-collection fixtures |
| Schema compatibility | Upgrade preserves existing ciphertext/revisions; new temporary-table foreign keys let an older image delete an account without knowing those tables. Exact schema/head/drift checks and adopt/upgrade rehearsal pass. | PASS | `test_vault_restore_migration.py`; strict historical/head fixtures; `make db-check`; seeded rehearsal |

## Implemented boundary

The merged SEC-05 codec stays the only bundle format. Decode/decrypt and full
bundle validation precede writes; current collection/schema policy is checked
before stage metadata is read. Ownership comes only from the authenticated
session, never from file metadata. Source payload values/client IDs are preserved;
destination encryption uses the current held DEK, current key version and existing
schema-2 AAD. The existing transaction-index rule is shared with ordinary writes.

One disposable preview owns selected plaintext groups; skipped/source payload
references are dropped after preview construction. The common recovery scope
captures owner/lock epoch and binds parent abort, immediate lock snapshots,
owner changes and vault lock. Each preview/stage/activation action has one bounded
120s deadline with cancellable HTTP subscriptions and post-await checks. Scope
and form disposal clear plaintext/password references. JavaScript strings and
browser-internal crypto copies cannot be promised secure erasure; a losing
WebCrypto completion is ineligible.

`vault_restore_stages` and `vault_restore_batches` are temporary ciphertext
checkpoints outside the one active `EncryptedRecord`/index store. Batches use the
strict JSON-body `batch_index` ordinal (0–127), not a SQLite path ID. Client uploads
are at most 100 records / approximately 1 MiB; server caps are 200 records / 2 MiB
base64 ciphertext per batch, 10,000 records / 24 MiB ciphertext per stage, 128
batches, two jobs per owner and 24-hour expiry. Same source file hash, mode,
destination wrap/key and active fingerprint identify resumable work. Unknown or
obsolete stages can be discarded without changing active rows.

Activation obtains SQLite's write lock before reading the active fingerprint,
checks complete staging/current credentials, then calls the existing revision,
index, upsert and delete primitives and commits once. The explicit activation
request is the boundary: an already accepted remote commit cannot be retracted
by a later local abort. Its result is wholly old or wholly restored; a late
response cannot publish into a locked/disposed/other-owner view. On eligible
success the existing lock path clears participating tabs/caches before normal
unlock/reload. A receipt supports idempotent activation/status after interruption.
CSV receipt/Undo and Fidelity domain staging semantics remain unchanged.

## Deletion and compatibility

| Candidate | Prior consumers | Surviving owner | Actual disposition and compatibility proof |
| --- | --- | --- | --- |
| Parallel recovery formats/ad hoc membership | No restore or competing portable format existed on base. | Merged SEC-05 codec and `COLLECTION_POLICY.recovery` descriptors. | No second codec/list introduced. New-collection fixtures prove membership adoption. No invented orphan deletion. |
| Inline ordinary wire validation copied into a staging engine | Ordinary `upsert_records`. | `validate_record`, used by ordinary upsert and restore staging. | Existing validation moved/reused, not counted as a behavioral deletion. Reindex retains its distinct compatibility parser. No weaker membership/AAD/version checks. |
| Separate field-assignment update implementations | Ordinary upsert and reindex. | `_update_existing_record` with conditional SQL revision guard. | Both old assignment blocks removed. Early revision checks remain intentionally, and the actual write now detects stale reads. Existing create/update/reindex behavior and blind-index uniqueness tests pass. |
| Handwritten transaction-index decision | `EncryptedRecordPersistence.persistUpsert`. | `recordIndexes`, used by ordinary persistence and destination restore encryption. | Old ternary/casts removed; destination HKDF/HMAC test independently verifies parity. ESLint counter shrinks 13→11. |
| Recovery owner/subscription/abort cleanup duplication | SEC-05 export wrapper. | `openRecoveryScope` used by export and restore. | Old export listener block removed; scope owns cleanup and immediate snapshots. Existing `openBoundedWork` owns deadlines. No new loader/event-bus framework. |
| Partial activation/write engines versus CSV staging | Bank receipts/Fidelity stages have distinct domain meanings and Undo rules. | Existing import owners plus existing backend record primitives. | No duplicate raw commit implementation introduced; restore activation calls existing upsert/delete/index owners. CSV services/stage formats retained, with full regression suites. |
| Unsafe cleanup/error workaround | `withVaultStore` abort read accessed a pending request's error. | Existing IndexedDB owner with a ready-state guard. | Fixes the real root-Karma cleanup failure; deterministic pending/done abort tests preserve error details and existing logout/isolation assertions stay unchanged. |

- Classification: recovery feature with necessary lifecycle/concurrency/schema safety additions. It is not a net-LOC simplification claim. No code moves, minification, removed feature, skipped meaningful assertion, credential rotation or wire/AAD/key migration.
- Base/full closure: `c461fe791251b13e02a05911531246f01f0e8290` → `911bd38cc56eb567c0d6b772428a6053e4862161`, all 33 changed files. Application production **+1046/−84 (net +962)**; required new migration **+69/−0**, giving total production **net +1031**. Tests/fixtures **+970/−9 (net +961)**. Guidance/docs before this evidence **+98/−10 (net +88)**. Verification configuration **+1/−1 (net 0)** is the stricter ESLint counter only. Evidence documentation is additional; generated build/image/coverage output is excluded.
- New backend staging owner: 276 physical lines (25 blank, 3 comment lines); restore adapter: 237 (10 blank, 3 comment); recovery scope: 38 (1 blank, 1 comment); index helper: 11 (0 blank, 1 comment). Necessary feature/guard code is reported honestly; moved validation is not claimed as savings.
- Equivalent policy owners after change: one bundle codec, one owner/recovery policy, one normal/staging wire validator, one conditional existing-record updater, one transaction-index rule and one recovery lifecycle adapter. Existing domain import engines remain distinct. Active persistent record/DEK/view owners do not change; two bounded temporary ciphertext tables support resumable activation.
- New public entries: lazy `prepareFinanceRestore` returning a disposable count/action plan, real Settings controls and authenticated stage/list/get/upload/activate/discard endpoints. Plan values/keys are not a shell store. Normal record lists/counts never include stages. Each listener/timer is disposed by its actual scope; Core lock delivery uses the existing validated shared transport.
- Historical migration fixtures add only the exact new table/index drift and current head/compatibility names; equality checks, old upgrade/downgrade assertions and legacy-table guards remain. Applied revisions were not edited.
- Follow-up collection work edits existing owner/schema contracts and intentional client boundary copies; recovery has no extra list. A supported new envelope/protocol version belongs in the single codec/record owner. There is no obsolete trial batch-path consumer (`batch_index` is in the body).

## Verification

Final functional source: `911bd38cc56eb567c0d6b772428a6053e4862161`.
Node `/tmp/node24/bin/node` v24.11.1, Python 3.12 from the existing installed
`.venv`; isolated worktree dependency symlinks are untracked, not PR files.
`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` point to
`/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
Karma coverage is on, browser retries remain zero and all floors remain unchanged.

Backend suites use separate `COVERAGE_FILE` paths under `/tmp` because the scripts
otherwise share `.coverage`. Earlier parallel combined percentages are not used
as final evidence. Actual test assertions still ran; only the isolated final
measurements below establish the coverage results.

| Command | Final result |
| --- | --- |
| `make test-fast` | PASS; doc/boundary/script/discovery checks, including 21 Node tests. Rechecked for evidence links and the final whitespace-only cleanup. |
| `make lint-web` | PASS; ESLint 467/9/1/0, plus engine purity 1 pass. Finance baseline strictly shrinks from 469; no new exemptions. Rechecked after the final whitespace-only cleanup. |
| `make typecheck-web` | PASS across all seven app/spec/package configurations. |
| `make lint-python` | PASS; 230 files formatted, Ruff 101 / suppressions 6 match baseline. |
| `make typecheck-python` | PASS; mypy 87 matches baseline; SQLAlchemy/result/test annotations fixed without new ignores. |
| `COVERAGE_FILE=/tmp/sec06-finance-911bd38.coverage ./scripts/coverage-gate.sh finance` | PASS; 170 tests, **87.10%**, floor 83.28%. Includes 19 restore scenarios/parametrizations and existing crypto/import/identity tests. |
| `COVERAGE_FILE=/tmp/sec06-server-911bd38.coverage ./scripts/coverage-gate.sh server` | PASS; 888 tests, **79.10%**, floor 61.53%, plus separate uninstrumented perf test 1 pass; Town GET p50 131.39 ms. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS; **871/871**. Statements 75.49%, branches 65.28%, functions 71.82%, lines 78.74%. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS; **716/716**. Statements 81.84%, branches 68.44%, functions 82.27%, lines 85.72%. |
| `make build-frontends` | PASS separately and in final `make e2e`; production bundle/release manifest built locally. |
| `make e2e` | PASS; **264 passed, 8 unchanged conditional viewport/matrix skips**. No recovery scenario skipped; all original CSV/receipt/Undo/coherence journeys remain. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS; **79/79**. |
| `npx playwright test --project=suite` | PASS; **30/30**, including cross-tab lock and private/public isolation. |
| `SITE_DATABASE_URL=sqlite:////tmp/sec06-final-schema-check.db make db-check` | PASS on a disposable migrated database, empty drift at `site_vault_restore_v1`. |
| `SITE_IMAGE=personal-site:sec06-restore-test make docker-build` | PASS; image `sha256:f30a06f20cba87852575a612fd5e95ce7c1818bdbad2e2047dc2c0f9cbdaa04d`, revision label equals final implementation `911bd38`. |
| `SITE_IMAGE=personal-site:sec06-restore-test SEED_PORT=28191 SITE_PORT=28195 make db-validate-seeded` | PASS for both pinned legacy adopt and current-main upgrade; original values preserved, new head correct, empty model diff, FK checks and all health/auth/Finance/Travel/Media smoke endpoints 200. Report `/tmp/seed-validation-report.json`; disposable project only, no production data. |

Failures stayed failures until fixed: UTC-aware/naive stage expiry mismatch;
new schema names missing from exact legacy/head/historical-drift fixtures;
zero-based batch ordinal incorrectly typed as a SQLite path ID; root IDB abort
reading a still-pending request; and a real Settings-only cross-tab lock gap.
These received actual code/contract or exact-fixture fixes with counterexamples
retained. Early new mypy/ESLint findings were fixed, not baselined upward. An
initial rehearsal failed because the unique image had not yet been built; the
complete final build/rehearsal then passed. Initial new browser lock expectations
were corrected to the actual full locked sentence. No failure or unrun gate is
reported as a pass and no suite/floor/assertion was weakened.

## Handoff

- SEC-05: #362 merged, #270 closed, verified on current main before SEC-06; no deployment.
- SEC-06 PR: ready to open after every required local check passed. Use `Closes #271` only, reference #121 without closing it.
- Roadmap #134: append scoped SEC-06 PR/tested-revision/evidence status after PR creation; do not overwrite its body or the global queue/parent ledgers.
- Actual status: complete restore implementation with local verification; not merged/deployed, not an operational server-backup drill. SEC-06 merge is not authorized by the user's earlier authorization for SEC-05.
- Next actor: reviewer/owner assesses the concrete PR, CI and explicit activation boundary; any future merge/deployment needs its own authorization. Current worktree has clean tracked source and only untracked installed-dependency symlinks.
