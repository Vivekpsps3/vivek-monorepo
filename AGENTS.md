# Agent handoff

Finance, Travel, and Media live in this repo. Keep each app's data and behavior in its own folder.

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
- `npx playwright test` in `apps/travel/e2e` — Travel Playwright

`make test` runs the fast checks, all four Python coverage gates, and all three Karma suites. Run the Playwright command for any screen those suites open. Gates and floors are in [Quality gates](docs/QUALITY.md).
