# STYLE-02 — Style shared buttons, fields, menus and dialogs

- Leaf #383; parent #304; roadmap #134.
- Agent: issue_383; branch `agent/style-02`; isolated worktree `/tmp/vivek-style-02`.
- Fresh main/base: `4cecdd9eaccef5960fa160d5bc3a1809b8a0f153`.
- Tested application and full-suite source: `a94ac9ca052e9e3167e71c66ac4bbc7230a65612`. Final test-source cleanup: `e7a5938beb165081f40f1940e7cc6551bbb7d2f2` removes repeated Travel viewport/theme setup; its full Travel suite is rerun. Other production/test sources are unchanged; later commits contain evidence only.
- STYLE-01 outcome verified on fresh origin/main: merged PR #494, named coastal day/night tokens and real consumer evidence present. Live #383 comments/open PRs had no competing claim before the issue claim.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| STYLE-02-A1 | Travel `crafted-controls.spec.js`: keyboard-submit the empty real trip form, focus its first invalid date, resolve the linked error, retain danger border on hover, correct dates/city and touch-save Kyoto with exact stored dates. Finance `crafted-controls.spec.ts`: keyboard-submit Add bill, retain its established multi-error summary, keyboard-follow Name to the first invalid control, correct and save the synthetic Harbor rent bill as exactly $12.50. | PASS |
| STYLE-02-A2 | Both new specs: real dialogs at 390×844 and 1280×800, light/night; Tab and Shift+Tab wrap, Escape closes Finance, Travel Escape opens its existing discard confirmation, nested Escape returns to the editor, and confirmed discard returns to Add. Normal slide and reduced motion both execute. Finance additionally returns to the same stable opener after its first successful save. | PASS |
| STYLE-02-LIFE | New Finance held-upsert browser test: automatic lock while Harbor bill save is held removes the private editor; release cannot reopen it or toast, unlock restores the original route, and a new editor has an empty private draft. Same-session failed saves preserve Name/Amount and retry writes exactly one bill. Shared Karma tests close editor/confirmation together, restore original scrolling/focus, and reject returning outside a newly opened dialog. Existing Finance/Web owner, lock and migration races and Travel session-expiry/draft suites also execute. | PASS |
| STYLE-02-VIEW | New real-consumer matrices inspect 44px controls, keyboard/touch correction, shared native fields, select, button, selected growth-preset hover, menus and phone sheets in both themes; axe includes contrast. Existing matrices cover 320px, 200% text, forced colors, reduced transparency, populated/empty/loading/error/locked sources and exact money/PTO dates. Review captures are synthetic HTML-report attachments. | PASS |

Authored visual review inspected Finance phone day/night error and retry sheets,
Travel phone night sheet/menu and desktop linked date errors. Brass overlay edges,
wood-tinted button depth, inset ivory/navy fields, teal focus and coral danger remain
legible. Overlay labels remain opaque during the short slide; reduce-motion removes
the slide. System colors remove material shadows. Independent owner art approval
and production activation remain separate and are not claimed.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Flat controls, compact 32/36/40px minima, weak borders and undefined `--shadow-md` menu shadow | Finance, Travel, shell, Media and public shared controls | Existing `packages/ui` component CSS, native `controls.css`, shared token file | Replaced assignments in place, deleted compact/mobile target exceptions, use 44px sizes and real overlay shadow. Menus still reuse button CSS. No new component facade or second stylesheet. |
| Duplicate phone dialog keyframes and opacity fade | All actual `ui-dialog` consumers | Existing shared dialog CSS | One full-opacity slide replaces both identical animations; reduced-motion and visual-viewport/scroll behavior survive. Axe exposed transient label contrast during the old fade. |
| Synchronous nested focus return and per-dialog previous-overflow snapshots | Editor plus discard confirmation | Existing shared dialog controller | Removed the unsafe paths; queue return after inert release, skip detached/outside-active-dialog targets, and reference-count each real scroll target. Two unit regressions and Travel nested browser journey retain the counterexamples. |
| Separate empty/populated Add bill/subscription action trees | Finance recurring hub | Existing header actions | Delete empty-state copies and the header condition. One stable real opener survives first save and retains focus; the domain editor/store is unchanged. |

- Classification: feature replacement with necessary focus/scroll safety repairs; no simplification claim, no files moved.
- Base-to-tested production: 110 added / 87 deleted physical lines (includes comments/blank lines), net +23. The positive delta supplies material tokens, visible focus and bounded shared scroll-lock/focus guards. Tests: 236 added / 2 deleted; package guidance: 3 added / 2 deleted; this evidence is documentation. Generated output/captures are excluded.
- Before/after: same component, native-control, theme, preference and domain-store owners; same public inputs/entry points and listener disposal. One bounded scroll-target map replaces per-dialog restore snapshots; entries disappear on final close/destroy. No new requests, domain state, calculations, crypto/AAD/record formats, routes or persistence owners.
- Old flat values, desktop compact target exceptions, undefined menu shadow, duplicate sheet keyframes and duplicate recurring Add branches are removed from this slice. No useful assertion or supported record/behavior was removed. The contrast test now asserts the increased compact target; all numerical contrast floors remain.
- A later frame edit still changes the existing UI owner, with real consumers inheriting it. Domain validation remains local. No uncoupled helper or permanent adapter was introduced.

## Verification

Node 24, the existing Python virtual environment and installed Chromium are used.
All gates retain their original coverage floors, assertions and retry policy.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS: documentation/planning/boundaries, 111 script Python tests, 21 script Node tests |
| `make lint-web` | PASS: ESLint baselines unchanged; engine-purity check |
| `make typecheck-web` | PASS: all seven TypeScript projects |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 503 tests and coverage gate |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 9 tests and coverage gate |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 405 tests and coverage gate |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 20 tests |
| `make build-frontends` | PASS: production bundle/manifest; 652.78kB initial bundle exceeds the 650kB warning level, below the unchanged error budget |
| `make e2e` | PASS: production build and 220 browser tests; five pre-existing viewport-specific skips, none added |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS: 95 browser tests |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS: 147 browser tests |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 browser tests |
| `npx playwright test --project=suite` | PASS: 50 browser tests |

Iteration failures were corrected before delivery: animation assertions now accept
Angular's generated keyframe prefix; fixtures use actual collapsed PTO labels,
clickable radio labels and preserved unlock routes. The new assertions exposed and
retained real first-bill and simultaneous nested-dialog focus/scroll failures.
An overlapping rebuild initially removed the served index during two browser
suites; builds are serialized before the final complete reruns. One Finance Karma
run stalled in existing IndexedDB cleanup; its fresh full rerun passed all 503
without changing tests/timeouts. No partial or failed run is substituted for a gate.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/495; closes only #383, references #304 and #134.
- Roadmap #134 scoped note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6953887113.
- Required local gates and acceptance journeys pass. The original issue and all acceptance/deletion rows and the complete published diff were critically reviewed for omissions, regressions, security, scope and coverage. Duplicate Travel fixture setup found in that review was removed; no production deficiency remains. The affected full Travel rerun passes all 147 tests. Exact-final-head CI must pass before recorded pre-merge vetting and merge.
- Next actor: same worker verifies final local/CI outcomes, records pre-merge vetting on the PR, merges under the user's authorization, verifies leaf closure and cleans only this worktree/branch.
