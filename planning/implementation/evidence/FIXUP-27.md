# FIXUP-27 — Lead Media Search and manual capture with the selected task

- Leaf issue and parent(s): [#615](https://github.com/Vivekpsps3/vivek-monorepo/issues/615) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-27`, worktree `/tmp/vivek-fixup-27`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/615#issuecomment-7227376616). No subagents. The shared checkout was not edited. Town, Travel, Finance, server, queue, and CI files were not edited by this leaf.
- Base main SHA `0252ddda225d190c4951b4e766dc646a4e44f93c`. Media behavior tested at `bc152925cb78a134169b1f442acde7eb571557d1`. That commit was then merged with `origin/main` `8358d7acc8c2714bdf05bdf74bc1469eb1e0f7f5` as `be16b00bb29140d2380e9dcbf6736ef9bee9df86`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree. MUX-07 (#403, PR #517, `ea4e8f4a02530e5afdad8f33545cf9a565c97d6d`) is an ancestor. One membership per provider id, pending metadata, ordinary GET without refresh, configuration-only coverage, and manual save when providers fail are still on this tree. Search and Add stay one component and still carry kind. GAME-09 merged while this leaf was open. Its Town and server files came in through the merge commit and were not edited here. FIXUP-25 was left alone.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-27-A1 | Synthetic Books search at 390×844 and 1280×800, light and night, keyboard and touch, reduced motion. A partial response shows eight Paper Harbor matches. The first card, the incomplete notice, Add to library, and the saved-item link are in the first viewport. The incomplete notice sits above the first card. Coverage and Popular sit below it. Coverage stays closed. A later `fail` query shows Synthetic source timeout and Retry search inside the viewport and drops the previous matches. An `empty` query shows No matching titles and still one Add manually link. A 320px one-match search keeps the card inside 844px with no horizontal overflow. Valid matches stay usable beside a timed-out source. | PASS | `apps/media/e2e/capture.spec.ts` lead journeys and the 320px case, inside `npx playwright test --config apps/media/e2e/playwright.config.ts` (208 passed). |
| FIXUP-27-A2 | From the scrolled partial search, the section-nav Add link opens `/media/add` with the query as the title, `kind=book`, `fromKind=book`, and the search scroll. Title and Save lead, both above the closed coverage disclosure, and the 390 title is above the old y608. Changing Type to game and activating ← Search asks Leave draft, then restores `q=Paper Harbor`, kind book, focus on the search box, and the recorded scroll. A down provider still reaches one manual Book form, keeps a failed save on that form, and retries pending metadata on the saved item. | PASS | The same lead journeys, plus `a down provider keeps manual capture` in `capture.spec.ts`. `native.spec.ts` still keeps The Gentlemen through Back. |

On fresh `0252ddda`, a one-match Books partial put the result at document y1247 on 390px and y970 on 1280px, below both viewports. An all-types one-match sat at y1703 and y1162. Search showed the section-nav Add link and a second Add manually link, an open coverage list before the result, and an inline manual form. Book Add put coverage before Title y608 and Save y877. ← Search dropped the query. Those positions were the reproduced start. The packet's y1824 and y1283 had already drifted.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Always-open provider coverage before results, and the repeated per-query source list | Search and Add both rendered coverage above the task | One closed `details.source-details`. Before a search it lists configuration coverage. After a search with sources it lists that query's sources. A coverage load error changes the summary text. | Replaced the open `.provider-coverage` block. The disclosure stays closed until the person opens it. | Lead journeys expect the disclosure closed and the timeout reason hidden. `bundle-m.spec.ts` and `screenshots.spec.ts` open Provider coverage. |
| Second Add manually control and the always-rendered search-page manual form | Page header and the empty state linked to Add, and Search rendered `.capture-manual` under the results | The existing Media sections Add link is the one visible manual route. `/media/add` is the one form and leads with Title. A plain click from Search carries the query, kind, and scroll. Modified clicks keep the normal link. | Removed the in-page Add button, the empty-state Add button, and the search-page form. Section nav, canonical editors, and `/media/search`, `/media/add`, and `/media/new` stay. | Lead journeys expect one Add manually link and zero `main .capture-manual` on Search. `popular.spec.ts` still returns to the same Popular cards. |

- Candidate class and protected counterexamples: replacement of the repeated coverage and the second manual form. Provider identity, manual rows that do not merge by title, pending metadata, the three-attempt retry limit, and GET that does not repair stay in `capture.mjs`.
- Comparison base SHA `0252ddda225d190c4951b4e766dc646a4e44f93c`. Closure is `search.component.ts`, `capture.mjs`, `capture.d.mts`, and `media.css`. `public-api.ts` needed no route change. No new production file.
- Production added/deleted: 263 lines added and 189 removed across four production files. Net +74. The search template move accounts for most of the churn. Added behavior is the return parameters, the search-page click that carries them, scroll restore, and clearing a result when the committed query changes. This is a usability repair, not a simplification claim.
- Independent equivalent implementations before/after: one Search component still owns Search and Add. Coverage copy still has one helper.
- State/cache owners and public entry points before/after: routes stay in `public-api.ts`. Return state is the add URL (`q`, `kind`, `fromKind`, `scroll`), not session storage. A new search drops scroll and moves to the top. A changed committed query clears the previous matches so a failed query does not keep another query's cards. Same-query retry still keeps the matches already shown.
- Remaining old symbol/path search: `addQuery` remains for other callers. `.provider-coverage` is gone. The section-nav Add label stays in `media-navigation.ts`, which this leaf did not edit. `queue.json`, the completion registry, and CI were not edited.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: tests add 213 lines and remove 6. This evidence file is the documentation change. No bundle or screenshot is committed.
- Net production delta and exception: +74 production lines for the return path and the single disclosure. No reviewed boundary exception. The existing initial-bundle budget warning and unused Finance pipe warnings stayed as they were.
- No behavior/data/meaningful assertion silently removed: one membership per provider id, a losing save, pending metadata retry, sign-out clearing a draft, Popular back, and paging stay. Empty and failed searches keep their copy. Leave draft still guards a prefilled title.

## Verification

Media commands ran from `/tmp/vivek-fixup-27` on `bc152925cb78a134169b1f442acde7eb571557d1`. `make test-fast` and `make typecheck-web` were run again after the merge with GAME-09, on the tree that contains `be16b00bb29140d2380e9dcbf6736ef9bee9df86`, before this evidence file. `make test-fast` used `PATH="/tmp/vivek-fixup-27/.venv/bin:$PATH"` because system `python3` has no alembic. Karma used `CHROME_BIN` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used that same Chromium. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python product lint and coverage gates were not run. The leaf diff has no Python product file. Town and Travel files from the merge were not edited.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-27` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, root Karma, the media node tests, `make build-frontends`, and Media Playwright. |
| `make test-fast` | PASS after the merge. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets). 135 unittest tests OK. Node script tests 21 pass. The run before the venv path failed in `test_restore_drill` with `ModuleNotFoundError: alembic`. |
| `make lint-web` | PASS on the media commit. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS after the merge. Web, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on the media commit. 754 SUCCESS. Statements 77.99% (12498/16025), branches 65.98% (5659/8576), functions 80.21% (2729/3402), lines 83.27% (10881/13066). |
| `node --test apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS. 63 pass, 0 fail. |
| `make build-frontends` | PASS. Initial total 732.58 kB. The existing 650 kB budget warning and NG8113 Finance warnings remain. |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS. 208 passed (2.3m). |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/650. The body is only `Closes #615`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. `media.css` owns the capture disclosure style and is not a Town or Travel file.
- Next actor: review and merge this leaf only. #277 remains open.
