# NAV-01 — Expose direct app destinations in the suite shell

- Leaf #386. Tracking parents #304 and #93. Roadmap #134.
- Agent `issue_386`, branch `agent/nav-01`, isolated worktree `/tmp/vivek-nav-01`.
- Base main `7c2302295618d3a215038510c5116aff2476a37f`. Tested source and tests `e763f52f010e546cef7428db1232dac7906182af`. Production assets, routes and app code were identical in earlier final runs before the last Finance and suite test-only follow-ups.
- Fresh origin/main contained STYLE-02 merge `6303c08adbee023600b3a8df1673fef934a4c7d4` and its coastal control and focus behavior. No competing claim or open PR was present before the [leaf claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/386#issuecomment-6967557348).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| NAV-01-A1 | From unlocked Finance Home, select Holdings once by touch at 390×844 and keyboard at 1280×800, in both themes. The canonical `/finance/have?t=holdings` opens with its focused heading, one current link and the two-share synthetic Harbor Index position worth $250. Back restores active Home. All nine destinations fit the screen and have 44px targets. Accounts, Activity, Calendar, Bills, Pay and Imports use their existing direct URLs. Imports displays the same receipt history with the existing Import action. | PASS |
| NAV-01-A2 | From Travel at both viewport sizes and in both themes, select the named app switcher then Media Books. The saved Harbor Guide appears and the synthetic Harbor Matinee movie stays out of the result. Books is current in the app and in the disclosure. Escape collapses the disclosure and returns focus. Back and Forward restore Travel Trips and Media Books. The shell keyboard suite also executes arrow, Home, End, Tab, and Escape navigation. | PASS |
| NAV-01-LIFE | In the Media library, hold Books after navigating from Movies, then select Games, fail that request, release Books and retry Games. While Books loads the Movies cards are gone. The losing Books response never restores its record or active state. Requests are exactly Movie, Book, Game, Game. Finance's locked switcher journey sends only the existing Holdings route in `next`, hides the local navigation and private marker, and returns to Holdings after unlock. Existing held Finance write, same-session retry, Media draft and owner-remount checks also execute. | PASS |
| NAV-01-VIEW | The Finance and cross-app journeys run at 390×844 and 1280×800 in light and night with touch and keyboard, visible focus, measured 44px targets, axe and screenshots. Desktop Holdings also scans hover contrast. The shell suites measure wrapping and keyboard outlines at raised text sizes, 320px and 200% content zoom. The disclosure runs with normal and reduced motion. | PASS |

Inspected the synthetic switcher and Holdings Playwright review captures. The
mobile disclosure presents grouped destinations and shows the active Travel link
in the first screen. Desktop preserves the top app links and places the grouped
disclosure below the header. Local links wrap instead of clipping. The disclosure
uses the coastal paper and brass in light mode and navy and teal in night mode.
Independent owner visual approval and production activation remain separate.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Finance's one-item nav groups and Net worth, Spending and Recurring nested navigation rows | Finance layout and the three view hubs | Finance's app destination list and existing view owners | Removed the grouping indirection and three rows. Direct links expose Accounts, Holdings, Activity, Calendar, Bills, Pay and Imports. Existing canonical URLs, legacy aliases, planning tools, editors and Finance guard resolution survive, exercised in Karma and browser tests. |
| Mixed Library as the primary collection choice | Media layout | Media's destination list and saved library | Five categories reach the existing library using canonical kind filters. Music opens Artists and marks Albums and Songs as Music. Mixed access is explicitly labeled All items, and filter and item URLs remain supported. |
| Duplicate compact/desktop landmarks, repeated app-label map and unused home getter | Private shell | One Apps nav and disclosure | Removed the separate mobile navigation and redundant label/path derivation. Wide app links and compact named disclosure share one app list. The disclosure uses the same Finance, Travel and Media link definitions as local navigation. |
| Hidden routing links, scroll/fade timers, resize/focus listeners and unused short label option | Shared section navigation in Finance, Travel and Media | Existing section nav and shared match function | Removed those paths. Real links wrap, and query-specific matches take precedence over canonical defaults. One router subscription marks current state. Browser tests retain unclipped rings, active-link visibility and narrow overflow checks. |

- Feature replacement at the base above. Production changes add 329 and delete 336 physical lines, including blank lines and comments. Tests add 342 and delete 198. Guidance and frontend documentation add 14 and delete 13, excluding this evidence. No files moved and generated bundles and captures are outside the diff.
- Before, Finance had a shell-local link hierarchy and three separate nested selection rows. The current destination match is shared by the actual shell and local consumers. The authoritative rendering, filtering, domain stores, guard and route entry points stay with the apps.
- The switcher has one disclosure state and no added data loader, record store, persistence or vault protocol. The library keeps one stream for saved collection reads. Category switches clear data from the previous category and cancel obsolete expanded-item reads.
- Searches for `visibleNavGroups`, `sectionNavItems`, `ui-section-nav__scroller`, `app-switcher__compact` and the three removed Finance labels on nested navs found no surviving production consumers. Planning retains its own tools. A new app-local destination changes its app's list and continues through an existing canonical route.
- Synthetic fixtures use the local test server and browser vault only. Media saved reads use the existing library API. Existing domain owners continue to govern financial rules, dates, authorization and import receipts.

## Verification

Node 24, repository Python virtual environment and installed Chromium. The final
production bundle reported the pre-existing initial size warning at 657.35 kB,
below the unchanged error budget. Browser retries and coverage floors stayed
unchanged. Local front-end and actual-diff gates are listed below.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS. Documentation, planning, boundaries, 111 script Python tests and 21 script Node tests. |
| `make lint-web` | PASS. Existing lint baselines and engine-purity checks. |
| `make typecheck-web` | PASS. All seven TypeScript targets. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 503 tests and coverage. |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 9 tests and coverage. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 407 tests and coverage. |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 104 tests. |
| `make build-frontends` | PASS. Production bundle and manifest. |
| `make e2e` | PASS. 241 browser tests and five existing viewport-specific skips. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 103 tests. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 147 tests. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 114 tests. |
| `npx playwright test --project=suite` | PASS. 54 tests. |
| Backend coverage, Python lint/types and release rehearsal | Local NOT RUN. The diff touches frontend and verification files. GitHub CI runs these jobs. |

Initial checks caught an old Imports absence assertion, an old desktop button
count and a Finance heading expectation. They now check the intended direct link,
one named header switcher and the actual destination heading. The first wide
Holdings scan found low contrast on positive gain text and the Live price badge
over a hovered row. The success token and badge surface now pass the same scan.
The fast suite was rerun using the project Python environment and the agent
guidance word limit. Lint was rerun outside the fast suite's transient ownership
fixture. A Finance passphrase test timed out closing a Chromium context during a
parallel run. The unchanged complete gate passed in isolation.

## Handoff

- The closing PR and scoped roadmap note are linked from the issue timeline.
- The issue worker reviews the published diff and exact CI head before authorized
  merge. The PR records the pre-merge audit, and the leaf timeline records closure.
- The issue-specific worktree and branch are removed after verified merge and closure.
