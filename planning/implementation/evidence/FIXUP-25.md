# FIXUP-25 — Put setup and requesting time off first in PTO

- Leaf issue and parent(s): [#613](https://github.com/Vivekpsps3/vivek-monorepo/issues/613) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-25`, worktree `/tmp/vivek-fixup-25`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/613#issuecomment-7226639417). No subagents. The shared checkout was not edited. Finance, Town, Media, server, trip detail, queue, and CI files were not edited.
- Base main SHA `0a8ca08f2733f0c79622723100c095ec2d35f798`. Tested product SHA `ba56f46cb52c984ce5c85214e9b42aeb3300adaf`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` at `0a8ca08f` before the worktree. TUX-08 (#413) is closed and `6da2563c10835cae5274b013d6b5967e1747802e` is an ancestor. Policy history, the accrual boundary, per-day overlap, intersecting date edits, and the session guard are present in the PTO page and `pto-inspect` coverage. FIXUP-26 and GAME-09 were in progress on other worktrees and were not edited here. Source order on this base still put the Sick first-run card, the static “Set up PTO” message, and the unconfigured Add time off form ahead of the policy fields, matching the review at `bb300824`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-25-A1 | Synthetic reset account at `/travel/pto`. Without a policy, at 390×844 and 1280×800, light and night, reduced motion: “Set up PTO” leads, Starting balance is focused inside the viewport with `scrollY` under 8, the only primary button is Save, Add time off is absent, and Tab moves to Balance as of. “Track sick time too” sits below that setup. With a saved policy, Balance today and Add time off lead (stacked on a phone, Add to the right at 1280). One “Edit PTO” remains. Sick stays below Add. Empty Add focuses Name. Touch uses tap at 390; keyboard uses Enter at 1280. Axe reports no serious or critical violations on either state. | PASS | `apps/travel/e2e/pto-lead.spec.js` “PTO leads with setup or booking”, plus `pto.component.spec.ts` lead tests and `pto.spec.js` empty/loading focus and keyboard order. |
| FIXUP-25-A2 | Same synthetic policy (40 hours, no accrual) plus planned trip Harbor week. A 0.5 day Clinic request previews Before, a 502 keeps the draft and writes nothing, Retry stores one entry with days 0.5 on PTO, and the forecast chart stays mounted. Carry, cap, overlap, cadence, hours, chart Retry, remove Sick, and scheduled accrual still pass at 390 and 1280. Setup stays inside the page at 320px and at 200% text. | PASS | `pto-lead.spec.js` half-day and 320/200% tests, and the existing `pto.spec.js` recovery cases. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Primary “Set up Sick” ahead of PTO setup | First-run card was the first bright action on an unconfigured account | Sick is a secondary section under setup or booking. The button is `secondary`. “Not now” still dismisses the prompt. | Moved below the primary path. The compact “Sick: not set up” link still appears after dismiss. | Lead spec: Sick heading is below Set up PTO and below Add time off. First-run dismiss in `pto.spec.js` still passes. |
| Duplicate “Edit PTO” and “Edit PTO policy”, and the repeated balance sentence | Tile button plus a policy-card button, and the balance string in both places | One ghost “Edit {bucket}” on the balance tile. Policy facts (carry, cap, year, accrual boundary) stay visible without a second edit control. | Removed the second edit button and the second balance paragraph. | Specs expect one “Edit PTO” and zero “Edit PTO policy”. Hours text appears once. |
| Unconfigured Add time off form | The booking form rendered before a policy existed | `PtoComponent` shows the policy editor when PTO is missing and the booking form only after PTO is configured. | Removed the gated booking form, preview, and chart from the unconfigured page. Planned time away still lists. | Unconfigured page has no Add time off heading. Configured page primary button text is Add. |

- Candidate class and protected counterexamples: replacement of page order. Day math, carry and caps, overlap sentences, chart Retry, routes, the policy field set, and the session guard stay. Home “Set up PTO” / “Set up Sick” is unchanged.
- Comparison base SHA `0a8ca08f2733f0c79622723100c095ec2d35f798`. Replacement closure is `apps/travel/frontend/src/pto.component.ts` only. No new production file.
- Production added/deleted/moved: 433 added and 376 deleted in that component, net +57. Most of the churn is the same policy form moved into one `ng-template` with three mutually exclusive outlets. The net growth is the setup, editor, book, forecast, and Sick sections. Comments were not stripped.
- Independent equivalent implementations before/after: one policy editor and one booking form. The chart component is unchanged.
- State/cache owners and public entry points before/after: `/travel/pto` and the PTO policy, entry, series, and settings routes stay. Drafts stay on the component. A failed add does not invent a balance or write an entry. Focus timers clear on destroy and session loss.
- Remaining old symbol/path search: “Edit PTO policy”, `.pto-top`, and `.pto-lower` are gone from the component. “Set up Sick” remains as the secondary action.
- Follow-up change: none in this leaf. Home PTO prompts stay with their own owner.
- Tests/docs/generated changes separately: `pto.component.spec.ts` +32, `pto.spec.js` +24/−13, new `pto-lead.spec.js` 149 lines. No docs edit. No bundle committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +57 production lines. This is a feature/replacement layout, not a simplification quota. The extra lines keep one canonical editor while the unconfigured booking form and the duplicate edit/balance copy are gone. Domain math was not compressed to shrink the file.
- No behavior/data/meaningful assertion silently removed: half-day values, carry/caps, conflict copy, chart failure recovery, cadence wrapping, and hours display remain asserted.

## Verification

Commands ran from `/tmp/vivek-fixup-25` on `ba56f46cb52c984ce5c85214e9b42aeb3300adaf`, before this evidence file. `make test-fast` used `PATH="/tmp/vivek-fixup-25/.venv/bin:$PATH"`. Karma used `CHROME_BIN` and Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

An earlier focused Playwright run failed two assertions in the new spec only: the API returns days as `0.5000`, and CSP blocks `page.addStyleTag`. The assertions now compare `Number(days)` and set the root font size in the page. The full suite below is the run after that correction. No product code changed between the production bundle and that suite.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-25` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, root Karma, Travel node tests, `make build-frontends`, and Travel Playwright. |
| `make test-fast` | PASS. Doc paths, planning fixtures, blame, shared boundaries, and script tests. Travel e2e discovery lists 38 files. |
| `make lint-web` | PASS. Existing eslint baselines unchanged. |
| `make typecheck-web` | PASS. Web, Finance, packages, and site. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 756 SUCCESS. Statements 77.97% (12496/16025), branches 65.97% (5658/8576), functions 80.21% (2729/3402), lines 83.25% (10878/13066). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 95 pass, 0 fail. |
| `make build-frontends` | PASS. Production web bundle written to `dist/web`. The existing initial-budget warning remains. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 231 passed (3.9m), including `pto-lead.spec.js` and `pto.spec.js` at 390×844 and 1280×800, light and night. |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request is opened. The body is only `Closes #613`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. #277 stays open; this merge is not OPS-06.
- Next actor: merge this leaf after GitHub checks pass.
