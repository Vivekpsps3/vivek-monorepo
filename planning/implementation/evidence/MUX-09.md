# MUX-09 — Style Now and Calendar without duplicating their saved queries

- Leaf #405. Tracking parent #304. Roadmap #134.
- Branch `agent/mux-09`. Worktree `/home/vivek/.grok/worktrees/deployments-vivek-monorepo/subagent-01a1efea-8862-76a1-ab38-e5e06b9a4ff4`.
- Base main `2e699ab66ec68318cb7d971964e7be0432eeca42` (MUX-08 archive merge of #522). Tested source SHA `7228b8cad8c70b7af7fb57e7f47013c8617fe04d`. Production commit `319175d7a1bb2b2d236a7a0b92aef4f3bcf9e9cb`. The empty-month assertion is the only change after that production commit. This evidence file does not change that source.
- MUX-04 is on this base: implementation #511 merge `b912b0407340a1bb5f1efeca29f76f6eb0863c8d`. STYLE-03 is PR #496. MUX-08 is on this base: implementation #521 merge `c14616b014e1b64138f635372cf2db03840fea37`, archive #522 merge `2e699ab66ec68318cb7d971964e7be0432eeca42`. Poster shelves, series lifecycle, detail return, capture type, book shelves, the game cabinet, and music groups stay and were not reimplemented. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/405#issuecomment-6988046584

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| MUX-09-A1 | Python `test_saved_reads_share_one_calendar_and_a_month_is_not_a_day` with `MEDIA_TODAY=2026-11-18` and `TMDB_API_KEY` unset. Synthetic Paper Month is stored from `2026-11-20` at month precision and published as band `month_band`, `release_on` `2026-11`, `on` null. The JSON does not contain `2026-11-01`. Year Lantern is `year_band` / `2026`. Undated Reel is `unknown` with `release_on` null. Night Screening stays the real day `2026-11-28`. Playwright `Now and Calendar share one saved read at phone size` shows Paper Month with the month label, no day-1 string, and no raw ISO date, then Calendar shows `Paper Month · <month year>`. `bundle-m` shows Month-only release as October 2026, Year-only release as 2026, and Unknown release as Date unknown. | PASS at `7228b8cad8c70b7af7fb57e7f47013c8617fe04d` |
| MUX-09-A2 | The same Python test: two calendar GETs make 0 wiki calls and 0 tmdb calls, `partial` is false, and the bodies match. One refresh makes 1 wiki call and 0 tmdb calls. The following GET adds 0 calls. `unconfigured` is `["tmdb"]` because synthetic Keyed Film is a saved TMDB movie and the key is absent. That sentence is not a live account. Playwright phone touch outage at 390×844 night: Now loads with 1 calendar GET and 0 POSTs, the Harbor Signal next-episode button and Paper Month stay, a mocked 502 refresh is 1 POST, and the in-app Calendar link plus back stay at 1 GET and 1 POST. The 502 is fulfilled in the browser, so that POST does not reach a provider. | PASS at `7228b8cad8c70b7af7fb57e7f47013c8617fe04d` |
| MUX-09-LIFE | Playwright `a late refresh does not move the other month` at 1280×800 light keyboard. The refresh POST is held, the month input moves to the next month, and the released body is month `2020-01` titled Late Ghost. Late Ghost is absent, December Lantern stays, the month input keeps the next month, and the POST count stays 1. The outage journey keeps Paper Month and the next-episode control after the 502. Now and Calendar have no text draft; the month query is the recoverable input and survives that failure. `phase0` `a real session expiry removes private drafts and returns to sign-in` still passes, so `MediaDrafts` still clears `media-item-draft:` keys. A session clear drops the in-memory calendar slot so a late body cannot publish for the next owner. | PASS at `7228b8cad8c70b7af7fb57e7f47013c8617fe04d` |
| MUX-09-VIEW | `now-calendar.spec.ts` at 390×844 light keyboard and 1280×800 night touch, reduced motion. Labels are Now, Coming out, Refresh release metadata, Month, and See where these dates sit. Refresh, the month input, the calendar link, and the next-episode control are at least 44px. Keyboard Enter refreshes and returns focus to Refresh release metadata. Touch taps the same controls. Axe on `main` reports no serious or critical violations. Contrast follows the existing light and night tokens (`rgb(24, 46, 64)` and `rgb(255, 240, 212)`). Empty library hides Coming out. A want book with no release date shows Nothing coming out this month. Calendar’s empty day list still says No dated releases this month. Series shelf next episode and ← Library still return to `kind=tv`. The full Media Playwright suite is 171 passed, including detail return, capture type, book shelves, the game cabinet, poster shelves, and music groups. | PASS at `7228b8cad8c70b7af7fb57e7f47013c8617fe04d` |

Synthetic titles only: Paper Month, Year Lantern, Undated Reel, Night Screening, Seen Reel, Keyed Film, Harbor Signal, December Lantern, Dated show, Someday book, Late Ghost, Month-only release, Year-only release, Unknown release. No real release calendar and no provider credential. An unset TMDB key is reported as unconfigured. The suite does not prove a TMDB account.

## How the two screens share data

`SavedCalendar` is the one in-memory owner, keyed by owner, browser timezone, and month. `read` is one GET of `/media/api/calendar`. A fresh slot is reused with no HTTP. An in-flight GET is shared. `refresh` is one POST of `/media/api/calendar/refresh`, and a second caller joins that POST. A response is stored only when its epoch, owner, and month still match. A failed refresh keeps the previous payload. `forget` marks the slot stale so the next open GETs the database once and does not POST. The server GET uses `Budget(offline=True)`, so a saved read refuses the network and does not look like an outage. Refresh is the provider request.

## Request counts

| Path | Saved GETs | Refresh POSTs | Provider calls |
| --- | --- | --- | --- |
| Python: two GETs of 2026-11 | 2 | 0 | 0 wiki, 0 tmdb |
| Python: one refresh, then one GET | 3 total | 1 | 1 wiki, 0 tmdb, and the last GET adds 0 |
| Browser: Now, then in-app Calendar, before refresh | 1 | 0 | 0 (GET is offline) |
| Browser: one explicit refresh, then Calendar again | 1 | 1 | one refresh request; the second screen adds 0 |
| Browser outage: Now, 502 refresh, in-app Calendar, back | 1 | 1 | the POST is mocked 502 and does not reach a provider |
| Browser late refresh | 1 for the open month, plus the next month’s saved GET | 1 | the held POST is one request and its body is discarded |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Now’s private upcoming classifier and Calendar’s separate client read of the same month. | `now.component.ts` rendered `summary.upcoming`. `calendar.component.ts` called the calendar HTTP itself. | `SavedCalendar` plus `build_calendar`. Now’s Coming out section and Calendar both call `read` / `refresh`. | The only frontend caller of `/media/api/calendar` is `saved-calendar.service.ts`. Opening Now and then Calendar in the same document stays at 1 GET until an explicit refresh. |
| `summary`’s own `classify_release` and its `episode_state` loop for Now’s next episodes. | Hub and Now read `summary.upcoming` and `summary.next_episodes`. | `when.classify_release` and `when.public_release_on` for dates. `records._library_show_progress` for continuation. The series shelf still owns the button. | `summary.py` no longer defines `classify_release` and no longer calls `episode_state`. Harbor Signal’s upcoming continuation is the shelf row. Last Reel, ended and caught up, stays off Now. `records.py` is unchanged. |
| A saved calendar GET that marked the month partial without a network call. | `Budget(limit=0)` set `partial` when it refused work. | `Budget(offline=True)` refuses the network and leaves `partial` false. A failed refresh still sets `partial`. | Two GETs in the Python test have `partial` false and 0 provider calls. |

- Feature replacement at base `2e699ab66ec68318cb7d971964e7be0432eeca42`. Production adds 893 and deletes 255 physical lines (net +638). Counted files: `calendar.py` 28/5, `followups.py` 5/1, `summary.py` 97/76, `calendar.component.ts` 103/89, `format.mjs` 23/0, `format.d.mts` 13/0, `library.component.ts` 4/17, `media.css` 29/0, `now.component.ts` 333/67, `saved-calendar.service.ts` 196/0, `theater.d.mts` 32/0, `theater.mjs` 30/0. The positive delta is the shared cache, Now’s coming-out section, poster cards for films and series already in progress, and the band treatment. It is not a simplification.
- Tests add 513 and delete 7 (`now-calendar.spec.ts` 299, `now.spec.ts` 2/0, `test_calendar.py` 152/0, `theater.test.mjs` 35/1, `test_journal.py` 13/4, `format.test.mjs` 8/1, `bundle-m.spec.ts` 4/1). Docs replace 1 line in `docs/MEDIA.md`. `quality/mypy-baseline.txt` drops the fixed `summary.py` call-overload (79 findings remain). `apps/media/AGENTS.md` stays unchanged. This evidence file is separate.
- `episode_state` remains the detail owner. Hub still reads `summary.upcoming` and `summary.next_episodes`; public dates no longer invent a day. Games and books stay off the calendar. No second calendar store, no second next-episode implementation, and no new crypto protocol.
- Style uses the existing `--data-edge` tokens: Now is the teal edge and Calendar is the coral edge. STYLE-03’s collection material is unchanged.

## Verification

Playwright used cached Chromium 1248. This worktree has no installed `.venv` or `node_modules`; gates used symlinks to `/home/vivek/Deployments/vivek-monorepo/.venv` and `node_modules`. Those symlinks are gitignored and were not staged. `make test-fast` and the Python gates need `PATH=".venv/bin:$PATH"`. Karma used `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `make build-frontends` wrote `dist/web` and release `a11fd4aa75708408ca49168b3865ce5c93fa87e89941c1cb3f08c5360449a099`. The production bundle reported the existing initial-size warning at 672.84 kB versus a 650 kB budget and did not fail. Media coverage is 75.37% against the existing 68.7% floor (111 passed). The floor was not changed.

| Exact command | Final result |
| --- | --- |
| `PATH=".venv/bin:$PATH" make test-fast` | PASS before this evidence file. Doc paths, planning validation (105 active packets, 24 parents, 82 completed packets, forty TD owners), blame ignore, shared boundaries, finance UX F1, 135 unittest OK, e2e discovery media files=27 listed-not-executed, 21 Node script tests. |
| `PATH=".venv/bin:$PATH" make lint-python` | PASS. 248 files formatted. ruff 90 findings match the baseline. suppressions 6 match. |
| `PATH=".venv/bin:$PATH" make typecheck-python` | PASS after dropping the fixed summary call-overload. mypy 79 findings match the baseline. |
| `PATH=".venv/bin:$PATH" ./scripts/coverage-gate.sh media` | PASS. 111 passed. Total coverage 75.37%. Floor 68.7% unchanged. |
| `make lint-web` | PASS. ESLint baselines matched. |
| `make typecheck-web` | PASS. All seven `tsc` projects. |
| `CHROME_BIN="$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 417 of 417. |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 55 tests, 0 failed. |
| `make build-frontends` | PASS. Release `a11fd4aa75708408ca49168b3865ce5c93fa87e89941c1cb3f08c5360449a099`. |
| `./node_modules/.bin/playwright test --config apps/media/e2e/playwright.config.ts --reporter=line` | PASS. 171 passed, 0 failed (1.2m), on `7228b8cad8c70b7af7fb57e7f47013c8617fe04d`, including Now, Calendar, the month band, continuation, explicit refresh, the provider outage, the late refresh, the series shelf, and detail return. |

## Handoff

- PR URL (leaf closure keyword only): after this evidence commit is pushed.
- Roadmap #134 append-only status-note URL: after merge and archive.
- Merged/activation status: local gates above passed on `7228b8cad8c70b7af7fb57e7f47013c8617fe04d`. Merge waits on required checks.
- Remaining external prerequisites: none for this leaf. OPS-06 / #277 was not touched. No Town minigame was added.
- Next actor: push, open the pull request, wait for required checks, merge, then archive. Parent #304 remains open.
