# MUX-01 — Separate the library into visible media-type collections

- Leaf #397. Tracking parent #304. Roadmap #134.
- Branch `agent/mux-01`. Worktree `/home/vivek/.grok/worktrees/deployments-vivek-monorepo/subagent-01a1edaf-647f-7740-9bd3-91e683ec24c4`.
- Base main `6ea4344f8f9fa256042583019a6de20862b1c69f` (merge of #504). Tested source SHA `243caf53c86129d156377b00085f9590bebcd4fc`. This evidence commit does not change that source.
- NAV-01 / #386 is merged as #498 and present: `mediaSections` still opens Movies, Series, Books, Music (`kind=artist`, also album and track), Games, and All items at `/media/library`. STYLE-03 / #384 is merged as #496 and present: library cards keep the shared `media-card` edge and the concealed library heading. Open PR #500 (`agent/nav-03`) edits Hub and Town only. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/397#issuecomment-6973048399

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| MUX-01-A1 | Synthetic Harbor Matinee, Harbor Season, Harbor Field Guide, Harbor Ensemble (Following) with Harbor Pressing and Harbor Single, and Harbor Tactics. From Music Following, keyboard activation of Books shows “Following does not apply to Books. Showing every state.”, Harbor Field Guide, and a State control with Want to read and no Following. The URL keeps `kind=book` and `sort=title` and drops `status`. No library GET pairs `kind=book` with `status=following`. A bookmarked `kind=book&status=following` is rewritten before the read. Albums and Songs say the same when Following cannot apply. Node helper test covers the same transition. | PASS |
| MUX-01-A2 | Twenty-five synthetic Shelf books plus the seeded library. Next items reaches `kind=book&sort=title&offset=24`, reload keeps Shelf 24, Back drops the page and keeps the collection and title sort, Favorites only keeps `fav=1` with the collection and sort across reload, and Shelf 24 remains the visible favorite. Movies then Books then Back and Forward restore each collection’s titles. | PASS |
| MUX-01-LIFE | A 503 on the Harbor search leaves the search box and Books URL in place; Retry library shows Harbor Field Guide with the same search. A held Books response cannot replace Games after the section link changes; Harbor Tactics stays, Harbor Field Guide stays at count 0, and the search text survives. The existing dense-collection hold still expects reads movie, book, game, game and a final `kind=game` URL. Library has no private draft store; detail review drafts and sign-out clearing remain on their existing screens, and the full Media Playwright suite including session-expiry draft removal passed. `records.py` still returns an empty page for an incompatible kind and status; the client fits the status before the request. | PASS |
| MUX-01-VIEW | Collection chrome at 390×844 touch and 1280×800 keyboard, light and dark, reduced motion. Books is current, at least 44px, and Games opens Harbor Tactics. Axe on `.media-workspace` has no serious or critical violations. The first library card at 390 stays above 450px. Screenshot scenes of the populated library and the empty filtered collection were captured at 390 and 1280. | PASS |

Reviewed captures: All items is a current section link with the sentence “All activity: movies, series, books, music, and games.” and a collection-colored leading edge. Cards stay on the shared media card. An empty favorite filter says “Nothing in this collection matches” and offers Clear filters and Search Media. Phone section links wrap. Desktop keeps Hub as home and the Media categories in one row.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition and proof |
| --- | --- | --- | --- |
| Library Filters Type dropdown | `LibraryComponent` filter dialog | Media section links plus Music Artists, Albums, and Songs links | Removed the Type select. Collections are the NAV-01 destinations. Album and song URLs stay reachable. Playwright asserts the dialog has no Type field. |
| Counting `kind` as a library filter, and the empty-kind copy “No saved items match these filters” | Filter count, empty state, screenshot spec | `filterCount` / `isFiltered` ignore kind. Empty copy is per collection. | Clear filters keeps the collection and clears state, favorite, and tags. An empty Movies collection says “No movies saved yet” and links to All items. |
| `apps/media/backend/services/records.py` list behavior | Library API | Same `list_library` | Read and retained. Incompatible kind and status still return zero rows. The UI does not request that pair. |

- Feature replacement at base `6ea4344f8f9fa256042583019a6de20862b1c69f`. Production files `library-filters.mjs`, `library-filters.d.mts`, `library-filters.css`, `library.component.ts`, and `media.component.ts`: 781 lines before, 1134 after. Diff adds 410 and deletes 57 physical lines (net +353). Tests add 394 and delete 35, including new `apps/media/e2e/collections.spec.ts` (242 lines). `docs/MEDIA.md` adds 2. This evidence file is separate.
- One library component, one `switchMap` read, and the existing `/media/api/library` route. Section links are rewritten from the current library URL. All items stays exactly `/media/library`. Query from `/media/search` is not copied onto collection links.
- No second catalog, crypto protocol, or library store. Media domain status, dates, and owner filtering stay in the existing records service.
- Searches of the library template find no Type field. `kinds` remains only to label the concealed heading. Search and Add keep their own Type controls.
- Synthetic titles are Harbor and Shelf fixtures. No private credentials.

## Verification

Node 20.20.2. Playwright 1.64.1 with cached Chromium 1248. Python gates used `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` because this worktree has no `.venv`; system `python3` lacks alembic, so the first `make test-fast` failed in `RestoreDrillTests` before any assertion about this change. The rerun below passed. Browser retries and coverage floors were unchanged. The production bundle reported the existing initial-size warning at 668.80 kB.

| Exact command | Final result |
| --- | --- |
| `PATH="/home/vivek/Deployments/vivek-monorepo/.venv/bin:$PATH" make test-fast` | PASS. Doc paths, planning validation (113 active packets, 74 completed), 135 Python tests, e2e discovery, 21 Node script tests. |
| `make lint-web` | PASS. eslint-finance 353, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all at baseline. Engine purity passed. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 412 SUCCESS. Statements 72.48% (5760/7947), branches 57.32% (2203/3843), functions 72.22% (1152/1595), lines 77.17% (5001/6480). |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 42 tests, 0 failed. |
| `npm run build && node scripts/write-release-manifest.mjs` | PASS. `make build-frontends` is this pair. |
| `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python npx playwright test --config apps/media/e2e/playwright.config.ts --reporter=line` | PASS. 114 tests, 0 failed. Includes collections, library filters, dense collection, screenshots, recovery, and the rest of the Media screens. |

Python lint, mypy, and `./scripts/coverage-gate.sh media` were not run: `records.py` and other Python files are unchanged.

## Handoff

- PR URL (leaf closure keyword only): opened after this evidence commit. `Closes #397`. References #304 and #134 without closing them. #386 and #384 stay closed.
- Roadmap #134 append-only status-note URL: after merge and archive.
- Merged/activation status: not merged at the time of this file.
- Remaining external prerequisites: none for this leaf. MUX-02 through MUX-09 stay with their owners. OPS-06 / #277 was not touched.
- Next actor: required CI, then merge, then archive.
