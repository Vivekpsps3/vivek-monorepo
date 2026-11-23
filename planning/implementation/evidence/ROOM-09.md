# ROOM-09 — implementation evidence

- Leaf issue and parent(s): [#459](https://github.com/Vivekpsps3/vivek-monorepo/issues/459) ROOM-09. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-09`; `/tmp/vivek-room-09`. The shared checkout was not edited. Health, Finance, Travel, Town, pixels, and server code outside `apps/media/backend/services/records.py` were not edited.
- Base main SHA, current tested SHA: implementation base `f527ccf6515fe64d5441d0068f1c6c26114816e8` (ROOM-08, pull request #562). Tested product `a476c50592ed1acc892ee18a7d08f7a1c5593239`. The verification table is that product. `origin/main` was fetched again before this file and was still that base.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, pull request #555, merge `57b69462126defe6bf3b8853237a8b18c1c9abcf`), MUX-03 (#399, pull request #510, merge `189a1780480a22c6d44b65c62152f9c4f91a6cd4`), and MUX-08 (#404, pull request #522, merge `2e699ab66ec68318cb7d971964e7be0432eeca42`) are ancestors of `origin/main`. FIT-05 and SCENE-08 do not overlap these files.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-09-A1 | Synthetic Lantern Pressing is saved first at 6 / 10 with a cover, under manual identity Lantern Voice. The artist wall shows one group, the heading is plain text, the follow line is “Not followed,” and the album card shows “6 / 10.” The group payload has `rating` null, `artwork_url` null, `followed` false, and that one album. Opening the album checks “6 out of 10.” | PASS | `apps/media/e2e/music-bar.spec.ts` album-first wall at four viewports. `apps/media/backend/tests/test_artist_groups.py` album-first group. |
| ROOM-09-A2 | Following the same identity does not copy the album rating or cover onto the artist. Unfollow keeps the album at 6 / 10. Deleting the artist returns 404 for that entry and leaves the album, its rating, and its cover. The wall still shows one unfollowed Lantern Voice group and Lantern Pressing at 6 / 10. | PASS | `music-bar.spec.ts` unfollow and delete journey. `test_artist_groups.py` `test_unfollow_and_delete_keep_the_independently_saved_album`. |
| ROOM-09-LIFE | A typed `https://example.com/keep` link stays in `#external-music` and `media-music-link:1` through a 503 on the artist list and Retry. The direct album read stays at rating 6. Sign-out through the account menu reaches `/auth/login` and removes `media-music-link:` keys. A held list that later returns Late Voice does not paint an artist wall or song stage on Movies, and the link is still there when Artists opens again. `javascript:` does not call `window.open`. | PASS | `music-bar.spec.ts` failed read, sign-out, and late list. |
| ROOM-09-VIEW | 390×844 light keyboard and dark touch, and 1280×800 light touch and dark keyboard, with reduced motion. Portrait, Harbor Rhythm, and Open external music are at least 44px. Harbor Rhythm focuses its heading, shows that it does not play audio, and returns focus on close. An https link opens in a new tab with `noopener,noreferrer`. Axe serious and critical violations on `main` are empty. The page does not grow horizontally. There is no audio, video, or iframe. | PASS | `music-bar.spec.ts` four viewport journeys. Captures: `music-bar-390-light.png`, `music-bar-390-dark.png`, `music-bar-1280-light.png`, `music-bar-1280-dark.png` (test output, not committed). |

Fixtures are synthetic. Lantern Voice and Lantern Pressing are test titles. The wall reads `GET /media/api/music-groups`. The typed link is same-session `sessionStorage` under `media-music-link:` and clears when the session emits `cleared$`. No second library store, no new crypto, and no unlicensed audio. Harbor Rhythm does not open a URL.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Inline artist grid and the album/song generic cards inside the music collection | `LibraryComponent` rendered `.artist-group` for `kind=artist`, and the shared item grid for albums and songs. | `MusicRoomsComponent` (`media-music-rooms`) for the music collection. `MusicStageComponent` (`media-music-stage`) owns Harbor Rhythm and the external link. `media-card` still renders each record. All-items, books, movies, series, and games keep the library grids. | The music branch of the library template now mounts those two components. Artist-group markup, Show/Hide names, saved albums, and saved songs stay inside the rooms component. Outer wall, racks, songbook, and stage are `div` regions so an artist `section` stays one group. | Music Playwright still expects `.artist-group`, “Show saved albums and songs”, “6 / 10”, and “Not followed.” `detail-editor.spec.ts` “Back from an expanded artist” passes. `git grep` finds `media-music-rooms` and `media-music-stage` only in the library template and the new component. |

- Candidate class and protected counterexamples: feature replacement of the music-collection presentation. Canonical grouping, album rating, delete, and unfollow stay on `records.py`. `artwork_url` on a group is the artist portrait or catalog image. An album cover is not copied there. The all-items grid, including `#saved-{id}`, stays in the library. No rhythm-game implementation was added.
- Comparison base SHA and full replacement closure (including new files): `f527ccf6515fe64d5441d0068f1c6c26114816e8`. New production files: `music-bar.component.ts` (417), `music-bar.component.css` (183), `music-bar.mjs` (15), `music-bar.d.mts` (1). Changed production files: `library.component.ts` (+27/−97), `library-filters.mjs` (+3/−3), `media-card.component.ts` (+2/−1), `media-card.component.css` (+9), `media.models.ts` (+2), `records.py` (+8).
- Production added/deleted/moved; comments/blank-only churn separately: production +667/−101, net +566. Docs +4/−5 (`docs/MEDIA.md` and Media `AGENTS.md`, which stays at 296 words). Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 0 inline music grid in the library. 0 / 1 music rooms component. 0 / 1 song stage. 1 / 1 artist-group payload (`list_saved_artist_groups`). 1 / 1 media card. 0 / 0 audio players.
- State/cache owners and public entry points before/after: saved music stays on the media entry and music-group routes. The stage stores one same-session link and does not write `media-item-draft:`. A late library response is dropped by the existing kind and epoch guard. Public entry remains `/media/library?kind=artist`, `kind=album`, and `kind=track`. Item links remain `/media/item/:id`.
- Remaining old symbol/path search, including config and discovery: `.artist-group`, `.saved-album`, and `.saved-songs` live in the rooms template and its stylesheet. The library no longer inlines that grid for the music collection. No `audio`, `video`, or iframe element was added. No Town file was edited.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +380/−0 (`music-bar.spec.ts` 272, `music-bar.test.mjs` 23, `test_artist_groups.py` +85). Docs are Media guidance, Media `AGENTS.md`, and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `ee82846e63284c1d2c927d66dd3ddf9c094338458712e7e4b5920d81f3dadaeb`. The initial-bundle warning is 680.05 kB against the 650 kB warning budget. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +566 production lines. This is the feature: the artist wall, album racks, songbook, and the separate song stage. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Album-first grouping, personal album rating, unfollow, and delete assertions remain. The music collection now asserts the wall, racks, and songbook. Media Playwright is 188 passed.

## Verification

Commands ran in `/tmp/vivek-room-09` on product `a476c50592ed1acc892ee18a7d08f7a1c5593239`, at base `f527ccf6515fe64d5441d0068f1c6c26114816e8`. `make test-fast` used `PATH="/tmp/vivek-room-09/.venv/bin:$PATH"` because `.venv/bin/python3` is the system interpreter and does not have alembic. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright found its Chromium without `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout. Neither symlink is committed. Playwright ran against the production bundle of this source. `python3 planning/implementation/plan.py launch ROOM-09` printed the web and Media commands below.

The first `make build-frontends` failed because the template bound private `currentFilters`. That method is public, and the rebuild exited 0. The first full Media Playwright run failed 5 tests: the artist wall was a `section`, so detail-editor matched every Show button; album-cover image requests were counted as providers; touch viewports had no `hasTouch`. Outer music regions are `div` landmarks, the provider watcher records only discography and MusicBrainz URLs, and each viewport uses `test.use`. The recorded Playwright result is the rerun.

| Command | Result |
| --- | --- |
| make test-fast | PASS. Planning/docs, boundaries, 135 Python tests, and 21 Node script tests. Media e2e files are listed (30) and not executed by this gate. |
| make lint-web | PASS. eslint-finance 344 findings match the baseline. eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| make typecheck-web | PASS. Web app and spec, Finance, packages, and site. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS. 565 SUCCESS. Statements 76.92% (8596/11174), branches 64.01% (3722/5814), functions 78.4% (1768/2255), lines 82.02% (7461/9096). Rerun after the landmark change. |
| node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs | PASS. 58 pass, 0 fail. |
| make build-frontends | PASS. Production build and release manifest. Warning budget and Finance import warnings as above. Exit 0. Release `ee82846e63284c1d2c927d66dd3ddf9c094338458712e7e4b5920d81f3dadaeb`. |
| npx playwright test --config apps/media/e2e/playwright.config.ts | PASS. 188 passed (1.8m), including the four music-bar viewport journeys, unfollow and delete, sign-out, the late list, and the expanded-artist return. |
| make lint-python | PASS. 262 files already formatted. ruff 90 findings match the baseline. suppressions 6. |
| make typecheck-python | PASS. mypy 79 findings match the baseline. |
| ./scripts/coverage-gate.sh media | PASS. 112 passed. Total coverage 75.39%. `records.py` 85.73%. Required floor 68.7% was not changed. |

## Handoff

- PR URL (leaf closure keyword only): not opened at this commit.
- Roadmap #134 append-only status-note URL: not posted. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): the branch is local and ahead of `origin/main` by the product commit. It is not pushed and not merged.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review and deployed activation stay separate.
- Next actor: this implementer opens the pull request, waits for the required checks, then merges with a merge commit.
