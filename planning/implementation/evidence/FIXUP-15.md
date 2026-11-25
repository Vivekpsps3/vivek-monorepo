# FIXUP-15 implementation evidence

- Leaf [#593](https://github.com/Vivekpsps3/vivek-monorepo/issues/593) and parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole worker on `agent/fixup-15` at `/tmp/vivek-fixup-15`. The base was `a94748609cf1fa0aff15aa7c48cd6cb7fe7005c9`. Product code is `1e8eb6af66a00a662489dea0dfed4e6751f3a723`. The server regression is at `4bd3f6b4fcf12d915c54743c3f891ec109de2002`. Final Town and suite browser runs used `6b978a086b518b6b82d0b41fc71211e473bcc036`.
- Current main had the [saved layout API](https://github.com/Vivekpsps3/vivek-monorepo/pull/622), [catalog](https://github.com/Vivekpsps3/vivek-monorepo/pull/577), [furnished rooms](https://github.com/Vivekpsps3/vivek-monorepo/pull/596), [placement](https://github.com/Vivekpsps3/vivek-monorepo/pull/623), [recovery](https://github.com/Vivekpsps3/vivek-monorepo/pull/624), [browse layout](https://github.com/Vivekpsps3/vivek-monorepo/pull/625), and [Workshop](https://github.com/Vivekpsps3/vivek-monorepo/pull/626). [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/593#issuecomment-7154751410). There was no competing issue claim or open PR.

## Acceptance

| Row | Browser and server evidence | Result |
| --- | --- | --- |
| Baseline | A synthetic build of audited `ab2507c9` started with one Oak seat in the sample's Saved layout, showed two after Place free item, and returned to one on reload. The same behavior reproduced on the current main bundle. | PASS |
| FIXUP-15-A1 | Town opens the real Home editor with twelve free starters. An older Oak seat URL opens the named placement and preserves its day/night art choice in preview. The normal validator rejects a doorway placement. Place edits the local draft. Only Save issues a revision-checked PUT. The new piece survives reload, and Back to Town restores focus to Visit Home. An external save produces the expected conflict, reapply preserves both edits, and Undo preserves the other save. | PASS |
| FIXUP-15-A2 | A Tile fountain bookmark retains the correct price, footprint, and selected artwork variant. With that asset unavailable, the fallback fits its panel and the Workshop retains its label, price, and legal action. An unsupported bookmark has no purchase action. An unlocked Shell stool hands its selected ID into Home, and two saved instances block refund until removal. A direct Home link to a locked piece keeps it out of inventory and offers the exact Workshop link. | PASS |
| Concurrent Workshop purchase | The existing two-tab browser journey returned 201/500 twice in 40 pre-fix runs. The deterministic HTTP test confirms that the sync SQLite lock wait blocked its event loop. The baseline lost with `sqlite3.OperationalError: database is locked` and 500 in 5,069 ms. The fixed request returns 409 `insufficient_stamps` and keeps one entitlement and zero Stamps. The browser still asserts 201/409. | PASS |
| Visual and accessibility | Keyboard at 1280×800 and touch at 390×844 through both themes, with reduced motion. The named Home action is in the first viewport with a 44 px target. Axe finds no serious or critical violations. Preview copy fits at 320 px and 200% text after switching the narrow Workshop panel to one column. | PASS |

The before captures are `audited-sample-save` and `audited-sample-reload` in the disposable baseline report. The main browser report includes `place-*`, `saved-*`, and `workshop-missing-art-320-night`. All use synthetic accounts. Independent owner visual review remains pending.

## Deletion and compatibility

| Removed or migrated | Previous consumers | Surviving owner |
| --- | --- | --- |
| Catalog component, sample layout map, Save claim, grid, duplicated placement control, and the sample-only placement helpers | Town header, suite switcher, and catalog bookmarks | Town's existing Visit Home and Workshop entries and the switcher's corresponding destinations. The client keeps the legacy route, directs each known free starter to Home and each priced piece to Workshop, and shows a safe fallback for older missing catalog IDs. |
| Sample art controls and missing-placement placeholder | Legacy catalog item and sample scene | The same twelve starter and twelve shop assets, variants and metadata remain. Home previews the selected piece on the canonical spatial layout and Workshop preserves the selected artwork or fallback. Real invalid and unsupported layouts retain Home's existing recovery behavior. |
| Blocking SQLite wait on the Workshop HTTP purchase request | Concurrent market purchases | Existing request transaction and Stamp ledger. Purchase execution uses the existing server thread pool while the event loop schedules the preceding commit. The same request keeps the existing schema, receipt, error, and purchase rules. |

Compared with `a9474860`, the code adds 89 and removes 548 production lines. Tests add 224 and remove 346 lines. The feature, source pointers, and Town guidance replace four documentation lines. Physical line counts include whitespace and comments. No code was moved. The layout write owner, Stamp transaction, canonical milestone eligibility, and original art files stay in their existing locations. Home remains the single layout state owner.

## Verification

| Command | Result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS. Planning and path checks, 135 Python tests and 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint baselines match. |
| `make lint-python` and `make typecheck-python` | PASS. Ruff formatting, suppressions, and mypy match the existing baselines. |
| `./scripts/coverage-gate.sh server` | PASS. 488 passed, one existing skip, 81.76% coverage. Passive Town GET p50 was 338.38 ms. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 716 tests and 77.66% statement coverage. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 553 tests. |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 9 tests. |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 173 tests on installed Node 22, which supports the TypeScript sources these tests import. |
| `make build-frontends` | PASS. The production manifest is generated. Initial bundle advisory remains at 729.29 kB against a 650 kB warning budget. |
| `make e2e` | PASS. 297 passed and five existing skips. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 239 Town, Pixels, and World tests. |
| `npx playwright test --project=suite` | PASS. 61 tests. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 197 tests. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 210 tests. |

In the first full Town run, Playwright scrolled the exterior scene back into view while clicking the artificially displaced sound button. The corrected test translates only the scene, asserts it remains offscreen when the button is clicked, and keeps all audio assertions. It passed eight focused runs and the full rerun.

The browser gates used the installed Chromium through `CHROME_BIN` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The server regression runs the real HTTP route with a waiting SQLite writer and explicitly releases the winning transaction after the contender reaches the lock. The earlier run on Node 20 could not load two TypeScript test files. Re-running that exact static command on installed Node 22 passed with all 173 tests.

## Handoff

- The pull request closes only [#593](https://github.com/Vivekpsps3/vivek-monorepo/issues/593). The leaf carries the live PR and [roadmap](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) comment links.
- Next in the owner's sequence is [FIXUP-02 #580](https://github.com/Vivekpsps3/vivek-monorepo/issues/580). Production deployment and independent owner visual review require separate evidence.
