# DEL-06 — implementation evidence

- Leaf: [#358](https://github.com/Vivekpsps3/vivek-monorepo/issues/358); parent #200 remains open.
- Branch/worktree: `agent/deletion-sweep`, `/tmp/vivek-deletion-sweep`.
- Base main: `5bc07c2aab4345446f408d6e331cd1bef193f4d6`.
- Tested implementation: `4b6a2b6c7588913f5b40dac7c11ea050ef1d00aa`; offline Media fixture fix `ea5bad58c3998784dcbebb919e301d5387a1bd21`. Subsequent changes record scope/evidence only.
- Selection: explicit owner request for a broad deletion PR; no open PRs at claim or final main check.
- Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/358#issuecomment-6873610059
- Scope and acceptance: [packet](../issues/DEL-06.md). Existing queue order is unchanged; only this owner-selected leaf is appended.

## Acceptance

| Row | Proof | Result |
| --- | --- | --- |
| STYLE | Production captures at 390/1280 in light/dark across Home, holdings, Imports, recurring, Planning, Hub, new trip, PTO and public demo. Shared-menu tests compare both variants with the button under equivalent containing layout and check 44px targets. Four new public browser cases encrypt/decrypt through the actual controls and run axe. | PASS |
| DELETE | Consumer ledger below; all remaining dynamic variants and deep/projection scopes reviewed. No production file moved or minified; complete apps/packages closure is net −1,063 physical lines. | PASS |
| HISTORY | Completed remediation and superseded brief/reviews link to the immutable base snapshot. Active packets/evidence, technical-debt requirements and Living World scope remain. Doc links and 95-packet validation pass. | PASS |
| GATES | Fast, web lint/types, all three Karma coverage suites, Node utilities and production build pass. All canonical browser domains also exit 0; the aggregate is 630 passed and 8 existing Finance conditional skips. | PASS |

## Deletion and compatibility

| Candidate / old consumers | Surviving owner and disposition | Proof |
| --- | --- | --- |
| Global card/page-header copies in `packages/ui/kit.css` | Existing component styles already win Angular's scoped cascade. Delete global copies; keep directly used back-link utility and public navigation. | Responsive captures; existing shared/public/domain browser stories |
| Global button copy used by menu triggers and public demo | Menu loads the existing button stylesheet before its own menu rules; demo uses `UiButtonComponent`. Native shell controls remain in `controls.css`. One source per Angular control replaces global plus component definitions. | Two menu style/target tests and four real demo roundtrips; computed-style/pixel comparison |
| Legacy static shell, Hub header/theme controls and Travel navigation/chart selectors | Existing private shell, section navigation and PTO chart components remain. Remove absent class producers, not current controls or chart math. | Full template/source review and affected suite journeys |
| Finance parent result, chart drilldown and source-date selectors | Child Planning results/quick tools, category table and live portfolio templates retain their own scoped styles. Parent selectors cannot reach child-owned nodes under encapsulation. | Type/build and actual Finance rendered journeys |
| Unused Finance presentation remnants | Remove import-guide, old disclosure/guidance/summary and other selectors absent from their component templates/inline class producers. Grouped selectors retain live branches. | Reviewed actual diff, responsive captures and full Finance browser suite |
| Seven Finance exports with no import/template/test/config/public-barrel caller | Delete `transactionIncome`, `transactionSpending`, `liabilityReviewState`, `validatePlanningPaths`, `validateGrowthPercent`, `isRecordedDate`, `centsToStoredDollars` and newly unused imports. Live transaction-effects, review math and validators stay. | Whole tracked source symbol search, Finance Karma, lint/types and browser workflows |
| Completed remediation board/spec/evidence copies and four superseded brief/reviews | Remove checkout copies. Keep a short archive index with pinned Git provenance; repair planning index, quality and assessment links. | Doc-path gate; original content remains at base commit |

Protected counterexamples: dynamic button/badge variants, chart swatches, child result KPI variants, direct Travel/Media back links, shared native form controls, public navigation, parent deep selectors and Finance toolbar geometry remain. A first static pass missed the generated small-button override; production parity caught it and the complete original toolbar/phone rules were restored. No meaningful test assertion, migration, domain formula, ciphertext/AAD format or product feature is removed.

Legacy migration login/enrollment is retained: LoginComponent and backend fixtures still call it. Unified `schema.assert_ready` checks revision compatibility, not password-only account eligibility. The historical Finance preflight is insufficient retirement evidence; DEL-02 stays open. The MED-06 claimant's detail/media.css surface is unchanged.

No state/cache, record-store, provider or public API owner is added. A button appearance change now edits its existing stylesheet rather than a global copy as well. No production files are moved; generated bundles are not committed. Removed physical production lines comprise 940 nonblank/noncomment lines, 140 blanks and 4 comment lines; 21 lines are added for surviving selector branches and caller adoption. This is a CSS-heavy production deletion, not a claim of 1,063 removed TypeScript statements.

Physical full-PR accounting against the base (including this evidence):

| Category | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| Production | 21 | 1,084 | −1,063 |
| Tests | 50 | 3 | +47 |
| Planning/documentation | 216 | 10,362 | −10,146 |

Four historical screenshot binaries are removed separately and are not counted as text lines.

Production bundle on the same checkout/profile: global CSS 58.32 → 51.27 kB raw; initial total 637.34 → 633.09 kB raw, estimated transfer 169.99 → 169.33 kB. Scoped menu CSS increases its JS chunk; the total still falls. These are build observations, not a deployed-performance claim.

## Verification

Toolchain: Node v24.22.2 (`PATH=/tmp/node-v24/bin:$PATH`); Karma `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Dependency symlinks reuse installed packages and are uncommitted.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS: doc links, 95 packets/17 parents/40 TD owners, negative planner fixtures, boundaries, discovery, 98 Python script tests and 21 Node gate tests. Final complete-diff rerun also PASS, exit 0. |
| `make lint-web` | PASS: unchanged ratchets, Finance 469 / site 9 / packages 1 / World engine 0; engine purity test passes. |
| `make typecheck-web` | PASS: all seven canonical TypeScript projects. |
| `make test-frontend` | PASS: Finance 838, site 15, web/shared 716; all existing coverage floors pass unchanged. |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 139, no failures/skips. |
| `make build-frontends` | PASS: production bundle, public prerenders and release manifest. |
| Temporary production parity runner | PASS: 36 route/viewport/theme states. All control properties agree except the public button's expected internal flex blockification after adopting the shared host. All 36 screenshot dimensions agree; 30 are pixel-identical, six differ only in displayed clock minutes (38–39 pixels per image). Public demo images are pixel-identical. |
| `npx playwright test` | Assertions: 630 passed, 8 existing conditional skips, 0 failures, 3.8m. Command ended 143 after the pass summary; not counted as a clean gate. Superseded as gate evidence by the clean-exit canonical commands below. |
| `make e2e` | PASS, exit 0: rebuilt production/prerenders/manifest, Finance 250 passed / 8 existing conditional skips, 2.6m. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS, exit 0: 178 passed, 2.2m. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, exit 0: 93 passed, 45.8s, after the fixture correction described below. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS, exit 0: 79 passed, 1.9m. |
| `npx playwright test --project=suite` | PASS, exit 0: 30 passed, 39.6s, including all four new real encryption/decryption cases. |

Parity artifacts: `/tmp/deletion-baseline*`, `/tmp/deletion-final*`; runner `.local/deletion/playwright.config.ts` and `control-parity.spec.ts` are local verification artifacts, not production scaffolding. Decode comparisons use Playwright's existing PNG utility. Baseline is unchanged base source; final is the implementation tree. No real/private records or providers are involved.

Resolved attempts: first doc gate found one incoming historical review link, now pinned correctly; Node 20 could not import the existing TS utility tests, rerun under documented Node 24 passes; Karma initially lacked CHROME_BIN, configured installed Chromium passes. The full Media confirmation exposed a real TMDB poster response blocked by ORB; `clearArt` correctly removed it. The Popular fixture now serves the same local PNG as neighboring Media tests, preserving all URL-policy/request-count/Back assertions. The complete 93-case suite then passed with zero retries. The new menu test initially compared different flex containing contexts; its fixture now uses equivalent inline-block hosts and keeps all style/target assertions. An earlier broad browser run was intentionally interrupted to rebuild restored dynamic rules; it is not used as final evidence.

## Handoff

- PR: [#359](https://github.com/Vivekpsps3/vivek-monorepo/pull/359). Its live checks and merge result are authoritative.
- Scoped roadmap note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6873942721
- Activation: no deployment or external activation is claimed.
- Owner authorized opening and merging after review on 2026-11-14. Deployment is not claimed.
- Delivery rule: merge #359 only after required CI passes, closing #358 only; #200 and #214 remain open.
