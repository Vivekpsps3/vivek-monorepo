# FIXUP-04 — Reading Hall and Hall actions in one interaction

- Leaf issue and parent(s): [#582](https://github.com/Vivekpsps3/vivek-monorepo/issues/582). Parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stay open.
- Agent/context, branch/worktree: sole worker on `agent/fixup-04` in `/tmp/vivek-fixup-04`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/582#issuecomment-7239175735).
- Base main SHA, current tested SHA: base `55bd912c8251e63613f46104aed1fd95bf40c3d3` (MERGE-01). Tested product SHA `fbd538752ebad397ea55da9a8e602f7486c9e0ba`.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 #441, SCENE-06 #444, and ROOM-06 #456 are closed on that base. Reading Hall still layers shelves, desk, and calendar and opens saved Media books. Hall still shows rules, progress, and archive history through the existing habit dialogs. `/town/library/study` and `/town/library/study/:conceptId` still open the concept editor. No other claim was open on #582 at start.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-04-A1 | Reading Hall with a saved book, and Hall with progress. Touch-select a purposeful object at 390×844. Title and primary action are in the current viewport on the first tap. Close returns to the object picker. | PASS | `town.spec.ts` front-object and return journeys. `town-hall.spec.ts` 390 dark scene tap of Progress dial, plus 390 light Rules board. Escape keeps a committed scale and focuses the picker. |
| FIXUP-04-A2 | Keyboard and direct reload. Open a Media record or a Hall habit editor and return. The same room, object, and useful focus restore, and a failed save writes nothing. | PASS | `town.spec.ts` opens Browse saved books and returns to `object=shelves` and `scale=1.5`. `town-hall.spec.ts` reloads Hall, opens History and Edit, cancels the failed save, and restores the history link focus. |
| Layout matrix | `/town/library` and `/town/hall` at 390×844 and 1280×800, light and night, keyboard and touch, reduced motion, plus 320px and 200% text. Scene tap and keyboard picker. | PASS | Library matrix in `town.spec.ts` (390/1280 light and dark, 320px at 32px root). Hall matrix in `town-hall.spec.ts` (1280 light, 390 dark, 390 light, 1280 night, 320px at 32px root). Animations stay at 0 under reduced motion. |

Before this change, a 390×844 Reading Hall inspector started below the scene and camera controls, and Hall rendered the full rules block in that same lower inspector. Desktop Reading Hall already showed the adjacent inspector and also listed Town in the breadcrumb, Back to Town, and the shell. After this change, desktop keeps the adjacent inspector. A phone mounts no object inspector until a selection, then shows a non-modal fixed sheet (`phone-sheet`) with Close, the object title, and the primary action inside the viewport. Close and Escape clear only the selection, focus the keyboard picker, and undo an uncommitted drag. A committed camera stays in the URL.

The single room exit is Back to Town. It pushes history, so browser Back restores the room URL, object, and camera, and Town focuses the Library or Hall building link. It does not move the exterior camera onto the culture or civic district. That framing exists for the inn return and would require `town-exterior`, which this leaf does not edit. The old Town breadcrumb used `replaceUrl` and dropped the room history entry.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Always-rendered small-screen empty inspector | `library-room.component.html`, `hall-room.component.html`, Reading Hall and Hall browser journeys | Phone sheet after selection; desktop aside when the viewport is at least 800px | Removed on a narrow viewport until an object is selected. Library progress, Open study, and the Keepsake shelf stay outside the sheet. | Phone unit spec and 390×844 journeys show no "Choose an object" pitch and no Hall rules until selection. |
| Duplicate Town breadcrumb exit | `library-room.component.ts`, `hall-room.component.ts` crumbs | `ui-button` Back to Town (`href="/town"`, no `replaceUrl`) | Town crumb removed from both rooms. Shell Town link unchanged. | One Back to Town link. Return focuses the building. Browser Back restores `object` and `scale`. |
| Repeated visible camera sentence | Visible paragraph in both room templates | Viewport `role="group"` accessible name | Visible sentence removed. Zoom, reset, and Reload Hall stay one control away. | `getByRole('group', { name: /Drag to look around/ })` still matches. Exterior, clinic, and gym hints unchanged. |

- Candidate class and protected counterexamples: presentation replacement. Home keeps the sticky `.inspector.sheet` because it does not use `.phone-sheet`. Study route files were not edited.
- Comparison base SHA and full replacement closure: `55bd912c8251e63613f46104aed1fd95bf40c3d3`. Production files are the two room components, their templates, and the shared room CSS. Tests are the two room specs and `town.spec.ts` / `town-hall.spec.ts`.
- Production added/deleted/moved: 9 files, +380 / −118 including tests. No new route and no server model change.
- Independent equivalent implementations before/after: one desktop inspector and one phone sheet per room. Habit and history dialogs remain the canonical editors.
- State/cache owners and public entry points before/after: selection and camera stay in the room URL. Town, Media, and habit records are unchanged. Opening a sheet does not fetch or write.
- Remaining old symbol/path search: Town crumb removed from these two rooms only. Other rooms still have their own Back to Town controls.
- Follow-up change: none in this leaf. Exterior district framing stays with the exterior owner.
- Tests/docs/generated changes separately: browser and unit expectations follow the sheet. This evidence file is the only planning doc.
- Net production delta and specific reviewed safety/compatibility exception if positive: the sheet, the single exit, and the action-first phone order add markup so the selected action is in the first viewport. The empty phone inspector and the Town crumb are the removed paths.
- No behavior/data/meaningful assertion silently removed: desktop still shows every Hall section and the Library pitch. Phone shows the selected section. Study, Media links, and dialogs remain.

## Verification

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-04` | PASS. Profiles `docs` and `web_front`. |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS. Doc paths, planning fixtures, 135 Python tests, 21 Node tests. A first run without the venv on `PATH` failed in `scripts/test_restore_drill.py` with `ModuleNotFoundError: alembic`. The venv run is the recorded result. |
| `make lint-web` | PASS. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `CHROME_BIN` set to Playwright Chromium; `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 806 tests. Statements 78.48% (13692/17446), branches 66.97% (6355/9488), functions 81.01% (2995/3697), lines 83.99% (11926/14199). |
| `make build-frontends` | PASS. Release manifest written. Initial bundle advisory remains over the 650 kB warning (733.40 kB) and under the error budget. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 348 tests. |
| `npx playwright test --project=suite` | PASS. 75 tests. |

Node and the linked repository venv ran these checks from `/tmp/vivek-fixup-04`. Focused Reading Hall, Hall, and study journeys passed before the full suites. No known unrelated flake needed a rerun.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/661. Body is only `Closes #582`.
- Roadmap #134 append-only status-note URL: added after merge with this leaf, the PR number, and the merge SHA.
- Merged/activation status: not merged at the time of this file.
- Remaining external prerequisites or approved scope decisions: exterior district camera framing is unchanged. No deploy.
- Next actor: required checks, then merge.
