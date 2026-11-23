# ROOM-10 — implementation evidence

- Leaf issue and parent(s): [#460](https://github.com/Vivekpsps3/vivek-monorepo/issues/460) ROOM-10. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#314](https://github.com/Vivekpsps3/vivek-monorepo/issues/314) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-10`; `/tmp/vivek-room-10`. The shared checkout was not edited. `apps/web`, `apps/server`, Finance, and Travel were not edited. Pixel scores were not changed.
- Base main SHA, current tested SHA: implementation base `b4975ffffabde7e693c7af5de99a0fd78b652faa` (ROOM-09, pull request #564). Tested product `811267741ae28f6d2daeba4ee47fac7007882fe0`. `origin/main` was still that base at commit time.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, pull request #555, merge `57b69462126defe6bf3b8853237a8b18c1c9abcf`) and MUX-06 (#402, pull request #515, merge `7f55790a3d6c3ac92e4dc3c77cbcc581be86c35c`) are ancestors of `origin/main`. The game cabinet from MUX-06 is the collection this leaf extends. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/460#issuecomment-7095452843). SCENE-08 (pull request #563) and FIT-06 own Town scene, Town health, and Finance `public-api.ts`. Those trees were not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-10-A1 | Synthetic Paper Cartridge is want with no progress and is marked Unopened. Lantern Kart is playing at 12 hours and is opened. Untouched Quest is want with 3 hours recorded and is opened. Quiet Arcade is played and opened. Anticipated Port is anticipating and unopened. Opening Paper Cartridge reaches `/media/item` and Back leaves Unopened. Playing Memory Shelves and Harbor Rhythm writes no library, Town, or Pixels request. Paper Cartridge stays want with null progress, Lantern Kart stays at 12, and Untouched Quest stays at 3. Principal 2 sees zero games and a 404 for the other owner's entry. Another owner cannot apply a move to the stored session. | PASS | `apps/media/e2e/arcade.spec.ts` four viewport journeys. `apps/media/backend/tests/test_game_cabinet.py`. `apps/media/backend/static/tests/arcade.test.mjs` and `games.test.mjs`. |
| ROOM-10-A2 | With every game deleted, the page says "No games saved yet", shows no cabinet, and both tables stay Unopened. Tapping Lane 2 records one miss and the library total stays 0. A 503 body "Library locked" still lets Memory Shelves flip Shelf 1. Retry restores the empty cabinet and keeps that shelf label. The library total stays 0. | PASS | `arcade.spec.ts` empty collection and locked read. |
| ROOM-10-LIFE | A held `status=in_progress` library read does not change the open shelf. Leaving for Movies drops that response: Movies has no play tables and no Late Cabinet. Returning to Games restores the same shelf label from `media-arcade-play:`. Saved Paper Cartridge and Lantern Kart are unchanged. Sign-out through the account menu reaches `/auth/login` and removes `media-arcade-play:` keys. | PASS | `arcade.spec.ts` held read and sign-out. |
| ROOM-10-VIEW | 390×844 light keyboard and dark touch, and 1280×800 light touch and dark keyboard, with reduced motion. The catalog link, Play Memory Shelves, Shelf 1, Play Harbor Rhythm, and Lane 1 are at least 44px. Opening a table focuses its heading. Escape or Close returns focus to the Play button. Axe serious and critical violations on `main` are empty. There is no audio, video, or iframe, and no running animation under reduced motion. The existing 320px 200% cabinet page does not grow wider than the viewport. | PASS | `arcade.spec.ts` four viewport journeys. Captures `arcade-390-light-keyboard.png`, `arcade-390-dark-touch.png`, `arcade-1280-light-touch.png`, and `arcade-1280-dark-keyboard.png` (test output, not committed). `game-cabinet.spec.ts` long title at 320px. |

Fixtures are synthetic. Paper Cartridge, Lantern Kart, Untouched Quest, Quiet Arcade, and Anticipated Port are test titles. Play is same-session `sessionStorage` under `media-arcade-play:` and clears when the session emits `cleared$`. No second library store, no new crypto, and no audio. The music-bar Harbor Rhythm stage is unchanged and still plays no audio. The Arcade table of the same name is a separate four-lane pattern and also plays no audio.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Arcade play table. MUX-06 game cabinets stay. | `LibraryComponent` already mounted `media-game-cabinet` for `kind=game`. The music bar already owns a non-playing Harbor Rhythm stage. | `ArcadeTablesComponent` (`media-arcade-tables`) owns Memory Shelves and Harbor Rhythm on the game collection. `media-game-cabinet` still owns the boxes. `game_unopened` on a game library card is the Unopened fact. | No cabinet, bay, or music-stage path was removed. Play tables mount above the cabinet and outside the library data block, so an empty or failed read still shows them. Movies do not mount them. | `git grep media-arcade-tables` finds the component, the game branch of the library template, and `arcade.spec.ts`. Movies assert a count of 0. `media-game-cabinet` remains. The music stage file was not edited. |

- Candidate class and protected counterexamples: addition beside the existing cabinet. No feature was replaced. Cabinet status words, the missing-box sentence, and the sentence "This cabinet is your Media library, not a Town minigame." stay. Unopened is derived from status and progress. It is not a new column. Inspecting a box does not clear it. Play does not write a row. The all-items grid, movies, books, and music stay on their own components.
- Comparison base SHA and full replacement closure (including new files): `b4975ffffabde7e693c7af5de99a0fd78b652faa`. New production files: `arcade.mjs` (288), `arcade.d.mts` (84), `arcade.component.ts` (277), `arcade.component.css` (157). Changed production files: `records.py` (+13), `games.mjs` (+9), `games.d.mts` (+5), `library.component.ts` (+5), `library-filters.mjs` (+2/−2), `media-card.component.ts` (+8/−1), `media-card.component.css` (+1), `media.models.ts` (+2).
- Production added/deleted/moved; comments/blank-only churn separately: production +851/−3, net +848. Docs +3/−5 (`docs/MEDIA.md` and Media `AGENTS.md`, which is 299 words). Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 1 game cabinet. 0 / 1 Arcade play-table component. 1 / 1 music-bar Harbor Rhythm stage, still without audio. 0 / 0 audio or video players. 0 / 0 new stores.
- State/cache owners and public entry points before/after: saved games stay on the media library and entry routes. Play stays in `sessionStorage` for that owner and is not `media-item-draft:`. A late library response is dropped by the existing kind and epoch guard. Public entry remains `/media/library?kind=game`. Item links remain `/media/item/:id`.
- Remaining old symbol/path search, including config and discovery: `media-game-cabinet` remains the box owner. `media-arcade-tables` is new. No Town file, Pixel score, or discovery allowlist was edited. Media e2e discovery lists the new spec because it globs the directory.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited. GAME-10 and GAME-11 still own the full Town minigames.
- Tests/docs/generated changes separately: tests +479/−0 (`arcade.spec.ts` 293, `arcade.test.mjs` 150, `test_game_cabinet.py` +18, `games.test.mjs` +16, `library-filters.test.mjs` +2). Docs are Media guidance, Media `AGENTS.md`, and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `85545d0415163da243a141eca55795dbe92e9b8d7fad4b3444d919815559ad44`. The initial-bundle warning is 680.17 kB against the 650 kB warning budget. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +848 production lines. This is the feature: two play tables, the Unopened mark, and owner-scoped session play. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Cabinet bays, empty copy, missing box image, and the Town boundary sentence remain. Media Playwright is 194 passed.

## Verification

Commands ran in `/tmp/vivek-room-10` on product `811267741ae28f6d2daeba4ee47fac7007882fe0`. `make test-fast` and the Python gates used `PATH="/tmp/vivek-room-10/.venv/bin:$PATH"` because the system interpreter does not have alembic. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright found its Chromium without `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout. Neither symlink is committed. Playwright ran against the production bundle of this source. `python3 planning/implementation/plan.py launch ROOM-10` selects `docs` and `media_front`. The records change also ran the Python gates below. The coverage notice suggested a higher floor. The floor stayed 68.7%.

| Command | Result |
| --- | --- |
| make test-fast | PASS. Planning/docs, boundaries, 135 Python tests, and 21 Node script tests. Media e2e files are listed (31) and not executed by this gate. Town files stayed 15. |
| make lint-web | PASS. eslint-finance 344 findings match the baseline. eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| make typecheck-web | PASS. Web app and spec, Finance, packages, and site. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS. 573 SUCCESS. Statements 77.13% (8865/11493), branches 64.57% (3948/6114), functions 78.84% (1837/2330), lines 82.21% (7698/9363). |
| node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs | PASS. 62 pass, 0 fail. |
| make build-frontends | PASS. Production build and release manifest. Warning budget and Finance import warnings as above. Exit 0. Release `85545d0415163da243a141eca55795dbe92e9b8d7fad4b3444d919815559ad44`. |
| npx playwright test --config apps/media/e2e/playwright.config.ts | PASS. 194 passed (2.3m), including four Arcade viewport journeys, the empty and locked collection, the held read, sign-out, and the 320px cabinet page. |
| make lint-python | PASS. 262 files already formatted. ruff 90 findings match the baseline. suppressions 6. |
| make typecheck-python | PASS. mypy 79 findings match the baseline. |
| ./scripts/coverage-gate.sh media | PASS. 112 passed. Total coverage 75.41%. `records.py` 85.77%. Required floor 68.7% was not changed. |

## Handoff

- PR URL (leaf closure keyword only): not opened yet.
- Roadmap #134 append-only status-note URL: not posted. The issue body was not edited.
- Merged/activation status (actual evidence, not assumption): not merged. The branch is local at product `811267741ae28f6d2daeba4ee47fac7007882fe0`.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review and deployed activation stay separate. GAME-10 and GAME-11 still own the Town minigames.
- Next actor: this implementer opens the pull request, waits for the required checks, then merges with a merge commit.
