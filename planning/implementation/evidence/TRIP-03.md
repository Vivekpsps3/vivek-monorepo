# TRIP-03 — implementation evidence

- Leaf issue and parent(s): [#227](https://github.com/Vivekpsps3/vivek-monorepo/issues/227); parent [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/trip-03`, `/tmp/vivek-trip-03`
- Base main SHA, current tested SHA: base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Product commit `161010305164f568102eb1facff7751c4945541c` is the tree those gates ran against. This handoff line is the only later documentation change.
- Fresh-main/prerequisite/active-PR checks: TRIP-02 #226 is closed via squash `9e1f582b2f5651a96268b66d779f319ce1744aed`, an ancestor of the base. At claim time no other PR was open. Before commit, open PRs were #342 (DEL-04, finance service only), #343 (PTO-04, leave router, `pto.component.ts`, `pto.spec.js`, PTO evidence), and #344 (VER-01, lint ownership and scripts). None of those diffs edit the trip page, trip costs, trip reminders, `packages/ui` menu or confirm, or the trip end-to-end specs this leaf owns.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ACT1 | Empty trip. Keyboard opens Add, lands on Transport, Escape returns to the trigger, and each of Transport, Activity, Destination, Parking, Reminder, Note, and Cost opens its editor. ArrowDown from the focused Transport item reaches Cost. Touch at 390px opens Add and the note row menu, then Escape closes it. | PASS | `apps/travel/e2e/trip-actions.spec.js` |
| DELETE1 | Title confirmation. Keep trip sends no DELETE. Wrong text leaves the confirm control `aria-disabled`; a forced click and Enter send no DELETE. A 502 keeps the dialog, the static error, the typed title, and focus. Retry deletes, focuses the Trips heading, and the following GET is 404. The same contract is repeated for the short title Kyoto. | PASS | `apps/travel/e2e/trip-actions.spec.js` and `apps/travel/e2e/blockers.spec.js` |
| ACT2 | At 390 and 1280, destination, itinerary, note, reminder, and cost rows expose either the menu or the inline actions, not both. Transport and Parking headings stay hidden at 390 and visible at 1280. The EUR total still shows 12.00. Delete trip stays transparent at rest. Home still groups Away now, Upcoming, and Past and expands six past trips. | PASS | `trip-actions.spec.js`, `trips-list.spec.js`, `itinerary.spec.js`, `trip-page.spec.js` |
| COSTREM | Failed reminder toggle rolls back and the alert is the in-page `Toggle unavailable` alert, not the toast region. Inline cost add posts one row. Undo failure for costs and reminders stays in a scoped `Restore unavailable` alert and retry restores the row. Both widths and both themes. | PASS | `apps/travel/e2e/trip-costs.spec.js`, `reminders.spec.js`, `undo.spec.js` |
| Deletion | The trip-page `details.add-menu`, the separate Add transport and Add activity buttons, and the transport and parking detail-card action buttons are gone. Each record has one action set in the accessibility tree. | PASS | ACT2 menu-versus-inline counts in `trip-actions.spec.js` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Trip-page `details.add-menu` plus Add transport and Add activity buttons | `trip.component.html` and the trip end-to-end specs | one `ui-menu` labeled Add | old menu and the two buttons deleted | ACT1 seven menuitems |
| Destination, note, cost, and reminder inline-only actions, and transport/parking detail-card Edit/Remove buttons that duplicated the itinerary | trip, cost, and reminder templates | the same `ui-menu` / inline pair already used by the itinerary, swapped at 640px | detail-card action buttons deleted; row menus added | ACT2 one affordance per row |
| `confirm.ask` for typed trip deletion | `TripComponent.deleteTrip` | `ConfirmService.confirmAction` | ask path removed for this delete only | DELETE1 |

- Candidate class and protected counterexamples: duplicate live action controls. Unsaved-change prompts still use `confirm.ask` in the trip, new-trip, PTO, and settings components. Item Undo still uses the toast. New-trip "Add destination" and the transport editor's "Add transport" heading are different surfaces and stay. PTO files were not edited.
- Comparison base SHA and full replacement closure: `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6`. Closure is `trip.component.ts`, `trip.component.html`, `travel.css`, `trip-costs.component.ts`, `trip-costs.component.css`, `trip-reminders.component.ts`, `trip-reminders.component.css`, `packages/ui/src/ui-menu/ui-menu.component.ts` and its spec, the trip e2e specs listed below, `apps/travel/e2e/dates.mjs`, `apps/web/src/app/world/ui/world.component.spec.ts`, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat` production is +208 / -104. `trip.component.html` +66/-58, `trip.component.ts` +18/-19, `travel.css` +6/-3, `trip-costs.component.ts` +29/-2, `trip-costs.component.css` +14/-5, `trip-reminders.component.ts` +36/-8, `trip-reminders.component.css` +21, `ui-menu.component.ts` +18/-9. Net production +104. No comment-only file.
- Independent equivalent implementations before/after: two Add entry points (primary buttons and a details menu) become one Add menu. Desktop detail-card actions for transport and parking duplicated the itinerary row; those card buttons are gone, so each of those records has the itinerary action only. Phone still hides the detail cards. `confirmAction` was already the confirm-and-run primitive; this leaf calls it and does not add another.
- State/cache owners and public entry points before/after: one open menu, still the existing `ui-menu` slot. Typed delete state stays inside `ConfirmService`. No second trip store. `ConfirmService.confirmAction(options: ConfirmActionOptions)` is unchanged: `title`, `message`, `confirmLabel`, `cancelLabel`, `busyLabel`, `phrase`, `errorMessage`, `run`. `packages/ui/src/confirm.service.ts` has no diff.
- Remaining old symbol/path search, including config and discovery: `details.add-menu` is gone under `apps/travel`. "Add transport" remains the new-trip control and the transport editor heading, not a trip-page action button. `confirm.ask` remains for non-destructive leave and save prompts.
- Follow-up change: trip Add and row actions edit the trip, cost, and reminder templates. Typed trip deletion edits `deleteTrip`. Menu focus timing edits `ui-menu.component.ts`.
- Tests/docs/generated changes separately: new `trip-actions.spec.js` is 216 lines. Tracked e2e numstat is +235/-60 across blockers, dates, flights, map-recovery, native, optional-forms, reminders, screenshots, trip-costs, trip-page, and undo. Menu spec +13. World ownership spec +5/-3 so an already-installed shared lock transport does not fail the listener counts. No generated output committed. `apps/karma.conf.js` was set to port 9971 only while Karma ran and matches HEAD again.
- Net production delta and specific reviewed safety/compatibility exception if positive: +104. The leaf adds the responsive row menus and removes the old Add details menu, the split Add buttons, and the duplicate detail-card actions. The menu focuses on a second animation frame because zone event coalescing paints after the first frame; without that, keyboard focus was dropped while the panel was still hidden. Escape on the open trigger closes the menu. Those menu changes keep the existing inputs and outputs.
- No behavior/data/meaningful assertion silently removed: checkbox locators that collided with "Actions for {title}" are now `getByRole('checkbox', { name, exact: true })`. Alert assertions stay on one role-and-text match and still reject the toast region. Wrong-title confirmation is still refused; the spec clicks it with `{ force: true }` because the control is `aria-disabled`. Map recovery at 390px opens Choose location through the row menu.

The world ownership spec was already failing on base `bc2d79ebabab7d2b719bcbff920a4f256dbeb9f6` (GitHub Actions Frontend job 130780523579, same three `Expected 0 to be 1` lines). Search's root finance port installs the shared lock transport for the Karma page and never releases it. The spec still requires a sole owner to add and remove that listener, and it requires an already-live transport to stay shared. Channel and storage delivery assertions are unchanged. Isolated, the world spec's 10 tests passed before this adjustment. In the full suite they failed until the counts accepted either case.

## Verification

Commands ran from `/tmp/vivek-trip-03`. `PYTHON` was `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` (symlink only; nothing was installed into it). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Karma used port 9971 inside `config.set` and that edit was reverted before commit. Local execution only.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, planning validation, blame revisions, shared boundaries, finance UX, unittest, e2e discovery, and 15 node script tests. |
| `make lint-web` | PASS. eslint baselines unchanged: finance 469, site 9, packages 1, world-engine 0. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS on the rerun after the world spec adjustment. 711 SUCCESS. Statements 83.24% (5518/6629), branches 70.25% (2123/3022), functions 82.78% (1106/1336), lines 86.91% (4776/5495). An earlier run failed the new menu Escape focus assertion (focus was on `body` because the test never focused the trigger) and the pre-existing world counts. The next run failed only the world counts. |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 63 passed, 0 failed. |
| `make build-frontends` | PASS. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 167 passed. An earlier full run had 166 passed and 1 failed: map recovery at 390px could not see the inline Choose location button. That spec now uses the row action. The rerun of `map-recovery.spec.js` was 11 passed, and the full suite after the production rebuild passed. |

## Handoff

- PR URL (leaf closure keyword only): opened after these gates, with `Closes #227` and a non-closing reference to #84. URL recorded in the next handoff update.
- Roadmap #134 append-only status-note URL: posted after the PR exists. The issue body is not edited.
- Merged/activation status (actual evidence, not assumption): not merged. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. `confirmAction`'s call shape stayed unchanged, so PTO-04 does not need a packages/ui edit from this work.
- Next actor: this agent, to push `agent/trip-03`, watch CI, and squash-merge.
