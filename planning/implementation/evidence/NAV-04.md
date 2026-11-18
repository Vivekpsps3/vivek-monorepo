# NAV-04 — implementation evidence

- Leaf [#389](https://github.com/Vivekpsps3/vivek-monorepo/issues/389), with parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93).
- Branch `agent/nav-04`, isolated worktree `/tmp/vivek-nav-04`.
- Base main `18c8553f95fc78a0c14c7ecd461609964a4f20de`. Source `b07194b513d8207eb41e7a019ae4e4ae680a4315`. Browser test updates `d1b01147a4f7de3c4513b306236c5de81ab37f8c`.
- Confirmed NAV-02 (`8126d6ef2e6e0564d7dccc67e17d785204d4f9`) and STYLE-02 (`6303c08adbee023600b3a8df1673fef934a4c7d4`) on fresh main. No overlapping PR or claim for this leaf. The original settings index redirected to Account on desktop. The failed flight lookup named Settings without offering access from the editor.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| NAV-04-A1 | Travel `flights.spec.js` starts a synthetic Tokyo trip, enters a flight number, date and a manual departure time, receives an unconfigured lookup, opens the existing FlightAware editor and returns. Cancelling a discard confirmation keeps the key input. Confirming discards only the key draft. The flight and trip values remain editable, focus returns to the trigger and no draft value appears in the URL, history state or storage. | PASS |
| NAV-04-A2 | Suite `settings-navigation.spec.ts` holds a key write on the deep link and signs out with the logout request still held. The old owner's masked identifier, key input and save message disappear before either response settles. Travel Karma verifies that a different owner cancels the held key write and clears the view and that session clearing cancels a held status read. | PASS |
| NAV-04-LIFE | Travel `flights.spec.js` holds a lookup in an existing trip, opens the connector editor and releases the response. The obsolete candidate cannot populate the resumed draft. Existing `drafts.spec.js` exercises ordinary connection save failure and retry, edit-during-save, key removal and session expiry. | PASS |
| NAV-04-VIEW | Suite and Travel at 390×844 touch/dark and 1280×800 keyboard/light, with reduced motion. The Settings index groups Account and security, Preferences and Connections. Real Game and Flight schedules links focus the new heading. Flight schedules reloads as a private document. The connector dialog focuses its heading and returns focus to the exact source control. Tested 44px links and correction controls and ran axe with contrast checks. Reviewed synthetic `connection-phone.png`, `connection-desktop.png`, `flight-settings-phone.png` and `flight-settings-desktop.png` from Playwright output. | PASS |
| Retained settings | Finance `account-settings.spec.ts` follows the real account export/recovery/sign-out paths. Existing Profile and calendar subscription suites exercise deep links, private disclosure and route lifecycle. Travel PTO and original `/travel/settings` remain in the native Travel suite. | PASS |

Each browser worker used its disposable SQLite database and synthetic identity. Lookup failures and held replies were controlled at the browser request boundary. The checks used synthetic keys.

## Deletion and compatibility

| Candidate | Previous consumers | Disposition and surviving owner | Proof |
| --- | --- | --- | --- |
| Viewport-dependent `SettingsHomeComponent` redirect | Bare `/settings` opened from the private user menu | Deleted the redirect and its empty component. The existing settings shell now owns the grouped index at both widths. | Suite keyboard/touch journeys assert the bare route, navigation and direct reload. |
| Flat list and repeated navigation steps to correct a FlightAware key | Settings index and Travel's failed lookup | Grouped the same section registry. The Travel settings form renders in the connector page, both former Travel routes and the in-place transport dialog. The dialog uses the mounted editor as the only draft owner. | Route parity checks include the new documents. Browser tests exercise both transport entry points and assert no draft persistence. |
| Premature consumption of the settings-heading focus attempt | Shell account navigation | Consume the shell toggle focus allowance only once the new heading is ready. | The focused browser reproduction failed before this fix and both Settings arrival tests passed after it. |

The comparison uses the final test SHA above and all changed owned apps and packages. Production has 287 added and 112 removed physical lines, with 37 additions and 37 removals attributable to whitespace-only moves. Tests add 226 and remove 4 lines, including one expanded test-session fixture. Guidance and behavior docs add 10 and remove 6 lines before this evidence file. This feature adds the grouped navigation, in-place presentation and request invalidation while retaining one Travel settings implementation, the existing connector endpoints, and one transport draft per mounted editor. The group registry and private document manifest carry the two new routes; the existing Travel API remains the key authority. No generated bundle or captures are committed.

## Verification

Local gates ran on the source SHA above or the identical working tree before commit. The unified browser rerun used the final browser test SHA above.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch NAV-04` and `python3 planning/implementation/plan.py validate --self-test` | PASS, packet resolution and planning fixtures |
| `make test-fast` with the installed project virtualenv on PATH | PASS, 135 Python and 21 Node checks, route discovery and boundary checks. The initial run with system Python failed because Alembic was absent. |
| `make lint-web` | PASS, four lint ratchets and engine purity |
| `make typecheck-web` | PASS, all seven TypeScript targets |
| `make lint-python` and `make typecheck-python` | PASS, formatting and lint/type baselines |
| `./scripts/coverage-gate.sh server` | PASS, 397 tests at 79.38% and the passive-history performance check |
| `./scripts/coverage-gate.sh travel` | PASS, 190 tests at 86.05% |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS, 49 tests |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs` on Node 24.22.3 | PASS, 16 tests. Node 20 cannot load the existing TypeScript module imports. |
| `make test-frontend` with installed Playwright Chromium in CHROME_BIN | PASS, 503 Finance, 9 Site and 417 Web Karma tests with coverage |
| `make build-frontends` | PASS, production bundle and release manifest. Build warnings for the bundle budget and existing unused imports remain. |
| `npx playwright test --project=suite --project=travel tests/e2e/settings-navigation.spec.ts apps/travel/e2e/flights.spec.js` | PASS, all nine cases after the arrival focus fix |
| `npx playwright test` | PASS, 722 passed (243 finance, 150 travel, 149 media, 121 town, 59 suite), five existing Finance skips. |

The unified browser command runs Finance, Travel, Media, Town and suite through their configured owners on the production bundle, including the NAV-04 Web and suite profiles. The first full run found an assertion expecting the old desktop redirect and a shared synthetic session revoked by the new sign-out test. The new assertion follows the grouped index and preserves the full lock verification. The sign-out test now controls the logout response inside its own browser context. No live provider activation or independent owner visual approval was run.

## Handoff

- The implementation PR closes only #389. The roadmap status and parent ledgers are reconciled by the integration owner from verified merged evidence.
- The in-place FlightAware form is scoped to the current transport instance. A full document reload ends its unsaved draft, guarded by the existing Travel navigation behavior.
