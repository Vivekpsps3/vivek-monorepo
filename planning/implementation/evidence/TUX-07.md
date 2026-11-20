# TUX-07 — implementation evidence

- Leaf issue and parent(s): [#412](https://github.com/Vivekpsps3/vivek-monorepo/issues/412) TUX-07; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. #277 stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-07`; `/tmp/vivek-tux-07`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `bcaad64db2134c5209101573d6850c4c33ec7f0f` (TUX-06 merge, pull request #539). The implementation and these command results are `2fe26672983351e8f414a8d21147e073d34eb323`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `bcaad64db2134c5209101573d6850c4c33ec7f0f`. STYLE-03 dense holdings and media cards are ancestors of that tree (`fe04d6d84a6a99f525e053e483ba19405ea96e06`, pull request #496). NAV-02 return context is an ancestor (`8126d6efef2e6e0564d7dccc67e17d785204d4f9`, pull request #499; `packages/ui/src/return-context.ts`). `gh pr list --state open` returned no pull requests. No open `travel-forms` or `travel-ui` pull request. #412, #304, #134, and #277 were open.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-07-A1 | Synthetic upcoming trip with no stays opens from the card and shows "No destinations saved. Add one when you know where you're staying." and "No activities yet. Your dates are saved." Springfield has no coordinates and still shows the city plus "Location has not been chosen." Aborting `tile.openstreetmap.org` on Mapped harbor shows "Map tiles could not load" and "place list and map links are still available", with the title, city, and span still visible and no interactive tile. | PASS | `apps/travel/e2e/postcards.spec.js` empty-itinerary open and the missing-coordinates / failed-tile journey, at 390×844 and 1280×800. |
| TUX-07-A2 | The upcoming card states Upcoming, the saved span from ten days ahead through twelve days ahead, "No destination saved.", and "Review the plan". The heading is the trip title. The past card "Past harbor" states Past, the span from twenty days ago through eighteen days ago, City Paper City, Lodging Paper Inn, Airport PAP, and "Open this trip". A drive and a train are not airports. Latitude 0 and longitude 0 stay a city pin. Latitude 99 drops both coordinates. A blank or duplicate flight place is dropped. The title is not turned into a destination. | PASS | `postcards.spec.js` upcoming and past cards. `apps/travel/backend/static/tests/trip-list.test.mjs` card place and status test. |
| TUX-07-LIFE | A newer home response replaces a cancelled one. Session end and an owner change clear the listed trips, and the late home body does not paint them. A 503 on the destination save keeps Paper City and Paper Inn; the retry saves. A lodging edit during a held save stays "Second Inn" in the dialog. Session expiry clears the place query "synthetic quay" and leaves the login page with no place search. `acceptListedLoad` and `placeSearchCurrent` reject a stale epoch, editor, stay, query, or inactive session. | PASS | `travel.component.spec.ts` home race, session end, and owner change. `postcards.spec.js` failed save, late destination response, and session expiry. `trip-list.test.mjs` stale-load test. |
| TUX-07-VIEW | 390×844 dark touch and 1280×800 light keyboard, reduced motion. The postcard, stamp, and Hide map control are at least 44px. Axe serious and critical violations are empty. `animation-name` on the postcard is `none`. Keyboard Enter or a tap opens the upcoming card; "← Trips" returns focus to that card at `/travel`; the past card then opens and shows the city, lodging, and airport text. Stamp text is Away now, Upcoming, or Past. | PASS | `postcards.spec.js` at both viewports, including AxeBuilder, target size, reduced motion, and focus return. |

Fixtures are synthetic trips only. No private itinerary is in the tests, logs, or the issue. One OSM tile provider remains. Place search stays the explicit Find places action. Past `next_action` from the home API stays null; the card says "Open this trip".

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Second past-card markup, a plain link with only the title and the date range | `travel.component.ts` past grid, separate from the upcoming `a.trip-card` | One `#postcard` template for in-progress, upcoming, and past | Removed the thinner past markup. The same home payload still owns the rows. | Upcoming and past cards in `postcards.spec.js` share status, span, places, and a next action. |
| `.travel-page .trip-card { display: block }` and `.travel-page .trip-card:hover .ui-card` | Global `travel.css`. The hover rule targeted a nested card the list no longer rendered. | `.travel-page a.trip-postcard` | Removed both rules. Encapsulated `.trip-card`, `.trip-card-when`, and `.trip-card-next` stay because the postcard still uses them. | Postcard layout, focus, and reduced motion in `postcards.spec.js`. |

- Candidate class and protected counterexamples: feature replacement. The trip payload, OSM tiles, and explicit place search stay. A missing coordinate or a failed tile still leaves the place list. Latitude 0 and longitude 0 remain a real pin. A title with no stays does not become a city.
- Comparison base SHA and full replacement closure (including new files): `bcaad64db2134c5209101573d6850c4c33ec7f0f`. Closure is `trip-list.mjs`, `trip-list.d.mts`, `travel.component.ts`, `travel.css`, `trip.component.ts`, `trip.component.html`, and `map.component.ts`. No new production file.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat is +443/−78, net +365. That includes `trip-list.d.mts` (+41) and `docs/TRAVEL.md` (+2). `travel.component.ts` is +167/−44. `travel.css` is +81/−4. Blank-only lines are not split out of that numstat.
- Independent equivalent implementations before/after: 1 / 1 trip store. `cardPlaces` is the one place list for the postcard, the airport text rows, and the map list.
- State/cache owners and public entry points before/after: home and leave still use `GET /travel/api/home` and the existing PTO route. Saves still use the existing stay and place-search routes. List focus uses the existing return context for `/travel`. A later home epoch, a moved destination draft, or a changed place query makes the older response stale. Session invalidation clears the listed trips and the private place query.
- Remaining old symbol/path search, including config and discovery: no second map provider, geocoder, or trip store. `pastSlice` still limits the past preview. The past grid still uses `id="past-grid"`.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf.
- Tests/docs/generated changes separately: tests +497 (`trip-list.test.mjs` +66, `travel.component.spec.ts` +125, new `postcards.spec.js` 306 lines). `docs/TRAVEL.md` is the +2 above. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (677.04 kB against the 650 kB budget). The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +365 production lines. This is the feature: one postcard for upcoming and past trips, city/airport/lodging labels, and the late-response and session guards. The positive delta is the implementation, not a simplification claim.
- No behavior/data/meaningful assertion silently removed: confirmed. Trip titles, saved spans, currency totals, PTO overlap text, destination city headings, the map status sentences, and the existing trip routes still pass. The TUX-06 local-day itinerary still names the city in the level-3 heading.

## Verification

Commands ran in `/tmp/vivek-tux-07`. `make test-fast` used `PATH="/tmp/vivek-tux-07/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. The product tree did not change after these gates. Postcard locators were tightened after the first full Playwright run, and the passing full run below includes that spec.

The first full Playwright command was FAIL: 186 passed and 1 failed. `reminders.spec.js` "[390 light] failed toggle reverts" hit `locator.check` because the checkbox state did not change. The 1280 twin in that run passed. An isolated `--repeat-each=2` of that test passed 4 of 4. The reminder toggle was not changed in this leaf. The full suite was rerun and passed. The first command stays recorded as FAIL. The repaired run is the PASS row.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-07/.venv/bin:$PATH" make test-fast` | `2fe26672983351e8f414a8d21147e073d34eb323` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. Travel e2e discovery listed 30 files, including `postcards.spec.js`. |
| `make lint-web` | `2fe26672983351e8f414a8d21147e073d34eb323` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. No baseline was raised. |
| `make typecheck-web` | `2fe26672983351e8f414a8d21147e073d34eb323` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `2fe26672983351e8f414a8d21147e073d34eb323` | PASS. 421 SUCCESS. Statements 72.6% (5824/8022). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `2fe26672983351e8f414a8d21147e073d34eb323` | PASS. 69 pass / 0 fail. |
| `make build-frontends` | `2fe26672983351e8f414a8d21147e073d34eb323` | PASS. Output `/tmp/vivek-tux-07/dist/web`. Initial-bundle warning 677.04 kB. Exit 0. The Playwright run used that bundle. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `2fe26672983351e8f414a8d21147e073d34eb323` | First run FAIL: 186 passed, 1 failed (`reminders.spec.js` 390 failed toggle). Isolated rerun of that test PASS: 4 passed. Second full run PASS: 187 passed. |

Python lint, Python typecheck, and the travel and server coverage gates were not run. The diff does not change Python. Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run. The diff does not change those screens.

## Handoff

- PR URL (leaf closure keyword only): after the pull request is opened. The body uses `Closes #412` only.
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #134, and #277 stay open.
- Next actor: push `agent/tux-07`, open the pull request, wait for green required checks, then merge with a merge commit.
