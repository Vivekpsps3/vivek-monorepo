# World revamp — issue 374 delivery evidence

- Owner-requested standalone delivery: [#374](https://github.com/Vivekpsps3/vivek-monorepo/issues/374).
- Related scope remains open in [Living World #304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [PLACE-03 #307](https://github.com/Vivekpsps3/vivek-monorepo/issues/307) and [PLACE-06 #310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310).
- Branch/worktree: `feat/world-revamp`, `/tmp/vivek-world-revamp`.
- Base main: `8ed694a851abaa156c9c02397210b8b945ca247c`.
- Tested implementation: `d12ec3e281760110fabfb57b074ac3507cc37937`, 2026-11-16. Later evidence-only commits do not change the tested application.
- Fresh GitHub inspection found no open competing PRs or claims. The original checkout and its uncommitted changes were preserved; the change was applied to a separate worktree on current main.

## Acceptance

| Requirement | Executed proof | Result |
| --- | --- | --- |
| Readable scene and equivalent dated journal | Full web browser suite; map/inspector reflow at 320/390/1280px, light/dark, reduced motion | PASS |
| Object inspection, overlap choice, source/date/focus agreement | Shared renderer bounds unit vectors; actual mouse picking/dragging, pointer cancellation and keyboard source inspection | PASS |
| Exact day, legacy week, bounded history and browser navigation | Older civil-date visit, capped 26-week page assertions, reload and Back/Forward; dated Pixels link | PASS |
| Quiet terrain, future horizon, optional activity overlay and explicit failures | State fixture browser regression and visible source/error assertions | PASS |
| Learning, repeated media and private lifecycle | Real concept save/rename/undo and reload; zero World refetch for rename; dated media identity vectors; controller cancellation/deadline and session disposal tests | PASS |
| Deterministic generation and existing app journeys | Engine/golden vectors in the web Karma suite; engine purity; full Town/Pixels/Hub/World browser suite | PASS |

The browser matrix runs Axe against `app-world` without excluding accessibility rules. It writes synthetic scene/inspector screenshots to each test's output directory. These are implementation review artifacts, not owner visual approval or production activation proof. Tests are owned by [World browser regressions](../../../apps/web/e2e/world.spec.ts) and the existing World unit suites.

## Deletion and compatibility

This is feature and safety work, not a simplification claim. Across the complete implementation diff against the base: production **+879/-417 lines (net +462)**; tests **+300/-9**; guidance **+8**. This evidence document is additional documentation. Counts are physical lines including formatting/comments, not a claim that all removed lines were independent behavior.

- Removed the concept-only horizontal picking path; both paint and object selection now use `sceneObjects` bounds in the existing renderer.
- Replaced camera-center-only reading and week-only URL publication with a selected civil date, object inspector and settled history publication. The plain controller, engine, camera calculations and bounded bitmap cache remain the owners.
- Removed unused programmatic camera interpolation state after visits adopted immediate dated positioning. Pointer inertia and reduced-motion handling remain.
- Replaced the obscuring fog veil with optional recorded-ground markers. The existing lit/fog calculation and user preference remain; turning the overlay off does not remove objects.
- Preserved legacy week links, the full dated list, concept sheet, real source editors, deterministic engine version/vectors, Finance-only chest aggregates and lock/owner guards. No schema, new service/store, dependency, generated asset or migration was introduced.

## Local verification

All commands below passed against the tested implementation in the isolated worktree before PR creation:

| Command | Result |
| --- | --- |
| `npm run build` | PASS; production bundle generated |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS; 377 tests and the existing coverage gate |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS; 109 executed tests |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS; repository documentation, boundaries and script gates |
| `make lint-web` | PASS; existing allowances unchanged and engine purity passes |
| `make typecheck-web` | PASS; all frontend TypeScript projects |
| `npx eslint apps/web/src/app/world apps/web/e2e/world.spec.ts` | PASS; zero findings in changed World code |
| `node --test scripts/engine-purity.test.mjs` | PASS |
| `git diff --check` | PASS |

No required suite was skipped, no retries or gate reductions were added, and no earlier failed assertion was relabelled as a pass. Initial environment failures were resolved by using the installed virtualenv and Chromium. The scoped delivery changes only web application/tests/guidance plus this evidence; Python application code is unchanged.

## Handoff

The [delivery issue timeline](https://github.com/Vivekpsps3/vivek-monorepo/issues/374) is the durable PR/merge reference. User authorization explicitly includes merging. The PR closes only #374. No broader roadmap leaf or parent is declared complete: dated source-contract expansion, Year/Life span/context return, the composed Town garden/feedback loop, owner visual acceptance and integrated release proof retain their existing owners.
