# FUX-07 — implementation evidence

- Leaf [#396](https://github.com/Vivekpsps3/vivek-monorepo/issues/396) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open.
- Planning implementation agent, branch `agent/fux-07`, worktree `/tmp/vivek-fux-07`.
- Base `620fcb87f3c7654c3cb0742777096bf93e3b863c` (`origin/main`, FUX-06 merge). Tested source `cb22b50e12bc25c720851c5fb6d45822a96596d8`.
- [NAV-04](NAV-04.md) merge `2e4a6013` (#518) and [STYLE-02](STYLE-02.md) merge `6303c08a` (#495) are ancestors of this base. NAV-04 supplies the Finance section list. STYLE-02 supplies the direct-selection surface. No competing finance-ui or finance-public-api pull request was open.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FUX-07-A1 | `imports.spec.ts` starts from one VOO holding, interrupts the Fidelity write, and leaves that holding at 1 share. Resume on `/finance/imports` then stores SPAXX and VOO with VOO at 2 shares. The Holdings page shows both symbols. `trustworthy-finance.spec.ts` repeats the interrupt, keeps the holding through Home, and resumes from “Finish your Fidelity import” before the explicit price refresh. | PASS |
| FUX-07-A2 | `imports.spec.ts` opens `/spending?t=imports`, lands on `/finance/imports`, and retries the same Chase preview after a failed save. The account name survives Back, the retry inserts the three CSV rows, and “Restore encrypted backup” opens the existing settings heading. `bank-import.spec.ts`, custom CSV resume, and receipt undo still use `FinanceImportService`. | PASS |
| FUX-07-LIFE | A held bank commit that the synthetic vault then rejects leaves zero transactions. Lock from the other tab removes the filename and account label, and unlock returns to Imports with those strings gone. Karma drops a late bank commit toast after the draft is cleared and ignores a late Fidelity resume after the session token changes. The ordinary Chase failure keeps the file and account name for the retry above. | PASS |
| FUX-07-VIEW | The imports journey runs at 390×844 with touch and 1280×800 with keyboard, in light and night, with reduced motion. Import, both exports, the recovery link, and Lock Finance are at least 44px. The page has no horizontal overflow. Axe reports no violations on `app-imports`. Enter focuses the Imports heading. Escape from the bank dialog returns focus to Import on the keyboard viewport. Holdings stay at one row and transactions stay empty. | PASS |

Fixtures are browser-local synthetic ciphertext. Preview, dedupe, staging, receipts, and Undo stay in `FinanceImportService`, `bank-import.util.ts`, `fidelity-import.util.ts`, and the encrypted bank and brokerage stores. Backup, restore, and passphrase change stay on `/settings/finance`. Activity keeps “Export CSV” and Holdings keeps the actions-menu “Export CSV”.

## Deletion and compatibility

| Former path | Consumers and disposition | Surviving owner and proof |
| --- | --- | --- |
| Activity receipts landing and hub `t=imports` rewrite | Section navigation opens `/finance/imports`. `?receipts=1` and `?t=imports` redirect there. Calendar with `receipts=1` stays on Calendar. `receiptsOpen` is gone. | `ImportsComponent` embeds the bank history and the Fidelity resume surface. Navigation, coherence, and `imports.spec.ts` follow `/finance/imports`. |
| Holdings-page Resume button | A staged Fidelity file shows “Finish your Fidelity import”, which opens `/finance/imports`. The in-place “Import from Fidelity” dialog remains on Holdings. | `PortfolioComponent` still calls `commitFidelityImport` and `resumeFidelityImportStage`. The trustworthy interrupt journey resumes from the imports page. |
| Collapsed page-level receipt list on Activity | Activity links to “Import history”. The imports page keeps the receipt rows open, including Resume and Undo. The dialog-internal history remains. | Undo in `trustworthy-finance.spec.ts`, `custom-csv-import.spec.ts`, and `finance-coherence.spec.ts` still withdraws the receipt and keeps an edited row. |

- Feature replacement. Relative to the base, the closure adds 675 and removes 153 physical lines. Application and route files add 360 and remove 88. Tests add 305 and remove 59. Docs add 10 and remove 6. This record is outside those figures. The added lines are the imports page, the bounded redirect, and the browser journeys. The deleted lines are the hub import rewrite and the holdings-page resume control.
- The encrypted import engine, receipt records, Undo, staging, and settings recovery forms keep their owners. A late commit result is ignored after the session changes, and the draft plaintext is cleared on lock.
- `returnPath` accepts `/finance/imports` with `start=bank` or `start=fidelity` and drops a reattach filename. Activity and Holdings export names stay “Export CSV”.
- No follow-up production file is required for this leaf. Pay, Bills, and the import parsers stay with their current owners.

## Verification

Local verification used Node v20.20.2, Python 3.12.3 from the repository environment, and Chrome Headless 156. Commands ran from `/tmp/vivek-fux-07` on `cb22b50e12bc25c720851c5fb6d45822a96596d8`.

| Exact command | Final result |
| --- | --- |
| `PATH=".venv/bin:$PATH" make test-fast` | PASS. Doc paths, planning validation, boundaries, 135 Python unittest methods, and 21 Node tests. The first `make test-fast` used system Python and stopped in `scripts/test_restore_drill.py` because Alembic was missing. The repository environment rerun is the result above. |
| `make lint-web` | PASS. Four ESLint ratchets match the baseline. Engine purity passes. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `CHROME_BIN=$PLAYWRIGHT_CHROME npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 514 tests. Statements 63.26% (7728/12216), branches 49.34% (3418/6927), functions 59.13% (1842/3115), lines 66.7% (6826/10233). `PLAYWRIGHT_CHROME` is `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. This machine has no default Chrome binary. |
| `CHROME_BIN=$PLAYWRIGHT_CHROME npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 417 tests. Statements 72.6% (5824/8022), branches 57.53% (2222/3862), functions 72.13% (1165/1615), lines 77.3% (5049/6531). |
| `make e2e` | PASS. Production build, release manifest, 281 Finance browser tests, and five existing viewport skips. The imports interrupt, retry, lock, and both viewport sizes passed in this run. |
| `.venv/bin/python -m pytest apps/server/tests/test_route_parity.py -q` | PASS. 34 tests. The private finance route pattern includes `imports`. |

Python product files are unchanged, so the Python coverage gates were not required. Town Playwright was not required: no Town spec changed. The initial bundle is 674.62 kB, over the existing 650 kB warning and under the error limit. Finance, Travel, Media, and site Karma outside this diff, and the other Playwright projects, stay with CI.

## Handoff

- The PR closes only #396. Parents #304 and #134 stay open.
- The roadmap receives one status note after merge. The issue body, queue, and parent ledgers stay unchanged.
- Deployment remains separate.
