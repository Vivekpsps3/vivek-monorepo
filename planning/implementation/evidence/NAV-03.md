# NAV-03 — implementation evidence

- Leaf [#388](https://github.com/Vivekpsps3/vivek-monorepo/issues/388). Parent scopes are #304, #317 and #93.
- Agents issue_388 and issue_388_recovery1, branch `agent/nav-03`, worktree `/tmp/vivek-nav-03`.
- Initial base `8126d6efef2e6e0564d7dccc67e17d785204d4f9`, initial tested implementation `6c127f943cbba483320e233ae7ea6eb060818933`. Latest integrated base `51f2e504b791db8e164f1928a97fe91b9877dd7d`, tested source `80a5e13ee0dfab528e169e7f988915e5a81c8223`.
- Fetched main and verified the merged STYLE-03, NAV-01 and NAV-02 commits are ancestors. Checked live PRs and the leaf and [posted the scoped claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/388#issuecomment-6969182257).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| NAV-03-A1 | Real browser arrival at `/hub` shows the day, greeting, existing Quick add, three ordered dated rows and six tiles within 390×844 and 1280×800. Finance browser journeys sign in and arrive at `/hub` with no explicit next path. The public portfolio keeps its existing route. | PASS |
| NAV-03-A2 | Held and failing Media summary cases confirm Travel remains actionable and only Media summary/calendar reads repeat. The recovered Media action and in-progress item populate from the same response. Finance lock is represented as locked. | PASS |
| NAV-03-A3 | Real keyboard pin editor verifies the three-pin limit, reorder, reload, reset, and Escape/Done focus return. A mounted Hub test switches from Ada to Bea while prior-owner work and the editor are still active. Bea sees the default order and the old dialog closes. | PASS |
| NAV-03-LIFE | Held Travel, Media and Town reads from Ada resolve after Bea takes over and cannot publish. Locked Finance drops late plaintext, and the existing Travel reminder mutation cancels on invalidation and keeps the full reminder after ordinary failure. Media watch and Undo still use their domain operation, including stale and conflict paths. | PASS |
| NAV-03-VIEW | Reviewed light/night viewport captures at 390×844 and 1280×800. Axe checks, 44px action measurements, named route links, focus return, touch and the reduced-motion fixture passed. The 320px enlarged-text case retains readable, keyboard-reachable shortcuts. Static Town preview loads two existing repo-native assets and runs zero animations. | PASS |
| PLACE-13-ARRIVE | Touch opens Town in one action, returns to Hub, opens the filtered December agenda and follows a dated action to a persisted synthetic Media item. The item reloads at the same route and browser Back restores the prior agenda month/filter. Pixels strip tests retain exact dates and keyboard traversal. | PASS |
| PLACE-13-SHARE | Both compact views use one Travel summary, one Media summary and only the necessary months. The December/January fixture verifies per-source request counts, reuse of existing Media months on agenda expansion, isolated Media retry, and a single independent Finance view. | PASS |

Synthetic fixtures include the Kyoto trip and reminder, the December Premiere and January Finale, the saved Synthetic premiere series, two test owners, and test-generated browser vault data. Provider calendars are intercepted with bounded responses. The test of the Media detail route creates a real saved test record. Capture attachments use `hub-up-next-<width>-<theme>`, `hub-empty-<width>-<theme>`, and `hub-town-preview-<width>-<theme>` in the Town Playwright report.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Six-row landing presentation and relative-date groups | Hub Up next | Existing Up next component and date projection | Three flat chronological rows replace the landing groups. The expanded route still groups by exact date, including hidden compact rows. Existing order, overdue behavior, filters and calendar links are exercised. |
| Spare Media rows and duplicate heading link | Hub Media card and mark-watched focus return | Existing Media item/Now routes and one named card link | The card previews the first current item and prioritizes the first available next episode. The first episode absorbs its matching progress row. The Media app remains the complete library. Recent notes and releases remain reachable in disclosures. Focus goes to the surviving episode row or Open Media and ignores a dropped owner/route. |
| Large side cards and duplicate/dead layout rules | Hub landing | Compact Hub layout and existing state controls | Replaced redundant link styles, unused skip-link and ineffective child error overrides. Town preview is static and secondary. Town progress remains in a keyboard-operable disclosure with the existing bounded loader, retry, expiry and exact server values. Finance retains its collapsed breakdown and locked/empty/stale semantics. |
| Private presentation preferences | No prior destination-pin implementation | Hub destination component | One local preference by owner. At most three allowlisted IDs, no copied domain data or server persistence. Reset removes the active owner's key. Existing route guards still control each destination. |

The production comparison against the current base adds 334 and removes 172 lines (net +162). This is a feature addition. Its two new files contain the pin UI and device preference. The independent domain loaders, request windows, record owners, vault key protocol, API contracts, and public routes are unchanged. Existing art bytes total 9,875 raw across both already-served SVGs. The compressed Hub route chunk rises from approximately 14.48 kB to 16.02 kB. The follow-up for these shortcut choices is the Hub destination component. Unrelated app navigation and stores retain their owners.

Health displays an unavailable tile because the current Angular router has neither a Clinic nor a Gym interface. ROOM-11 and ROOM-12 own the interfaces. The other five tile routes are canonical and tested. Health data and editors stay with their named room issues.

## Initial verification

| Command | Result at the initial tested implementation |
| --- | --- |
| `make test-fast` using the repo Python environment | PASS. 111 Python and 21 Node tests, guidance lengths/links, app boundaries, discovery and policy checks. |
| `make lint-web` | PASS. Four lint ratchets and the engine purity test. |
| `make typecheck-web` | PASS. Seven application, spec and package TypeScript targets. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 411 tests with coverage. |
| `make build-frontends` | PASS. Production bundle and release manifest generated. Initial-size warning remains at the base's 662.50 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 117 cases, including the updated Hub and Town journeys. |
| `npx playwright test --project=suite` | PASS. 56 cases, including shell target/focus checks and cross-tab vault lock. |
| `make e2e` | PASS. 243 Finance cases with 5 existing viewport skips, including actual sign-in and vault journeys through the Hub. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 105 cases, including Hub episode update, Undo, stale and conflict regressions. |
| `npx playwright test` in `apps/travel/e2e` | PASS. 147 cases. |

Additional Python, Finance Karma, Site Karma and standalone app Node gates were outside the local changed-source profile. The change touches the Hub and its Web browser tests and uses the existing app APIs and editors.

Iteration failures were corrected before the final runs. The first mobile layout put the last tile below 844px. Resizing rows and arranging the date and title within one named target fixed the layout without shrinking targets. Axe exposed the need to keep the full visible text in the link's accessible name. The legacy Town browser assertion now opens the new disclosure and still checks the same truthful status, safe expiry and 44px actions. The final Media episode row retains entry-keyed component lifetime and its exact record link.

## Current main integration

The [original PR CI](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/44240680009/attempts/1) failed one desktop Travel-to-Books keyboard case. Its [Playwright rerun](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/44240680009/attempts/2) could not retrieve the retired frontend bundle. The branch incorporated newer main, including the shell focus correction already merged in [PR #515](https://github.com/Vivekpsps3/vivek-monorepo/pull/515). All four original switcher cases passed on the integration without changing the test.

Review caught a separate phone regression in the open Finance breakdown. Compaction kept the grid columns but dropped the grid display, leaving three totals side by side. The extended synthetic-vault browser journey reproduced the defect against the previous bundle. Restoring the phone grid preserves the stacked amounts and the same lock and cache assertions.

| Command | Result at the integrated source |
| --- | --- |
| `make test-fast` using the repo Python environment | PASS. 135 Python and 21 Node tests, plus planning, paths, boundaries and discovery. |
| `make lint-web` and `make typecheck-web` | PASS. Four lint ratchets, engine purity and all seven TypeScript targets. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 415 tests with coverage. |
| `make build-frontends` | PASS. Production bundle and release manifest generated. The existing initial-size warning is now 669.83 kB on current main integration. |
| `npx playwright test` | PASS. 716 cases across Finance (243), Travel (147), Media (149), Town (121) and suite (56), with 5 existing Finance viewport skips. No retries. |
| `npx playwright test --project=suite --grep 'Travel opens Media Books\|a locked Finance card drops money' --repeat-each=4 --workers=2 --output /tmp/nav-03-recovery-regressions --reporter=line` | PASS. 20 executions covered touch, keyboard, the two-action route, and the restored phone breakdown. |

## Handoff

- [PR #500](https://github.com/Vivekpsps3/vivek-monorepo/pull/500) closes only #388. The leaf and roadmap #134 have scoped evidence comments.
- Deployment and independent owner visual approval are separate from implementation and test results.
