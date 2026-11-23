# ROOM-07 — implementation evidence

- Leaf issue and parent(s): [#457](https://github.com/Vivekpsps3/vivek-monorepo/issues/457) ROOM-07. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#314](https://github.com/Vivekpsps3/vivek-monorepo/issues/314) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-07`; `/tmp/vivek-room-07`. The shared checkout was not edited. Health, Town habit files, and the Finance public API were not edited.
- Base main SHA, current tested SHA: implementation base `7e2acd1e6628f5acb70abd64853f8619611f7993` (ROOM-04 merge, pull request #557). The verification table is the uncommitted Theater product on that base, before this evidence file. The implementation commit that contains those files is the tested product. `origin/main` is `e7a5e16b3e2165fae856bc2e7820e18084022a09` (FIT-04 pull request #559) and was not merged into this branch. That tip only changes Town health and FIT-04 evidence.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, pull request #555, merge `57b69462`) is an ancestor. MUX-04 archive `e86bd245` and evidence `883abde2` are ancestors (merge pull request #512). MUX-08 archive `2e699ab6` and evidence `98ff85ee` are ancestors (merge pull request #522). At handoff, the only other open pull request was #558 (`agent/scene-04`). It does not edit Media. No competing pull request owned the Theater files. FIT-04 files do not overlap this diff.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-07-A1 | Synthetic Velvet Screening (completed, rating 8, note, `viewed_on` 2024-03-02) opens from its poster. The auditorium shows the recorded watch and “This screening does not play the film.” The ticket saves the rating and note. The film link opens `/media/item/:id`. Paper Lantern stays Planned: a stored 2024-01-15 date is absent from the poster and remains in Watched on. Quiet Projector is Watched with no date. | PASS | `apps/media/e2e/theater.spec.ts` four viewport journeys. `apps/media/e2e/theater-shelf.spec.ts` planned, dated, and undated posters. |
| ROOM-07-A2 | Bare Poster has no cover. Torn Poster is planned, rating 5, note “Still the saved note,” with a stubbed provider 503. Editing the note to “Torn note edited” and saving posts no `/refresh`. The stored rating and note remain. | PASS | `theater.spec.ts` missing-cover and provider-outage test. `data-cover="missing"`. |
| ROOM-07-LIFE | A newer typed note stays after a late successful save and asks to save again. Leaving during PATCH drops the losing body. A failed save keeps the typed note and restores that same-session draft. Sign-out clears drafts and lands on `/auth/login`. A library 503 is a local error, not an empty lobby. A film GET 502 can be retried. A late GET for a previous film is ignored by the request token. | PASS | `theater.spec.ts` late-save, leave, failed-save, sign-out, and library/film error tests. |
| ROOM-07-VIEW | 390×844 light keyboard and dark touch, and 1280×800 light touch and dark keyboard, all with reduced motion. Lobby, corridor, auditorium, and ticket controls are at least 44px. Focus moves to the section heading and returns to Open screening. Axe serious and critical violations are empty. The page does not grow horizontally. There is no video and no play control. | PASS | The four Playwright journeys call `expectCleanMediaPage` and Axe on `main`. |

Fixtures are synthetic. Paper Lantern, Velvet Screening, Quiet Projector, Bare Poster, and Torn Poster are test titles. The desk reads and patches the existing entry routes. It does not add a film store, play a file, or call a live provider. `viewed_on` stays a recorded watch. `completed_on` is not that date. `apps/media/backend/services/records.py` was not changed.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Movie-collection poster grid (`media-card` poster layout when `kind=movie`) | Library movie branch rendered the shared poster grid. Series and Now still use `media-card` posters. | `TheaterComponent` (`media-theater`) for the movie collection. Series stay on `.theater-shelf`. Books stay `media-book-shelf`. Games stay `media-game-cabinet`. All items stay rows. | The movie branch no longer renders that poster grid. `media-card` remains. No playback path was added. | Movie Playwright expects `.theater-poster` and zero `.media-card--poster`. Series still expect poster cards. |

- Candidate class and protected counterexamples: feature replacement of the movie collection presentation. Saved films, ratings, notes, recorded watches, series posters, the book shelf, and the game cabinet stay on their existing owners.
- Comparison base SHA and full replacement closure (including new files): `7e2acd1e6628f5acb70abd64853f8619611f7993`. New production files: `theater.component.ts` (656), `theater.component.css` (203). Changed production files: `library.component.ts` (+45/−1), `library-filters.mjs` (+1/−1).
- Production added/deleted/moved; comments/blank-only churn separately: production +905/−2, net +903. Docs +3/−3 (`docs/MEDIA.md` and Media `AGENTS.md`, which stays at 300 words). Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 theater. 1 / 1 media entry store. 1 / 1 series poster shelf. 1 / 1 book shelf. 1 / 1 game cabinet.
- State/cache owners and public entry points before/after: films stay on the media entry API. The ticket draft stays in `sessionStorage` under `media-item-draft:{userId}:{id}` and clears on session clear. A same-base draft restores in the same session. Public entry is `/media/library?kind=movie`. The film link remains `/media/item/:id`.
- Remaining old symbol/path search, including config and discovery: `shelfLayout()` returns poster only for series. Now still uses poster cards for movie and series. No video element or play control was added.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. The series episode lounge stays with ROOM-08. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +466/−7, net +459 (`theater.spec.ts` 450, plus `theater-shelf.spec.ts`, `book-shelf.spec.ts`, and `game-cabinet.spec.ts`). Docs are Media guidance, Media `AGENTS.md`, and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `7122562bc2d44f37815d7de366f0a1de966ceedc0a3903478b6aa40168b03cdb`. The initial-bundle warning is 679.72 kB against the 650 kB warning budget. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +903 production lines. This is the feature: lobby, poster corridor, movie auditorium, and ticket desk on saved films. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Media Playwright is 179 passed, including the theater journeys and the existing series, book, and game shelf tests.

## Verification

Commands ran in `/tmp/vivek-room-07` on the uncommitted product at base `7e2acd1e`. `make test-fast` used `PATH="/tmp/room07-py:$PATH"`, where that `python3` executes `/tmp/vivek-room-07/.venv/bin/python`, because `.venv/bin/python3` is the system interpreter and does not have alembic. The first `make test-fast` without that shim failed in `scripts.test_restore_drill` with `ModuleNotFoundError: No module named 'alembic'`. That failure is the interpreter, not this leaf. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright found its Chromium without `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout. Neither symlink is committed. Playwright ran against the production bundle of this source. `make build-frontends` was run again on the same source and wrote the release above. No product file changed between those two builds.

| Command | Result |
| --- | --- |
| make test-fast | PASS. Planning/docs, boundaries, 135 Python tests, and 21 Node script tests. Media e2e files are listed (28) and not executed by this gate. |
| make lint-web | PASS. eslint-finance 344 findings match the baseline. eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| make typecheck-web | PASS. Web app and spec, Finance, packages, and site. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS. 552 SUCCESS. Statements 76.33% (8304/10878), branches 63.07% (3531/5598), functions 77.37% (1700/2197), lines 81.42% (7214/8860). |
| node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs | PASS. 55 pass, 0 fail. |
| make build-frontends | PASS. Production build and release manifest. Warning budget and Finance import warnings as above. Exit 0. Release `7122562bc2d44f37815d7de366f0a1de966ceedc0a3903478b6aa40168b03cdb`. |
| npx playwright test --config apps/media/e2e/playwright.config.ts | PASS. 179 passed (1.2m), including the four theater viewport journeys, the missing cover, the provider outage, the late save, the leave-during-save, the failed save, and sign-out. |
| make lint-python, make typecheck-python, ./scripts/coverage-gate.sh media | NOT RUN. This leaf's diff has no Python product code. |

## Handoff

- PR URL (leaf closure keyword only): not opened when this sentence is written. The body will say `Closes #457` only.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged. `origin/main` `e7a5e16b3e2165fae856bc2e7820e18084022a09` is not an ancestor. The pull request is not open when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review and deployed activation stay separate. The series episode lounge stays with a later room leaf.
- Next actor: this implementer commits, pushes, opens the pull request, waits for the required checks, then merges with a merge commit.
