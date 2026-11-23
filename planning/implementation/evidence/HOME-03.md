# HOME-03 — implementation evidence

- Leaf issue and parent(s): [#450](https://github.com/Vivekpsps3/vivek-monorepo/issues/450) HOME-03. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/home-03`; `/tmp/vivek-home-03`. The shared checkout was not edited. Health, Finance, Travel, Media, and server product files were not edited. SCENE-07 arrived through the merge below and those files were left as merged.
- Base main SHA, current tested SHA: product and tests are `474d957ee756f612640c330812e00cc16ac3264c`. The Playwright, build, and route-parity gates below ran on that tree. `make test-fast`, `make lint-web`, `make typecheck-web`, and the web Karma suite ran on `a8e7bace` immediately before it. That later commit adds one line to `apps/web/e2e/town-home.spec.ts` and does not change production files. This note only records the SHA. The branch started at `ab2507c9e51c6c3c4dbcf5b307d30f50b3e406b6` (HOME-02, pull request #577). `origin/main` then moved to `dd64f2bddab94251a7a4867345ce2ec92029c302` (SCENE-07, pull request #595). That merge is `a8e7bace`. No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441) and HOME-02 (#449, merge `ab2507c9e51c6c3c4dbcf5b307d30f50b3e406b6`) are ancestors of this base. The twelve free starters and twelve shop items are on that main. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/450#issuecomment-7107610367). Fetch again before this note still has `origin/main` at `dd64f2bd`. Pixel scores were not changed. Stamps and habits do not gate the rooms.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| HOME-03-A1 | Empty account `town-empty`. `/town` still offers a first habit. Visit Home opens a furnished living room with the twelve starter pieces placed, a cutaway floor and walls, and a 12-cell floor. The page has no Buy control, no Stamp price, and no other owner's habit. Lot 1 is an empty lot. Lot 3 unlocks at level 3 and links back to Town. | PASS | `home-rooms.spec.ts` places every starter at price 0 and places no shop id. `apps/web/e2e/town-home.spec.ts` empty-account journey. |
| HOME-03-A2 | Phone and keyboard enter living room, study, bedroom, and courtyard from the room links and from a direct study URL. Each primary object opens: sample coastal print, dated desk note, saved music, and the courtyard planter. `/town/home` redirects to living. Room links drop the object and camera query. | PASS | `town-home.spec.ts` four-room matrix and the direct study address. `home-room.component.spec.ts` for the unknown room, the sample, and the music link. |
| HOME-03-LIFE | A held town response for another owner does not paint. The desk note stays through a town 503 and an art error, slices at 500 characters, and is absent from the URL. Lock clears it. Watering the planter does not call check-in. Retry lots keeps the same-session note, which is visible again after the desk is reselected. | PASS | `home-room.component.spec.ts` held town, note, and garden cases. Playwright 503 case after reopening `study-desk`. |
| HOME-03-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Room links, object links, and the primary action are at least 44px. Day and night art URLs follow the theme. Focus returns to Visit Home. Axe serious and critical violations on `app-town-home` are empty. No horizontal scroll. | PASS | Four Playwright viewport journeys. A 390×844 night study capture shows the cutaway wall, gridded floor, doorway, desk with lamp, and bookshelf. Screenshots stayed in the Playwright output and are not committed. |

Fixtures are synthetic. The Town y-down frame is unchanged. Shop items stay in the catalog and are not placed. Samples are labeled and create no Media record. The desk note and garden water state are session maps for the signed-in owner. HOME-01 still owns saved layout persistence. HOME-04 still owns place, rotate, recolor, and Save.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior Home room composer. The exterior Home control was a button with no route. | Town header and exterior spec expected a button. | `home-rooms.ts` and `HomeRoomComponent` on `/town/home/:room`. Exterior Home is a link to `/town/home/living`. | The button control was replaced by that link. Reading Hall, Hall, the cosmetic catalog, and `/town/review` stay. | `town-exterior.spec.ts` expects the link. Town Playwright, including `town-review.spec.ts`, passed with the Home journeys. |

- Candidate class and protected counterexamples: Reading Hall, Hall, Clinic, Gym, the weekly review, habit check-in, and the cosmetic catalog stay. No previous Home module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `dd64f2bddab94251a7a4867345ce2ec92029c302`. New production files: `home-rooms.ts`, the home room component, template, and stylesheet, and four SVG files under `apps/web/public/town/home/`. Changed production files: Town routes, private Town section, exterior Home link, Town header, `routes.json`, `route-examples.json`, and `return-context.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1129/−5, net +1124, including 84 SVG lines, counted from `origin/main` to `474d957e`. Guidance and discovery +3/−5 (`town/AGENTS.md` net −2, `docs/QUALITY.md` net 0, `tests/e2e/discovery.mjs`, `scripts/check-e2e-discovery.test.mjs`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 Home room composer. 1 / 1 cosmetic catalog. 0 / 0 currency wallet.
- State/cache owners and public entry points before/after: `/town/home` redirects to `/town/home/living`. The room, selected object, and camera live in the URL. The desk note and watered garden ids live in component maps keyed by owner and clear on lock. A town failure does not clear the note. Return path keeps each room's object id and strips the note and camera.
- Remaining old symbol/path search, including config and discovery: `town-home.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`, alongside `town-review.spec.ts`. The private route pattern is `town(?:/(?:world|clinic|gym|library|hall|keepsakes|cosmetics|review|home(?:/[^/]+)?))?`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +543/−3, net +540, including the room model, component, and Playwright specs. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `becd7becff1657593113e50da297954486e426c7bcb40cc95455d8a8e04ba582`. The initial bundle stays over the 650 kB warning budget at 681.80 kB. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1124 production lines. This is the feature: four cutaway rooms, wall slots, starter placement, and inspect actions for the frame, desk, shelf, record stand, and garden. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 203 tests, including the weekly review. The first focused Home run failed one assertion because the study link clears `object`, so the note field was not in the document. The draft was still held. The spec reselects the desk, and that test passed inside the 203.

## Verification

Commands ran in `/tmp/vivek-home-03`. `make test-fast` used `PATH="/tmp/vivek-home-03/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at that Chromium. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. A bare `python3 -m pytest` failed with `No module named pytest`. The table uses the worktree venv. `apps/server/tests/test_route_parity.py` ran because `routes.json` and `route-examples.json` changed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file. `return-context.spec.ts` is in the web Karma project.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch HOME-03` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`, `make build-frontends`, `npx playwright test --config apps/web/e2e/playwright.config.ts`, and `npx playwright test --project=suite`. It does not edit the queue. |
| `make test-fast` | PASS on `a8e7bace`. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=22. Node script tests 21 pass / 0 fail, plus engine purity 1 pass / 0 fail. |
| `make lint-web` | PASS on `a8e7bace`. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS on `a8e7bace`. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on `a8e7bace`. 688 SUCCESS. Statements 77.72% (11211/14424), branches 65.41% (4967/7593), functions 79.99% (2407/3009), lines 82.8% (9758/11784). |
| `make build-frontends` | PASS. Release hash above. Production files match `474d957e`. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on `474d957e`. 203 passed (3.0m), including seven Home rooms tests. |
| `npx playwright test --project=suite` | PASS on `474d957e`. 61 passed (1.1m). |
| `/tmp/vivek-home-03/.venv/bin/python3 -m pytest -q apps/server/tests/test_route_parity.py -m "not perf"` | PASS. 35 passed, 1 skipped, 1 warning, 1.58s. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/596. The body is only `Closes #450`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet.
- Remaining external prerequisites or approved scope decisions: HOME-01 owns saved layout persistence. HOME-04 owns place, rotate, recolor, and Save. GAME-02 owns buy and refund. No deployment.
- Next actor: review and merge this leaf only.
