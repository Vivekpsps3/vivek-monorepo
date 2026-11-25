# FIXUP-16 — workspace search query ownership

- Leaf [#604](https://github.com/Vivekpsps3/vivek-monorepo/issues/604). Parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole worker on `agent/fixup-16` in `/tmp/vivek-fixup-16`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/604#issuecomment-7171154477).
- Fresh main base `607fc213497d7d06a65c581723fad0811ad943de`. Verified the merged HUB-04 browser-local Finance search and NAV-02 safe search unlock return path on current main. Their registered merges `779f1679` and `8126d6ef` are ancestors. No competing claim or open PR at start.
- Tested source, tests and guidance at `209aaef1c1da92bc4a7d08f357e2b058a48e0d3a`. This evidence is the only follow-up in the implementation PR.

## Acceptance

| Row | Executed proof and result | Artifact or check |
| --- | --- | --- |
| FIXUP-16-A1 baseline | Chromium on the base production bundle showed a stale Portland option and active descendant while the field contained Dune. Real touches at 320 and 390px and Enter at 1280px opened `/travel/trips/1`. Base and the audited `bb300824` have identical Search source. | Four baseline cases, including A2 below. Output `/tmp/fixup-16-audit.log`, captures `/tmp/fixup-16-reviewed/before-stale-*.png`. |
| FIXUP-16-A1 current | At 390×844 and 1280×800, light and night with reduced motion, replace Portland with a held request, then type Harbor. During debounce, Enter and a phone touch at the retired row position stay on Hub. The old option and active descendant disappear and the new query stays visible. Deliver the older response after Harbor renders. Desktop arrows highlight the correct visible option and preserve input focus. Enter or phone touch opens the exact seeded Harbor Crossing trip and stores only its recent id fields. | `tests/e2e/search.spec.ts` query ownership matrix. Local capture `after-query-change-390-light.png`. Component regression also rejects direct activation of a retired option object. |
| FIXUP-16-A2 baseline | A synthetic Travel/Media 503 showed a general search error and hid Harbor Checking, even though the unlocked Finance account was already loaded locally. | `before-partial-failure.png`. |
| FIXUP-16-A2 current | In the same four views, Harbor Checking remains selectable while Travel and Media fail and during their held retry. The named retry accepts touch or keyboard, returns focus to the combobox, and restores the exact Travel match with Finance still available. No amounts appear. At 320px with a 32px root font, the retry and Finance name stay in view within the dialog width. | `tests/e2e/search.spec.ts` partial-failure matrix. Inspect `after-finance-retry-390-dark.png`, `after-finance-retry-1280-light.png` and `after-finance-retry-320-200.png` in `/tmp/fixup-16-reviewed`. |
| FIXUP-16-A2 lifecycle | A second same-owner tab uses Settings to lock the vault during a held search. The owner tab clears the private match and active descendant, and a late reply adds no old rows. Real Sign out from the second tab aborts the owner tab's held request and clears Search on arrival at Sign in. Component tests hold Finance through lock, sign-out and HTTP 401, and verify only the subsequent authenticated owner can resume an expired search. | Browser matrix plus Search Karma cases. |
| Existing journeys | One-character input stays below the search threshold. The 150 ms debounce, eight-second server deadline, no-store response, id-only recents, local-only Finance names, provider isolation, Travel/Media routes, and sanitized Finance unlock return link all pass. | Existing production browser and Karma cases. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner and disposition |
| --- | --- | --- |
| Stale selectable options during debounce and index-based selection across updates | Search combobox, touch and mouse rows | The existing dialog invalidates the old query immediately and gates every publish on its generation. Keyboard order follows rendered groups. Selection uses the visible option key, and activation accepts only a current option object. |
| Combined query publication and failure-wide clearing | Travel/Media and local Finance in Search | The dialog publishes each source separately. Remote retry updates only Travel/Media. Session expiry, sign-out, and owner changes clear both. The existing local Finance facade and server endpoint retain their domain rules. |
| Repeated abort and timer cleanup | Query changes, lock, session clear, close and destroy | One cancellation path invalidates both asynchronous sources. The same dialog reset clears its query, options and focus selection on session changes and close. |

Compared with `607fc213`, production adds 126 and removes 88 lines across the Search component, template and styles. The 38-line net addition covers immediate invalidation, independent source publication and stable focus. Tests add 276 and remove six lines. Web guidance replaces four lines. The dialog and its option projection remain the only UI owner. No new persistent store, endpoint, facade or app route is introduced. A future Search result type still changes its existing source owner and result rendering. The retained tests cover real expiration, entry/return, recents, deadlines, touch, keyboard and privacy behavior.

## Verification

| Command | Result |
| --- | --- |
| `PATH="/tmp/node-v24-linux-x64/bin:$PWD/.venv/bin:$PATH" make test-fast` | PASS. Planning structure and fixture checks, 135 Python tests, 21 Node tests. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint findings match their baselines. All seven TypeScript projects compile. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 719 tests and 77.8% statement coverage. |
| `make build-frontends` | PASS. Production bundle and release manifest. Initial bundle is 730.51 kB against the existing 650 kB warning threshold. |
| `npx playwright test --project=suite tests/e2e/search.spec.ts --workers=1` | PASS. 10 Search browser tests. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 242 Town, Health, Pixels and World browser tests. |
| `npx playwright test --project=suite` | PASS. 69 cross-app browser tests. |

Node 24.11.0, the linked project venv and installed Chromium ran these gates. Early iterations caught missed imperative combobox ARIA synchronization during reactive updates. The final browser checks use the real second-tab Settings route, and resume the temporary clock after checking the debounce window so Angular can render the network response. The final matrix retains its exact option, focus, route and cancellation assertions. The first full Town run passed 241 cases and failed one Furniture Catalog arrival after Chromium logged `ERR_NETWORK_CHANGED` on six localhost bundle chunks. The unchanged full rerun passed all 242 cases before the suite passed.

## Handoff

The implementation PR closes only #604 after all required checks. The [roadmap](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) carries the verified merge note. Local screenshot review and user visual feedback are separate. Production activation requires its own evidence.
