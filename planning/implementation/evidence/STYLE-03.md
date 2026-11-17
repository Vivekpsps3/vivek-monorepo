# STYLE-03 — implementation evidence

- Leaf and parent: [#384](https://github.com/Vivekpsps3/vivek-monorepo/issues/384), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent: autonomous issue worker; branch `agent/style-03`; worktree `/tmp/vivek-style-03`.
- Base: `6303c08adbee023600b3a8df1673fef934a4c7d4`; tested implementation: `e690f5d9f66c70acca73869d4afe34807af94366`.
- Fresh main includes [STYLE-01 / PR #494](https://github.com/Vivekpsps3/vivek-monorepo/pull/494) and [STYLE-02 / PR #495](https://github.com/Vivekpsps3/vivek-monorepo/pull/495). No competing PR or claim was open before the [claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/384#issuecomment-6962471620).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| STYLE-03-A1 | `dense-holdings.spec.ts` opens eight encrypted synthetic positions (HARBOR, TIDE, BRASS, BAY, ISLE, LANE, FLAT, UNLISTED) via What you have → Holdings. One row per position retains real USD value, source date, basis and actions, with no horizontal overflow. `dense-collection.spec.ts` reads a real Media Books filter seeded over its test API. Tide, the Coastal Almanac, and an unbroken title retain their title links and accompanying metadata. | PASS |
| STYLE-03-A2 | With chart preference enabled and UNLISTED unvalued, the table reports unavailable rather than zero, disables misleading share-of-whole visualization, and preserves FLAT's actual $0.00 alongside TIDE's $51.16 and 14-day stale quote. With complete values, the actual chart paints the coastal token, keeps stale status visible and offers the checked numeric view. | PASS |
| STYLE-03-LIFE | Hold the HARBOR refresh, edit a local draft, remotely lock via a second synthetic tab, and release the request. No old toast, draft or write survives lock; re-unlock still reads the original quote. A failed Holding update preserves shares in the same dialog; the retry writes the intended value. A held Media library result loses to a newer filter and cannot repopulate cards. Karma releases a held Chart.js load after destruction and verifies no paint. | PASS |
| STYLE-03-VIEW | Browser journeys at 390×844 and 1280×800 in light/night, plus 320 and 200% root text. Reduced motion, keyboard open/Escape and returned focus, touch edit/save, Media detail/back, 44px targets, axe, numeric accuracy and chart-pixel checks. The six slice fills clear 3:1 against the card separator in both themes (minimum 3.81:1). | PASS |

Finance uses enforced synthetic ciphertext fixtures with auto price lookups off;
the deliberate held market request is synthetic. Media uses its isolated test
server and canonical saves. Captures are attached to the Playwright reports and
copied to `/tmp/style-03-review`. Visual review separately inspects desktop
columns, mobile row/field grouping, long Media titles and light/night chart paint.
Independent owner approval and production activation remain separate.

## Deletion and compatibility

| Removed path | Former consumer | Surviving owner and proof |
| --- | --- | --- |
| Holding details-only row, nested table scroller and single-column padding overrides | Fidelity and manual Holdings displays | Same Portfolio component and shared compact table keep basis/date/source in each row's identity cell. The shared scroll wrapper, paired mobile labels, and 44px actions preserve the table and edit/delete/refresh paths. Existing net-worth row assertion still checks the basis/date/source. |
| Repeated portfolio mini-list and extra net-worth subscription request | Holdings summary card | Portfolio summary retains totals and dated status, and the same rows provide definitive values. The previous mini-list showed an unavailable UNLISTED value as $0. The chart, CSV, and authoritative net-worth calculation retain their owners. |
| A second read after a single-position quote refresh | Portfolio row and held-symbol price check | Finance coordinator already publishes eligible writeback to holdings$. Row feedback checks the view and vault session before publishing. Refresh, lock, update and retry are tested. |
| Zero fallback and separate default-styled table projection | Holdings mix | The same Finance chart projects real values from the existing Finance stream. Shared table preserves row/column headers and mobile labels. The view makes partial or stale data explicit and keeps complete chart/table mode. |
| Media card material and compact breakpoint rules in global Media CSS | Media library cards and other existing MediaCard consumers | Existing MediaCard owns their light/night material and wrapping; Search retains its own use of the shared artwork and copy rules. Saved reads, canonical item links, and Library URL/filter/scroll behavior remain with Media. |

Feature replacement. Relative to the base, production is +273/−251 physical lines
(+22); some presentation rules moved with the Media card. New compact styling,
source-state handling and lifecycle guards explain the remaining addition. Tests
are +310/−7, with the previous behavior assertions retained. Guidance is +7/−1
before this evidence file. No bundle, schema, crypto, data-owner, route, or public
record format changes. Later dense app tables can opt into the shared variant
without introducing app-local table overrides. No duplicate loader or state
owner remains for the migrated paths.

## Verification

Node 24, the repository's existing virtual environment and installed Chromium
were used. Required local checks run before PR creation. An initial compiler/lint
run caught nullable chart values and a count of new DI and template findings;
typed checks and template equality were corrected with baseline gates intact.
Browser iteration found heading order, labels after row headers, a persisted
decimal string assertion, and the retained basis/date copy. These were fixed
without skipping assertions. A typecheck overlapped the transient ownership probe
created by `test-fast`; it was rerun after that probe was removed.

The full browser matrix ran on the shared table, chart and Media code at
`f9d577c5802825da24cdd77ba6730f4263558ad3`. The only subsequent production
change is the desktop Holdings action CSS, which keeps Edit and Delete on one
line. Finance and shared shell browser checks were rerun with that CSS. The
Media, Travel and Web projects do not render the Holdings view.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS: doc/blame/planning/boundaries, 111 Python and 21 Node script tests |
| `make lint-web`, `make typecheck-web` | PASS: unchanged lint baselines, engine purity and all seven TypeScript projects |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 504 tests and coverage |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 9 tests and coverage |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 405 tests and coverage |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 20 tests |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 39 tests |
| `make e2e` | PASS: production bundle and release manifest; 230 browser tests, five pre-existing viewport skips |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS: 102 browser tests |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS: 147 browser tests |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 browser tests |
| `npx playwright test --project=suite` | PASS: 50 browser tests |

The standalone backend implementation is unchanged. Browser tests exercise the
real Finance and Media screens against synthetic encryption and isolated test
servers without claiming live provider or owner data.

## Handoff

- PR: see the closing reference in the #384 GitHub timeline. Closes only #384.
- Roadmap #134 receives a scoped note on the PR and its verified outcome.
- Local gates pass on the tested implementation. Published diff and required CI
  will be reviewed on the PR before merge. Approval and activation remain outside
  the code verification.
