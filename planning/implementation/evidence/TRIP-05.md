# TRIP-05 — implementation evidence

- Leaf issue and parent(s): [#229](https://github.com/Vivekpsps3/vivek-monorepo/issues/229); parent [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84) stays open
- Agent/context, branch/worktree: Cursor Grok, `agent/trip-05`, `/tmp/vivek-trip-05`
- Base main SHA, current tested SHA: base `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Product and test commit `eb989e688ababcd7c5d81caff3072bfd7333267b` is the tree those gates ran against. This SHA line is the only later documentation change.
- Fresh-main/prerequisite/active-PR checks: the branch was created from that base, which was `origin/main` at claim time. TRIP-04 is on this base as squash `942db75` (`Explain trip form errors on submit instead of disabling Save (#352)`). `gh pr list --state open` returned no open pull requests. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/229#issuecomment-6811728220

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| PICK1 | Same Monday–Wednesday dates. Pointer chooses None then Full, and Half. Keyboard moves Full to Half to None. Both the new-trip POST and the existing-trip PATCH send `counts_as_pto: true` and amounts `1`, `0.5`, `0` on `2026-12-14`, `2026-12-15`, `2026-12-16`. Both show `1.5 PTO days selected.` and the local day name. | PASS | `apps/travel/e2e/pto-picker.spec.js` PICK1 new trip and PICK1 existing trip. Unit vectors in `pto-model.test.mjs` (`allocationDraft` of the same map). |
| PICK2 | Existing amounts `0.25`, `1`, and `0.1` at 390px in light and dark. The `0.25` and `0.1` radios stay checked and Half is not selected for `0.25`. Date and choice text are visible, at least 13px, inside the viewport, and contrast with the opaque background. The day list does not scroll horizontally. Changing the middle day to Half, failing the PATCH, then choosing None and saving again sends `0.25` / `0.5` / `0.1` on the failed body and `0.25` / `0.5` / `0` on the retry. The stored trip matches the retry. | PASS | `apps/travel/e2e/pto-picker.spec.js` PICK2. `allocationText("0.3")` stays `0.3` while `blurHours("0.3")` is `0.25` in `pto-model.test.mjs`. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Parallel new-trip and existing-trip `<select>` controls (`Not PTO` / `Half day` / `PTO`), each with its own weekday default, numeric total, and payload | `NewTripComponent` and `TripComponent` | `travel-pto-days` plus `allocationDraft` / `defaultAllocation` / `allocationText` in `pto-model.mjs`. `apps/travel/backend/services/pto.py` still stores and validates the allocation | both selects, the `minmax(130px)` day grid, and the duplicated weekday/total/payload code are deleted | PICK1 uses one control on both routes and asserts equal payloads. `rg` finds no `Half day`, `Not PTO`, or `ngValue]="0.5"` under `apps/travel/frontend` |

- Candidate class and protected counterexamples: duplicate live policy. The two selects were the same Full/Half/None decision written twice. Server overlap, legacy totals, and weekday storage stay in `pto.py`. Policy quarter-rounding (`blurHours` / `commitHour`), accrual fields, the PTO policy form, the chart, `leave.py`, and `leave_math.py` were not edited.
- Comparison base SHA and full replacement closure (including new files): `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Closure is `pto-days.component.ts`, `pto-model.mjs`, `pto-model.d.mts`, `new-trip.component.ts`, `trip.component.ts`, `trip.component.html`, `travel.css`, `pto-model.test.mjs`, `pto-picker.spec.js`, the picker locator updates in `dates.mjs`, `blockers.spec.js`, `map-recovery.spec.js`, `native.spec.js`, `trip-stories.spec.js`, `undo.spec.js`, and `weekend.spec.js`, and this evidence file.
- Production added/deleted/moved; comments/blank-only churn separately: tracked numstat plus the new component (78 lines). `new-trip.component.ts` +25/-34, `trip.component.ts` +28/-16, `trip.component.html` +6/-16, `pto-model.mjs` +69/-1, `pto-model.d.mts` +12, `travel.css` +59/-2, `pto-days.component.ts` +78. Production added 277, deleted 69. The helper's opening comment is part of `pto-model.mjs`, not a separate docs file.
- Independent equivalent implementations before/after: two select implementations before; one `travel-pto-days` control after. `defaultAllocation` is the single unsaved Monday–Friday default. It does not forecast balances or overlaps.
- State/cache owners and public entry points before/after: each form still holds its draft `charges` map and sends that draft on save and on retry. `allocationDraft` returns a fresh total and payload for the current dates only, so a day that left the range is not part of the next payload. There is no cached preview. Saved amounts remain the server rows from `pto.py`.
- Remaining old symbol/path search, including config and discovery: no trip-day `<select>` remains. `ptoChoice` now returns the radiogroup named with `formatDay`. Overlap copy on the trip page is unchanged and still covered by `trip-stories.spec.js`.
- Follow-up change: `pto-days.component.ts` and `allocationDraft` in `pto-model.mjs` for a new or existing trip day. `pto.py` remains the allocation policy owner.
- Tests/docs/generated changes separately: `pto-model.test.mjs` +48. Tracked e2e locator updates +31/-29. New `pto-picker.spec.js` is 194 lines. This evidence file is the only planning doc. No generated bundle is committed. `apps/karma.conf.js` used port 9996 only while Karma ran and matches HEAD again.
- Net production delta and specific reviewed safety/compatibility exception if positive: +208. The extra lines are the one control: local day names, Full/Half/None, an exact decimal radio when the stored amount is not those three, decimal-string totals, and a wrapping layout so 390px does not scroll sideways. Both trip forms use it. A failed save keeps the draft, and the retry sends the draft rather than a stale body.
- No behavior/data/meaningful assertion silently removed: weekday defaults, counts-as-PTO, legacy confirmation, unsaved-change protection, and the in-flight save race still hold. Existing picker specs now click Full, Half, and None instead of selecting `PTO`, `Half day`, and `Not PTO`. Overlap, undo, and legacy flows passed in the full Travel Playwright run.

## Verification

Commands ran from `/tmp/vivek-trip-05`. `PYTHON` was `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python` (symlink only; nothing was installed into it). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Karma used port 9996 inside `config.set` and that edit was reverted before commit. Local execution only.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Doc paths, planning validation (94 packets), blame revisions, shared boundaries, finance UX, 98 unittests, e2e discovery (travel lists 25 files), and 15 node script tests. |
| `make lint-web` | PASS. eslint baselines unchanged: finance 469, site 9, packages 1, world-engine 0. |
| `make typecheck-web` | PASS. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 714 SUCCESS. Statements 83.19% (5534/6652), branches 70.14% (2122/3025), functions 82.81% (1108/1338), lines 86.87% (4792/5516). |
| `node --test apps/travel/backend/static/tests/*.test.mjs` | PASS. 65 passed, 0 failed. |
| `make build-frontends` | PASS. Output `dist/web`. Release manifest written. |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS. 178 passed. Includes `pto-picker.spec.js` PICK1 (two journeys) and PICK2. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/354 with `Closes #229` and a non-closing reference to #84.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6811963189. The issue body is not edited.
- Merged/activation status (actual evidence, not assumption): not merged. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Parent #84 stays open. Policy quarter-rounding stays on the PTO policy form.
- Next actor: this agent, to watch CI and squash-merge #354.

No unstated decision from the previous context is necessary to continue.
