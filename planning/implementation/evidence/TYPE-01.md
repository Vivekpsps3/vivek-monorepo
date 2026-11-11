# TYPE-01 — implementation evidence

- Leaf issue and parent(s): #218; parents #200 and #199
- Agent/context, branch/worktree: Cursor Grok implementer, branch `agent/type-01`, worktree `/tmp/vivek-type-01`
- Base main SHA, current tested SHA: base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Implementation commit `d80394e47ada0048ac11ccabf6c1a192b01814cb`. Local gates ran on that tree. This follow-up only records the PR and roadmap URLs.
- Fresh-main/prerequisite/active-PR checks: #218 was open with no other claim. No open PRs on `main`. Closed on `origin/main`: SAFE-05 #205, MED-08 #242, MED-02 #236, UX-05 #263, TRIP-01 #225, PTO-03 #232, SEC-02 #267, OPS-02 #273. SAFE-05 deadline behavior in `hub-load.ts` and `pixels-data.service.ts` was left in place.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | A string trip id or string pixel count fails that source. Hub still renders Media and Town. Pixels does not publish a zero day for `town: "1"`. | PASS | `hub-decode.spec.ts` ("rejects a travel summary…", "rejects a media summary…"); `hub.component.spec.ts` ("keeps the other cards when the travel summary has the wrong shape"); `pixels-model.spec.ts` ("rejects a string count…"); `pixels-data.service.spec.ts` ("rejects a string activity count…") |
| LOCAL2 | Null trip, null destination, `days_until: 0`, unknown media precision/when, null rating, null town XP ceiling, null founded date, null pixel counts, absent/unavailable sources, null birthday, and locked finance stay distinct. Dates stay `YYYY-MM-DD` strings. Home money is not copied. | PASS | `hub-decode.spec.ts` null/unknown matrix; `hub.component.spec.ts` ("shows a null trip date count…"); `pixels-model.spec.ts` ("keeps null counts…"); `pixels-data.service.spec.ts` ("keeps a null activity count…", "attaches trip dates and ignores home money") |
| LOCAL3 | Hub summaries and Pixels reads go through owned decoders. `http.get<T>`, the home-trip field filter, and `next_trip ?? null` are gone. `npm run test:web` typecheck and `make lint-web` passed. ESLint baseline was not lowered: no migrated file had a baseline entry. | PASS | `make typecheck-web`; `make lint-web` (`eslint-finance: 469 findings match the baseline`); search of `apps/web/src/app/hub` and `apps/web/src/app/pixels` |
| LOCAL4 | A Hub body that finishes decoding after abort is `cancelled`. A decoded pixels body whose owner changes before publication is `dropped`. The previous-user Hub card test still hides the late trip. | PASS | `hub-load.spec.ts` ("drops a body that decodes after the caller aborts"); `pixels-data.service.spec.ts` ("drops a decoded pixels body when the owner changes before publication"); `hub.component.spec.ts` ("ignores a late summary from the previous user") |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `response.json() as T` for Hub travel, media, and town summaries | `HubComponent.loadTravel`, `loadMedia`, `loadTown` | `decodeTravelSummary`, `decodeMediaSummary`, `decodeTownSummary` | Removed from those callers. `fetchHubSummary` still returns `payload as T` only when no decoder is passed. | Hub specs above. The no-decoder path remains because `search-dialog.component.ts` calls `fetchHubSummary` and this leaf must not edit `apps/web/src/app/search/`. |
| `http.get<PixelApiBody>` and `http.get` of the home trip envelope | `PixelsDataService.fetchPixels`, `fetchTrips` | `decodePixelApiBody`, `decodeHomeTrips` | Generic JSON cast removed. `getJson` now requires a decoder. | Pixels service and model specs |
| Home trip `filter` on id/title/start/end plus `slice(0, 10)` | `fetchTrips` | `decodeHomeTrips` | Filter and date slice removed. A bad row fails the trip list instead of being skipped or cut down to ten characters. | `pixels-model.spec.ts` datetime and string-id cases; service spec "invents no trip" |
| `next_trip ?? null` and `readProfile` `??` / `=== true` | Hub travel card, pixels profile projection | Decoded `next_trip` and profile object | Missing `next_trip` is unavailable, not an empty trip. Null birthday and boolean `show_age` are copied through. | Decoder and service specs |
| Duplicate `TravelTrip`, `MediaItem`, and `MediaSummary` interfaces in `hub.component.ts` | Hub template and card state | `hub-decode.ts` | Moved with the decoders. Not counted as deletion. | Component still renders the same cards |

- Candidate class and protected counterexamples: duplicate live policy for shape checks (the trip filter and the unchecked casts). Protected and unchanged: Finance vault totals, Travel multi-currency amounts, pixel score `countOrZero`, SAFE-05 deadlines (`HUB_SUMMARY_DEADLINE_MS`, `PIXELS_ACTION_DEADLINE_MS`), search.
- Comparison base SHA and full replacement closure (including new files): `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`. Closure is `hub-load.ts`, `hub.component.ts`, `hub-decode.ts`, `pixels-data.service.ts`, `pixels-model.ts`, and their specs.
- Production added/deleted/moved; comments/blank-only churn separately: production added 516, deleted 64, net +452. `hub.component.ts` 12/37 and `pixels-data.service.ts` 16/21. New `hub-decode.ts` is 314 lines. `pixels-model.ts` 151/4. `hub-load.ts` 23/2. Almost all of the increase is decoder and field-reader safety code, not a second loader.
- Independent equivalent implementations before/after: before, one unchecked cast in `fetchHubSummary`, one unchecked `http.get<T>`, and one ad hoc trip filter. After, five wire decoders (travel summary, media summary, town summary, pixels body, home trips) and one transport helper. Search still has the unchecked helper path.
- State/cache owners and public entry points before/after: Hub card generation and Pixels `generation` / lifecycle abort are unchanged. `fetchHubSummary` and `PixelsDataService.load` remain the entry points. Deadlines are unchanged.
- Remaining old symbol/path search, including config and discovery: `payload as T` remains in `hub-load.ts` for the no-decoder call. `rg` found no `http.get<T>`, `next_trip ??`, or `start_date.slice(0, 10)` under Hub or Pixels.
- Follow-up change: which production files and independent policy owners now need editing: `apps/web/src/app/search/search-dialog.component.ts` still needs its own search-response decoder. Do not fold that into a universal client.
- Tests/docs/generated changes separately: tests added 339, deleted 6, net +333, including new `hub-decode.spec.ts` (109). This evidence file is the only documentation change. No generated client.
- Net production delta and specific reviewed safety/compatibility exception if positive: net production +452. Exception: runtime decoders are the safety code TD-12 requires so malformed payloads become unavailable instead of unchecked objects. Superseded casts and the trip filter were removed in the same change. The ESLint baseline was not edited.
- No behavior/data/meaningful assertion silently removed: null versus missing, unknown release text, locked finance, absent/unavailable sources, and calendar date strings are covered by new assertions. `countOrZero` still scores a null activity count as no activity after the decoder has kept the null. SAFE-05 cancellation and deadline tests still pass.

## Verification

Recorded on the implementation tree before commit, base `a7e16c6fa5bd5543514081e0834022fe38dcd1d1`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0, all matching baseline |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 694 tests. Coverage statements 83.21%, branches 69.97%, functions 83.21%, lines 86.87% |
| `make build-frontends` | PASS |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 78 tests. An earlier run timed out in unrelated `town-checkin.spec.ts` "visibility after the local date changes"; that test passed in 572ms on the immediate full rerun with no code change. |
| `npx playwright test --project=suite` | PASS. 24 tests |

Karma used port 9911 only in the worktree `apps/karma.conf.js` during the runs. That line was reverted and is not in the diff. `media.models.ts` and `travel.models.ts` were not changed.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/338 (`Closes #218` only). Parents #200 and #199 stay open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6804581804
- Merged/activation status (actual evidence, not assumption): PR #338 is open. Not merged yet.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Search responses remain an unchecked `fetchHubSummary` caller on purpose.
- Next actor: review and CI, then squash-merge of `agent/type-01` if the four required checks are green.
