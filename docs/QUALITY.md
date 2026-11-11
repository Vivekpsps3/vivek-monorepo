# Quality gates

`make test` runs the fast checks, the four Python coverage gates, and all three Karma suites. Lint and type checking are separate so a formatting or type failure is not hidden inside the test log.

```bash
make lint          # Ruff format check, Ruff, ESLint, and inline suppressions
make typecheck     # mypy and tsc --noEmit
make e2e           # root production bundle, then Finance Playwright
make lint-baseline # rewrite quality/*.txt after a finding count shrinks
make coverage-pin  # rewrite quality/coverage.txt from a fresh measurement
```

Dev tools are locked in `requirements-dev.txt` (hashed; compiled from `requirements-dev.in`). `make install` installs that lock with `--require-hashes`. The production image installs only `apps/server/requirements.lock`. The image-building CI job does not install the dev lock. `pip-audit` is in the dev lock and runs in the Backend job, against `apps/server/requirements.lock`.

## Test readability and parametrization

These review rules apply to Python, Node, Angular, browser and script tests.
Parametrize variations of the same behavior with the same setup and assertions.
Keep distinct workflows or failure contracts as separate tests. Prefer the form
that makes a failing scenario obvious to a reader.

- Give each independently meaningful case its own test result. Use pytest
  parametrization or generate named `it`/`test` cases outside the test body.
  A small loop inside a test is fine for checking a collection invariant or steps
  in one deliberate journey; add case context when a failure would be ambiguous.
- Use readable case IDs. Simple pytest scalar IDs are often sufficient; use
  `pytest.param(..., id="...")` for ambiguous values, complex fixtures or boundaries.
  Browser test names should identify the scenario, viewport and theme when varied.
- Prefer named case objects for wide tables. Short input/expected pairs can stay
  tuples; five positional columns or boolean switches usually obscure intent.
- Keep case data declarative. Split a test whose parameters select unrelated
  branches, different assertions or different setup lifecycles. Avoid a generic
  scenario interpreter with callback fields for every test phase.
- Keep expected outcomes independent of the production calculation under test.
  Literal golden vectors and a small, explained independent oracle are useful;
  recomputing the same algorithm in a fixture can repeat the same defect.
- Allocate fresh mutable objects and reset state for independent cases. Pytest
  passes parameter objects without copying them. A viewport/theme matrix should
  not inherit records or drafts changed by a previous matrix cell.
- Use a Cartesian product only when each combination proves an invariant or a
  required acceptance dimension. State its purpose; prune redundant work only
  after preserving all required coverage.
- Share setup through small domain fixtures. Keep triggers and essential
  assertions visible. Avoid importing helpers from another test module when a
  stable fixture module or local helper makes ownership clearer.
- Name fixture defaults and override only the relevant facts. Avoid broad type
  casts that let invalid fixtures silently become valid domain records.
- Synchronize races with observable gates/deferred results or supported fake
  clocks. Replace fixed sleeps and arbitrary microtask iteration budgets when
  they make success depend on machine timing.
- Keep meaningful behavior assertions and test discovery intact during cleanup.
  Record old-to-surviving cases; test-count reduction is not itself a quality gain.
- Review tests as maintained code: a reader should understand the input, action,
  expected observation and failure case without tracing a custom framework.

Pytest documents [parameter values and mutation](https://docs.pytest.org/en/stable/how-to/parametrize.html)
and [case IDs](https://docs.pytest.org/en/stable/example/parametrize.html).
Playwright documents [named parameterized cases](https://playwright.dev/docs/test-parameterize)
and [isolated, user-visible behavior tests](https://playwright.dev/docs/best-practices).

## Ratchet

`scripts/quality_ratchet.py` records `path<TAB>rule<TAB>count` in `quality/`. CI fails when a live count rises, and when a recorded count is higher than the current one. A fix has to drop the baseline entry (`make lint-baseline`) instead of leaving a stale allowance.

`update` refuses a higher count unless `--allow-increase` is passed. On a pull request, CI compares each committed baseline with the same file on the base branch (`check-base`) and fails if this branch allows more than the base. The tool list comes from `quality_ratchet.py list`, so a new `TOOLS` key is covered without editing the workflow. `check-tools` fails when a key that exists on the base ref was renamed or removed here. The base ref is passed in the environment, and the job does not fetch with `--depth=1`, so blame and merge-base still see full history. A missing baseline is an error when that tool is already in `TOOLS` on the base. It is a `::warning::` when this script, or that tool, is new there. The workflow listens for `labeled` and `unlabeled` as well as the default pull-request events, and the allowance step writes whether the `ratchet-increase` label is present. That label sets `RATCHET_ALLOW_INCREASE` and is the reviewed way to accept a higher allowance. Do not add file-wide suppressions to quiet a noisy rule.

ESLint counts warnings as well as errors and passes `--report-unused-disable-directives`. A parse error, including an unused `eslint-disable`, fails the run instead of being absorbed. The `suppressions` tool counts a `# noqa` comment (any case, including `# ruff: noqa` and `# flake8: noqa`). The `#` is required, so the word `noqa` inside a string is not a suppression. It also counts `# type: ignore`, any `# mypy:` inline option (including `ignore-errors` and `disable-error-code`), `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `# pragma: no cover`, and `istanbul` / `c8` / `v8` `ignore` in `apps/`, `scripts/`, and `packages/`. Alembic `versions/` directories are skipped by that path, not because the directory is named `versions`.

Allowances are the committed files under `quality/`: `ruff-baseline.txt`, `mypy-baseline.txt`, `eslint-finance-baseline.txt`, `eslint-site-baseline.txt`, `eslint-packages-baseline.txt`, `eslint-world-engine-baseline.txt`, and `suppressions-baseline.txt`. Do not copy those counts into this guide. `eslint-packages` is not an empty allowance. `quality/source-moves.json` maps relocated identity files so the base-branch comparison follows the same debt. Updating a path must not increase an allowance.

What remains is the rule column of those files. New code still has to stay inside those counts.

## Python

Ruff lints `apps/`, `scripts/`, and `packages/`, and formats `apps/` and `scripts/`, at line length 100. The lint and mypy directories are `PYTHON_TARGETS` in `scripts/quality_ratchet.py`. Selected rules are `E`, `W`, `F`, `I`, `B`, `UP`, `SIM`, and `RUF`. Ignored on purpose:

- `E501`, because the formatter owns wrapping.
- `B008`, because FastAPI uses `Depends` and `Query` in argument defaults.
- `RUF001` and `RUF002`, because titles and prose use en dashes.
- `E402` in `apps/finance/backend/alembic/env.py` and `apps/server/alembic/env.py`, because those files insert the repo root on `sys.path` before importing models.

Applied Alembic revisions are excluded from formatting and coverage to preserve historical source. Other application source remains inside the Python and suppression gates.

mypy runs on Python 3.12 with `check_untyped_defs` and `ignore_missing_imports`, on the same `PYTHON_TARGETS` directories. `disallow_untyped_defs` is off; turning it on would be a new baseline, not a cleanup.

The formatting-only commits listed in `.git-blame-ignore-revs` are `0fcae8021f783f836160bcd8f6a86ad1a98eacbe`, `2c41a00fecfabaefd4acab7229f613f7951a1d2a` (the auth-hardening reformat after merging main), `0ccfa2cb0696d2c6c278fa21093cdeb3828fb9de` (the reformat after merging the schema, media, and CSP work), and `116903ebc22c48c17947200c0e19e4d5f3f56e68` (the Travel and Media Prettier reformat). Later formatting commits are appended. CI checks that every listed SHA is still an ancestor of `HEAD`, which holds when main is merged in rather than rebased. Do not drop a SHA that is still an ancestor.

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## TypeScript

All feature code and the root Angular application compile with `strict`. `make typecheck` runs `tsc --noEmit` for every project in the `typecheck-web` recipe. A file is typechecked when it matches that project's `include` or `files`, not merely because another file imports it. Shipped `.mjs`, `.cjs`, and `.js` are on those includes with `allowJs`; `checkJs` stays false so strict implicit-any is not a new typing program. Handwritten `.d.mts` companions are on the same includes. `noUncheckedIndexedAccess` is not enabled.

ESLint 9 with `angular-eslint` and `typescript-eslint` uses the root `eslint.config.js`. The directories `make lint-web` passes are `ESLINT_SCOPES` in `scripts/quality_ratchet.py`. `scripts/source_inventory.py` fails when a shipped file has no matching ESLint, typecheck, ruff, or mypy owner. `no-undef` is off for TypeScript files. Unused names that start with `_` are allowed for TypeScript and for shipped JavaScript. Findings stay in the committed `quality/*-baseline.txt` files. Do not copy those counts here.

Prettier is not a project formatter. Travel and Media templates and CSS were formatted once in `116903ebc22c48c17947200c0e19e4d5f3f56e68`, which is listed in `.git-blame-ignore-revs`. The rest of the tree is unchanged.

## Coverage

`scripts/coverage-gate.sh` runs pytest with `pytest-cov` at `precision = 2`, so `--cov-fail-under` decides on the displayed total. Four pytest-xdist workers distribute whole files (`--dist=loadfile`), preserving module fixture ownership. Their coverage is combined before the same floor is checked. Set `PYTEST_WORKERS=0` for in-process debugging. Performance gates still run separately, serially and without coverage. Each CI job appends that run's table to the GitHub step summary. The summary step exits cleanly when a job failed before writing `coverage/`.

Python currently measures statements. `[tool.coverage.run]` sets `branch = false`, so the gate TOTAL is a statement percentage, not branch coverage. The source denominator is the suite tree passed to the gate (`apps/finance/backend`, `apps/travel/backend`, `apps/media/backend`, or `apps/server`). Finance also includes the relocated identity modules. Tests and Alembic paths are omitted. That denominator is not the whole repository.

`quality/coverage.txt` keeps two different numbers. `measured` is the historical total from the last `make coverage-pin`. `floor` is the current fail-under. The gate fails when a run drops under the floor. A higher run does not fail and does not rewrite the pin; it prints a `::notice::` with a suggested floor. The pin is not a claim about the latest run. Current per-run totals are the gate output and the CI summary. The current floors are:

| Suite | Floor |
| --- | ---: |
| Finance, including relocated identity code | 83.28% |
| Travel | 80.41% |
| Media | 70.60% |
| Server | 61.53% |

The merged refactor's measurements and command results are preserved in [its final verification](../planning/suite-experience-remediation/evidence/final-verification.md). Those figures are historical. Server composition, database ownership, identity and request-commit behavior now have explicit tests; coverage still includes untested lines rather than omitting modules to inflate the result.

Karma uses Chrome Headless with `--no-sandbox` and writes `coverage-summary.json` for the files the selected specs load. That loaded-source set is Karma's denominator. It is not whole-app coverage. The summary reports statements, branches, functions, and lines for that loaded set only. `scripts/karma-coverage-summary.mjs` appends those run totals to the GitHub step summary. They are that run's measurement, not a historical pin and not full-app proof. A run with `SUITE_KARMA_COVERAGE=0` does not satisfy the floors. `apps/karma.conf.js` owns these current floors, which stay unchanged:

| App | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Finance | 60 | 52 | 56 | 62 |
| Public site | 61 | 47 | 55 | 63 |
| Root/shared web | 60 | 52 | 56 | 62 |

## Playwright

`make e2e` builds the single root app at `dist/web/browser`, writes its release manifest, then runs Finance Playwright through the real server. Travel, Media, and Town use the same `tests/e2e/server.py` harness. Import `test` from `tests/e2e/fixtures.ts` (Finance extends it through `frozen-clock.ts`): each worker starts its own process, temporary database, sessions and reset endpoint. The OS assigns a free port while the server holds the socket, so concurrent workers and commands cannot collide. Four workers run files concurrently; tests within each file keep their order. All four keep retries at zero. Root `/auth` and `/hub`, canonical domain paths, old aliases, missing assets and public/private CSP transitions use production routing.

For an explicit local Finance server, use `E2E_SKIP_WEB_SERVER=1 E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test --config apps/finance/frontend/playwright.config.ts --workers=1`. Normal runs always own their disposable servers; they do not silently reuse a development database.

Run Travel with `npx playwright test --config apps/travel/e2e/playwright.config.js`, Media with `npx playwright test --config apps/media/e2e/playwright.config.ts`, and Town (habit, check-in, dialogs, Pixels Year, day, Life, Hub, and World) with `npx playwright test --config apps/web/e2e/playwright.config.ts`. `npm ci` runs once at the root. Existing Finance/site `npm test --prefix` commands are forwarding wrappers. Root/shared UI Karma is `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`. Screenshots are discovered by default and outputs are isolated under `test-results/{finance,travel,media,town}`. Set `CHROME_BIN` for Karma or `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an existing Chromium installation.

`make test-fast` runs `scripts/check-e2e-discovery.mjs`. The guard and Playwright both read intended projects and the Town allowlist from `tests/e2e/discovery.mjs`. The guard fails when a spec under a project directory sits outside that selector without an owned exclusion, when an intended project selects zero specs, or when an exclusion lacks an owner, issue, or reason. The Town allowlist selects `town.spec.ts`, `town-checkin.spec.ts`, and `town-dialogs.spec.ts` with the Pixels and World files. The owned whole-file omission that stays `not-run` is `apps/web/e2e/pixels-settings.spec.ts` (UX-01, #259). Phone, desktop, and platform cases that live inside an already selected file stay with that file. `npx playwright test --list` records discovery inventory. The guard reuses this project list, keeps retries at zero, and leaves browser execution to the existing Playwright commands.

CI runs one Backend job, one Frontend job, and one Playwright job. Frontend lints, typechecks, and runs the three Karma suites, then builds `dist/web` once. On the local runners that bundle is copied to `/opt/ci-dist` for Playwright, which installs Chromium once and runs `npx playwright test`. The root config reuses the domain configs for Finance, Media, Town, Travel, and the suite project, balancing all files through one four-worker scheduler. It does not build the frontend again. Unified Site Release still builds the production image and runs the seeded schema rehearsal; Deploy matches that job and its "Seeded schema rehearsals" step by name.

The production browser check is `SITE_TEST_URL=http://127.0.0.1:PORT node scripts/test-site-browser.mjs` against an initially empty disposable release database. It verifies public content/network isolation, local crypto, real account creation, private SPA transitions, map DOM, allowed images and blocked script/HTML sinks. Tiles/images use deterministic interception. `make docker-build test-suite-routes` and `bash scripts/validate-seeded-adoption.sh` validate the actual immutable image and historical/current entrypoints. These gates supplement the unit/browser suites.

Traces and screenshots are kept on failure (`trace: retain-on-failure`, retries stay 0). Playwright's browser download is cached on the `@playwright/test` version. The Playwright job and the image job install Chromium only. `--with-deps` was spending about 16 minutes downloading fonts on a GitHub-hosted runner.

## Keeping tests small and stable

Assign a behavior to the cheapest layer that can prove it. Backend and pure Node/Karma tests own arithmetic, validation branches, provider contracts and state transitions. Browser tests own user journeys, routing, persistence, focus and recovery across real screens. A browser journey may check rendered totals, but should not repeat the unit layer's full arithmetic matrix.

Run a functional story once. Use `test.step` when validation, correction and save are one journey, or marking and Undo are one reversible action. Keep unrelated error paths separate so a failed happy path does not hide recovery coverage. Use API setup for prerequisites and the UI for the action being tested.

Keep phone/desktop and light/dark combinations in the dedicated screenshot and accessibility suites. Repeat functional tests across widths only when controls actually change, such as the Travel cost row actions or Pixels sheet versus panel. Theme-independent form, filter and episode logic does not need four identical executions.

Wait for a visible result or a specific response. For transient loading/error states, hold a response behind a promise and release it after the assertion, including on failure. For debounce and client timeouts, install a fixed browser clock, let the initial view render, then pause at a known future instant and advance the timer. Avoid host timestamps when pausing: the running browser clock can already be ahead. Do not replace exact business assertions with broad text matches or add retries to mask a race.

The [test speed audit](../planning/test-speed-and-stability.md) records the reviewed suites, coverage ownership and local measurements.
