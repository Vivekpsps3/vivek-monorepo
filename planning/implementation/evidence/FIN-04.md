# FIN-04 — implementation evidence

- Leaf issue and parent(s): #223. Parent #65 stays open.
- Agent/context, branch/worktree: FIN-04 in `/tmp/vivek-fin-04`, branch `agent/fin-04`.
- Base main SHA, current tested SHA: base `89a1515a3516524f18f482e0849b8f661f6b127d`. Gates below ran on this working tree immediately before the evidence commit. CON-03 and FIN-05 are already in that base. `encrypted-store.persistence.ts` was not edited.
- Fresh-main/prerequisite/active-PR checks: #223 was claimed before edits. No open pull request overlapped Finance import files at claim time. Media detail work stayed in another worktree.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| CSV1 signed and debit-credit mapping | `CSV1 maps signed and debit-credit rows, refunds, and accounts onto one dedupe policy` maps a signed file and a semicolon debit-credit file, keeps the refund and the account cell, and shows the same Costco gas dedupe key. The unmapped `SECRET-NOTE-77` column is absent from the preview. | PASS | `bank-import.util.spec.ts` in Finance Karma |
| CSV1 preview, commit, reload | `CSV1 maps signed and debit-credit files, commits the selected rows, and reloads the receipt` maps both files, unchecks Bus fare, commits 4 rows, reloads Activity, and checks the encrypted receipt (`complete`, `inserted_count` 4) plus format_version 1 profiles named Signed sample and Split sample. Stored batches and localStorage do not contain `SECRET-NOTE-77` or the raw semicolon line. | PASS | `e2e/custom-csv-import.spec.ts` inside `make e2e` |
| CSV2 foreign, empty, and wrong mapping | `CSV2 rejects foreign currency, empty files, and wrong columns without mixing totals` excludes EUR and a blank currency from the rows, keeps the total at 3, throws on an empty file and a missing column, and rejects `commitBankImportRows` for EUR before any store call. | PASS | `bank-import.util.spec.ts` |
| CSV2 zero-commit then corrected roundtrip | `CSV2 does not write a custom import that has no valid rows, then commits the correction` returns before `commitBankImports` on the refusal, then commits the corrected row once. `importFileError` leaves the choose, currency, and fix-mapping sentences intact. | PASS | `transactions-import-workflow.spec.ts`; `bank-import-copy.spec.ts` |
| CSV2 browser correction | `CSV2 shows actionable currency and mapping errors and commits only the corrected rows` previews an empty file and a date/description swap with no writes, then commits only the USD Bus row. Taxi and `10.00` stay out of the summary and the stored batches. | PASS | `e2e/custom-csv-import.spec.ts` |
| CSV3 failed write, conflict, undo | `CSV3 keeps a failed custom checkpoint uncommitted, resumes, and undo keeps the edited row` leaves a thrown chunk write at `staging` with no transactions, marks a completion conflict `partial` and resumes with zero new inserts, then undo keeps the edited row and clears coverage. | PASS | `bank-import.util.spec.ts` |
| CSV3 receipt undo | `undo of a custom receipt keeps the edited row and withdraws coverage` keeps the edited merchant and sets coverage to `[]`. A format_version 2 profile is ignored and is not listed as a receipt. | PASS | `encrypted-store.bank-imports.spec.ts` |
| CSV3 lock and browser resume | `CSV3 drops custom CSV text when the vault locks` clears files, previews, and the dialog. `CSV3 resumes a failed custom import and undo keeps the edited row` fails the second transaction write, resumes to two rows on one receipt, edits Source coffee to Coffee shop, and undo leaves that row with coverage length 0 and `undo_summary.edited` 1. The raw CSV line is not in `import_batches`. | PASS | `transactions-import-workflow.spec.ts`; `e2e/custom-csv-import.spec.ts` |
| Existing import regression matrix | Capital One, Chase, Amex, Citi, Bank of America, X Money, duplicate, resume, and undo specs stayed in the same Finance Karma run. `bank imports require account identity, resume one receipt, and undo retains edited records` stayed in the same Playwright run. | PASS | Finance Karma 838 SUCCESS; `make e2e` 250 passed |

Fixtures are synthetic. Dates in the browser spec use the frozen 2026-10-15 clock. No real CSV, passphrase, or account number is in the tests.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| A format-specific commit or receipt engine | None on `89a1515`. Custom CSV was not a second importer. | `commitBankImportRows` and `EncryptedBankImportStore` | Not introduced. `parseCustomCsv` only adapts rows into `buildBankImportPreview`. `custom_csv` parse throws until the column map is chosen. | CSV1 shared dedupe key; CSV3 staging, resume, and undo use the bank receipt |
| A second remembered account, date, or sign map | None. Bank account keys and `buildDedupeKey` already normalize rows. | `buildDedupeKey`, `parseDate`, `classifyCredit`, and `resolveCategory` | Column maps are `csv_mapping_profile` records in `import_batches` (`format_version` 1). `getImportReceipts` skips them. They are not written to localStorage. | CSV1 signed and debit-credit Costco gas share one key; unknown `format_version` is ignored |

- Candidate class and protected counterexamples: a second import engine and a second normalization map. Brokerage staging, Fidelity replacement, and `encrypted-store.persistence.ts` stay as FIN-05 left them. No FX conversion and no second ledger.
- Comparison base SHA and full replacement closure: `89a1515a3516524f18f482e0849b8f661f6b127d`. Closure is `bank-import.parsers.ts`, `bank-import.util.ts`, `bank-import-copy.ts`, `transactions-import-workflow.ts`, `transactions.component.html`, `transaction.model.ts`, `encrypted-store.bank-imports.ts`, and the thin `listCsvMappingProfiles` / `saveCsvMappingProfile` delegates on `encrypted-store.service.ts`, `finance-import.service.ts`, and `finance.service.ts`.
- Production added/deleted/moved: parsers +314/−6, util +44/−8, copy +4, workflow +145/−17, dialog +112, model +34, bank-import store +27, store service +8, finance-import service +10, finance service +10. App production net +677. No moves. `docs/ADDING_A_BANK_IMPORT.md` +1 is the docs change.
- Independent equivalent implementations before/after: one commit and receipt writer before and after. One dedupe key builder. Mapping profiles are additive encrypted metadata, not a second writer.
- State/cache owners and public entry points before/after: preview, commit, resume, and undo still enter through `FinanceImportService` and `EncryptedBankImportStore`. Cancel and lock call `discardImportPlaintext`. Profiles are saved only after a successful custom commit.
- Remaining old symbol/path search: no `custom_csv` commit function existed to delete. `commitBankImportRows` remains the only bank/custom commit. `parseCustomCsv` is the adapter.
- Follow-up change: none in this leaf. Parent #65 stays open.
- Tests/docs/generated changes separately: `bank-import.util.spec.ts` +239, `transactions-import-workflow.spec.ts` +61, `encrypted-store.bank-imports.spec.ts` +42, `bank-import-copy.spec.ts` +10, `e2e/custom-csv-import.spec.ts` 207. Test and e2e net +559. This file is the evidence change. `apps/karma.conf.js` was restored and is not in the diff.
- Net production delta and specific reviewed safety/compatibility exception if positive: app production +677. The increase is the column adapter, the mapping dialog, the USD rejection before commit, and the encrypted profile records. Those are the custom-CSV feature. No second commit or receipt engine was added.
- No behavior/data/meaningful assertion silently removed: existing bank preview, dedupe, resume, and undo assertions remain in the Finance Karma and Playwright runs.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `PYTHON` was `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python`. Karma used port 10003 only for the runs; `apps/karma.conf.js` was reverted and is not part of the diff. `./scripts/coverage-gate.sh finance` was not run: the diff has no Python backend files. The launch profile `finance_front` does not include it.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. 98 Python tests, doc paths, blame, shared boundaries, and e2e discovery |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0 |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 838 SUCCESS. Statements 75.27%, branches 64.9%, functions 71.86%, lines 78.43% |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 714 SUCCESS. Statements 83.19%, branches 70.14%, functions 82.81%, lines 86.87% |
| `make e2e` | PASS. Production bundle written, then Finance Playwright 250 passed, 8 skipped, including all three `custom-csv-import.spec.ts` cases |

## Handoff

- PR URL (leaf closure keyword only): not opened yet.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status: not merged. Not a deployment.
- Remaining external prerequisites or approved scope decisions: #65 stays open.
- Next actor: open the pull request, append the #134 note, wait for Backend, Frontend, Unified Site Release, and Playwright, then squash-merge.
