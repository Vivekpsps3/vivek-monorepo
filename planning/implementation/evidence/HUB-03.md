# HUB-03 — implementation evidence

- Leaf [#245](https://github.com/Vivekpsps3/vivek-monorepo/issues/245); parent [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) remains open.
- Codex, branch `agent/hub-03`, isolated worktree `/tmp/vivek-hub-03`.
- Base main `d96c34508ce49ecadfc73c3caa6242b04c091976`. Tested implementation tree: `fa3de9a4b02b92332bc455b825fa7ec0f24232eb`; subsequent commits update this evidence only.
- Live leaf/comments, parent, packet, prerequisite evidence, current main and open PRs were read. HUB-02 is merged in #369 (`3d02609`), CON-02 in #367 (`ad806f3`); their shared read model and route-parity outcomes are present. No competing claim or open PR; main was fetched again before delivery and remained at the base.
- [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/245#issuecomment-6891207418).

## Acceptance

| Row | Executed behavior proof | Result |
| --- | --- | --- |
| AGENDA1 | Travel's `test_agenda_window_history_overlap_bounds_and_owner` compares compact/window events and next-trip fields, includes completed-trip start dates, omits undated/done reminders, rejects missing/reversed/invalid/overlong bounds, accepts 42 days, and switches owner. Existing summary defaults remain covered. | PASS |
| AGENDA1 | `up-next.spec.ts` uses the existing projection for a monthly window and retains a watched episode's release date, omitting unsupported follow-ups and out-of-window dates. No watch/completion timestamps are inferred. The agenda states the historical limitation. | PASS |
| AGENDA1 | `hub-up-next.spec.ts` opens the agenda from Hub, uses the mini-month by keyboard to focus its date heading, changes source/month, navigates back/forward and reloads. Date/source URLs survive. The compact/agenda view reuses the Media summary and already-loaded month; filters perform no source reads. Axe passes. | PASS |
| AGENDA2 | Cross-app `bundle-0.spec.ts` uses the existing encrypted synthetic vault with a private subscription marker. Only a local integer bill count appears. A Media 503 leaves Travel usable, source retry leaves Travel at one request, navigation drops a held old-window response, and a validated owner lock clears the count. Private name/amount/ID markers are absent from source request URLs/bodies and the browser URL. | PASS (final suite: 31 tests) |
| Drive-by | A long unbroken show title and note are rendered at 390/1280; every note/title box remains inside the Media card and has no internal text overflow. Notes stack below the title; other titles can shrink and wrap. | PASS |
| Lifecycle | A focused shell regression reproduces a heading-focus callback warning after destruction. The same test passes after cancelling the timer and invalidating the attempt on destruction/new navigation. The existing authentication no-warning and no-passphrase-log assertions are retained. | PASS |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner / disposition | Proof |
| --- | --- | --- | --- |
| Separate Timeline/agenda loader, store and projection | None on this base | No obsolete store existed, so none is claimed deleted. `/hub/agenda` is a componentless child of the existing Hub route; the same Hub instance, source state and `upNextRows` serve both views. Existing loading call sites are extended in place. | Route/browser request counts, history and held-response tests |
| Duplicate summary/month reads when expanding the Hub | Compact source loader | One Media source load reuses its decoded summary and available whole-month snapshot. Each selected source response feeds both views; navigation aborts obsolete loads. Explicit retry/episode changes refresh the source. | Shared-month counts and existing episode refresh/independent retry tests |
| Recent note's non-shrinking flex cell | Media card | Replaced by a stacked, wrapping note row. Long title links also shrink/wrap. | Real browser geometry regression |
| Repeated low-level presentation, copy, ordinary projection/CRUD and generated path-ID matrix cases | Unit/backend/Node suites | Removed selected cases and unused imports/fixtures. Every mounted integer path parameter still gets an overflow-versus-unknown check, with additional malformed grammar classes sampled per domain; the direct bound/empty-segment counterexample remains. | Full remaining gates; count table below |
| Theme-independent functional browser repetitions | Finance/Travel journeys | Removed repeated theme/viewport executions. Responsive Activity/navigation/reminder branches retain both widths. Dedicated screenshot/accessibility matrices remain. No new skip, retry or discovery exclusion. | Remaining complete browser suites |
| Heading-focus callbacks after the shell lifetime | Private layout | One tracked timer, cancelled on new attempt/destruction; destroyed attempts cannot touch another screen. | Focused regression fails before and passes after |

This is a **feature and safety repair**, not a negative-production-LOC simplification. There is one Hub source state owner and one dated event projection before/after; the expanded view adds no event store, server Finance aggregation, provider read, schema change or background polling. The Hub fixture helper is moved into its existing app test owner and has two actual consumers (Hub and cross-app suite); that move is not a deletion saving. Full closure against the base: production **+187 / −34 = +153 physical lines** across 14 files; tests **+588 / −20,466 = −19,878** across 204 files (including the moved fixture); gate configuration +2/−2; quality baselines +12/−18; documentation is separate. Production includes lexical blank-only +10/−0 and comment-prefix +2/−0 lines; this is not an AST metric or a claim of formatting savings. No production file is moved. The positive production delta supplies the monthly controls/URL state, bounded API parameters, reusable month metadata, note wrapping and necessary focus-lifetime guard. Follow-up date changes still belong to Travel's summary, the saved Media calendar and the single Hub projection/view, not another agenda policy owner.

The owner explicitly requested repository-wide test reduction, targeting roughly half as many cases and accepting lower coverage. This overrides the usual instruction to preserve existing coverage floors for this scoped change. Removed tests are not claimed as production simplification or as lossless equivalent coverage: fine-grained presentation, arithmetic/projection and API diagnostics are reduced. Authentication/encryption, recovery, ownership, concurrency, authoritative time and representative user journeys remain in the retained suites. The full diff is the per-case removal ledger; all surviving assertions remain enforced.

| Canonical suite inventory | Base cases | Revised cases |
| --- | ---: | ---: |
| Finance / Travel / Media / Server pytest, excluding separate perf | 171 / 225 / 208 / 919 | 139 / 190 / 91 / 356 |
| Finance / Site / Web Karma | 872 / 15 / 756 | 493 / 9 / 370 |
| Domain/shared Node models | 140 | 103 |
| All five Playwright projects, including pre-existing conditional cases | 670 | 569 |
| Fast Python / Node checks | 111 / 21 | 111 / 21 |

Core unit/backend cases: **3,166 → 1,648 (48% fewer)**. Across this default verification inventory: **4,108 → 2,452 (40% fewer)**, rather than an exact repository-wide halving. The unchanged separate performance case and standalone non-default tests are outside this inventory. Visual/accessibility and sensitive-state journeys account for much of the retained browser set. Counts are expanded cases, not a count of files or compressed declarations. Backend inventories were collected on unchanged main and this worktree; browser inventories use Playwright collection; Karma counts come from execution (Site's base has 15 literal cases).

Coverage remains enabled. Authorized floor changes: Finance Python **83.28 → 81.03**, Media Python **70.60 → 68.70**, Finance Karma branches **52 → 48.3**. Each new floor is one point below the new measurement. Other floors, source denominators, discovery, performance limits and retry policies remain. Lint/mypy baselines only shrink; no allowance increase was used.

## Verification

Node 24 from `/tmp/node24/bin`; repository venv Python 3.12; Chromium 156 from `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `PATH`, `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` select those existing installations. Python coverage files are isolated per suite under `/tmp/hub03-*.coverage`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS: 111 Python, 21 Node, documentation/planning/blame/boundary/discovery checks; final evidence/doc check passes before PR |
| `make lint-python` / `make typecheck-python` | PASS: Ruff format, Ruff/suppression/mypy ratchets |
| `make lint-web` / `make typecheck-web` | PASS: four ESLint ratchets, engine-purity check, seven TypeScript projects |
| `./scripts/coverage-gate.sh finance` | PASS: 139, 82.03%, floor 81.03% |
| `./scripts/coverage-gate.sh travel` | PASS: 190, 86.05%, floor 80.41% |
| `./scripts/coverage-gate.sh media` | PASS: 91, 69.70%, floor 68.70% |
| `./scripts/coverage-gate.sh server` | PASS: 356, 74.05%, floor 61.53%; separate perf case passes |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs` | PASS: 103, no skips |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 493; statements 62.55%, branches 49.30%, functions 57.80%, lines 65.78% |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 9; statements 85.21%, branches 52.94%, functions 79.16%, lines 87.37% |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 370; statements 72.31%, branches 56.73%, functions 71.90%, lines 76.83% |
| `make build-frontends` | PASS; stable committed production bundle built by `make e2e` before any other browser run |
| `make e2e` | PASS: 198, 5 existing conditional skips, zero retries |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS: 95, zero retries |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS: 143, zero retries |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 97, zero retries |
| `npx playwright test --project=suite` | PASS: 31, zero retries |

Failures were not removed or relabeled as passes. Corrected assertions include the new Explore agenda link and calendar snapshot month metadata. Browser checks exposed and fixed incorrect relative filter navigation and missing month-button content. The new vault test initially sent an invalid lock message; its fixture now follows the existing version/owner/kind contract. Import checks moved that cross-app test into the existing cross-app suite, without widening boundaries. Empty suites and unused test fixtures/imports were deleted, and only shrinking quality baselines were updated.

The shell teardown regression fails on the original code and passes with timer cancellation. A retained authentication test caught an unrelated late warning; its exact no-warning assertion now provides diagnostic context and still rejects passphrase logging. Earlier overlapping browser runs were discarded: one run's cleanup removed another's trace files, and building while another run loaded the bundle produced five missing-chunk 404s and a blank Travel page. These are evidenced in local logs/traces; final verification builds first and does not overlap the same project/output directory. No assertion, timeout or retry was weakened to hide them.

Logs and synthetic browser artifacts remain local under `/tmp/hub03-*`, `test-results/` and `playwright-report/`; no private data or generated bundles are committed.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/371, closes only #245 and references #93.
- Leaf status note: https://github.com/Vivekpsps3/vivek-monorepo/issues/245#issuecomment-6891691618.
- Roadmap #134 scoped append-only note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6891691842.
- State: implementation complete, PR open; all required local gates passed on the committed implementation tree. CI was running at handoff. No merge or deployment authorization is inferred.
- External prerequisites: none for this leaf.
- Next actor: CI and reviewer. No implementation work remains for this leaf; merge/deployment requires owner authorization.
