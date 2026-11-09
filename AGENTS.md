# Agent handoff

Keep each app's data and behavior in its own folder. Before editing a subtree,
read its applicable `AGENTS.md`, including when your session started at the root.
Use the map below to find the owner; read linked detail only when the task needs it.

| Work | Start here |
| --- | --- |
| Encrypted Finance, accounting, import | [Finance](apps/finance/AGENTS.md) |
| Trips and PTO | [Travel](apps/travel/AGENTS.md) |
| Media catalog and journal | [Media](apps/media/AGENTS.md) |
| Shell, Hub, search, Town, World, Pixels | [Web](apps/web/AGENTS.md) |
| Identity, database, server composition | [Server](apps/server/AGENTS.md) |
| Public pages | [Site](apps/site/AGENTS.md) |
| Reusable UI and browser utilities | [Packages](packages/AGENTS.md) |
| Build, quality, migration and operations scripts | [Scripts](scripts/AGENTS.md) |

## Keep changes cheap

Prefer an existing owner and a direct call. Add a shared abstraction for actual
repeated behavior, migrate its consumers, and delete the old copies in the same PR.
Keep domain rules local. Do not claim moving code, removing tests or compressing
formatting as simplification. Safety fixes may add necessary code; report that honestly.

Update applicable guidance in the same PR when an owner, command or invariant
changes. Keep root instructions under 650 words and each nested file under 300;
replace stale text instead of appending history. Full maintenance rules and research
sources are in [Agent guidance](docs/AGENT_GUIDANCE.md).

## Roadmap implementation

For a roadmap issue, read [planning/AGENTS.md](planning/AGENTS.md), the active
[implementation queue](planning/implementation/README.md), and that issue's exact
work packet before editing application files. Those instructions apply by this
reference even when the changed files are outside `planning/`. Dated reviews and
completed project records are supporting evidence, not an executable backlog.

## Before a pull request

Run the tests that cover the change on this machine, and open the pull request only after they pass. CI is the second run, not the first. Leave a failing test failing until the code or the assertion is actually fixed. Do not skip a suite or lower a gate to get the pull request open.

From the repo root, these are the commands CI runs. Run every one that touches the files you changed:

- `make test-fast` — doc paths, blame revisions, shared boundaries, and script tests
- `make lint-python` and `make typecheck-python` — Ruff format, Ruff, suppressions, and mypy
- `./scripts/coverage-gate.sh finance` and `./scripts/coverage-gate.sh server` — Finance and site server
- `./scripts/coverage-gate.sh travel` and `node --test apps/travel/backend/static/tests/*.test.mjs` — Travel
- `./scripts/coverage-gate.sh media` and `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` — Media
- `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` — Finance Karma
- `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` — public site Karma
- `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` — root shell/shared UI Karma
- `make e2e` — Finance Playwright, after the root production bundle
- `npx playwright test --config apps/media/e2e/playwright.config.ts` — Media Playwright
- `npx playwright test --config apps/web/e2e/playwright.config.ts` — Town Playwright, including Pixels
- `npx playwright test` in `apps/travel/e2e` — Travel Playwright

`make test` runs the fast checks, all four Python coverage gates, and all three Karma suites. Run the Playwright command for any screen those suites open. Gates and floors are in [Quality gates](docs/QUALITY.md).
