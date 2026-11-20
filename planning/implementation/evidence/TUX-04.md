# TUX-04 — implementation evidence

- Leaf issue and parent(s): [#409](https://github.com/Vivekpsps3/vivek-monorepo/issues/409) TUX-04; parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304). Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. OPS-06 / #277 was not edited. TUX-02 / #407 stays merged as #535. TUX-03 / #408 stays merged as #536.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/tux-04`; `/tmp/vivek-tux-04`. The shared checkout was not edited.
- Base main SHA, current tested SHA: base `1b933def10cb00216d1103fe02f5e7d403947aad` (TUX-03 merge, pull request #536). The implementation and these command results are `d74f1e8d0ef33144b77e8a45067fe595d31e549e`. This sentence names that commit; the follow-up only edits this evidence file.
- Fresh-main/prerequisite/active-PR checks: `git fetch origin main` on 2026-11-20 still returned `1b933def10cb00216d1103fe02f5e7d403947aad`. That commit is the TUX-03 merge. TUX-02 flight lookup, TUX-03 draft save, NAV-02 settings return, and STYLE-02 44px controls are on that tree: `apps/travel/e2e/flights.spec.js` and `apps/travel/e2e/trip-draft.spec.js` passed in the Travel Playwright run below. `gh pr list --state open` returned no pull requests. No open `travel-forms` or `travel-ui` pull request.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| TUX-04-A1 | Synthetic UA837 on 2026-11-02 proposes SFO → NRT, local departure `2026-11-02 10:00 America/Los_Angeles`, local arrival `2026-11-04 07:30 Asia/Tokyo`, and "Proposed. Not saved yet." No trip or draft write happens until Plan as a new trip, then Save draft. The posted draft has start `2026-11-02`, `end_date` null, `destination_label` null, one outbound leg UA837, and one inferred `destination_city` proposal for NRT. Home stays empty and PTO entries stay empty. Using the proposed destination stores NRT and still leaves `end_date` null with no `counts_as_pto`. Two matches stay unselected until LAX → HND is chosen. Lisbon week receives only the accepted leg; its dates, `counts_as_pto`, `pto_dates`, and PTO entries stay unchanged. A typed departure of `2026-11-02T09:15` is what the draft stores, and the arrival day is not a return. | PASS | `apps/travel/backend/static/tests/flight-start.test.mjs`. Browser: `apps/travel/e2e/flight-start.spec.js` review, edited time, ambiguous choice, and existing-trip tests. |
| TUX-04-A2 | FlightAware settings opens over the typed flight. A held lookup is dropped. Back to flight restores the number, date, and proposed route. The trip departure and return stay empty. Drafts and home trips stay empty. Typing `synthetic-key-tux-04`, choosing Keep editing, then Leave settings returns focus to the settings button and keeps the same proposal. Checked at 390×844 dark touch and 1280×800 light keyboard, reduced motion. | PASS | `apps/travel/e2e/flight-start.spec.js` settings hold test and both viewport tests. Screenshots `flight-start-settings-phone.png` and `flight-start-settings-desktop.png` in the Playwright output. |
| TUX-04-LIFE | A late UA837 response does not replace the UA838 card on screen. Opening settings cancels a held lookup. A 502 on the first draft save keeps the reviewed flight, and the retry stores one draft with `end_date` null. `lookupApplies` rejects a stale epoch, open settings, and an inactive session. `settleAttach` refuses a changed flight number and a signed-out session. `clearFlightStart` drops the in-memory ident. Session expiry on Plan a trip still clears the form and does not show a discard dialog. | PASS | `flight-start.test.mjs` late lookup, attach, and clear tests. Browser: late lookup, settings cancel, and failed-save tests in `flight-start.spec.js`. Existing `trip-draft.spec.js` session expiry still passes. |
| TUX-04-VIEW | The same settings journey at 390×844 night touch and 1280×800 light keyboard. Flight number and FlightAware settings are at least 44px. The dialog heading receives focus, reduced motion sets `animation-name` to `none`, and Back to flight is at least 44px. Axe color-contrast, serious, and critical violations are empty. Focus returns to the settings button. The proposed route text matches the synthetic timetable. | PASS | Both viewport tests in `flight-start.spec.js`, including AxeBuilder. |

Fixtures are synthetic: UA837 / UAL837, SFO/NRT, UAL837E / UA838, LAX/HND, Lisbon week, and `synthetic-key-tux-04`. Lookup responses are Playwright `route.fulfill` bodies. No live FlightAware call and no private itinerary.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior flight-first start. Plan a trip began with typed dates and a destination. | `new-trip.component.ts` date and city fields, `POST /travel/api/trips`, and `POST /travel/api/trip-drafts`. | The same form remains below the flight section. Complete trips still require a return and still allocate PTO. | Nothing replaced. The flight section is additive. | `forms.spec.js`, `trip-draft.spec.js`, and `flights.spec.js` passed with the new section on the page. |
| A second flight client would duplicate `POST /travel/api/flights/lookup`. | Transport editor lookup. | `flight-model.mjs` plus that same endpoint. `flight-start.mjs` only composes the model. | No second client was added. | `rg` of `/travel/api/flights/lookup` finds the transport editor and `flight-start.component.ts` only. |

- Candidate class and protected counterexamples: feature addition. There was no flight-first path to delete. Manual dates, the transport editor, draft save, and complete-trip PTO stay. An inferred arrival airport is not `destination_label` until the user accepts it. Acceptance does not set `end`.
- Comparison base SHA and full replacement closure (including new files): `1b933def10cb00216d1103fe02f5e7d403947aad`. Closure is `flight-start.mjs`, `flight-start.d.mts`, `flight-start.component.ts`, the Plan a trip wiring in `new-trip.component.ts`, the empty-home sentence, and the flight-start styles.
- Production added/deleted/moved; comments/blank-only churn separately: physical production numstat is +1059/−9, net +1050. That includes `flight-start.mjs` (272, 23 blank), `flight-start.component.ts` (531), `flight-start.d.mts` (104), `flight-model.d.mts` (+1), `new-trip.component.ts` (+140/−7), `travel.component.ts` (+2/−2), and `travel.css` (+9). Comments and blank lines are inside that count. Docs before this evidence file are `apps/travel/AGENTS.md` +5/−3 and `docs/TRAVEL.md` +2/−2.
- Independent equivalent implementations before/after: 1 / 1 lookup client. The new component is another caller of the same route, not a second provider client.
- State/cache owners and public entry points before/after: lookup stays `POST /travel/api/flights/lookup`. New-trip drafts stay `POST/PATCH /travel/api/trip-drafts`. An existing trip gains a leg only through `POST /travel/api/trips/{id}/transports`. The in-memory flight draft clears on session invalidation. Opening settings bumps the lookup epoch and does not refetch on close.
- Remaining old symbol/path search, including config and discovery: destination-first fields remain. `rg` finds no second lookup URL and no calendar-import path. Calendar import stays TUX-05.
- Follow-up change: which production files and independent policy owners now need editing: none for this leaf. A later calendar leaf must not reuse this review as an import.
- Tests/docs/generated changes separately: tests +593 (`flight-start.test.mjs` 242, `flight-start.spec.js` 351), plus this evidence file. No generated bundle is committed. `make build-frontends` exited 0. The existing initial-bundle warning remains (674.82 kB against the 650 kB budget).
- Net production delta and specific reviewed safety/compatibility exception if positive: +1050 production lines. This is the feature: a flight-first review, an unconfirmed destination proposal, an empty return, and no PTO charge. The positive delta is the implementation, not a simplification exception.
- No behavior/data/meaningful assertion silently removed: confirmed. Manual trip entry, transport flight lookup, draft save, and complete-trip PTO assertions still pass.

## Verification

Commands ran in `/tmp/vivek-tux-04`. `make test-fast` used `PATH="/tmp/vivek-tux-04/.venv/bin:$PATH"` because the Makefile calls `python3` and the worktree `.venv` is a symlink to the shared virtualenv. Playwright and Karma used Chromium `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` is a symlink to the shared install. The first `make test-fast` without that PATH failed in `scripts/test_restore_drill.py` with `No module named 'alembic'`; the PATH rerun passed. The first Karma launch failed with no Chrome binary; the `CHROME_BIN` rerun passed. The first focused `flight-start.spec.js` run had 8 passed and 1 failed because the draft list was read before the save response; the assertion now waits for the saved notice. The full suite below includes that fix. No Python file changed, so Python lint, mypy, and coverage gates were not run.

| Command | Tested SHA | Result |
| --- | --- | --- |
| `PATH="/tmp/vivek-tux-04/.venv/bin:$PATH" make test-fast` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. Node script tests 21 pass / 0 fail. |
| `make lint-web` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. eslint-finance 345, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baselines. Engine purity 1 pass. One new template `==` was changed to `===` before this pass. The baseline was not raised. |
| `make typecheck-web` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. `tsc` noEmit for web, finance, packages, and site. |
| `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. 418 SUCCESS. Statements 72.6% (5824/8022). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. 61 pass / 0 fail. |
| `make build-frontends` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. Output `/tmp/vivek-tux-04/dist/web`. Initial-bundle warning 674.82 kB. Exit 0. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | `d74f1e8d0ef33144b77e8a45067fe595d31e549e` | PASS. 164 passed. The nine `flight-start.spec.js` tests are included. |

`make lint-python`, `make typecheck-python`, `./scripts/coverage-gate.sh travel`, and `./scripts/coverage-gate.sh server` were not run: the diff has no Python. Finance coverage, Media coverage, Finance Karma, site Karma, Finance Playwright, Media Playwright, and Town Playwright were not run: the diff has no Finance, Media, or Town screen. `make e2e` is the Finance Playwright gate and was not run.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/537 (`Closes #409` only).
- Roadmap #134 append-only status-note URL: after merge.
- Merged/activation status (actual evidence, not assumption): not merged and not deployed.
- Remaining external prerequisites or approved scope decisions: none inside this leaf. #304, #134, and #277 stay open.
- Next actor: wait for green required checks, then merge with a merge commit.
