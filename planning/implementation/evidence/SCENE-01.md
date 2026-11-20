# SCENE-01 — implementation evidence

- Leaf issue and parent(s): [#439](https://github.com/Vivekpsps3/vivek-monorepo/issues/439) SCENE-01. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#308](https://github.com/Vivekpsps3/vivek-monorepo/issues/308), [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310), and [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/scene-01`; `/tmp/vivek-scene-01`. The shared checkout was not edited. Health files under `apps/web/src/app/town/health/` and Travel files under `apps/travel/` were not edited.
- Base main SHA, current tested SHA: base `5e63cd7ec6e34c162c332f12730945da1439b138` (HEAL-03 merge, pull request #548). `git fetch origin main` on 2026-11-20 still returned that SHA while these commands ran. The implementation and these command results are `315949fa40d9d9a7af12bd00ff9f675ddfc73b5f`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: STYLE-04 merge `7c2302295618d3a215038510c5116aff2476a37f` is an ancestor of the base. Reading Hall asset metadata, the shared rectangle, the lazy room route, and the room browser tests are on that base. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/439#issuecomment-7044400515). At launch, `gh pr list --state open` was empty. Before the pull request, #549 (HEAL-04) and #550 (TUX-10) were open on other conflict groups. Neither is `private-routes` or `town-ui`. HEAL-04 also edits `apps/web/src/app/town/AGENTS.md` and was not in the tested base.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SCENE-01-A1 | Seeded Town and the synthetic book "Synthetic Scene Atlas". At 390×844 and 1280×800, reset the view, then tap the shelves/desk overlap. The Reading desk opens. An exposed shelves point opens Bookshelves. One zoom and a 70×36 pointer pan move the desk more than 30 CSS px, and the overlap still opens the desk. | PASS | `library-room.scene.spec.ts` overlap and camera round-trip. `apps/web/e2e/town.spec.ts` "selects the front object after resize, pan, and zoom, and ignores drag and cancel". |
| SCENE-01-A2 | The same journey. A pointer drag leaves `object=calendar` and does not add a Town read. A CDP touch move shifts the desk, and touch cancel restores it within 2 CSS px without a Town read. Keyboard Enter on the Reading desk and Wall calendar list links opens those objects. | PASS | Same Playwright test. `library-room.component.spec.ts` tap navigates, pointer cancel restores the transform, and the later pointerup does not navigate. |
| SCENE-01-LIFE | The first Town read is held. Zoom to 1.5, then the held response returns 503. The desk selection, URL, and stage matrix stay. Retry then shows Media XP today and keeps that matrix. An owner change drops an unfinished drag and ignores the previous owner's Level 19 payload. Destroy unsubscribes the in-flight read. | PASS | `apps/web/e2e/town.spec.ts` "keeps the scene view and selection when Library progress fails". `library-room.component.spec.ts` both tests. |
| SCENE-01-VIEW | The overlap journey runs at 390×844 reduced motion and 1280×800 with motion allowed, then light and night. Visible links and buttons are at least 44 CSS px. Artwork box equals the control box. Axe violations on the room are empty. Focus returns to the list link. Back from Media library restores Bookshelves and the same progress string. The 320px / 200% text capture still fits. | PASS | Same front-object Playwright test, including axe and screenshots, plus the existing 320px Reading Hall test. |
| PLACE-06-OBJECT | `roomRect` is the only rectangle. `sceneFrame` paints it. `screenToRoom` plus `frontObject` picks it after a camera of `{x:-48,y:-30,scale:2}`. A pre-pan screen point is not the desk. Zoom keeps the viewport center. Pan clamps inside the room. Slop is 8px exclusive. | PASS | `library-room.scene.spec.ts` and the component and Playwright journeys above. |

Fixtures are synthetic. The book title is "Synthetic Scene Atlas". Town progress is the seeded Library level and today's Media XP cap. The 503 is a routed test failure. The room reads Town-owned progress and links to existing Media destinations. It does not write records. Camera state is a signal on `LibraryRoomComponent`, not a second store and not local storage. Selection stays in `?object=`. The room is CSS y-down. The World canvas keeps its own frame and was not edited.

`requirements.json` assigns PLACE-04-SCENE and PLACE-04-BUILD to SCENE-02 and PLACE-04-EQUIV to SCENE-03. This leaf exercises the assigned PLACE-06-OBJECT row on the Reading Hall. It does not add the six-district exterior or a second room product.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Painted scene `<a routerLink>` activated on click, including after a drag. Percent left/top/width/height were inlined in the asset map. | Reading Hall template and `readingRoomObjects`. | `roomRect` / `sceneFrame` / `frontObject` in `library-room.scene.ts`. The keyboard list links still set `?object=`. | Scene pieces are `button.piece` buttons. A tap calls the same router navigation. The inline percent formula is gone. World hit testing stays on the World renderer. | `git diff 5e63cd7ec6e34c162c332f12730945da1439b138` is the Reading Hall, its tests, Town guidance, and this evidence file. Playwright proves drag and cancel do not navigate. |

- Candidate class and protected counterexamples: feature replacement of click activation on the painted scene. The URL selection, Media links, artwork retry, progress retry, and the exterior Library lot stay.
- Comparison base SHA and full replacement closure (including new files): `5e63cd7ec6e34c162c332f12730945da1439b138`. New production file: `apps/web/src/app/town/library-room.scene.ts`. Changed production files: the room component, template, CSS, and asset catalogue.
- Production added/deleted/moved; comments/blank-only churn separately: production numstat is +362/−30, net +332. That is `library-room.scene.ts` +142, component +162/−4, template +30/−17, CSS +23/−3, and assets +5/−6. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 1 / 1 room rectangle. 1 / 1 Town progress subscription. 0 / 0 second scene stores. World picking remains a separate owner.
- State/cache owners and public entry points before/after: selection stays in the route query. The camera signal is view state for the mounted room. An unfinished pan is the only uncommitted gesture; pointer cancel, owner change, and destroy drop it. Committed zoom and the URL survive a failed Town read.
- Remaining old symbol/path search, including config and discovery: the scene role is `button`, and the Town Playwright file no longer looks up scene links. `townTestMatch` still includes `town.spec.ts`. No new route was added.
- Follow-up change: which production files and independent policy owners now need editing: SCENE-02 owns the exterior scene rows. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +369/−6, net +363, including `town.spec.ts` (+205/−5), `library-room.component.spec.ts` (+89/−1), and `library-room.scene.spec.ts` (+75). Docs are the Town AGENTS paragraph (298 words) and this evidence file. No generated bundle is committed. `make build-frontends` exited 0. Release `f752484a80a1ac2cee4b04b5e2e726e87dbeb3584dd74fc7fbc2db1b31476ad7`. The existing initial-bundle warning remains (678.88 kB against the 650 kB warning budget). The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +332 production lines. This is the feature: one shared rectangle, overlap, pan, zoom, and tap versus drag versus cancel. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. The existing Reading Hall artwork, retry, unmount, empty-town, and 320px journeys still pass in the Town Playwright file.

## Verification

Commands ran in `/tmp/vivek-scene-01` against `315949fa40d9d9a7af12bd00ff9f675ddfc73b5f` except this evidence file. `make test-fast` and Playwright used `PATH="/tmp/vivek-scene-01/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. A first `make test-fast` without that PATH failed in `scripts/test_restore_drill.py` with `No module named 'alembic'` from `/usr/bin/python3`. The rerun below is the recorded gate. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. Neither the symlink nor the virtualenv is committed.

| Command | Result |
| --- | --- |
| make test-fast | PASS with the repository interpreter on PATH. Planning/docs, boundaries, 135 Python tests, and 21 Node script tests. |
| make lint-web | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, and engine purity 1 test. Direct eslint on the changed Town sources and `town.spec.ts` also passed. |
| make typecheck-web | PASS. Seven TypeScript projects. |
| npm run test:web -- --watch=false --browsers=ChromeHeadlessCI | PASS. 496 tests. Statements 75.22% (7220/9598), branches 61.44% (2983/4855), functions 75.43% (1437/1905), lines 80.09% (6280/7841). |
| make build-frontends | PASS. Production build and release manifest. Warning budget and Finance import warnings as above. Exit 0. |
| npx playwright test --config apps/web/e2e/playwright.config.ts | PASS. 141 tests, including the overlap, drag, cancel, keyboard, both viewports, and the late Town 503. |
| npx playwright test --project=suite | PASS. 61 tests. |
| make lint-python, make typecheck-python, ./scripts/coverage-gate.sh server | NOT RUN. The diff has no Python product code. `make test-fast` covers the Town guidance path. |

## Handoff

- PR URL (leaf closure keyword only): recorded in the follow-up commit on this branch after the pull request exists. The body may say `Closes #439` and names the parents that stay open.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this file was written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review and deployed activation stay separate. SCENE-02 and SCENE-03 still own their PLACE-04 rows.
- Next actor: this implementer waits for the required checks, then merges with a merge commit.
