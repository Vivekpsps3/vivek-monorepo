# MED-05 — implementation evidence

- Leaf issue and parent(s): [#239](https://github.com/Vivekpsps3/vivek-monorepo/issues/239); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: implementer, `agent/med-05`, `/tmp/vivek-med-05`
- Base main SHA, current tested SHA: base `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Product commit `e249e40248d8c76caeb30c9d8a945f871f5cda7e` contains the code these commands ran against. Karma used port 9997 in this worktree only; that line was reverted and is not in the commit.
- Fresh-main/prerequisite/active-PR checks: this branch matched `origin/main` at the base above. MED-01 is on that base as squash `29e1318` (#282). MED-04 is on that base as squash `b7ae697` (#349). Open pull requests were none. #239 had no earlier claim. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/239#issuecomment-6811776204

## Acceptance

Fixtures are synthetic. Popular responses are intercepted in the browser, so TMDB is not called. The e2e server stubs `lookup_detail` to return nothing, and the successful Add continues to `POST /media/api/library/from-provider`, which stores one pending catalog row for the signed-in owner. Viewport is the Playwright default.

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| POP1 | Open `/media/search` with a movies interceptor. The Popular button is visible and `.popular-card` count is 0. After a wait, `GET /media/api/movies` is still 0. The click sends one request. The payload has a duplicate id, an empty title, a null row, one evil-host poster, one `javascript:` poster, one TMDB poster, and 23 extra titles. The DOM shows 20 cards, `Movie 17`, and not `Movie 18` or the duplicate title. The only image src is `https://image.tmdb.org/t/p/w500/p.jpg`. Add manually, then browser back, still shows 20 cards and the same one request. | PASS | `apps/media/e2e/popular.spec.ts` › `popular waits for an explicit click and restores the same cards on back`. `popular.test.mjs` caps `cleanPopular` at 20. |
| POP2 | One intercepted row is already saved (`saved_id` 42) and shows Open saved item with no POST. Two synchronous clicks on Add for `Needs add` send one POST body `{ source: "tmdb", source_id: "popular-add-1", kind: "movie", title: "Needs add" }`. That attempt returns 503 `Save failed`; the title and the other Open link stay, and Add is enabled again. The retry continues to the API. The card becomes Open saved item, the alert is gone, and the library query for that title has one row whose catalog source and source id match the POST. | PASS | `apps/media/e2e/popular.spec.ts` › `popular add keeps one saved item and recovers after a failed attempt`. `popular.test.mjs` keeps a positive integer `saved_id` and drops a string id. |
| POP3 | A 502 shows `Can't reach the movie service.` and no image. The Retry popular button is focused. Enter focuses `Loading popular movies…`, shows four skeletons, and still no image, then one more request. The next payload has an evil-host poster and one TMDB poster: two cards, one allowed image, and the unsafe card uses the initials. An empty `results` array shows `No popular movies` and the retry sentence, with no image. Enter again loads skeletons, then one card whose `javascript:` artwork is the initials `AF`. Focus lands on the Popular movies heading. | PASS | `apps/media/e2e/popular.spec.ts` › `popular failure retries from the keyboard without unsafe artwork` and › `an empty popular list retries from the keyboard`. `popular.test.mjs` covers `safeArt`, unsafe artwork inside `cleanPopular`, `popularError`, and `popularFocus`. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Unmounted `PopularMoviesService` plus any competing discovery provider cache or fetch, at base `04a5dac` | None. `rg` found no production caller of `PopularMoviesService`, `cleanPopular`, or `GET /media/api/movies` in the frontend. `GET /movies` in `journal.py` and `popular_movies` had no screen caller. `SearchComponent` had no Popular flags. The historical library popular fallback is not in this tree. | `PopularMoviesService` owns the one `GET /media/api/movies` call, the rows, and the ready cache. `SearchComponent` is the only consumer. `popular.mjs` remains the only card, artwork, error, and focus policy. Add uses the existing `POST /media/api/library/from-provider`. | No eager caller existed to delete. This PR does not add a second provider client or a second movies request. `journal.py`, `add.component.ts`, detail, the rating editor, the tag editor, and Related are unchanged. `load()` still skips a ready list. `retry()` fetches again from an error or an empty ready list, and skips while a request is in flight. | POP1 stays at 0 requests before the click and at 1 after back. POP2 sends one POST for two Add clicks. A search of `apps/media/frontend` shows the movies URL only in `popular-movies.service.ts`. |

- Candidate class and protected counterexamples: feature mount of an unused helper. Not a simplification. Membership SQL, catalog versus personal entry, the rating editor, the tag editor, and the MED-04 Related sentinel were not given a second implementation.
- Comparison base SHA and full replacement closure (including new files): `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Closure is `search.component.ts`, `popular-movies.service.ts`, `popular.mjs`, `popular.d.mts`, `media.css`, `popular.test.mjs`, and `apps/media/e2e/popular.spec.ts`. `journal.py` is not in the diff.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat` against the base. Production +250/−20: `search.component.ts` +175/−2, `popular-movies.service.ts` +23/−17, `popular.mjs` +22/−1, `popular.d.mts` +5, `media.css` +25. Two of the added lines are blank. No comments. No moves. No generated bundle committed.
- Independent equivalent implementations before/after: screen request paths 0 → 1 (the existing service). Card normalization stays the one `cleanPopular` helper, now with a screen caller. `GET /movies` stays the one Popular endpoint. Add stays the one from-provider route.
- State/cache owners and public entry points before/after: the root service already held `state`, `rows`, and `error`, with no caller. It now also drops a stale response when a newer request id wins. The search route reads those signals and keeps in-flight Add keys plus the per-card error. `GET /media/api/movies` is the only Popular read. A ready list is not fetched again on back.
- Remaining old symbol/path search, including config and discovery: `PopularMoviesService` is imported only by `SearchComponent`. `GET /media/api/movies` appears only in the service. `cleanPopular` and `popularFocus` are used by that screen and by `popular.test.mjs`.
- Follow-up change: a Popular rule change edits `popular.mjs` and `SearchComponent`. Provider shape stays in `popular_movies` / `GET /movies`.
- Tests/docs/generated changes separately: `popular.test.mjs` +64/−2, `popular.spec.ts` +211. This evidence file is the only doc. `dist/` was built for Playwright and is not committed. The Karma port edit was reverted.
- Net production delta and specific reviewed safety/compatibility exception if positive: +230 because Search had no Popular UI. The positive delta is the explicit button, the skeletons, the bounded cards, the empty and error retry, and focus. It is a feature mount, not a simplification claim. The request id ignores a stale body so a late error cannot replace a newer result. The in-flight Add key ignores a second click so one owner row is saved.
- No behavior/data/meaningful assertion silently removed: search, manual Add, half ratings, tag editing, and the Related sentinel stay. `add.component.ts` was not edited.

## Verification

Commands from `/tmp/vivek-med-05`. `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` (worktree `.venv` is a symlink; nothing was installed into it). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `npm ci` ran in the worktree because `node_modules` was missing. Karma port 9997 was set inside `config.set` for the web run and reverted before commit. The coverage reporter loaded.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch MED-05` | printed the commands below |
| `make test-fast` | PASS |
| `make lint-web` | PASS |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 714 SUCCESS. Statements 83.19% (5534/6652), branches 70.14% (2122/3025), functions 82.81% (1108/1338), lines 86.87% (4792/5516) |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS, 56 |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 93, including `popular.spec.ts` 4/4, `related.spec.ts`, `rating.spec.ts`, and `tags.spec.ts` |
| `make lint-python` | PASS |
| `make typecheck-python` | PASS |
| `./scripts/coverage-gate.sh media` | PASS, 208 passed, coverage 84.37% (floor 70.6%). `journal.py` was not edited. |

Not run: Finance, site, and Travel Karma; Finance, Travel, and Town Playwright; Finance, Travel, and server coverage gates. This diff does not change those screens or any Python file. Deployment was not run.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/353 (`Closes #239` only). #85 is referenced and stays open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6811932471. The issue body was not edited.
- Merged/activation status: PR #353 is open. Not merged. Not deployed. Local verification passed. CI is not recorded yet.
- Remaining external prerequisites or approved scope decisions: none. Parent #85 stays open.
- Next actor: watch Backend, Frontend, Unified Site Release, and Playwright on #353, squash-merge, then record the squash SHA on #239 and #134.

No unstated decision from the previous context is necessary to continue.
