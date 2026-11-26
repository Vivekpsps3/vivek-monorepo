# FIXUP-10 — Harbor entrance and Terminal return

- Leaf [#588](https://github.com/Vivekpsps3/vivek-monorepo/issues/588), with tracking parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Isolated worker branch `agent/fixup-10` in `/tmp/vivek-fixup-10`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/588#issuecomment-7203415566)
- Fresh main `57caac17c49e3eeab63bcc48d09b6704ef1f6ef7`. Tested implementation `a57e51ae8feca503e7cf0e5a8a95183ca769409c`. The final regression test strengthens paint and text-size assertions at `df08e44834aea06f273532c457b6d98e3b22af78`. The cross-app suite passed on `781d9d5e9c7c7564410eb115b60bd09e1e6370d2`.
- SCENE-02 `b1c9d0ea`, NAV-02 `8126d6ef`, ROOM-04 `7e2acd1e`, and ROOM-05 `27c99dc2` are ancestors. Current main supplies Harbor picking, owner-bound navigation state, the existing hall and its trip/leg/day targets, and the map and gallery. There was no competing issue claim or overlapping PR.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| Reported baseline | At audited SHA `27c99dc2`, a 390×844 Chromium touch visit with synthetic data selected Harbor. The Inn door opened Trips. The Travel Terminal section and direct Terminal URL both showed the Trips exit. | Reproduced. Baseline screenshots in `/tmp/vivek-fixup-10-baseline/playwright-report/town`. |
| FIXUP-10-A1 | Enter the canonical Terminal by Harbor's building list with touch and Enter, and by the painted landmark with a mouse. Select the exact saved map destination, reload, and see the same trip and place selected. Exit to Town and verify the Harbor control is selected, the Terminal door is focused, and the scene highlights it. Compare Inn progression before and after. | PASS with reduced motion at 390×844 night, 1280×800 light and night, and 320×700 light at 200% text. |
| FIXUP-10-A1 | Open the desk and type an unfinished flight. Cancel both an explicit Town exit and browser Back, verify the exact booking route, typed number, and Town exit are usable, then confirm leaving and verify the restored door. | PASS with touch on the explicit exit and keyboard on the browser Back path. |
| FIXUP-10-A2 | In a direct Terminal visit, open saved outbound and return legs and an exact trip day, then return to the same row and refresh the same day. Exit to Trips, enter again via Travel navigation, and verify its Trips exit. Check no Travel writes, no changed trip IDs or dates, and no changed PTO charge in the inspection journey. | PASS at 390×844 night and 1280×800 light. |

Changed captures are attached to the Town browser report under `playwright-report/town`. The existing Travel Terminal journey captures both widths under `test-results/travel`. The 320px check enlarged the document font size and verified horizontal bounds after returning. Owner visual review remains pending.

## Deletion and compatibility

| Candidate | Previous path | Surviving owner and proof |
| --- | --- | --- |
| Generic Trips launcher in Harbor | Town labeled the functional door Inn and pointed both the list and painted landmark to Trips. | Town's existing exterior model projects Terminal at `/travel/terminal`. The Inn asset, building ID, level, credit source, and XP still use the same Town data, and the browser comparison shows equal Inn progression before and after. |
| Unconditional Trips exit | Terminal always returned to `/travel`. | The existing page-header return link uses the current owner's Town entry. The existing route guard retains an unfinished flight when the user cancels or accepts either exit path. Direct and Travel-origin entries keep Trips. |
| Competing room query writer | The hall and its map/gallery child separately replaced the Terminal URL. | The hall performs every in-route replacement and carries the validated source. The child emits the selected coordinates. Reload and trip/day browser checks preserve the old targets and focus. |

Compared with the base, 69 production lines were added and 53 removed. Tests added 141 and removed nine. Travel guidance replaced one line. No files moved or generated output committed. One route history writer remains for Terminal. The extra production lines bind a bounded focus key to its owner and path and hold the active entry stable during guarded Back. There is no extra draft store, API, persisted record, or trip calculation. A follow-up room coordinate changes Terminal's owned hall or child selection, with the one hall history writer providing the same return behavior.

## Verification

Commands used Node 24.22.2, the repository Python environment, and installed Chromium. The release manifest is `5c48d2d4f610128102a08a1f4a0cb94ee6b966a510f83c70154d83946f6ebfac`. The existing production build warning reports a 731.08 kB initial bundle against a 650 kB warning threshold.

| Command | Local result |
| --- | --- |
| `make test-fast` | PASS. Paths, planning, ownership and browser discovery checks, 135 Python tests and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint baselines match and seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests; 77.85% statement coverage. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 553 tests; 65.22% statement coverage. |
| `make build-frontends` | PASS. Production bundle and release manifest. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 263 Town, Health, World and Pixels cases on the implementation. All four changed Harbor tests passed in the final focused run. |
| `npx playwright test --project=suite` | PASS. All 75 cross-app browser cases passed after the stable target measurement. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 94 Travel runtime tests. |
| `npx playwright test` in `apps/travel/e2e` | PASS. 210 Travel browser cases including both strengthened direct/Travel-origin Terminal journeys. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 197 Media browser cases. |
| `make -o build-frontends e2e` after the successful production build | PASS. The Finance Playwright suite passed 297 cases with five existing skips using the already verified bundle. |

The first implementation emitted the Trips label while the browser briefly selected the previous history entry during a guarded Back. The trace confirmed the owner's history source was intact after cancellation. Terminal now reads that source when its route is active. The regression asserts the Town exit after cancellation, then accepts the next exit. The keyboard fixture waits for the booking view before beginning the guarded navigation. The outdated Inn route assertions now verify the new canonical door and the existing Library action. An existing Health switcher assertion sampled a 44px target during the opening animation at 43.999992px. The assertion now checks the browser’s target geometry after a trial click confirms stability and hit testing, keeping the strict 44px minimum.

## Handoff

- One PR closes only #588. Monitor the exact head, verify the merge and leaf closure, and append the results to [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
- This evidence covers the synthetic local journey. Independent owner visual acceptance remains pending.
