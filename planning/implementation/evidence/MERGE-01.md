# MERGE-01 — implementation evidence

- Leaf issue and parent(s): [#484](https://github.com/Vivekpsps3/vivek-monorepo/issues/484) MERGE-01. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/merge-01`; `/tmp/vivek-merge-01`. The shared checkout was not edited. Media, Travel, Finance, and Health product code were not edited. No Obsidian vault, note import, Immich path, or second concept store was added.
- Base main SHA, current tested SHA: base and `origin/main` at the claim fetch and at the pre-push fetch `e47ffe612543f699dfef85ec46bf2dafd4fdea1e`. Product behavior tested below is `6541da25fce69415aafd96df05aaa48986d3002f`. The gates below ran on that tree before this evidence file. `make test-fast` is repeated with this file present.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441) and PIX-01 (#421) are closed on that base. The same base already has `world_concepts`, `/api/world/concepts`, and `ConceptSheetComponent`. Those ids, the store, the API, and the editor stay. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/484#issuecomment-7237979607).

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| MERGE-01-A1 | `seed=pixels-facts` owner concept "Synthetic concept", note `synthetic private note`, understood `2026-08-15`. Keyboard edit from `/town/library/study/:id` changes the note and source, then reload keeps that note, source, and date. A new concept saved from the study uses the town civil today and is visible again from World by the same id. | PASS | `apps/web/e2e/world.spec.ts`: `keeps an old concept id, note, source, and understood date at 1280 light` and `World learning saves through the study and undo retracts the dated beacon`. |
| MERGE-01-A2 | Unknown id `999999` and the other owner's next id both show `That concept doesn't exist.` The foreign name and note never render. PATCH of the foreign id is 404. Archiving the owner row keeps the note and understood date on the Archived tab and removes it from the active list. The world week still shows that archived-but-understood concept. The pixels day heading does not. | PASS | `keeps unknown, archived, and other-owner boundaries` in the same spec. `shows an archived concept and the same missing copy for an unknown id` in `concept-sheet.component.spec.ts`. |
| MERGE-01-LIFE | A rejected create keeps the typed name. A create that resolves after the owner changes does not publish. A held list that resolves after lock does not publish. A town clock resolved for the previous owner does not set today. Changing the focused id closes the draft before reload. | PASS | `keeps a failed draft and drops a late create after the owner changes` and `does not publish a held concept list after lock` in `concept-sheet.component.spec.ts`. `drops a town clock that belongs to the previous owner` in `library-study.component.spec.ts`. |
| MERGE-01-VIEW | 1280×800 light keyboard and 390×844 night touch, both with reduced motion. Edit, save, reload, and the dated annotation stay. Tabs, the Town crumb, and Open study are at least 44px. Arrival focus is the Study heading. After a same-page save, focus is the concept card. Axe serious and critical violations are empty on `app-library-study`. No horizontal scroll. `getAnimations().length` is 0. The page text does not offer an Obsidian import. | PASS | Library study describes in `world.spec.ts`, including `study surface stays within the viewport` at 390 light and 1280 dark, `Reading Hall opens the study list`, and `edits the dated annotation at 390 night with touch`. Screenshots stay in the Playwright output and are not committed. |

The study routes are `/town/library/study` and `/town/library/study/:conceptId`, both titled Town · Study, under the existing private layout and auth guard. `routes.json` allows only a positive decimal id of at most 19 digits. There was no previous concept URL. Direct resolution of an existing id is `/town/library/study/:conceptId`. `/town/world?day=` and `?week=` are not redirected. That redirect is MERGE-02. World date and week surfaces stay. ROOM-15 and MERGE-03 were not implemented.

The e2e town clock is 2026-10-29 in America/Los_Angeles. The world meta clock is not frozen, so the learning journey reads `GET /api/town` for the understood date. An unsafe or non-positive id is treated as absent and uses the same missing sentence. Archived owner rows stay patchable and visible on the Archived tab.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| In-world concept dialog (`app-concept-sheet` inside World, opened from Concepts / Add a concept). | `world.component.html` and the open/close state on `WorldComponent`. | `LibraryStudyComponent` mounts the same `ConceptSheetComponent` at `/town/library/study`. | Dialog host removed from World. Concepts, Add a concept, and Open concept are links to the study route and the same numeric id. | World learning and old-id browser journeys. `WorldController.applyConceptEdit` remains for date moves and is no longer called from the page. |
| Concept sheet as a `ui-dialog` with Escape close. | The World dialog. | The same sheet as page content inside Study `main`. | `panelClass`, dialog close, and the `closed` output are gone. Archive confirm stays a `ui-confirm-dialog`. | Sheet unit tests and the study browser journeys. Escape no longer dismisses the page. |
| World day and week surfaces, including archived-but-understood concepts in `read_concepts`. | World page and pixels day facts. | Unchanged world read and pixels fact queries. | Retained. Pixels facts still require `archived_at IS NULL`. No concept API move and no pixels product edit. | Archive boundary test: world day `2026-08-15` still contains "Synthetic concept"; the pixels heading count is 0. |

- Candidate class and protected counterexamples: feature replacement of the World dialog with the Library study route. `world_concepts`, `/api/world/concepts`, concept ids, notes, sources, understood dates, and archive state stay. Unknown and other-owner responses stay 404 with `That concept doesn't exist.` There is no GET-by-id and no second store.
- Comparison base SHA and full replacement closure (including new files): `e47ffe612543f699dfef85ec46bf2dafd4fdea1e` through `6541da25fce69415aafd96df05aaa48986d3002f`. New production files: `library-study.component.ts`, `.html`, and `.css`. Changed production files: study routes, `routes.json`, Reading Hall link, concept sheet, World links, `WORLD_COPY.missing`, and `returnPath` for the study URL.
- Production added/deleted/moved; comments/blank-only churn separately: production +207/−108, net +99, counted on `6541da25`. World guidance +3/−1. Blank and comment lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 1 / 1 concept store and 1 / 1 concept editor. 0 / 0 second concept API. The World dialog is gone.
- State/cache owners and public entry points before/after: `world_concepts` and `/api/world/concepts` remain the only concept record. Public entry is `/town/library/study` and `/town/library/study/:conceptId`, plus the existing World day and week URLs. Return context keeps `new=1` on the list and a safe id path; `0`, `nope`, and an unsafe integer return null.
- Remaining old symbol/path search, including config and discovery: `app-concept-sheet` remains the editor selector and is mounted only by the study page. World no longer embeds it. `townTestMatch` already includes `world.spec.ts`. No app-switcher item and no new library scene object.
- Follow-up change: which production files and independent policy owners now need editing: MERGE-02 owns redirects from legacy World day and week URLs. MERGE-03 owns removing the standalone World presentation. ROOM-15 owns study as the home of notes. Those stay out of this PR. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +386/−26 (`world.spec.ts`, both component specs, `return-context.spec.ts`) and route examples +14. This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `930b6c1ea7379080a0a322fa8535304e77b1556bfe40fc9b267dfc44da3fd294`. The initial bundle stays over the 650 kB warning budget. The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +99 production lines. The study page, id parser, owner clock, and lifecycle guards replace the dialog chrome. The positive delta is the route move, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. World still loads a saved concept from the server when the page is opened again. A note-only edit does not remove the pixels heading. Text edits no longer refetch `/api/world` from the World page because the editor moved. `WorldController.applyConceptEdit` unit coverage remains.

## Verification

Commands ran in `/tmp/vivek-merge-01`. `make` and Playwright used `PATH="/tmp/vivek-merge-01/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Playwright used that Chromium as `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. No Python product file changed. Python lint, typecheck, and the server coverage gate still ran because the leaf profile includes `server_back` and route parity lives there.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch MERGE-01` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`, `make build-frontends`, both Playwright commands, `make lint-python`, `make typecheck-python`, and `./scripts/coverage-gate.sh server`. It does not edit the queue. |
| `make test-fast` | PASS on the product tree before this file, and again with this file present. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets, forty TD owners). Shared boundaries OK. 135 unittest tests OK. E2E discovery lists town files=30 and suite files=12. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS on the final product tree. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. Engine purity 1 pass. |
| `make typecheck-web` | PASS after the study focus change. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS after the study focus change. 805 SUCCESS. Statements 78.43% (13675/17435), branches 66.9% (6343/9481), functions 80.88% (2987/3693), lines 83.93% (11913/14193). |
| `make build-frontends` | PASS. Release hash above. Town Playwright served that bundle. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 347 passed (3.7m), including the study journeys. An earlier run failed two study cases: the learning form used the unfrozen world clock, and arrival focus belongs to the Study heading. Both were repaired and this full run passed on the same tree. |
| `npx playwright test --project=suite` | PASS. 75 passed (58.4s). |
| `make lint-python` | PASS. 279 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | PASS. mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 525 passed, 1 skipped. Total coverage 83.06%. Floor 61.53% was not changed. |

Not run: Finance, Travel, and Media product gates beyond the suite project. This leaf does not change those apps. The suite project passed, including the known Hub app-switcher and calendar-feed cases. No deploy.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/660. The body is only `Closes #484`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. Not deployed.
- Remaining external prerequisites or approved scope decisions: MERGE-02 keeps the World day and week URLs addressable. Direct concept ids already open `/town/library/study/:conceptId`.
- Next actor: required checks, then merge this leaf only.
