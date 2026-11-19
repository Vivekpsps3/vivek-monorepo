# FUX-03 — implementation evidence

- Leaf [#392](https://github.com/Vivekpsps3/vivek-monorepo/issues/392) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Activity implementation agent, `agent/fux-03`, `/tmp/vivek-fux-03`.
- Base `850353ed05f9f4655b1108eb7b0de6466bbf0c96`. Tested source `0dbf34e4d05e8b1fba1860163d8d6beb6541b82a`.
- Both merged prerequisites are ancestors of the base. [NAV-02](NAV-02.md) supplies validated return and dated edit handling. [STYLE-03](STYLE-03.md) preserves readable data and semantic colors. The issue was open, without a competing claim or related PR.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FUX-03-A1 | `tests/e2e/pixels-activity-return.spec.ts` selects August 15 in the real Pixels screen. Activity shows the named Portland record without the adjacent day's record. Add defaults to August 15. The desktop case unlocks through the sanitized exact coordinates. The phone case exercises Back and Forward. The Pixels panel reopens on the correct day and Close focuses its date cell. | PASS |
| FUX-03-A2 | `delete-undo.spec.ts` fails each of edit, delete and restore once for synthetic Boardwalk Cafe. The category draft and original amount remain usable. The retry updates the original record, delete plus retry removes it once, and Undo plus retry restores the same ID, amount, import link, account, original description and trip. The six encrypted requests are asserted. The unit regression exercises Delete while the full read is pending and retains the legacy negative amount through Undo retry. | PASS |
| FUX-03-LIFE | The browser holds a write, locks Finance in a second tab, then releases the failed write. Re-unlock shows the original record and no late draft or feedback. Browser Back closes the Activity-owned delete confirmation without a write. Route/destruction and vault/session invalidation drop the row actions and discard private draft state. | PASS |
| FUX-03-VIEW | `activity.spec.ts` exercises 390×844 and 1280×800 in light and night, touch and keyboard with reduced motion, exact day and combined range/account/category/trip, Escape focus return, imported source and correction, paired 44px targets and viewport bounds. Axe finds no serious or critical violations. Captures in the local Playwright artifacts were reviewed at both widths and in both appearances. | PASS |

## Deletion and compatibility

| Candidate | Removed path and surviving owner | Compatibility proof |
| --- | --- | --- |
| Date range inputs and Clear filters were rendered twice | The one Activity Filters disclosure now renders date/range alongside account, category, merchant, trip and sort. The empty state still offers a recovery action. Search, chips and filters use one route/sort update path. | Existing toolbar, category chip, empty-state and totals journeys plus the four combined filter cases. |
| Desktop and phone duplicated Edit/Delete markup and controls | Both render one local row-action template with the same two 44px actions and pending delete state. Semantic table and phone provenance disclosure remain. | Existing table/phone, imported editing, delete/Undo and focus tests. |
| A nested ledger read and a separate retry callback could compete | One Activity observer and retry input supersede losing reads. The existing encrypted record store owns all reads, writes, revisions and exact restore. | Browser import/edit/Undo and held-vault cases. Existing payment/refund/transfer behavior and bank import receipts still run in the Finance suite. |
| Editor owned a separate Travel request path | The bounded trip-tag source joins in-flight reads by Activity and its editor. The Trip filter operates on saved tags when names cannot load. | Same editor choice, earlier trip and unavailable tests; the browser also verifies the named trip and earlier saved ID. |

- Baseline Finance Activity used the ledger owned by Finance, with no Trip filter and no dated Activity action on the Pixels panel. The route now carries just two validated dates to enter/return. The unlock allowlist still excludes trip/account/row coordinates and arbitrary text.
- The comparison covers Finance Activity, its editor/query/hub/navigation/service, the Pixels day action and the existing shared return allowlist. Production added 327 lines and removed 188. Tests added 258 lines and removed 8. Documentation is this record.
- One encrypted ledger, one correction form and one receipt/Undo persistence path before and after. The new filter predicate and browser-day link are feature additions. Guarded reads, dialog cancellation and action cleanup add explicit lifecycle protection. Money, date and import calculations remain with the existing domain owners.
- A follow-up filter edits the Activity predicate, shared filter endpoint and its real browser acceptance. A receipt or provider change still belongs to the existing import or Travel owner.

## Verification

Commands ran on the tested source above.

| Command | Tested result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS, 135 Python and 21 Node tests plus repository checks |
| `make lint-web` and `make typecheck-web` | PASS, four lint baselines, engine purity, and all seven TypeScript projects |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 504 tests and coverage |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 417 tests and coverage |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 9 tests and coverage |
| `make e2e` | PASS, production bundle and 257 tests with five existing viewport skips |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, 121 tests |
| `npx playwright test --project=suite --project=travel --project=media` | PASS, 150 Travel, 171 Media and 61 shared suite tests |

The focused rerun for Activity, row recovery and Pixels return passed 23 cases with three existing viewport skips before the visible-row fix. The complete browser gates repeated those cases on the final source. An earlier focused run reached its dialog assertion before verifying the browser back destination. The final test asserts the Finance Home URL, confirms the dialog closes and verifies the original encrypted record remains.

A system Python invocation was missing DB test dependencies. The established worktree venv supplied them. On focused iteration, the unsorted tag options depended on ledger order, the strict template rejected nullable link inputs, and the pre-review desktop actions wrapped. The source was corrected and full suites rerun with the acceptance checks intact. The regression test first failed with zero delete calls for a visible row during a pending read. Rendering and row recovery now use the same ledger result, and the Finance Karma rerun passed. Python backend gates did not apply to the frontend-only diff.

## Handoff

- The implementation PR closes only #392 and references #304. The scope note is appended to #134 after PR creation.
- Evidence uses synthetic browser data. Deployment and independent owner visual approval remain external.
- The integration owner reconciles the roadmap body and packet archive after merge.
