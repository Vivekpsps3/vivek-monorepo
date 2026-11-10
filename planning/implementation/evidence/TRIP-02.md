# TRIP-02 — implementation evidence

- Leaf issue and parent(s): [#226](https://github.com/Vivekpsps3/vivek-monorepo/issues/226); parent [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/trip-02`, `/tmp/vivek-trip-02`
- Base main SHA, current tested SHA: base `80b9ca0e0776297f3addcdfdac78542f6a7ced40`. `origin/main` was fast-forwarded to `9d39d3c1e21948da3fe2f3facbf9adad21efceb9` before the locked gates. Tested product SHA `62c08ecc31e8bb9e5fc6cb2e7a442e2d6ecb6433`.
- Fresh-main/prerequisite/active-PR checks: no dependency leaf. Fast-forwarded `origin/main` (including `9d39d3c`) before the gates. Trip product files were not changed by that merge. Media, finance, web, server, and the boundary checker were not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| DAY1 | Mixed timed, untimed, out-of-range, red-eye, and linked-parking fixtures. Next-day arrival sits on the arrival date. Parking linked to that departure sorts before it. Untimed plans stay in the day's Unscheduled group. Dates outside the trip stay in Outside trip dates. | PASS | `week.test.mjs` red-eye, missing-time, tie, and out-of-range tests; Playwright `itinerary.spec.js` DAY1 |
| DAY2 | Arrow, Home, End, and Enter on the day strip. One tab stop. Enter selects the day, focuses its panel, and Add a plan submits that local date. | PASS | Playwright `itinerary.spec.js` DAY2 |
| DAY3 | `?day=` survives reload and back-forward. At 390px the Transport and Parking sections are gone, each record appears once in the itinerary, and row actions are menus. At 1280px those sections and inline Undo actions stay. Axe serious/critical is empty at both widths. | PASS | Playwright `itinerary.spec.js` DAY3 |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Trip page listed `day.items` separately from Transport and Parking cards | `trip.component.html` | `projectItinerary` in `calendar-model.mjs`, rendered once by the itinerary | Phone hides the Transport and Parking cards. Desktop cards stay. | DAY1 order and DAY3 phone counts |
| Per-handler date grouping | the trip template walked `trip.days` items only | one `projectItinerary` result for the strip and the rows | component-local item sort removed | `week.test.mjs` shared vectors |
| `monthMatrix`, `weekdayHeads`, `dayLinkName`, `barName`, `monthName`, `toIso` | only `week.test.mjs` and `tr3.test.mjs` | composer `weekdayHeads` / `monthCells` for the live week grid; `formatDay` for calendar copy | deleted from `calendar-model.mjs`; obsolete assertions removed | no production import of those helpers; week-start test now calls the composer |
| Leave/return and weekday labels | `dayKicker` and weekday tables in the preserved model | `projectItinerary` accessible names (`Leave day`, `Return day`, `busy`/`free`) | moved into the live strip | DAY1 accessible name and node assertions |

- Candidate class and protected counterexamples: duplicate live presentation on the phone, plus test-only calendar helpers. The 2026-10-27 runtime-removal record preserved `calendar-model.mjs`. Fresh imports were only the two node tests. The live calendar page lists trips. The composer already owns the week grid. The day strip needed weekday, leave/return, and busy/free labels, so those moved into the projection and the trip page imports it. The model was not deleted merely because it had no static import. PTO math, Finance totals, and leave policy were not changed. Undo still restores from the desktop row.
- Comparison base SHA and full replacement closure: `9d39d3c1e21948da3fe2f3facbf9adad21efceb9`. Closure is `calendar-model.mjs`, `calendar-model.d.mts`, `trip.component.ts`, `trip.component.html`, `travel.css`, `travel.models.ts` (parking `transport_id`, `start_at`, `end_at` only), `week.test.mjs`, `tr3.test.mjs`, `apps/travel/e2e/itinerary.spec.js`, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: tracked production `+589 / -137` (`calendar-model.mjs` `+226/-45`, `trip.component.ts` `+168/-1`, `trip.component.html` `+143/-88`, `travel.css` `+49/-3`, `travel.models.ts` `+3`). New `calendar-model.d.mts` is 64 lines of types for that projection. Net production is positive.
- Independent equivalent implementations before/after: two trip timelines (activity days, plus separate transport and parking lists) become one projection with a desktop detail presentation. The unused month-grid copy in `calendar-model.mjs` is gone; the composer keeps the live week grid.
- State/cache owners and public entry points before/after: selected day is the `day` query parameter only. No second trip store and no provider fetch. `projectItinerary` is the new read-only entry point.
- Remaining old symbol/path search, including config and discovery: `monthMatrix`, `dayLinkName`, and `barName` have no remaining import under `apps`, `packages`, or `scripts`. `calendar-model.mjs` remains and is imported by the trip component and `week.test.mjs`.
- Follow-up change: itinerary order and day-strip names edit `projectItinerary`. Trip row actions still edit the trip component. Week-start headers edit `composer-model.mjs`.
- Tests/docs/generated changes separately: `week.test.mjs` `+97/-3`, `tr3.test.mjs` `-10`, `blockers.spec.js` `+5/-2` so phone parking edit opens the row menu, `itinerary.spec.js` 159 lines. No docs and no generated output committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +452 tracked lines, plus the 64-line declaration. This leaf adds the itinerary, not a simplification. The added projection is the single chronology owner the strip and rows both use. Desktop transport and parking cards stay so existing detail and Undo remain.
- No behavior/data/meaningful assertion silently removed: composer week-start coverage moved from the unused calendar helpers onto `composer-model.mjs`. Trip-page money, date, and Undo specs still apply. PTO charges are untouched.

## Verification

Commands ran from `/tmp/vivek-trip-02` with `PATH="/tmp/node24/bin:$PATH"` (`node` v24.11.1). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `PLAYWRIGHT_BROWSERS_PATH` was `/home/vivek/.cache/ms-playwright`. `PYTHON` was the main checkout `.venv`. `flock` on `/tmp/vivek-wave-gates.lock` covered each recorded run. Local execution only.

An earlier Karma launch failed before any spec because `CHROME_BIN` was unset (`No binary for ChromeHeadless`). No assertion ran. The recorded Karma command below set `CHROME_BIN`.

Playwright then failed once on a strict-mode locator in the new DAY3 spec (`itinerary-actions--inline` matched three hidden nodes). The spec was fixed to assert each node. Product files did not change after the locked Karma, node, and build results. Playwright was rerun under the same lock.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, planning validation (80 packets), blame revisions, shared boundaries, finance UX, 53 unittest tests, e2e discovery, 15 node tests. |
| `make lint-web` | PASS. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 649 SUCCESS. Statements 82.44% (5085/6168), branches 68.92% (1914/2777), functions 81.77% (1041/1273), lines 86.02% (4432/5152). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 58 passed. |
| `make build-frontends` | PASS. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS on rerun. 147 passed. The rerun includes DAY1, DAY2, and DAY3. |

## Handoff

- PR URL (leaf closure keyword only): opened after the locked gates, with `Closes #226` and `Refs #84` only.
- Roadmap #134 append-only status-note URL: posted after merge. The issue body is not edited.
- Merged/activation status (actual evidence, not assumption): not merged until the gates pass and the squash merge completes. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf.
- Next actor: integration owner, after this leaf is squash-merged.
