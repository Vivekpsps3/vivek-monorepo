# MED-04 — implementation evidence

- Leaf issue and parent(s): [#238](https://github.com/Vivekpsps3/vivek-monorepo/issues/238); parent [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) stays open
- Agent/context, branch/worktree: implementer, `agent/med-04`, `/tmp/vivek-med-04`
- Base main SHA, current tested SHA: base `85212152bda3ce6cab5cbfcc9c787b564214fc69`. Commands below ran against that base plus the product diff in this file's commit. Karma used port 9993 in this worktree only; that line was reverted and is not in the commit.
- Fresh-main/prerequisite/active-PR checks: this branch matched `origin/main` at the base above. MED-03 #237 is on that base as squash `fdce45e1d792f54315160d4d9b3b15ae15d16812` (#345), which is an ancestor. Open pull requests were none. #238 had no earlier claim. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/238#issuecomment-6808754554

## Acceptance

Fixtures are synthetic journal rows from the Media e2e API. The movie payload is intercepted in the browser, so Wikidata and TMDB are not called. Viewport is 1100×640 so the sentinel starts below the fold. Saved half ratings and the tag field stay on the detail form.

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| REL1 | Open a movie whose Related sentinel is below the viewport. Before any scroll, `GET /media/api/entries/{id}/web` count is 0. Scrolling the sentinel into view repeatedly produces one request. The response mixes duplicates, empty rows, a `javascript:` field, and more than 12 titles. The DOM shows 12 cards, one copy of a duplicated title, both years of the same title, and hrefs from `relatedHref` (`/media/add?title=` plus `encodeURIComponent`). No href contains `javascript:`. An empty payload hides the Related heading. An artist has no sentinel and stays at 0 `/web` requests after scrolling the page. A saved 7.5 still shows its half-rating note, and the Tags field is still there. | PASS | `apps/media/e2e/related.spec.ts` › `related loads once from a distant sentinel and an artist never requests it`. `related.test.mjs` covers `cleanNodes` (cap 12), `relatedHref`, and `RELATED_KINDS` excluding `artist`. |
| REL2 | A 502 from `/web` leaves the item heading, the 7.5 note, and the tag field in place. The alert is `.related-error` and reads `Related items are unavailable.` Retry sends one request per click and disappears at 3 total requests. Further scrolls do not add a fourth. A second movie holds `/web`, the sentinel observer is disconnected by leaving for the library before that request starts, and releasing the held body after a same-detail navigation to an artist does not render `Stale Sequel` or request `/web` for the artist. | PASS | `apps/media/e2e/related.spec.ts` › `a related provider failure stays on the item and retry stops at three requests` and › `a held related response cannot publish after leaving and the observer is disposed` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Eager Related requests or a per-render `/web` subscription, at base `85212152` | None. `rg` found no production caller of `relatedHref`, `cleanNodes`, or `GET /entries/{id}/web`. `entry_web` in `journal.py` was the only Related endpoint and had no screen caller. The historical static `loadWeb` is not in this tree. | `DetailComponent` owns one `IntersectionObserver` and one `HttpClient` subscription. It calls the existing `entry_web` route. `related.mjs` remains the only card policy (`cleanNodes`, `relatedHref`, `RELATED_KINDS`, `RELATED_ATTEMPT_LIMIT`). | No eager caller existed to delete. This PR does not add a second provider client or a second request hook. `journal.py` is unchanged. Artist detail never calls `/web`. | REL1 request counts stay 0 until the sentinel intersects, then stay at 1 across repeated scrolls. The disposal test disconnects the observer on leaving the route and a late body does not publish cards. |

- Candidate class and protected counterexamples: feature mount of an unused helper. Not a simplification. Membership SQL, catalog versus personal entry, the rating editor, and the tag editor were not given a second implementation.
- Comparison base SHA and full replacement closure: `85212152bda3ce6cab5cbfcc9c787b564214fc69`. Closure is `detail.component.ts`, `detail.component.html`, `media.css`, `related.mjs`, `related.d.mts`, `related.test.mjs`, and `apps/media/e2e/related.spec.ts`. `journal.py` is not in the diff.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat` against the base. Production +196/−0: `detail.component.ts` +117, `detail.component.html` +42, `media.css` +33 (1 blank), `related.mjs` +3 (1 comment, 1 blank, 1 constant), `related.d.mts` +1. No moves. No generated bundle committed.
- Independent equivalent implementations before/after: screen request paths 0 → 1 (the sentinel observer). Card normalization stays the one `cleanNodes` helper, now with a screen caller. `entry_web` stays the one Related endpoint.
- State/cache owners and public entry points before/after: no Related signals existed. The detail route now keeps `relatedNodes`, `relatedError`, `relatedLoading`, the attempt count, one observer, and one subscription, cleared in `load` and on destroy. `GET /media/api/entries/{id}/web` is the only Related read. Rating drafts and tag state are untouched.
- Remaining old symbol/path search, including config and discovery: `entry_web` remains. No `loadWeb` or `data-web` in `apps/media`. `relatedHref` is used for the card href and for in-app navigation.
- Follow-up change: a Related rule change edits `related.mjs` and `DetailComponent`. Provider shape stays in `entry_web` / `followups.py`.
- Tests/docs/generated changes separately: `related.test.mjs` +8, `related.spec.ts` +226. This evidence file is the only doc. `dist/` was built for Playwright and is not committed. The Karma port edit was reverted.
- Net production delta and specific reviewed safety/compatibility exception if positive: +196 because the detail screen had no Related UI. The positive delta is the sentinel, the bounded request, the local error, and the cards. It is a feature mount, not a simplification claim. `RELATED_ATTEMPT_LIMIT` is 3 so a failed provider cannot be clicked without a bound.
- No behavior/data/meaningful assertion silently removed: half ratings, tag editing, and the existing `/web` collaborator branch for a direct API call stay. The screen does not call that branch for an artist.

## Verification

Commands from `/tmp/vivek-med-04`. `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` (worktree `.venv` is a symlink; nothing was installed into it). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `npm ci` ran in the worktree because `node_modules` was missing. Karma port 9993 was set inside `config.set` for the web run and reverted before commit. The coverage reporter loaded.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch MED-04` | printed the `media_front` and `media_back` commands below |
| `make test-fast` | PASS |
| `make lint-web` | PASS |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS, 712 SUCCESS. Statements 83.25% (5537/6651), branches 70.21% (2124/3025), functions 82.81% (1108/1338), lines 86.92% (4794/5515) |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS, 54 |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS, 89, including `related.spec.ts` 3/3, `rating.spec.ts` 3/3, and `tags.spec.ts` 4/4 |
| `make lint-python` | PASS |
| `make typecheck-python` | PASS |
| `./scripts/coverage-gate.sh media` | PASS, 208 tests, coverage 84.37% (floor 70.6%). `journal.py` was not edited. |

Not run: Finance, site, and Travel Karma; Finance, Travel, and Town Playwright; Finance, Travel, and server coverage gates. This diff does not change those screens or any Python file. Deployment was not run.

## Handoff

- PR URL (leaf closure keyword only): not opened yet. The next commit records it. Closure keyword is only `Closes #238`.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status: not merged. Local verification passed. CI is not recorded yet.
- Remaining external prerequisites or approved scope decisions: none. Parent #85 stays open.
- Next actor: open the pull request, append the #134 note, watch Backend, Frontend, Unified Site Release, and Playwright, squash-merge, then record the squash SHA on #238 and #134.

No unstated decision from the previous context is necessary to continue.
