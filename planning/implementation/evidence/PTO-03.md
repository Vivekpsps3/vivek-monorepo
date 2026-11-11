# PTO-03 — implementation evidence

- Leaf issue and parent(s): [#232](https://github.com/Vivekpsps3/vivek-monorepo/issues/232) PTO-03. Parent [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) stays open.
- Agent/context, branch/worktree: Cursor Grok, `agent/pto-03`, `/tmp/vivek-pto-03`.
- Base main SHA, current tested SHA: base `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Gates below ran on the implementation tree before this evidence file was added. `test-fast` was run again after this file existed.
- Fresh-main/prerequisite/active-PR checks: PTO-03 has no dependencies. PTO-01’s combined chart is on this base (`1b5a133`). The only open pull request at claim time was #322 (FIN-01), which does not edit Travel Home. No open PR claimed `travel-home` or `travel-summary`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| HOMEH1 | Configured PTO (80 h) and Sick (40 h), zero accrual, and a trip that includes today. Home shows `balance_today_days` / `balance_today_hours` from `GET /api/pto` and the next-trip day/hour fields from `GET /api/home`. Those bucket fields match `GET /api/pto/policies/{bucket}`. Impact days and leftover match the trip projection; impact hours are `fmt_hours(days × hours_per_day)`. Zeroing one counted day on or before today raises the PTO hour balance by that day’s hours and changes the impact; Sick hours stay put. The PTO page tiles show the same day/hour phrase before and after. | PASS | `apps/travel/backend/tests/test_home_time_off.py` `test_home_impact_hours_match_the_pto_projection` (inside `./scripts/coverage-gate.sh travel`, 200 passed). Playwright `home balances match the PTO page before and after an allocation change`. Karma shows the server strings, including hour text that is not `days × 8`. |
| HOMEH2 | No policy shows “PTO and Sick are not set up.” and `Set up PTO` → `/travel/pto`. Sick only shows `3 days · 24 h` and `Set up PTO`, and the link opens the PTO page. A failed `GET /api/pto` shows “Couldn't load time off.”, leaves the trip card clickable, and Retry time off loads the summary without a second home fetch. | PASS | `test_unconfigured_and_single_bucket_summaries`. Karma `links to PTO setup when nothing is configured`, `shows one bucket and the setup link for the other`, and `keeps the trip card usable when the summary fails and retries that request`. Playwright `unconfigured, one bucket, and a failed summary keep trip cards usable`. |

Hours stay in the time-off section. A €80 trip cost stays on the trip card. The time-off section does not contain `€`. Karma and Playwright both assert that split.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| PTO-only Home summary (`daysText(home.pto.balance_today)`) and any inline days/hours calculator | `TravelComponent` rendered one PTO day total from the legacy home snapshot | `GET /api/pto` bucket `balance_today_days` and `balance_today_hours` (`bucket_state` / `walk_bucket`). Next-trip days stay on `trip_projection`. `fmt_hours` spells those existing day amounts. | Removed the PTO-only card and the `daysText` binding. The component prints server strings. A fixture with home `balance_today` `999` and impact hours `16.5` (not `2 × 8`) renders `16.5`, not `999`. | Karma `shows server day and hour balances and the server trip impact`. |

- Candidate class and protected counterexamples: duplicate live presentation on Home. Trip costs, the PTO chart, policy forms, and `snapshot_pto` for the PTO board stay. Historical entries were not rewritten.
- Comparison base SHA and full replacement closure: `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`. Production closure is `assemble.py`, `travel.component.ts`, `travel.component.css`, and `travel.models.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: `git diff --numstat` versus the base. `assemble.py` +22/−4, `travel.component.ts` +69/−8, `travel.component.css` +8, `travel.models.ts` +12. Production +111/−12, net +99. About four of the added `assemble.py` lines are the `_hour_text` docstring. No move.
- Independent equivalent implementations before/after: 1 Home summary (PTO days only) before; 1 Home summary (both buckets’ server day/hour text, plus the existing next-trip projection) after. Balance math owners stay `walk_bucket` and `trip_projection`. Home does not divide hours by hours-per-day.
- State/cache owners and public entry points before/after: before, one `data` signal from `GET /api/home`. After, trips still come from that request. Balances come from one `GET /api/pto` (`leave`, `leaveError`, `leaveLoading`). Public route remains `/travel`.
- Remaining old symbol/path search: `daysText(home.pto.balance_today)` is gone from `travel.component.ts`. `snapshot_pto` and `home.pto` remain because the PTO board and existing forecast tests still read that day snapshot. Home no longer renders it.
- Follow-up change: Home copy stays in `travel.component.ts`. Exact balances stay in `leave_math.py` / `bucket_state`. Trip-day projection stays in `pto.py`. Policy forms and the combined chart were not edited.
- Tests/docs/generated changes separately: tests are `test_home_time_off.py` (123 lines), `travel.component.spec.ts` (152), `home-pto.spec.js` (131), and `axe.spec.js` +2/−1 so the home axe pass waits for the summary request. This file is the planning doc. `dist/` from `make build-frontends` is generated and not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: net +99 production lines. This is a feature leaf. The added lines are the Home presentation for both buckets, the separate summary failure state, and the hour spelling of the trip projection already returned by Home. `home.pto` stays so existing forecast assertions keep their day snapshot.
- No behavior/data/meaningful assertion silently removed: trip cards, currency totals, and the legacy `home.pto` / `next_pto` day fields used by `test_api.py` and `test_pto_allocation.py` remain. The old “PTO balance today” day-only sentence was replaced by the day-and-hour sentences those tests now cover.

## Verification

Local execution only at the time this section was written. CI, merge, and deployment had not run.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS (doc paths, planning validation 94 packets, 63 unittest tests, e2e discovery). Re-run after this file was added. |
| `make lint-python` | PASS. 212 files formatted. Ruff 101 and suppressions 6 match the baselines. |
| `make typecheck-python` | PASS. mypy 87 findings match the baseline. |
| `make lint-web` | PASS. ESLint baselines match (finance 469, site 9, packages 1, world-engine 0). Engine purity 1 pass. |
| `make typecheck-web` | PASS. |
| `CHROME_BIN=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 658 SUCCESS. Statements 82.47% (5102/6186), branches 68.59% (1913/2789), functions 82.08% (1049/1278), lines 86.04% (4439/5159). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 62 tests. |
| `make build-frontends` | PASS. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 153 passed. |
| `./scripts/coverage-gate.sh travel` | PASS. 200 passed. Total coverage 88.13% (floor 80.41%). The floor was not changed. |

## Handoff

- PR URL (leaf closure keyword only): not opened yet.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status (actual evidence, not assumption): not merged. Not deployed. Local verification only.
- Remaining external prerequisites or approved scope decisions: none for this leaf. #110 stays open for the rest of its scope.
- Next actor: open the pull request with `Closes #232`, then watch CI.

Issue / parent / local packet: PTO-03 / #232 / #110 / `planning/implementation/issues/PTO-03.md`.

Branch, worktree, base main SHA, current SHA: `agent/pto-03`, `/tmp/vivek-pto-03`, base `3954d1f27aa8ad0766eac9a7e9667f68d3c76571`.

Owned files and conflict groups: `travel-home`, `travel-summary`. FIN-01 (#322) was the only open PR and does not edit these files.

Completed acceptance rows with direct evidence: HOMEH1 and HOMEH2 PASS, as in the table above.

Unfinished/failed rows and exact next action: open the PR and wait for CI.

Deletion ledger and current consumer migration: Home is the only consumer of the PTO-only day card. It now reads the PTO board’s bucket balances and the existing next-trip projection.

Commands run, results, tested SHA; required checks still pending: see Verification. CI has not run.

PR and roadmap note URLs; actual merge/deployment/activation state: not opened, not merged, not deployed.

External prerequisites and next actor: open the pull request. #110 remains the open parent ledger.

No unstated decision from the previous context is necessary to continue.
