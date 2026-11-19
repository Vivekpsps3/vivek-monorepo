# FUX-04 — implementation evidence

- Leaf [#393](https://github.com/Vivekpsps3/vivek-monorepo/issues/393) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Bills implementation agent, branch `agent/fux-04`, worktree `/tmp/vivek-fux-04`.
- Base `b7bb3cc4bb00d4ee77f6a2ad5432ab1241e962bc`. Tested production source `99f93a5ca3d784c3f89fe1c855f4f64d6a995e20`. The reviewed test follow-up is `7be18320dae3f647875b8101e12682cd8d758c72`.
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

Local verification used Node 24, the existing Python environment and Chromium 157.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS, doc paths, planning, boundaries, 135 Python and 21 Node tests |
| `make lint-web` and `make typecheck-web` | PASS, four lint ratchets, engine purity and seven TypeScript targets |
| `python3 scripts/quality_ratchet.py check-base eslint-finance origin/main` | PASS, allowance shrank by seven findings |
| `python3 -m pytest apps/server/tests/test_route_parity.py -q` | PASS, 32 cases including the direct private Bills example |
| `./scripts/coverage-gate.sh server` | PASS, 398 tests, 79.38% coverage and a 150.27 ms Town p50 under the existing 600 ms gate |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 499 tests and coverage |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 417 tests and coverage |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 9 tests and coverage |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs` | PASS, 16 tests |
| `make e2e` | PASS, production build, release manifest, 264 Finance browser tests and five existing viewport skips |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, 121 Web browser tests |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 171 Media browser tests |
| `npx playwright test` in `apps/travel/e2e` | PASS, 150 Travel browser tests |
| `npx playwright test --project=suite` | PASS, 61 shared browser tests |

The first integrated Finance run caught the missing legacy URL defaults after
Show all and the toast-stack fixture's dependency on the old cross-route retry.
The final run retains the URL coordinates and keeps the full toast fixture on
the real Accounts retry boundary. Focused test iteration corrected exact field
and row selectors. Visual review shortened the phone Status label and checked
the compact editor again. The existing bundle warning is 673.11 kB against its
650 kB warning threshold and below the unchanged error limit. Backend code is
untouched. Server coverage applies because the document classifier reads the
route manifest. Other Python gates are deferred to normal PR CI.

The published review restored explicit coverage for inactive undated rows,
monthly totals excluding those rows, and sorting through status changes. The
Finance Karma and repository gates reran for that test-only follow-up.

The docs-only follow-up preserves two existing worktree edits that align the
route inventory with Bills and Pay. Their author could not be established.
The route wording was reviewed in scope and the documentation gate rerun.

A second work session recorded supplemental verification using Node v20.20.2
and Chrome Headless 156. That session reported 499 Finance Karma tests, 417
Web Karma tests, 264 Finance and 121 Web browser tests, 10 focused Bills and
capture cases, and the route parity tests. Its system-Python fast run lacked
Alembic. The gated run above used the repository virtual environment. The
reported extra runs are recorded in [the supplemental evidence commit](https://github.com/Vivekpsps3/vivek-monorepo/commit/bd9947d705589c453a7c91536acd7bed2ebae178).

## Handoff

- The issue timeline links the PR and closing commit. The PR closes only #393.
- The roadmap receives a scoped note for the integration owner to reconcile with merged evidence.
- Published acceptance review and exact-head CI precede merge. Independent owner visual approval and deployment remain separate.
