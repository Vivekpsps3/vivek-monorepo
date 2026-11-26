# FIXUP-22 — Weekly review exit protection

- Leaf [#610](https://github.com/Vivekpsps3/vivek-monorepo/issues/610) and tracking parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole implementer on `agent/fixup-22` in `/tmp/vivek-fixup-22`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/610#issuecomment-7172640334)
- Fresh main `9ce004408698a75460c1f6fcf533731febdf025b`. Tested implementation `ecbee2eaf1a8649fcd1199c561ab4aa741ae6639`.
- SCENE-07 merge `dd64f2bd` and NAV-02 merge `18c8553f` are ancestors of the branch base. The encrypted weekly review, its exact-week unlock, and the owner-bound return context are present on main. The issue and open PR list showed no overlapping work.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| Baseline | Opened the unchanged editor from Hub with 52 encrypted synthetic weeks in Chromium at 390×844. Focus 1, Note, and Save started at y1745.5, y2026, and y2315.5. Earlier left the draft in place with an alert. Hall exited without a dialog, and opening the same week showed an empty note. The editor and Hub shortcut sources match audited `bb300824`. | Reproduced on branch base |
| FIXUP-22-A1 | Real touch or keyboard from Hub. Earlier, saved-week selection, explicit return, the shell app switcher, and Browser Back all open the same dialog. Stay or Escape preserves all entered fields, current week, and exact initiating focus. Keyboard Tab stays inside the dialog. Desktop reload triggers a native confirmation and dismissal preserves the draft. | PASS at 390×844 and 1280×800 in light and night |
| FIXUP-22-A1 | Approved discard opens the earlier week. Browser Back and Forward still open their exact weeks. Saving the earlier week and returning opens Hub. Opening from Hall carries the selected Rules object through week changes and reload. Discard and leave returns to that Rules view. A direct review URL falls back to Hall. | PASS across the same matrix |
| FIXUP-22-A1 | With 52 encrypted weeks, one selector and Focus 1, Note, and Save all fit fully inside the arrival viewport and meet the 44px target. The selected week remains the page heading's subtitle. Phone History renders as one control above the fields. Desktop focus inputs share a row. At 320px and 200% text, the controls and both confirmation actions stay within the page and Stay returns focus. | PASS across the same matrix and dedicated enlarged-text case |
| FIXUP-22-A2 | Held update of a saved synthetic note sends expected revision 1. Lock in a real peer tab closes the pending leave decision, removes the fields, and keeps the original saved note after a failed held response. A peer-tab sign-out while a confirm dialog is open removes the editor and reaches login. | PASS across the same matrix |
| Regression | Original ISO year boundary, exact review schema, saved-week history, delete, restore, no Town writes, axe checks, and reduced motion. Store and component coverage retains a 409 draft, 503 retry safety, owner invalidation, and abort on approved leave. | PASS in the focused browser matrix and current Web Karma |

The local Chromium reports attach synthetic production screenshots for desktop,
phone, and enlarged text. The before and reviewed after files are in
`/tmp/fixup-22-reviewed` with source labels. The first compact-history attempt
still placed Save offscreen. Spacing, field arrangement, and the heading were
refined. Testing an exact Hall query exposed encoded query text in the existing
heading link, which the final review link resolves with an Angular URL tree.

## Deletion and compatibility

| Candidate | Previous consumers | Disposition and owner | Proof |
| --- | --- | --- | --- |
| Duplicate dirty-week checks and a URL rewrite after changing weeks | Earlier, Later, saved weeks, and popped history | One route guard delegates to the review editor for every in-app exit and week change. The browser's beforeunload fallback uses the same pending-change test. | Stay, discard, Back/Forward, app switch, and reload in Chromium |
| Unconditional Hall link | Weekly review editor | Actual Hub or Hall route from validated owner-bound history state. Canonical week changes carry the source. Unlock returns to the active review history entry. Direct links retain a safe Hall entry. | Hub unlock and save return, exact Hall Rules path after reload, and direct fallback |
| 52 individual history buttons before the single editor | Saved-week navigation | A labeled native selector lists every readable saved week, while the active editor remains the main content. | Count and first-viewport assertions, saved history selection and focus return |

Against the main base, production adds 239 and removes 71 physical lines. Tests
add 235 and remove seven. Guidance updates two existing lines. The increase covers
guarded navigation, secure cancellation, source restoration and compact layout.
The one encrypted review store, client IDs, revisions, key/record formats, week
semantics and routes continue through their existing owners. Navigation state
carries validated route coordinates. Invalidation aborts the editor's active
operations and clears the draft, baseline, visible history and confirmation state.

## Verification

The final bundle and tests use Node 24.11.0, the existing repository Python
environment and installed Chromium. Command results for the implementation SHA
are recorded below.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Path, planning, ownership, and discovery checks, 135 Python tests, and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Lint findings match their existing baselines. Seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests and 77.87% statement coverage. |
| `make build-frontends` | PASS. Production build and release manifest. Existing initial bundle advisory at 730.75 kB against the 650 kB warning threshold. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts town-review.spec.ts` | PASS. 14 review browser cases, including the 390 and 1280 theme matrix and the 320px enlarged-text case. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 251 Town, Health, Pixels, and World browser cases. |
| `npx playwright test --project=suite` | PASS. 69 cross-app browser cases. |
| `make e2e` | PASS. 297 Finance browser cases and five existing skips. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 197 Media browser cases. |
| `npx playwright test` from `apps/travel/e2e` | PASS. 210 Travel browser cases. |

## Handoff

- All required local gates passed before PR creation. Verify the published
  head and all four CI jobs. The leaf timeline records the closing PR and the
  scoped roadmap note records the verified merge.
- Owner visual review and production deployment remain separate.
