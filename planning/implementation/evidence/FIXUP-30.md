# FIXUP-30 — implementation evidence

- Leaf [#618](https://github.com/Vivekpsps3/vivek-monorepo/issues/618) and parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole worker on `agent/fixup-30` in `/tmp/vivek-fixup-30`. Base `a5d9c1319ceb8587264389fc9fece505850e2760`. Tested product `07a78306567ef8a7bc5c8f4aa7396d4b06ae5112`. Browser verification includes test-only commit `3f9454d05f277943b9afa77e5d89ac8208a4d56f`.
- Current main contained the [catalog](https://github.com/Vivekpsps3/vivek-monorepo/pull/577), [four furnished rooms](https://github.com/Vivekpsps3/vivek-monorepo/pull/596), [room editor](https://github.com/Vivekpsps3/vivek-monorepo/pull/623), and [revision recovery](https://github.com/Vivekpsps3/vivek-monorepo/pull/624). No overlapping PR or claim. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/618#issuecomment-7143854656).

## Acceptance

| Row | Current proof | Result |
| --- | --- | --- |
| FIXUP-30-A1 | The real browser visits all four rooms on the same synthetic saved revision, with a persisted color change to each primary object. Each object and Decorate are fully in view before scrolling at 390×844 and 1280×800 in light and night. The object list, direct touch and mouse hits select the same furniture. Keyboard selection, the study deep link, and closing details recover the named control. Room artwork and object links remain when the placement grid is absent. | PASS |
| FIXUP-30-A2 | Decorate focuses Add furniture and overlays the projected grid on the same room. Touch on the visible doorway cell and keyboard position changes hit the same validator. A valid placed starter holds its visible position after Save and reload. Cancellation removes the transient grid and restores the named control. Save failure, reapply, Reset, Undo, corrupt fallback, and a cross-tab lock with a held write retain their existing browser assertions. | PASS |
| Scene checks | The 16 `browse-*` captures and four `preview-*` captures show the actual rooms, primary actions, and projected footprints. The 320px study test asserts 32px root type, no horizontal document overflow in browse and edit, and keyboard return. Reduced motion shows zero scene animations and axe reports zero serious or critical violations for the inspected Home and editor states. | PASS |

The main baseline positioned the primary object links around y1005 on phones and y1417 on desktop at the resting scroll position. Its floor image always drew a square grid. The new room panels keep both the practical object and Decorate in the first viewport. Visual review used the baseline and current browser captures with synthetic data. Owner art review remains pending.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition |
| --- | --- | --- | --- |
| Permanent square guides in four Home assets, duplicate `shell` guide, and browse coordinates | Home browse and edit | Home cutaway artwork and one projected edit grid | Removed. The projection aligns room art, paint and hit rectangles, editable footprints, and the existing 12×12 cell model. |
| Duplicate room heading, scene guidance, and coordinate details | Home browse | Compact room navigation, accessible object actions, and contextual editor controls | Removed. Text and pointer actions reach the same practical objects. Actual write status, recovery, and focus behavior are covered. |

- Comparisons use `a5d9c131`. Eight production files replace the four backdrops and Home-only presentation. The product diff adds 363 and removes 229 physical lines, without file moves. Two test files add 94 and remove 26 lines. Guidance and feature documentation each replace one line.
- `/town/home/:room`, its object and camera query, and the layout transport remain the entry points. The same stored items and revision drive browse and edit. Home owns the view projection. The existing route and layout API remain authoritative for navigation and persistence.
- The room sprite paint targets are presentation. The existing named controls provide accessible interaction and preserve practical room actions. Art failure can still retry. Reset reload proves its persisted revision via the DOM attribute and the restored furniture. The live result still reports a Save when it occurs.
- The four SVGs retain the existing asset paths and original attribution. The visual captures are attached to the Town Playwright report.

## Verification

- `PATH="$PWD/.venv/bin:$PATH" make test-fast` — PASS. Planning, doc-path and boundary checks, Python script tests, and 21 Node tests.
- `make lint-web` and `make typecheck-web` — PASS. Existing lint baselines match.
- `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` — PASS. 719 tests, 77.76% statement coverage. The concurrent run saw an unrelated Pixels test's 30ms BroadcastChannel timing assertion fail. It passed with the same assertion and the browser suites run separately.
- `make build-frontends` — PASS. Home is 59.34 kB with an estimated 15.22 kB transfer. The existing 728.95 kB initial bundle advisory remains.
- `npx playwright test --config apps/web/e2e/playwright.config.ts` — PASS. 236 tests, including all 19 Home cases.
- `npx playwright test --project=suite` — PASS. 61 tests.

The browser runs use the installed Chromium 156 through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Karma uses the same Chromium through `CHROME_BIN`. The initial accessibility stress test hit the inline style CSP. It now sets root font size through the harness and asserts the computed 32px. The full run caught the old accessible-name assertion on the milestone art sprite. The final test checks the visible sprite and the same accessible name on its real room link.

## Handoff

- The PR closes only #618. Append the scoped roadmap status after verified merge.
- The owner-requested sequence proceeds to [GAME-02 #471](https://github.com/Vivekpsps3/vivek-monorepo/issues/471).
