# ROOM-08 — implementation evidence

- Leaf issue and parent(s): [#458](https://github.com/Vivekpsps3/vivek-monorepo/issues/458) ROOM-08. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#314](https://github.com/Vivekpsps3/vivek-monorepo/issues/314) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-08`; `/tmp/vivek-room-08`. The shared checkout was not edited. Health, Finance, Travel, Town, pixels, and server code outside Media were not edited. `apps/media/backend/services/records.py` was not edited.
- Base main SHA, current tested SHA: implementation base `9d6b74eb2ea1b002d669fa586878da602ce0e607` (ROOM-07, pull request #560). Tested product `3498b932fe2f734acfe2077cda2bfeaab47c8c82`. The verification table is that product. `origin/main` then moved to `1745b9c0e2ecece93122544570e3c72edef6654a` (SCENE-04, pull request #558). That tip was merged as `6b1bade4660439160a9aad3d7def6e51112a00ef`. It changes Town habits and the Town e2e allowlist, not Media.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, pull request #555, merge `57b69462126defe6bf3b8853237a8b18c1c9abcf`), MUX-04 (#400, pull request #512, merge `67fb3799d8f6a39daa4b0d619bd4607473fbd7e6`), and MUX-09 (#405, pull request #524, merge `ac35a3172d328b7da542b22ecba5df5436e34cc4`) are ancestors of `origin/main`. SCENE-04 was the other open pull request and is now on main. FIT-05 does not overlap these files.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-08-A1 | Synthetic Undated Lantern and Lantern Hour. Watching the next aired episode, then Undo, returns that episode to next. The entry stays `in_progress`. The unknown-air episode stays unwatched. Focus returns to the title, and seating shows the next seat again. | PASS | `apps/media/e2e/episode-lounge.spec.ts` watch and Undo. `apps/media/e2e/theater-shelf.spec.ts` Lantern Hour watch, Undo, and seating after Undo. |
| ROOM-08-A2 | Ended Lantern is Caught up and Ended, with no watch control and a watched seat only. Future Lantern is Caught up and Ongoing, shows the 2099 air line and “Waiting for the next episode,” and seats the later episode as Future. Undated Lantern seats S1E2 as Air date unknown. Nothing marks a future or unknown episode or completes the entry. | PASS | `episode-lounge.spec.ts` ended, future, and unknown journey. `theater.test.mjs` seat classification. |
| ROOM-08-LIFE | A late seating read for Glass Hour cannot replace Brass Hour. A 502 on watch keeps the button and the unwatched episode. A 502 seating read keeps the series and Retry restores the seats. Leaving for Movies during a held read drops that body. Sign-out, then opening seating, reaches `/auth/login` and leaves no `media-item-draft:` keys. | PASS | `episode-lounge.spec.ts` late read, 502, leave, and sign-out. |
| ROOM-08-VIEW | 390×844 light keyboard and dark touch, and 1280×800 light touch and dark keyboard, with reduced motion. Open seating, calendar, watch, and close controls are at least 44px. Focus moves to the seating heading and returns to Open seating. Axe serious and critical violations on `main` are empty. The page does not grow horizontally. There is no video element. | PASS | `theater-shelf.spec.ts` four viewport journeys, plus the lounge spec at 390 light and 1280 dark. |

Fixtures are synthetic. Ended Lantern, Future Lantern, Undated Lantern, Lantern Hour, Glass Hour, and Brass Hour are test titles. The board reads the library continuation. Seating reads one saved entry. Both use `episode_state` already returned by Media. No second progress store, no new crypto, and no unlicensed video.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Series-collection poster shelf (`.theater-shelf`, `shelfLayout`, `showShelfAction`, library `airLine`) | The library `kind=tv` branch rendered poster cards and the next-episode button. | `EpisodeLoungeComponent` (`media-episode-lounge`) for the series collection. Now still uses `media-card` posters and `media-next-episode`. Detail keeps `.episode-row`. Movies stay `media-theater`. | The series branch no longer renders that poster grid. The CSS for `.theater-shelf` and `.theater-actions` is removed. `seriesShelf` and the next-episode button stay. | Series Playwright expects `media-episode-lounge` and `.lounge-row`. Now still expects `media-card`. `git grep` finds no `theater-shelf`, `shelfLayout`, or `showShelfAction`. |

- Candidate class and protected counterexamples: feature replacement of the series collection presentation. Saved episodes, caught up, lifecycle, watch, Undo, and the calendar stay on their existing owners. `records.py` is unchanged.
- Comparison base SHA and full replacement closure (including new files): `9d6b74eb2ea1b002d669fa586878da602ce0e607`. New production files: `episode-lounge.component.ts` (428), `episode-lounge.component.css` (196). Changed production files: `theater.mjs` (+90), `theater.d.mts` (+69), `library.component.ts` (+15/−47), `library-filters.css` (−25), `library-filters.mjs` (+1/−1).
- Production added/deleted/moved; comments/blank-only churn separately: production +799/−73, net +726. Docs +4/−4 (`docs/MEDIA.md` and Media `AGENTS.md`, which stays at 297 words). Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 0 series poster shelf in the library. 0 / 1 episode lounge. 1 / 1 episode store (`episode_state` and the library continuation). 1 / 1 Now poster card. 1 / 1 movie theater.
- State/cache owners and public entry points before/after: progress stays on the media entry and episode routes. The lounge does not write `media-item-draft:` keys. A late seating response is dropped by a per-series token, and session clear drops the open diagram. Public entry is `/media/library?kind=tv`. The series link remains `/media/item/:id`. The calendar link remains `/media/calendar`.
- Remaining old symbol/path search, including config and discovery: no `theater-shelf`, `shelfLayout`, or `showShelfAction` in the tree. Now still uses poster cards. No video element or play control was added.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +391/−5, net +386 (`episode-lounge.spec.ts` 274, plus `theater-shelf.spec.ts`, `theater.test.mjs`, `book-shelf.spec.ts`, and `now-calendar.spec.ts`). Docs are Media guidance, Media `AGENTS.md`, and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `94a1ecd6f51e0886d9a5a89aebb93eb8bf1f843f4e0ee9ff0626ffe97dfdf416`. The initial-bundle warning is 679.80 kB against the 650 kB warning budget. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +726 production lines. This is the feature: the next-episode board and the seating diagram on saved series. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Watch, Undo, caught up, ended, and ongoing assertions remain. The series collection now asserts the lounge instead of the poster grid. Media Playwright is 181 passed.

## Verification

Commands ran in `/tmp/vivek-room-08` on product `3498b932fe2f734acfe2077cda2bfeaab47c8c82`, at base `9d6b74eb`. `make test-fast` used `PATH="/tmp/vivek-room-08/.venv/bin:$PATH"` because `.venv/bin/python3` is the system interpreter and does not have alembic. The first `make test-fast` without that shim failed in `scripts.test_restore_drill` with `ModuleNotFoundError: No module named 'alembic'`. That failure is the interpreter, not this leaf. The same shim passed again after the SCENE-04 merge. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright found its Chromium without `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout. Neither symlink is committed. Playwright ran against the production bundle of this source. `python3 planning/implementation/plan.py launch ROOM-08` printed the web and Media commands below.

| Command | Result |
| --- | --- |
| make test-fast | PASS. Planning/docs, boundaries, 135 Python tests, and 21 Node script tests. Media e2e files are listed (29) and not executed by this gate. Repeated PASS after merging SCENE-04; Town files listed rose from 14 to 15. |
| make lint-web | PASS. eslint-finance 344 findings match the baseline. eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| make typecheck-web | PASS. Web app and spec, Finance, packages, and site. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS. 557 SUCCESS. Statements 76.54% (8454/11045), branches 63.55% (3662/5762), functions 77.73% (1735/2232), lines 81.66% (7342/8990). |
| node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs | PASS. 56 pass, 0 fail. |
| make build-frontends | PASS. Production build and release manifest. Warning budget and Finance import warnings as above. Exit 0. Release `94a1ecd6f51e0886d9a5a89aebb93eb8bf1f843f4e0ee9ff0626ffe97dfdf416`. |
| npx playwright test --config apps/media/e2e/playwright.config.ts | PASS. 181 passed (2.1m), including both lounge journeys and the four series viewport journeys. |
| make lint-python | PASS. 262 files already formatted. ruff 90 findings match the baseline. suppressions 6. |
| make typecheck-python | PASS. mypy 79 findings match the baseline. |
| ./scripts/coverage-gate.sh media | PASS. 111 passed. Total coverage 75.37%. Required floor 68.7% was not changed. |

## Handoff

- PR URL (leaf closure keyword only): opened after this file. The body is `Closes #458` only.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): the branch includes the SCENE-04 merge and is not yet pushed. `origin/main` is `1745b9c0e2ecece93122544570e3c72edef6654a`.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review and deployed activation stay separate.
- Next actor: this implementer pushes, opens the pull request, waits for the required checks, then merges with a merge commit.
