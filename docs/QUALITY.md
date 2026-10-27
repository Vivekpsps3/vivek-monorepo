# Quality gates

`make test` runs the fast checks, the four Python coverage gates, and all three Karma suites. Lint and type checking are separate so a formatting or type failure is not hidden inside the test log.

```bash
make lint          # Ruff format check, Ruff, ESLint, and inline suppressions
make typecheck     # mypy and tsc --noEmit
make e2e           # root production bundle, then Finance Playwright
make lint-baseline # rewrite quality/*.txt after a finding count shrinks
make coverage-pin  # rewrite quality/coverage.txt from a fresh measurement
```

Dev tools are locked in `requirements-dev.txt` (hashed; compiled from `requirements-dev.in`). `make install` installs that lock with `--require-hashes`. The production image installs only `apps/server/requirements.lock`. The image-building CI job does not install the dev lock. `pip-audit` is in the dev lock and runs in the finance backend job, against `apps/server/requirements.lock`.

## Ratchet

`scripts/quality_ratchet.py` records `path<TAB>rule<TAB>count` in `quality/`. CI fails when a live count rises, and when a recorded count is higher than the current one. A fix has to drop the baseline entry (`make lint-baseline`) instead of leaving a stale allowance.

`update` refuses a higher count unless `--allow-increase` is passed. On a pull request, CI compares each committed baseline with the same file on the base branch (`check-base`) and fails if this branch allows more than the base. The tool list comes from `quality_ratchet.py list`, so a new `TOOLS` key is covered without editing the workflow. `check-tools` fails when a key that exists on the base ref was renamed or removed here. The base ref is passed in the environment, and the job does not fetch with `--depth=1`, so blame and merge-base still see full history. A missing baseline is an error when that tool is already in `TOOLS` on the base. It is a `::warning::` when this script, or that tool, is new there. The workflow listens for `labeled` and `unlabeled` as well as the default pull-request events, and the allowance step writes whether the `ratchet-increase` label is present. That label sets `RATCHET_ALLOW_INCREASE` and is the reviewed way to accept a higher allowance. Do not add file-wide suppressions to quiet a noisy rule.

ESLint counts warnings as well as errors and passes `--report-unused-disable-directives`. A parse error, including an unused `eslint-disable`, fails the run instead of being absorbed. The `suppressions` tool counts a `# noqa` comment (any case, including `# ruff: noqa` and `# flake8: noqa`). The `#` is required, so the word `noqa` inside a string is not a suppression. It also counts `# type: ignore`, any `# mypy:` inline option (including `ignore-errors` and `disable-error-code`), `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `# pragma: no cover`, and `istanbul` / `c8` / `v8` `ignore` in `apps/`, `scripts/`, and `packages/`. Alembic `versions/` directories are skipped by that path, not because the directory is named `versions`.

Current working baselines after source-path remapping are Ruff 101, mypy 87, Finance/web ESLint 474, public ESLint 9, packages ESLint 0 and suppressions 0. `quality/source-moves.json` maps relocated identity files so the base-branch comparison follows the same debt. Updating a path must not increase an allowance. Exact records live in `quality/*.txt`.

The leftover Ruff findings are import order, pyupgrade, and simplify rules, plus `RUF012` on test doubles. The leftover mypy findings are mostly SQLAlchemy `Column` inference. The leftover ESLint findings are `no-explicit-any`, `prefer-inject`, and a handful of template rules. New code still has to stay inside those counts.

## Python

Ruff lints and formats `apps/` and `scripts/` at line length 100. Selected rules are `E`, `W`, `F`, `I`, `B`, `UP`, `SIM`, and `RUF`. Ignored on purpose:

- `E501`, because the formatter owns wrapping.
- `B008`, because FastAPI uses `Depends` and `Query` in argument defaults.
- `RUF001` and `RUF002`, because titles and prose use en dashes.
- `E402` in `apps/finance/backend/alembic/env.py` and `apps/server/alembic/env.py`, because those files insert the repo root on `sys.path` before importing models.

Applied Alembic revisions are excluded from formatting and coverage to preserve historical source. Other application source remains inside the Python and suppression gates.

mypy runs on Python 3.12 with `check_untyped_defs` and `ignore_missing_imports`. `disallow_untyped_defs` is off; turning it on would be a new baseline, not a cleanup.

The formatting-only commits listed in `.git-blame-ignore-revs` are `0fcae8021f783f836160bcd8f6a86ad1a98eacbe`, `2c41a00fecfabaefd4acab7229f613f7951a1d2a` (the auth-hardening reformat after merging main), and `0ccfa2cb0696d2c6c278fa21093cdeb3828fb9de` (the reformat after merging the schema, media, and CSP work). Later formatting commits are appended. CI checks that every listed SHA is still an ancestor of `HEAD`, which holds when main is merged in rather than rebased. Do not drop a SHA that is still an ancestor.

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## TypeScript

All feature code and the root Angular application compile with `strict`. `make typecheck` runs `tsc --noEmit` for each app (application and spec configs) and for `packages/tsconfig.json` (`packages/browser`, `packages/auth`, `packages/ui`). `noUncheckedIndexedAccess` is not enabled.

ESLint 9 with `angular-eslint` and `typescript-eslint` uses the root `eslint.config.js` and root-installed plugins for all apps and packages. `packages/` has no findings. `no-undef` is off for TypeScript files. Unused names that start with `_` are allowed.

Prettier is not configured. The tree has no formatter today, and formatting both apps would be a review of its own. Adopt it in a follow-up, in one commit, and add that commit to `.git-blame-ignore-revs`.

## Coverage

`scripts/coverage-gate.sh` runs pytest with `pytest-cov` at `precision = 2`, so `--cov-fail-under` decides on the displayed total. Tests and Alembic are omitted. `quality/coverage.txt` stores the measured total and a floor about 1 percentage point below it. The gate fails when coverage drops under the floor. A gain does not fail; the job prints a `::notice::` with a suggested floor, and `make coverage-pin` rewrites the file from a fresh measurement. Each CI job appends the table to the GitHub step summary. The summary step exits cleanly when a job failed before writing `coverage/`.

The recorded measurements in `quality/coverage.txt` are the baseline from the last pin, not a claim about the latest run. Current per-run totals are emitted by the gates and attached to CI. The fail-under floors are:

| Suite | Floor |
| --- | ---: |
| Finance, including relocated identity code | 83.28% |
| Travel | 80.41% |
| Media | 70.60% |
| Server | 61.53% |

The merged refactor's measurements and command results are preserved in [its final verification](../planning/suite-experience-remediation/evidence/final-verification.md). Server composition, database ownership, identity and request-commit behavior now have explicit tests; coverage still includes untested lines rather than omitting modules to inflate the result.

Karma uses Chrome Headless with `--no-sandbox` and writes `coverage-summary.json`. `scripts/karma-coverage-summary.mjs` appends totals to the GitHub step summary. Karma instruments only the files loaded by the selected specs, so its totals are not whole-app coverage. `apps/karma.conf.js` owns these unchanged thresholds:

| App | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Finance | 60 | 52 | 56 | 62 |
| Public site | 61 | 47 | 55 | 63 |
| Root/shared web | 60 | 52 | 56 | 62 |

## Playwright

`make e2e` builds the single root app at `dist/web/browser`, writes its release manifest, then runs Finance Playwright through the real server at port 4173. Travel and Media use the same `tests/e2e/server.py` harness with isolated fixture databases and ports. All three keep retries at zero. Root `/auth` and `/hub`, canonical domain paths, old aliases, missing assets and public/private CSP transitions use production routing.

Run Travel with `npx playwright test --config apps/travel/e2e/playwright.config.js`, and Media with `npx playwright test --config apps/media/e2e/playwright.config.ts`. `npm ci` runs once at the root. Existing Finance/site `npm test --prefix` commands are forwarding wrappers. Root/shared UI Karma is `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`. Screenshots are discovered by default and outputs are isolated under `test-results/{finance,travel,media}`. Set `CHROME_BIN` for Karma or `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an existing Chromium installation.

The production browser check is `SITE_TEST_URL=http://127.0.0.1:PORT node scripts/test-site-browser.mjs` against an initially empty disposable release database. It verifies public content/network isolation, local crypto, real account creation, private SPA transitions, map DOM, allowed images and blocked script/HTML sinks. Tiles/images use deterministic interception. `make docker-build test-suite-routes` and `bash scripts/validate-seeded-adoption.sh` validate the actual immutable image and historical/current entrypoints. These gates supplement the unit/browser suites.

Traces and screenshots are kept on failure (`trace: retain-on-failure`, retries stay 0). CI uploads `test-results` and `playwright-report` when the job fails. Playwright's browser download is cached on the `@playwright/test` version and shared by the finance e2e job, the media e2e job, and the image job. Finance and the image install operating-system dependencies on a cache hit. Media installs Chromium only: the GitHub-hosted image already has the shared libraries, and `--with-deps` was spending about 16 minutes downloading fonts.
