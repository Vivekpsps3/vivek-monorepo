# SCENE-05 — implementation evidence

- Leaf issue and parent(s): [#443](https://github.com/Vivekpsps3/vivek-monorepo/issues/443) SCENE-05. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#252](https://github.com/Vivekpsps3/vivek-monorepo/issues/252), [#309](https://github.com/Vivekpsps3/vivek-monorepo/issues/309), and [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) remain open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) remains open. #277 remains open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/scene-05`; `/tmp/vivek-scene-05`. The shared checkout was not edited. `apps/web/src/app/town/health/`, `apps/finance/frontend/src/public-api.ts`, and `apps/media/` were not edited.
- Base main SHA, current tested SHA: base `3ca43de65bbfc6ac7adbcf6e617cb24512506a18` (SCENE-08, pull request #563). Product and tests are `62a91625fc82b76817807274bf092ece23cd1652`. The gates below ran on that tree. This note only records the SHA.
- Fresh-main/prerequisite/active-PR checks: SCENE-04 (#442) is merged and is an ancestor of this base. `git fetch origin main` during the work left `origin/main` at `3ca43de65bbfc6ac7adbcf6e617cb24512506a18`. The Town exterior and Reading Hall stay on the existing y-down frame. Pixel scores and server habit rules were not changed.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SCENE-05-A1 | Seed town, user 1, America/Los_Angeles, clock `2026-10-29T19:00:00Z`. Read is forge slot 0. A held POST returns 409 `conflict` / "Check not saved. Try again." The pending ring is up before the response, `data-pending-ms` is under 100, slot 0 has no smoke, garden, or light mark, Walk stays usable, and header XP is unchanged. The alert names the failure. The live region does not say checked. | PASS | `apps/web/e2e/town-checkin.spec.ts` held check-in. `town-today.component.spec.ts` failed Walk while Read is held. `town.component.spec.ts` failed cottage check leaves XP at 340 / 500. |
| SCENE-05-A2 | Read success paints one slot-0 smoke mark with celebration id 1 and "Chimney smoke". The same-day GET keeps that one id. Undo keeps id 1 while pending, then removes the mark. Reload with `checked_today` already true shows no mark. A second commit of the same pending mark does not celebrate. A day change to `2026-10-30` clears the mark and a late result does not settle. | PASS | `town-checkin.spec.ts` check, undo, reload. `town.component.spec.ts` celebration id, GET, undo, destroyed-and-rendered page. `habit-feedback.spec.ts` second commit and undo id. `town-today.component.spec.ts` day change. |
| SCENE-05-LIFE | Owner change and session clear drop pending marks and ignore the late POST. A failed check removes only that habit. A failed undo restores the same celebration id. A result whose day does not match the armed day does not settle. | PASS | `town-today.component.spec.ts` owner change and cleared session. `habit-feedback.spec.ts` fail undo and `retainFeedback`. Day mismatch in the Today spec. |
| SCENE-05-VIEW | 390×844 and 1280×800, light day and dark night, keyboard and touch, reduced motion and ordinary motion. Walk shows one garden mark and "Flower open" on that lot, the inspector, and Today. Check and building targets are at least 44px. No horizontal overflow. Axe serious and critical violations on `app-town` are empty. Undo removes the mark. Sleep by 12 on slot 2 shows "Window lit" at 390 dark night with reduced motion, then Undo clears it. | PASS | `town-checkin.spec.ts` viewport loop, cottage night window, and touch describe. Attached captures `feedback-390-light-day`, `feedback-390-dark-night`, `feedback-1280-light-day`, `feedback-1280-dark-night`, and `feedback-390-dark-night-window`. |
| PLACE-05-COMMIT | Pending is not a celebration. Success settles once and patches Town XP. A repeated `next` on the same check does not settle again. Undo reverses the mark. Double-submit while busy posts once. | PASS | `town.component.spec.ts` XP 340 then 350 and one light mark. `town-today.component.spec.ts` one settle. Existing busy-button coverage in the same spec. |
| PLACE-05-SAFE | Read and Walk can be pending together. Walk's failure leaves Read pending, then only Read celebrates. Slot 1 stays clean while slot 0 responds. Server day movement toasts "The day changed. Try again." and leaves no smoke, garden, or light mark. | PASS | `town-today.component.spec.ts` two habits. `town.component.spec.ts` slot isolation. `town-checkin.spec.ts` server-day case. |
| PLACE-05-FEEL | Pending copy is "Saving check" or "Undoing check" and is not the confirmed label. Confirmed copy is "Flower open", "Window lit", or "Chimney smoke". Reduced motion sets `animation-name` to `none`. Ordinary motion uses the grow keyframe (Angular scopes the name). The other habit's button is not disabled while one check is in flight. | PASS | `habit-feedback.spec.ts` labels. `town-checkin.spec.ts` `data-pending-ms` under 100 and animation name. Reviewed the five attached captures: light and night, phone and desktop, flower text on Today and the inspector, and the cottage window text. |

Fixtures are the synthetic town seed (Read 20 pages on slot 0, Walk 30 minutes on slot 1, user 2's habit absent). Sleep by 12 is created on empty slot 2 for the cottage case. Celebration ids live in the session book only. Reload starts from an empty book, so a checked row does not replay the mark.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior per-object flower, window, or smoke | Check-in already updated Town XP in `onSettled` and announced in the live region after GET. Stage swap (`town-seen.ts`) runs only for a real level change. `TownLotComponent` is still tested and is not the page exterior. | `habit-feedback.ts` is the session book. Today arms and commits it. The Town page filters by owner and day. The exterior paints the mark. | None removed. Stage swap and the lot component stay. The celebration is not derived from `checked_today`. | `git diff` does not name `town-seen.ts`, `town-lot`, `town/health/`, Finance `public-api.ts`, or `apps/media/`. |

- Candidate class and protected counterexamples: live check-in copy, focus return, XP patch, stage-swap toast, and the y-down exterior frame stay. No previous per-lot celebration existed to delete.
- Comparison base SHA and full replacement closure (including new files): `3ca43de65bbfc6ac7adbcf6e617cb24512506a18`. New production file: `apps/web/src/app/town/habit-feedback.ts`. Changed production files: town exterior component, template, and CSS; Today component, template, and CSS; town page component and template.
- Production added/deleted/moved; comments/blank-only churn separately: production +393/−5, net +388, including the new 194-line book. Guidance `town/AGENTS.md` +4/−4. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 session celebration book. 1 / 1 stage-swap path for real level changes. 1 / 1 Town XP owner (the server, projected by `onSettled`).
- State/cache owners and public entry points before/after: the book is component memory on Today, filtered by the page. Nothing is written to localStorage. Routes are unchanged. Check-in and undo still use the existing Town API.
- Remaining old symbol/path search, including config and discovery: no old celebration symbol. `town-checkin.spec.ts` was already in `townTestMatch`. No discovery edit.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +395/−1 (`habit-feedback.spec.ts`, Today and Town specs, `town-checkin.spec.ts`). This evidence file is docs. No generated bundle is committed. `make build-frontends` exited 0. Release `31dea7597246b3edca56f12d8b170779faf864156e2d53eae674f114d6a7b24b`. The initial-bundle warning stays over the 650 kB warning budget (680.05 kB). The budget was not raised. Existing Finance unused-import warnings remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +388 production lines. This is the feature: a session-only mark that appears after the check-in POST succeeds and clears on Undo, owner change, or day change. The positive delta is the implementation, not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Existing Town Playwright journeys still pass (168 passed).

## Verification

Commands ran in `/tmp/vivek-scene-05`. `make test-fast` used `PATH="/tmp/vivek-scene-05/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma and Playwright used `CHROME_BIN` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE` `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` and `PLAYWRIGHT_BROWSERS_PATH=/home/vivek/.cache/ms-playwright`. `node_modules` and `.venv` are symlinks to the shared checkout. Neither symlink is committed. An earlier `make lint-web` failed on `@angular-eslint/template/eqeqeq` for `!=` in the exterior template. That comparison is now `!==`, and the lint row is the rerun. An earlier Town Playwright run failed the held-check toast (the stub body nested `error` one level too deep) and the reduced-motion animation name (the attribute selector outranked `animation: none`). Both were fixed. The table records the reruns. The full Town Playwright command then passed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch SCENE-05` | Printed the commands below. It did not edit the queue. |
| `make test-fast` | PASS. Boundaries OK. 135 Python tests OK. 21 Node script tests pass. Town e2e files are listed (16) and not executed by this gate. |
| `make lint-web` | PASS on the rerun. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 611 SUCCESS. Statements 77.58% (9224/11889), branches 65.32% (4126/6316), functions 79.32% (1903/2399), lines 82.64% (8017/9701). |
| `make build-frontends` | PASS. The Makefile recipe `npm run build` and `node scripts/write-release-manifest.mjs` exited 0. Release hash above. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 168 passed (2.4m), including held failure, viewport/theme/motion, Undo, reload, and the 390 touch garden case. |
| `npx playwright test --project=suite` | PASS. 61 passed (1.1m). |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/567. The body is only the leaf keyword for #443.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Owner visual review of the authored marks stays separate from these passing checks.
- Next actor: open the pull request, wait for required checks, then merge.
