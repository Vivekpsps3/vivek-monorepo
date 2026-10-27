# Verification, exploratory audit, and evidence

Current implementation evidence is [final verification](evidence/final-verification.md), with the [requirement acceptance map](evidence/requirement-acceptance.md). The planning-only results below are historical. Approved runtime retirement and all local gates are complete; PR delivery is recorded in STATUS.md.

## Checks completed for this planning change

The change adds planning documentation and a planning index link, not product code. On 2026-10-25:

| Check | Result | Limit |
| --- | --- | --- |
| Source inspection | Completed across root/server/build/shared packages, public site, Hub, Finance shell/auth, Travel and Media domain/UI/tests | Does not prove rendered behavior or exhaustive defect discovery |
| Independent agent review | UI critique, simplification review, architecture challenge completed and incorporated | Read-only; no browser runtime evidence |
| Four pure-module probes | Confirmed split date semantics, missing second-city validation, unsaved music inclusion and masked TV-source warning | No app server/provider/browser |
| `make test-fast` | Passed: doc paths, blame ancestors, boundaries, Finance UX checks, 29 Python script tests, 2 Node server tests | Existing doc checker excludes planning; separate all-plan link check required below |
| Travel/Media/auth static Node command below | Passed: 102 tests, zero failures/skips | Some tests encode old behavior and source text; green baseline does not refute owner complaints |
| Plan link / requirement / task consistency and `git diff --check` | Passed: all relative plan links, R01–R34 sequence, 34 work-package IDs/dependencies, 68 distinct issue IDs, whitespace including untracked files | Content consistency check, not application behavior validation |
| Full Python app/coverage/lint/typecheck, Angular/Karma, Playwright, production build/image | Not run for docs-only change; app dependencies absent | Must run during implementation before PR; no claim of product fixes verified |

At the original planning audit, the checkout had no `.venv`, Finance/site `node_modules`, or Python `httpx`, FastAPI, SQLAlchemy, pytest, or Playwright dependencies. A browser cache directory alone is not a configured app test environment. Provision pinned dependencies when implementation starts; do not treat this as a reason to skip future gates. Public web fetch returned no extractable page content, so it is not a visual review of the live website.

Executed module baseline:

```sh
node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs
```

## Mandatory local gate matrix for implementation

Run commands at the existing paths until equivalent migrated commands are implemented. The broad top-down refactor touches every suite; all rows apply before its one PR opens. CI is the second run.

| Change area | Existing required commands |
| --- | --- |
| Docs/shared boundaries/scripts | `make test-fast` |
| Python source | `make lint-python`; `make typecheck-python` |
| Web/shared source | `make lint-web`; `make typecheck-web` |
| Finance backend | `./scripts/coverage-gate.sh finance` |
| Unified server/auth/schema/security | `./scripts/coverage-gate.sh server` |
| Travel backend/pure UI modules | `./scripts/coverage-gate.sh travel`; `node --test apps/travel/backend/static/tests/*.test.mjs` |
| Media backend/pure UI modules/auth UX | `./scripts/coverage-gate.sh media`; `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` |
| Shared browser/UI primitives | `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs` plus consuming app suites |
| Finance Angular | `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` |
| Public Angular | `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` |
| Finance production/browser | `make e2e` (builds production Finance first) |
| Media browser | `NODE_PATH=apps/finance/frontend/node_modules apps/finance/frontend/node_modules/.bin/playwright test --config apps/media/e2e/playwright.config.ts` |
| Travel browser | `npx playwright test` from `apps/travel/e2e` |
| Production outputs/routes | `make build-frontends`; `make docker-build`; `make test-suite-routes` |
| Schema/adoption/release behavior | Disposable `make db-seed-dev`; `bash scripts/validate-seeded-adoption.sh`; assembled `scripts/test-site-browser.mjs` using current CI invocation |

The last row uses disposable local data/image/environment exactly as documented in `docs/MIGRATIONS.md` and CI. Do not run an unreviewed seed/adoption command against real production. Existing coverage floors and ratchets in `docs/QUALITY.md` remain in force.

## Test-command migration contract

- [ ] Inventory existing discovered test names/counts and coverage source files before moving them.
- [ ] Provide root commands with domain filters and same meaningful suites; keep old command wrappers while consumers migrate.
- [ ] Map moved file baselines/coverage paths rather than resetting debt to zero or hiding newly uncovered files.
- [ ] Update AGENTS, CI, Makefile, Docker build, package scripts and docs in the same integration slice.
- [ ] Replace source-string assertions only with behavior/semantic tests covering intended contracts. Screenshots pin visual layout intentionally, not stale forbidden colors or broken behavior.
- [ ] Preserve gate strength and per-domain visibility even if test runner configuration is consolidated.
- [ ] Retire old wrappers only after local old→new suite equivalence and all references are verified. Do not keep permanent duplicate command frameworks.

## Production-like acceptance harness

One root harness uses a temporary database, synthetic users and deterministic external-provider fakes. It serves the built root frontend through the real server policy/middleware/static routing. App-specific standalone harnesses can mask security-header, auth and mount bugs; migrate them after parity fixtures exist.

- [ ] Two users with different personal library/PTO/photo/progress states, shared public catalog, and no cross-user leakage.
- [ ] Empty user, populated user, locked/uninitialized Finance vault, stale/expired session, provider keys missing/present/bad, offline and delayed requests.
- [ ] Minimal trip, multi-city trip, duplicate-save response uncertainty, weekend-only trip, custom legacy PTO total, overlapping time off, flight DST/date-line case and ambiguous place.
- [ ] Mixed Media library, same-named identities, saved/fetched-only children, score zero/unrated, artist legacy states, conflicting nested/standalone scores and broken image.
- [ ] TV ongoing/ended/canceled/unknown, no/partial/future-only episodes, specials, caught-up undo with concurrent edits, newly aired episode.
- [ ] Search repeated The Gentlemen movie/TV/all, quota/timeout/partial success, cache warm/cold, stale requests, result truncation/pagination and manual fallback.

Use deterministic provider fixtures in required tests. A small optional live smoke checks current provider compatibility separately; do not make all tests flaky on external availability or silently skip a failing deterministic suite.

## Full route/state UI audit

| Surface | Scenes and adverse states |
| --- | --- |
| Public | Home/Work/About/demo, Workspace link, public-only network requests, title/meta/canonical/unknown path, static meaningful HTML |
| Shared identity | Setup/login/signup gates, account/profile/admin, invalid input, loading, expired session, safe next path, non-admin denial |
| Hub | All empty, populated, one summary failing/stalling, retries, Finance locked/unlocked, long identity, settings editing |
| Finance | Home, balance/portfolio, activity/import/calendar, recurring, planning/tools, vault setup/unlock, tutorial, source freshness, failed save, large and negative values |
| Travel | Current/upcoming/past, partial/valid/multi-city composer, split/remove/date changes, trip minimal/populated, each editor, flight override, map failure/retry, PTO per-date/legacy/forecast, settings |
| Media | Now, mixed/filtered/paginated library, collapsed/expanded saved music, search and all source states, manual/prefilled Add, artist photo/discography, item review conflict, TV season/episode/caught-up/lifecycle, calendar |
| Cross-app | Public→login→Hub→every app→Hub, locked vault using Travel/Media, reload/back/forward, old hashes/aliases, sign-out across tabs |

Each scene: mobile/desktop light/dark screenshots, keyboard-only completion, focus/announcements, overflow, long content, 200% zoom, reduced motion/transparency, forced colors and useful empty/loading/error state. Reference widths 320/390/768/1280/1440px. Test small landscape and keyboard-open view.

## Exploration beyond reported issues

- [ ] Fuzz ranges: leap day, month/year boundaries, reverse selection, zero-night trip, timezone/DST, very long/invalid inputs, repeated submit/retry.
- [ ] Test network races: navigate while loading/saving, sign-out before response, late previous-user data, duplicate callback, stale CSRF and provider credential errors.
- [ ] Validate deletion semantics: trip child removal, artist unfollow versus song membership, score clear versus zero, undo after another edit, orphan metadata cleanup.
- [ ] Inspect console/CSP/network errors; no raw stack/key/private record in product errors or logs.
- [ ] Check SQL query counts and transaction duration; provider outage never holds open write transactions or blocks saved reads.
- [ ] Check public initial chunks for accidental private/Finance eager loading and built public HTML for metadata/content.
- [ ] Verify security-policy behavior when moving public↔private and Finance↔Travel↔Media; CSP is document-scoped.
- [ ] Add every finding to issue register with reproduction and owner. Record inability to reproduce honestly, including environment assumptions.

## Evidence package before PR

Include command output summaries and full log paths, screenshots/traces, migrated-test manifest, route/alias manifest, migration preservation/conflict report, source/dependency/mechanism deletion table, bundle/build/dev-loop/response metrics, unresolved issue dispositions, and exact release/rollback steps. All R01–R34 and the R22 subchecks must be linked to that evidence.
