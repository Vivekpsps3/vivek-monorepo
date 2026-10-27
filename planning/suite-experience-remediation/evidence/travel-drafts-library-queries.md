# Two completed follow-up tasks — 2026-10-27

The owner resumed work for two tasks. These are completed scoped follow-ups
under NAV-01 / the Travel browser audit and ARC-05. They do not close those
entire parent work packages or the final release gates. One agent implemented
and ran the checks; no independent agent review is claimed.

## Travel PTO/settings draft handling — done

PTO policy, other-leave and FlightAware-key drafts now warn before route exit
or document unload. Keep editing retains fields and restores focus to the
navigation control; deliberate exit discards the local draft. A cleared or
different session bypasses the guard, so expired private forms disappear.
No API-key draft is put into localStorage or sessionStorage.

PTO refresh, retry, leave creation and leave removal preserve an independently
edited policy. Saving a policy preserves an independent leave draft. Successful
leave creation clears the submitted form when it has not changed. Requests
capture submitted values; a late successful policy/key response preserves newer
typing and says it still needs saving. Key removal preserves a replacement key
draft. Duplicate mutations are blocked while pending; leaving a pending save
explicitly explains that it may still finish.

Changed files:

- [PTO component](../../../apps/travel/frontend/src/pto.component.ts)
- [Settings component](../../../apps/travel/frontend/src/settings.component.ts)
- [Travel routes](../../../apps/travel/frontend/src/public-api.ts)
- [Draft browser regressions](../../../apps/travel/e2e/drafts.spec.js)
- [PTO reload regression](../../../apps/travel/e2e/blockers.spec.js)

The browser checks exercise both 390px and 1280px. They cover clean versus dirty
unload, cancellation and focus, deliberate discard, independent drafts,
failed save/read retry, late save responses, private-key storage, removal and
real session revocation. Existing native/date/PTO/map/axe/screenshot cases stay
enabled. An older reload case now explicitly accepts the new native unload
warning because it retains unsaved leave dates.

This closes the policy/settings portion of browser-audit item 4. Optional trip
editors, flight/map adverse cases and the complete old-to-new story audit remain
separate work.

## Media library page query work — done

The paginated library now batches TV episode flags, lifecycle rows and personal
artist-child counts for the current page. It does not hydrate complete episode,
season or music detail state to draw a card. Artist counts deduplicate public
relation types and songs linked through multiple releases, count saved songs
even when their album is unsaved, and exclude another user's membership.
TV flags and lifecycle output are checked against detail truth for missing,
unknown, future, special, watched and unwatched episodes.

The response no longer computes or includes the unused `continue` member. The
native library consumes items/counts/pagination; continuation remains on
`/media/api/summary` for the Now screen. A backend contract test verifies that
next episodes still appear there. The old static renderer is not served by the
root factory; its source remains subject to the separate deletion/story audit.

Removed the superseded per-card `library_card` and `saved_child_count` query
paths. Detail/music expansion retains its meaningful independent behavior.
Lifecycle serialization is shared by detail and batched cards.

Changed files:

- [Records](../../../apps/media/backend/services/records.py)
- [Lifecycle metadata](../../../apps/media/backend/services/metadata.py)
- [Library endpoint](../../../apps/media/backend/routers/journal.py)
- [Query/ownership regressions](../../../apps/media/backend/tests/test_library_queries.py)
- [Pagination regression](../../../apps/media/backend/tests/test_library_sort.py)
- [Continuation contract](../../../apps/media/backend/tests/test_bundle_m.py)

Measured with a disposable mixed library, including off-page items and a second
user's saves/progress:

| Request | SQL SELECTs before → after | Response bytes before → after |
| --- | --- | --- |
| First 24 mixed artist/series cards | 319 → 5 | 10,455 → 9,756 |
| First 24 books, with music/TV off page | 197 → 2 | 7,864 → 7,165 |
| Empty book page at offset 120 | — → 2 | — → 65 |

The regression failed with the recorded before counts, then passed after the
implementation. [Structured measurements](library-page-queries.json) retain
the fixture, command and raw sample timings. Timings are single diagnostic
samples under concurrent local checks, not a benchmark or performance promise.
This closes this library hot path only. Summary/calendar/other hot paths,
non-ASCII SQL sort parity and full release performance evidence remain open.

## Verification

All floors and lint/type allowances remain unchanged.

| Check | Result | Log |
| --- | --- | --- |
| Root production build | Passed; 5 public routes prerendered | /tmp/suite-two-tasks-build.log |
| Travel Playwright, all suites and screenshots | 38 passed, no skips | /tmp/suite-two-tasks-travel-browser.log |
| Media Playwright, all suites and screenshots | 41 passed, no skips | /tmp/suite-two-tasks-media-browser.log |
| Media coverage | 136 passed; 79.39%, floor 70.6% | /tmp/suite-two-tasks-media-coverage.log |
| Travel coverage | 66 passed; 85.07%, floor 80.41% | /tmp/suite-two-tasks-travel-coverage.log |
| Root/shared Karma | 88 passed, unchanged floors | /tmp/suite-two-tasks-web-karma.log |
| Travel/Media/auth-UX Node suites | 115 passed, no skips | /tmp/suite-two-tasks-node.log |
| Python/web lint and configured TypeScript checks | Passed | /tmp/suite-two-tasks-quality.log |
| Python lint/mypy after final contract-test update | Passed; Ruff 101, mypy 87, suppressions 0 | /tmp/suite-two-tasks-python-final.log |
| Fast docs/boundaries/script checks | Passed; 32 Python and 7 Node tests | /tmp/suite-two-tasks-fast.log |

Browser screenshot matrices use distinct `/tmp/suite-two-tasks/travel-screenshots`
and `/tmp/suite-two-tasks/media-screenshots` directories so either runner cannot
clear the other domain's artifacts. Draft-confirmation captures are in Travel's
per-test output directory. Final release screenshot review remains open.

Inspected phone confirmation captures are retained here:
[PTO draft](screenshots/travel-pto-draft-390.png) and
[key draft](screenshots/travel-key-draft-390.png). Copy and actions fit the phone
viewport; Keep editing remains the first focused action.

No commit, push, pull request or deployment was made. Broader final Finance,
server, image, migration, deletion and acceptance checks remain required before
the single PR.
