# FIXUP-31 — Put the next saved episode at the top of Series detail

- Leaf issue and parent(s): [#619](https://github.com/Vivekpsps3/vivek-monorepo/issues/619) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-31`, worktree `/tmp/vivek-fixup-31`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/619#issuecomment-7229264105). No subagents. The shared checkout was not edited.
- Base main SHA `a60cd5fb4dfe3f2c66bda1e682f3385c07dd07fd`. Media behavior tested at `9b19d53e76175ec4048dc8b80359243fe428b1c0`. FIXUP-29 then reached main as `2bd41147c144bb95d3611f008fc289929ff24c00` and was merged here as `56691d6a19a9b83b72aaba744fd161ded668b153`. That merge only added Gym files and `planning/implementation/evidence/FIXUP-29.md`. Media files were not edited again.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree. MUX-08 (#404, PR #521 merge `c14616b014e1b64138f635372cf2db03840fea37`, archive `2e699ab66ec68318cb7d971964e7be0432eeca42`) is an ancestor. Detail still leads films, books, songs, and games with progress, rating, and note, and a direct link still falls back to the collection. ROOM-08 (#458, PR #562 merge `f527ccf6515fe64d5441d0068f1c6c26114816e8`) is an ancestor. The episode lounge still watches, undoes, and keeps caught-up separate from a future episode. FIXUP-29 merged while this leaf was open. Its Gym files came in through the merge commit and were not edited here. GAME-11 was still open and was not touched.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-31-A1 | Synthetic in-progress shows at 390×844 and 1280×800, light and night, keyboard and touch, reduced motion. Direct `/media/item/:id`, Now, and Series each show `Watched S1E1` inside the viewport, above the Episode progress heading, with `Next: S1E1 · Pilot`. There is one such button and no `Mark next watched`. Progress stays hidden until `Edit rating and note`. Caught up shows `Caught up` and `Waiting for the next episode` with no watch button. An unreleased 2099 episode shows the air line and the same waiting copy. A show with no episodes says `No episode detail`. A saved row whose catalog extra is `metadata_pending`, and which has no continuation, says `Episode source unavailable`. | PASS | `apps/media/e2e/series-resume.spec.ts` and the series half of `detail-presentation.spec.ts`, inside `npx playwright test --config apps/media/e2e/playwright.config.ts` (215 passed). |
| FIXUP-31-A2 | On the same four faces, marking `Watched S1E1` advances the exact episode, keeps the unsaved note and the 4 rating, and Undo restores S1E1 and the note. The browser made no provider, search, entry-refresh, or calendar-refresh request during those saved reads. ← Now returns to `/media` and focuses the Now card. ← Library returns to `kind=tv` and focuses the lounge link. An August episode opened from `/media/calendar?month=2026-08` shows ← Calendar, and activating it restores that month and focuses `August Lantern`. | PASS | The same `series-resume.spec.ts` journeys. `now-calendar.spec.ts` still returns from the lounge to `kind=tv`. |

The packet records the pre-change 390px page: the generic editor opened first, Episode progress began at y1642, and Mark next watched at y1780. This session did not rebuild that old page. On `a60cd5fb` the series template still rendered progress, rating, and note before Episode progress, and a separate `Mark next watched` button beside `show.next_episode`. The repaired header action is inside the 390 and 1280 viewports and above Episode progress.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Generic progress, rating, and note editor above series continuation | Series detail rendered the editor before Episode progress | The same editor, opened by `Edit rating and note` or by a dirty series draft | Moved behind that control for `tv` only. Films, books, songs, games, and artists still open it immediately. | Series specs expect Progress hidden until the button. `detail-presentation.spec.ts` still expects book and movie progress visible. `detail-editor.spec.ts` passed. |
| Detail `Mark next watched` button and `DetailComponent.markNext` | The episode-progress card posted the next episode itself | `media-next-episode` on the header, which calls `NextEpisodeService.markNext` and `NextEpisodeUndoService.offer` | Removed the detail method and the progress-card button. Season `Mark watched`, catch-up, and Undo stay. | Series specs expect zero `Mark next watched` and one `Watched S1E1`. Undo toast `S1E1 is next again.` |

- Candidate class and protected counterexamples: replacement of the default series editor position and the second next-episode button. Continuation still comes from `continuationFromShow`. Saved reads stay GET `/media/api/entries/:id`. Notes, ratings, and Undo stay on the item.
- Comparison base SHA `a60cd5fb4dfe3f2c66bda1e682f3385c07dd07fd`. Closure is `detail.component.ts`, `detail.component.html`, `now.component.ts`, and `calendar.component.ts`. No new production file. `media.css`, `packages/ui`, `theater.mjs`, `next-episode.mjs`, library, and search were not edited.
- Production added/deleted: 248 lines added and 71 removed across those four files. Net +177. Added behavior is the series action matrix, Calendar and Now return labels, and focus restore on those two screens. This is a usability repair, not a simplification claim.
- Independent equivalent implementations before/after: one continuation helper and one next-episode button. Detail formats the same Next sentence Now already shows. It does not calculate a second next episode.
- State/cache owners and public entry points before/after: routes stay in `public-api.ts`. Drafts stay in `MediaDrafts`. Return state stays on the history entry through `ReturnContext`. A direct link still uses `collectionHref`. Calendar links carry `/media/calendar?month=YYYY-MM`. Now links carry `/media`.
- Remaining old symbol/path search: `Mark next watched` is gone from Media frontend source. `NextEpisodeService.markNext` remains and is what the header button calls. Episode progress, catch-up, and per-episode Mark watched remain.
- Follow-up change: none in this leaf. Shared page-header CSS was not changed, so 320px and 200% text were not a separate stress pass.
- Tests/docs/generated changes separately: tests add 280 lines and remove 7, including new `series-resume.spec.ts` (261 lines). This evidence file is the documentation change. No bundle or screenshot is committed.
- Net production delta and exception: +177 production lines for the action matrix and the two return paths. No reviewed boundary exception. The existing initial-bundle budget warning and unused Finance pipe warnings stayed as they were.
- No behavior/data/meaningful assertion silently removed: non-series editors, collection return, lounge watch and undo, season rows, catch-up, and the 502 next-episode alert stay. A dirty series note still asks before leaving.

## Verification

Media commands ran from `/tmp/vivek-fixup-31` on `9b19d53e76175ec4048dc8b80359243fe428b1c0`. `make test-fast` was run again after the FIXUP-29 merge, on the tree that contains `56691d6a`, before this evidence file. The merge did not change Media files, so lint, typecheck, Karma, the node tests, the frontend build, and Playwright were not repeated for it. `make test-fast` used `PATH="/tmp/vivek-fixup-31/.venv/bin:$PATH"` because system `python3` has no alembic. Karma used `CHROME_BIN` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used that same Chromium through the Media config. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python product lint and coverage gates were not run. The leaf diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-31` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, root Karma, the media node tests, `make build-frontends`, and Media Playwright. |
| `make test-fast` | PASS on the media commit and again after the merge. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets). 135 unittest tests OK. Node script tests 21 pass. The first attempt, before the venv path, failed in `test_restore_drill` with `ModuleNotFoundError: alembic`. |
| `make lint-web` | PASS on the media commit. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS on the media commit. Web, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on the media commit. 765 SUCCESS. Statements 78.09% (12635/16179), branches 66.06% (5707/8639), functions 80.27% (2759/3437), lines 83.4% (11006/13196). |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 63 pass, 0 fail. |
| `make build-frontends` | PASS. Initial total 732.53 kB. The existing 650 kB budget warning and NG8113 Finance warnings remain. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 215 passed (2.3m). |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/654. The body is only `Closes #619`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. Gym files from FIXUP-29 are present and were not edited.
- Next actor: review and merge this leaf only. #277 remains open.
