# FUX-04 — implementation evidence

- Leaf [#393](https://github.com/Vivekpsps3/vivek-monorepo/issues/393) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Bills implementation agent, branch `agent/fux-04`, worktree `/tmp/vivek-fux-04`.
- Base `b7bb3cc4bb00d4ee77f6a2ad5432ab1241e962bc`. Tested product `7be18320dae3f647875b8101e12682cd8d758c72`. Docs `7fd6479f7bf39179c7196d45d7b47b5ba57a0e89` are included.
- [NAV-01](NAV-01.md) and [STYLE-03](STYLE-03.md) merges are ancestors of fresh main. NAV-01 supplies the Finance section destinations. STYLE-03 supplies the compact responsive table. The issue was open without a competing PR or claim before [the scoped claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/393#issuecomment-7014474566).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FUX-04-A1 | `bills.spec.ts` opens Harbor rent and Maritime archives from the same table. Both records deliberately share numeric ID 80. Editing the bill retains its due day, frequency and Autopay. Editing the quarterly subscription retains the exact next billing date and changes the monthly equivalent from $30 to $32. Assertions inspect the two separate encrypted collections, the expected revisions, and the ledger record. | PASS |
| FUX-04-A2 | One posted Harbor rent payment matches only one of two $1,200 projected occurrences. Home still shows $1,200 spent, $2,545 scheduled and $2,545 combined expense. Bills shows a provisional overdue date for the other rent and none for the matched bill. The payment and recurring records stay as seeded. Existing calendar, cashflow, refunds, planned schedules and invalid-amount tests also run. | PASS |
| FUX-04-LIFE | A held subscription write fails after a second tab locks the vault. The row and form are removed before the response. Unlock preserves the exact allowlisted Bills filters, reloads the saved record and shows no old draft or feedback. The held bill case exercises automatic lock. Navigation Back cancels the pending deletion confirmation without a write. The failure cases keep safe input or rows during retry. Karma delivers an older ledger response after a newer failure and verifies it cannot replace the newer status. | PASS |
| FUX-04-VIEW | Direct section navigation and typed edits run at 390×844 and 1280×800 in light and night, with touch and keyboard, Escape, focus return and reduced motion. Table row actions are at least 44px. Axe reports no violations in the workspace and editor. List and editor captures were reviewed separately for table headings, visible filter labels, monetary alignment, type-specific fields, and focus in both themes. | PASS |

The fixtures are browser-local synthetic ciphertext in the normal Finance app
journey. Possible overdue status covers the previous 14 days, uses the existing
one-to-one posting matcher and remains explicitly provisional. The Bills load
keeps missing ledger evidence and unavailable saved rows distinct. The route
parity fixtures verify that filtered Bills opens as a private document and
resolves through the Finance route.

## Deletion and compatibility

| Former path | Consumers and disposition | Surviving owner and proof |
| --- | --- | --- |
| Query-selected Recurring spend view and duplicate desktop and phone row templates | Section navigation, Finance Home, Planning, Calendar, Finance Search and Hub Up next link directly to Bills. Old Recurring tabs and the fixed-expense and subscription bookmarks route to the same workspace. | One compact semantic table supplies both layouts. Navigation cases exercise legacy filters, active state, and the guarded canonical path. Pay and dated compensation keep their existing route and history. |
| Standalone fixed-expense and subscription presentation, totals and reads | The only production consumers rendered these components as editors. Deleted the dormant lists and branching presentation along with their separate style and computed-total paths. | Bills owns the visible list and displayed monthly equivalents. Both editors retain type-specific field validation, write handlers, and same-session draft recovery. |
| Two per-editor delete confirmations and toast retry closures | Removed both dispatch copies. A single route-owned confirmation uses the selected record's type and ID. Failure keeps the row and retry action in the workspace. A leaving or invalidated view discards the pending action. | Browser cases assert no request on Back, retry only the selected collection, preserve other records, and return focus after removal. The original shared toast-stack capture still checks three real toasts, keyboard focus, and Undo, using an Accounts delete failure for its retry toast. |
| Per-type copies of occurrence assembly in cashflow | Factored existing amount admission, schedule expansion and occurrence shape into one domain function, with each kind supplying its original date anchor. Bills consumes that function and the existing posted matcher. | Home, Calendar and charts retain their ranges, ordering and counted amounts. New overlapping synthetic fixtures verify one payment only covers one projection. |

- Feature replacement. Relative to the base, production adds 629 and removes 836 physical lines. The comparison includes routes, shipped stylesheet and template changes, editors, shared allowlist and shell links. Tests and route fixtures add 360 and remove 276, with one editor handoff spec renamed and meaningful tab/filter/type/total assertions replaced by routed browser proof. This record is outside those figures.
- The encrypted store, revision checks and cashflow engine retain their owners. Bills subscribes to the existing record views and refreshes the checked ledger without adding persistence or an API endpoint.
- No runtime consumer remains for the old spend renderer, separate commitment cards, or editor-only switches in the two editors. The old URLs remain compatibility entry points. A follow-up Bills filter changes the Bills route projection and supported return coordinates.

## Verification

Commands ran from `/tmp/vivek-fux-04` with Node v20.20.2. Karma used
`CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`
(Chrome Headless 156). `make test-fast` used `PATH="$PWD/.venv/bin:$PATH"`
because the worktree virtualenv provides Alembic. A system-Python `make test-fast`
stopped in `scripts/test_restore_drill.py` with `ModuleNotFoundError: alembic`
and is not a pass.

| Exact command | Final result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS. Doc paths, planning, boundaries, 135 Python tests and 21 Node tests. Repeated after the route docs and again on the evidence commit |
| `make lint-web` | PASS. Four lint ratchets match their baselines. The Finance baseline shrank with the removed editor findings. Engine purity passed |
| `make typecheck-web` | PASS. Seven TypeScript projects |
| `CHROME_BIN=... npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 499 tests on `7be18320`. Statements 63.27% (7458/11786), branches 49.26%, functions 59.06%, lines 66.73% |
| `CHROME_BIN=... npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 417 tests, repeated after the Bills route example. Statements 72.6% (5824/8022) |
| `make e2e` | PASS. Production bundle, release manifest, 264 Finance browser tests and five existing viewport skips. Initial bundle 673.11 kB warns above 650 kB and stays under the error limit |
| `npx playwright test --config apps/finance/frontend/playwright.config.ts apps/finance/frontend/e2e/bills.spec.ts apps/finance/frontend/e2e/screenshots.spec.ts` | PASS, 10 tests, after the Accounts row selector tweak |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, 121 Web browser tests |
| `PATH="$PWD/.venv/bin:$PATH" python3 -m pytest apps/server/tests/test_route_parity.py -q` | PASS, 32 tests, including the mounted `finance/bills` example |

Not run locally: `./scripts/coverage-gate.sh server`, site Karma, Media Playwright, Travel Playwright, and `npx playwright test --project=suite`. Python product files did not change. The route-parity test above covers the Bills example that `apps/server/frontend.py` classifies from `routes.json` and `route-examples.json`. CI still runs the full server gate.

Show all keeps `kind=all` and `status=all`. The toast-stack capture stays on the Accounts delete retry. The inactive undated row, its exclusion from the monthly total, and latest-due ordering are in the Finance Karma rerun.

## Handoff

- The issue timeline links the PR and closing commit. The PR closes only #393.
- The roadmap receives a scoped note for the integration owner to reconcile with merged evidence.
- Published acceptance review and exact-head CI precede merge. Independent owner visual approval and deployment remain separate.
