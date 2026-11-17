# STYLE-01 — Apply the coastal palette, typography and day/night tokens

- Leaf: #382; parent scope: #304; roadmap: #134.
- Agent: autonomous issue worker; branch `agent/style-01`; isolated worktree `/tmp/vivek-style-01`.
- Fresh main/base: `b2bbf722c5164cb0ab6c23f413273782f4da026a`.
- Tested implementation: `1d5e88b3ebbb62699e684e211f118c1b99266ae5` (subsequent evidence-only commits do not change application/test source).
- No dependencies. Fresh GitHub issue/comments and open-PR checks found no competing claims or PRs before implementation. The planning amendment #493 is on main.

## Acceptance

| Row | Concrete executed proof | Result |
| --- | --- | --- |
| STYLE-01-A1 | `coastal-theme.spec.ts`: actual Settings → Appearance keyboard selection and Back twice preserve populated Hub and Finance. Synthetic Harbor savings stays $1,234.56; Harbor tour/Kyoto and Coastal stories remain visible. Both themes, 320×844, 390×844 and 1280×800. Record snapshots remain identical; tabular numbers and named shell material paint asserted. | PASS |
| STYLE-01-A2 | Same browser spec: forced colors and 200% root text size, both themes, real Hub and Finance, keyboard menu open/Escape/focus return, 44px trigger and no page overflow. Filled-link idle/hover paint must match ButtonText/ButtonFace, preventing invisible text backplates; axe also runs on both screens. | PASS |
| STYLE-01-LIFE | Existing web Karma `hub.component.spec.ts` executes held previous-owner summaries, retry failure/sign-out, and in-flight Finance responses released after lock; `fin-05-races.spec.ts` executes held legacy rewrite across lock and subsequent unlock. No state, request, persistence or lifecycle code changed. | PASS |
| STYLE-01-VIEW | Actual theme selection, keyboard return and touch navigation, reduced motion, contrast token floors and axe at the stated dimensions; synthetic captures in the Finance HTML report and `/tmp/style-01-review`. Full browser matrices retain empty/loading/locked/error, source retry and existing Finance value semantics. | PASS |

Authored visual review inspected Hub phone/desktop in both themes and Finance at
200% text. Ivory/navy surfaces, sea-glass links, brass shell/Finance accents, coral
selection and wood card edges remain legible. System body typography is unchanged;
serif display typography is confined to large Hub readouts. No texture obscures
labels. Independent owner art approval and production activation are **not claimed**.
Town/Pixels are intentionally unavailable in this narrow Finance-backed synthetic
capture; the full web suite separately exercises populated and empty sources.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Warm-paper/warm-ink role values in `tokens.css` at the base | Real shared controls and suite/app CSS | Same token file and unchanged semantic names, now backed by six named coastal colors | Replaced the old assignments in place; no second theme stylesheet or compatibility adapter. Existing light/dark/system preference, app keys and OS listeners remain untouched. |
| Teal shell selection and generic Hub top edge/readout | Private shell and real Hub cards | Existing component CSS | Coral current destination, material card edges and tabular display text replace those presentation values in their original owners. No copied component, route or data store. |
| `--accent` used for both link text and inverse-label fills | Shared button/native/segmented controls, Finance calendar/Home, suite skip link and Hub completion marker | Same token file: `--accent` foreground; `--accent-fill`/`--accent-fill-hover` plus `--on-accent` for fills | Migrated these real consumers together; normal paint aliases the same palette. Forced colors pairs ButtonFace/ButtonText and keeps LinkText for links. No duplicated per-control forced-color fallback. |
| Palette-specific RGB/hex assertions | Finance, Media, Travel, skeleton and contrast suites | Existing tests | Updated expected paint only; all contrast floors, map pixel-distance guards, focus, owner, data and save assertions remain. |

- Classification: feature replacement, not a simplification claim. No files moved.
- Production: 123 added / 63 deleted physical lines across the token file and existing shell, Hub, shared-control and Finance styles (includes comments/blank lines); net +60 for named palette roles, forced-color fallback and material accents. Tests: 158 added / 27 deleted; frontend documentation: 13 added / 10 deleted.
- Before/after: one theme token owner, one preference owner, unchanged public token entry points, zero new state/cache/listener/disposal owners.
- Old token assignments were removed from the selected stylesheet. Separate World renderer art constants and chart fallbacks remain outside this token-consumer slice; no live consumer was routed to a duplicated palette.
- A later palette edit still changes `packages/ui/tokens.css`; app-specific composition remains in the shell/Hub owners. Domain rules, encrypted formats, keys/AAD, records, supported routes and useful regression assertions are unchanged.

## Verification

Final results below apply to the tested implementation. Commands use Node 24 from
`/tmp/node-v24-linux-x64/bin`, the existing `.venv`, and installed Chromium via
`CHROME_BIN` for Karma. Local dependency symlinks and synthetic captures are not
committed. No gate or baseline was lowered. The final implementation revision
above includes the full foreground/filled-paint consumer migration; earlier
iteration results are not substituted for these final command results.

| Command | Final result |
| --- | --- |
| `make test-fast` | PASS: planning/doc/boundary checks, 111 Python script tests and 21 Node script tests |
| `make lint-web` | PASS: unchanged ESLint allowances and engine purity test |
| `make typecheck-web` | PASS: all seven app/package TypeScript projects |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 503 tests and coverage gate |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 9 tests and coverage gate |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 403 tests and coverage gate |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 20 tests; existing numeric contrast floors retained |
| `make build-frontends` | PASS: production build and release manifest; 651.45kB initial bundle exceeds the 650kB warning level but remains below its configured error budget |
| `make e2e` | PASS: production build, 213 browser tests; five pre-existing viewport-specific skips, none added |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS: 95 browser tests |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS: 143 browser tests; original map pixel and ≥3:1 contrast guards pass |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 browser tests |
| `npx playwright test --project=suite` | PASS: 50 browser tests |

Initial runs exposed stale old-palette assertions, a cross-owner test-fixture
import (replaced with an app-owned synthetic fixture), default Node 20/Python
runtime mismatches, and the navy map-surface distinction. Visual review also caught a filled-link
label backplate invisible under forced colors despite green axe results; matched
system paints and a direct idle/hover assertion correct it. The enlarged-text
keyboard test now waits for the actual arrived-heading focus. These were genuinely
corrected before final reruns. Two first-pass Media page-load failures did not
recur after the production rebuild was complete. No failed check is treated as a
pass, and no PR is opened with a required local gate pending.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/494; closes only #382.
- Roadmap #134 scoped note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6942287495.
- All required local gates pass. The original issue and complete published diff were re-reviewed for acceptance, missing behavior, regressions, security, unrelated changes and adequate coverage; no unresolved code findings remain. CI is the remaining merge condition. Actual CI/merge/closure outcomes are authoritative on the linked PR and leaf timeline.
- Next actor: same issue worker verifies successful CI on the exact PR head, records pre-merge vetting, then uses the user's explicit merge/closure authorization and removes only its own worktree/branches.
- Owner visual approval and deployed activation remain distinct from these code/test results.
