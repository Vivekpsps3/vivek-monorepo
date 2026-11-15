# CON-02 — implementation evidence

- Leaf issue and parent(s): #207; parents #197 and #196 stay open. UX-01 (#259) is already merged and was not redone.
- Agent/context, branch/worktree: Cursor Grok, sole implementer, branch `agent/con-02`, worktree `/tmp/vivek-con-02`.
- Base main SHA, current tested SHA: branch started at `0022c5ef8065e08892b6eecdfa6450158ee69ef6`. Merged `origin/main` `c461fe791251b13e02a05911531246f01f0e8290` (SEC-05 #362) without reverting those recovery files. Gates below ran on `c139de7342239537a25c03cac767eea0b6873aee`.
- Fresh-main/prerequisite/active-PR checks: #207 had no prior claim. UX-01 is on main via PR #280, commit `98c8d90a7a2738e1f34045e01f92b7bfb55f560c`. `routes.json` already included `profile`. No open pull request overlapped `private-routes` or `server-composition` when this leaf was claimed. SEC-05 #362 merged into this branch before the gates.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | `test_omitted_profile_fails_with_the_missing_owner` drops `profile` from a copy of the settings alternation. `settings_parity_errors` returns `missing mounted settings route settings/profile owner=settings`. The same omitted manifest makes `document_kind` return `missing` and `GET /settings/profile` return 404 JSON. That 404 is observed and is not the passing condition. Account still returns the private shell. | PASS | `apps/server/tests/test_route_parity.py` inside `./scripts/coverage-gate.sh server` |
| LOCAL2 | Mounted examples, including `/settings/profile?from=pixels`, are loaded twice through `register_frontend` and stay 200, `no-store`, with the existing `classify` CSP. Alias examples 308 and keep their query. `pixels-settings.spec.ts` reloads Profile, follows Birthday `#birthday`, and checks back/forward. The private layout still uses `authGuard`. | PASS | route parity pytest; `route-parity.spec.ts` in web Karma; Town Playwright, including `pixels-settings.spec.ts` |
| LOCAL3 | Example rows `unknown-page`, `unknown-asset`, and `unknown-api` return 404 JSON and do not include `<app-root`. Neighboring paths `settings/not-a-section`, `pixelsx`, `townx`, `travel/no-such-page`, `finance/no-such-page`, `finance/assets/missing.js`, and `media/api/missing` stay in that set. | PASS | `test_unknown_page_asset_and_api_paths_stay_404`; Profile browser requests for the same classes |
| LOCAL4 | Settings paths come from `SETTINGS_SECTIONS`. The document alternation is checked against that registry. Angular pages and redirects are walked from the registered route objects and must match `routes.json`. `route-examples.json` holds representatives only: profile, parameterized travel/media paths, finance portfolio redirect, aliases with query, reserved town clinic/gym, public home, and unknown counterexamples. | PASS | `test_settings_examples_do_not_copy_the_registry`; `test_every_settings_section_is_a_private_document`; spec `matches every registered page and redirect` |

Edit site for a new settings section: add one `SETTINGS_SECTIONS` entry and the same path in the `routes.json` settings alternation. The parity check fails until those two agree. Do not copy the section into `route-examples.json` unless it is the representative deep link. A new literal Angular page still needs its `routes.json` pattern; the client walk fails if the manifest does not cover it. Reserved paths such as `/town/clinic` and `/town/gym` are documents and are not mounted pages. App-switcher placement stays optional.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Handwritten document, alias, settings, pixels, town, and 404 expectations in `test_startup_checks_schema_frontend_and_static_files` | That composition test | `apps/web/route-examples.json` plus the settings registry and `routes.json` aliases | The enumerated route block was removed. Health, metrics, immutable asset cache, `/finance` and `/api` slash redirects, legacy `/finance/api` and `/finance/login` stay, because they are not document-manifest aliases. | Route parity tests and the rerun Town Playwright suite |
| Copied settings path and label arrays in `settings.spec.ts` | Settings shell unit test | `SETTINGS_SECTIONS` | The spec now compares registered child paths and rendered labels to the registry. | Web Karma settings shell tests |
| Stale town exclusion of `pixels-settings.spec.ts` | `tests/e2e/discovery.mjs` | Town Playwright selector | The UX-01 exclusion and its "not merged" reason are removed. The file is selected. | Discovery guard lists 9 town files and zero not-run notes; Profile browser tests passed |

- Candidate class and protected counterexamples: duplicate live route expectation lists. Unknown page, asset, and API 404s stay. Auth and CSP classification stay on `classify` / `content_security_policy`. No wildcard SPA fallback and no route generator.
- Comparison base SHA and full replacement closure: `c461fe791251b13e02a05911531246f01f0e8290`. Closure is `apps/server/frontend.py`, `apps/server/tests/test_composition.py`, `apps/server/tests/test_route_parity.py`, `apps/web/route-examples.json`, `apps/web/src/app/route-parity.spec.ts`, `apps/web/src/app/settings/settings.spec.ts`, `apps/web/tsconfig.spec.json`, `apps/web/e2e/pixels-settings.spec.ts`, `tests/e2e/discovery.mjs`, `scripts/check-e2e-discovery.test.mjs`, and `docs/ARCHITECTURE.md`.
- Production added/deleted/moved: `frontend.py` +21/−4. The new `document_kind` is the handler's existing alias/public/private decision, named so the omission fixture calls it. No route was added or removed. `routes.ts` and `settings.registry.ts` were not edited.
- Independent equivalent implementations before/after: one settings path list (`SETTINGS_SECTIONS`) instead of that list plus a copied array in the shell spec. One document manifest. One representative example file. The composition test no longer keeps a second universal route list.
- State/cache owners and public entry points before/after: unchanged. Document responses still come from `register_frontend`. CSP and auth guards are unchanged.
- Remaining old symbol/path search: `routes.json` remains the server manifest. Angular route modules remain the mounted-page declarations. `apps/server/redirects.py` remains the unused hub-media helper and was not part of this leaf.
- Follow-up change: a settings section needs the registry entry and the settings alternation. A new page needs its Angular route and a `routes.json` pattern. Add an example row only for a new representative parameter, alias query, reserved path, or unknown counterexample.
- Tests/docs/generated changes separately: `test_route_parity.py` +312, `route-parity.spec.ts` +188, `route-examples.json` +160, `test_composition.py` +1/−57, `settings.spec.ts` +3/−5, discovery test +4/−6, `discovery.mjs` +2/−10, `tsconfig.spec.json` +1, `ARCHITECTURE.md` +2. Generated `dist/` is not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: production +17 lines. The increase names the document decision the handler already made so the negative fixture can run that decision against an omitted manifest. It does not add a second router, a generator, or a CSP class.
- No behavior/data/meaningful assertion silently removed: public prerender, private shell, alias query, profile CSP, and unknown 404s are asserted by the parity tests. The first Town Playwright run timed out one unrelated visibility refetch; the full rerun passed, including that test.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Python was the worktree `.venv` symlink to the repo virtualenv. Heavy commands used `flock /tmp/vivek-heavy-checks.lock`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, boundaries, 98 unittest cases, discovery guard, and 21 node tests. Town discovery lists 9 files and no not-run notes. |
| `make lint-python` | PASS. Ruff format, Ruff 101, suppressions 6 match their baselines. |
| `make typecheck-python` | PASS. mypy 87 matches the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 917 passed. Total coverage 79.14% (floor 61.53%). Perf gate `GET /api/town` p50 131.73 ms. Floor was not changed. |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 720 SUCCESS. Statements 82.6%, branches 69.6%, functions 82.24%, lines 86.31%. |
| `make build-frontends` | PASS. Production bundle written under `dist/web`. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on the rerun, 85 passed. The first run had 84 passed and one timeout in `town-checkin.spec.ts` "13: visibility after the local date changes" waiting on `/api/town`. That test does not use the route manifest. Profile navigate, refresh, fresh load, back/forward, and Birthday passed in the first run. The full config was run again and passed, including test 13. |
| `npx playwright test --project=suite` | PASS. 30 passed. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/367 (`Closes #207` only). Parents #197 and #196 are named and stay open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6887994689
- Merged/activation status (actual evidence, not assumption): not merged and not deployed. SEC-05 recovery files from `c461fe79` stay in this branch.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Reserved `/town/clinic` and `/town/gym` are still not Angular pages.
- Next actor: review, then CI. Do not merge from this worker.

No unstated decision from the previous context is necessary to continue.
