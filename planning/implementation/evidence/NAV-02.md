# NAV-02 — Preserve source context through editors, unlock and browser history

- Leaf #387 and tracking parents #304, #307, #317, and #93. Roadmap #134.
- Isolated worktree `/tmp/vivek-nav-02` and branch `agent/nav-02`. The recovery worker continued the original implementation and tests after a daemon restart.
- Fresh base `35c9f2413866aec85c73f1d8b715beb181edc6df` contains the NAV-01 outcome. Initial tested source and tests `9830a1c1b80f977538a8a01a63e6988e6f33565a`. Pre-merge route validation and repeat gates used `652f09d801b5cfc7a0d2fdc4952d5182a7c46225`. The [leaf claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/387#issuecomment-6968178624) records the isolated work. The open PR list showed no overlapping implementation.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| NAV-02-A1 | Media's saved library filters to following artists, pages to offset 24, expands Harbor Artist Return, and opens its saved Harbor Return Album. The explicit Library link at 390×844 and browser Back at 1280×800 restore the exact library URL, expanded artist, album focus and scroll within 10px. Browser Forward returns to the same album. | PASS |
| NAV-02-A2 | Open Aug 15, 2026 in the synthetic Pixels year and unlock Finance with the existing vault form. The exact Portland date survives. Closing restores grid focus and browser Forward opens the same date. The unlock URL carries only the validated year and day. A direct locked Finance Calendar link returns to Sep 16, 2026 and omits its synthetic private merchant parameter. Existing passphrase rotation returns to Finance Settings. | PASS |
| NAV-02-LIFE | The Sep 16 Calendar Add action opens an editor with the selected date. Cancel returns to the selected date and focuses the day heading. A failed write keeps Synthetic retry category available. A held retry released after browser Back cannot reopen the editor or carry its draft into a new add. The existing held Media detail and cross-tab Finance lock cases also pass. | PASS |
| NAV-02-VIEW | The two return journeys run at 390×844 in night with touch and at 1280×800 in light with keyboard and reduced motion. The Media album and Library links and Pixels Unlock and Close controls meet 44px. The returned Media library and Pixels day run axe scans. Pixels also runs both themes at both widths. Browser assertions check label, focus and restored data. | PASS |
| PLACE-03-FOCUS | Media restores the invoking album link and original scroll. Pixels restores the date control with one additional selection entry and revisits the exact date on Forward. Both use browser history for the original source. A direct link can safely close to its owning library or year. Target URLs omit copied free-form filters and financial fields. | PASS |

The captures show the saved album and the second-page count at the original
scroll. On desktop, the visible focus outline lands on the album link. The
Calendar shows the selected day and dated Add action at phone width. The Pixels
captures show the restored Portland day in the phone sheet and desktop panel.
Fixtures use test database rows and the synthetic browser vault. Owner visual
approval and deployment verification are pending.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Raw whole-URL copying into vault `next` and repeated unlock/setup continuation | Finance guard, lock service, market refresh, unlock and setup, shell Search and Quick add, and shared locked state | Shared return-path validation and history restoration | Removed the copied paths and repeated completion routing. Valid coordinates survive, including Finance Settings. Accepted dates and finite view choices keep their owning route semantics. Unknown direct targets and recursive vault routes use Finance Home or the embedded route. |
| Media's private scroll key and unconditional Library navigation | Saved library, item detail and deletion return | Shared browser-entry position and source context | Removed the Media-only scroll marker. The existing filter/page URL still owns library selection. The source item identifier and scroll stay in owner-bound browser-entry state. Direct detail links have the library fallback. |
| Calendar transaction links carrying account, category and merchant filters and duplicated month reset code | Dated Calendar and the Activity editor | Calendar date and existing transaction editor | Removed copied filters and consolidated month changes. Edit retains the original transaction ID at its app route. Close restores the original Calendar entry. A failed draft save is retryable and browser Back clears the draft. |
| Pixels year-only unlock links and independent day-close handling | Year toolbar, day sheet, grid and table | Pixels year/day and the shared return source | The date survives unlock, Back, and Forward. A direct day link closes to its year. Day selection uses the existing data model and works in the grid and table. |

- Compared with the base above, production adds 581 and removes 131 physical lines. Tests add 207 and remove five, and guidance adds one line. The implementation introduces one shared validation boundary and binds view restoration and pending editor feedback to the active source. All record storage, date calculations, vault protocol, and source loading stay with the existing owners. No files moved. Generated bundles and review captures are outside the diff.
- Removed `mediaLibraryScroll`, raw dynamic unlock URLs in the migrated callers, and the Calendar account/category/merchant copy into the transaction link. Existing static vault links, generic sign-in routing, app APIs, supported record formats, and migrations continue on their owning paths.
- A new return coordinate changes the destination's validation entry and its consumer test. Media filters stay with Library, Finance day selection stays with Calendar, and Pixels Year owns its day selection. Presentation context stays on the browser history entry.

## Verification

Node 24, the repository Python environment and installed Chromium. The production
build completes with the existing initial-size warning at 662.50 kB, below the
unchanged error budget. Browser discovery, retries, and coverage floors are
unchanged.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS. Docs, planning, ownership and discovery, 111 script Python tests and 21 script Node tests. |
| `make lint-web` | PASS. Lint baselines and engine purity. |
| `make typecheck-web` | PASS. Seven TypeScript targets. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 503 tests and coverage. |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS. Nine tests and coverage. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 411 tests and coverage. |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 104 tests. |
| `make build-frontends` | PASS. Production bundle and release manifest, run by `make e2e`. |
| `make e2e` | PASS. 243 tests and five existing viewport-specific skips. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 105 tests. |
| `npx playwright test` from `apps/travel/e2e` | PASS. 147 tests. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 114 tests. |
| `npx playwright test --project=suite` | PASS. 56 tests. |
| `make test-frontend` and root `npx playwright test` | PASS on the pre-merge route refinement. 923 Karma tests, 665 browser tests and five existing viewport-specific skips. |
| Backend coverage, Python lint/types and seeded rehearsal | Local not run. The diff touches frontend, shared UI, tests and guidance. GitHub CI runs these checks. |

The first fast gate found a cross-app test import. The Pixels and Finance
journey now runs in the suite project and uses the existing Finance fixture.
The first Karma Web and Finance browser runs caught the missing Finance Settings
return destination. The destination is now validated and both unchanged
assertions pass. The private Search filter is tested through the existing search
port with a locked result, and the actual browser unlock and history round trip
runs in Pixels. The repository Python environment and Node 24 resolve the
initial system interpreter dependency and TypeScript module errors.

Published diff review identified two entries without active routes. The return
policy now validates the current Settings and Travel paths and preserves the
month on Media and Travel Calendar. Tests assert the corrected fallbacks and
retain Finance’s all-months coordinate. The complete local browser and Karma
gates ran again with the changed policy.

## Handoff

- The issue timeline records the closing PR, evidence, and scoped roadmap #134 note.
- The issue worker reviews the published diff and required checks on its final head before merge. The PR records the audit and the issue timeline records closure.
- After verified merge and closure, the issue worker removes the isolated worktree and feature branch.
