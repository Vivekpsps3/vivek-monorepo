# HOME-04 — implementation evidence

- Leaf [#467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467). Parent scopes [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312), and [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313).
- Sole issue worker on `agent/home-04` in `/tmp/vivek-home-04`. Base `e15091b2adcc0a7e3efc747c2ff23489a1fc6174`. Tested product `f0504a3441e14f0d807406e3522595507c1a824a`. Browser verification includes the Home keyboard fixture at `865ef3af7640e35b4c469482c18b6b4ba936b8c4` and weekly-review fixture at `38709fd60fdff3dad94de6a3670e49c53acc34c2`. Both follow-up commits change browser tests only.
- Current main contained the four furnished rooms [#596](https://github.com/Vivekpsps3/vivek-monorepo/pull/596) and revisioned room persistence [#622](https://github.com/Vivekpsps3/vivek-monorepo/pull/622). There was no competing claim or open PR. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/467#issuecomment-7142008950).

## Acceptance

| Row | Observed outcome and proof | Result |
| --- | --- | --- |
| HOME-04-A1 | The study rejects an occupied footprint and discards it on Cancel placement. Keyboard row changes and a phone tap select valid and invalid cells. A 90° Rose low table previews, survives a synthetic 503 with the same request on retry, saves at revision 1, and reloads from the real layout API with row, column, palette, identity, and angle intact. The saved body omits the desk note. | PASS |
| HOME-04-A2 | Doorway cells reject a tap or selected position. The Study desk still opens its practical note action across edit, Save, and reload. Wall slot exclusivity, rotated bounds, stack surface validity, and carrying a lamp on its moving desk are covered in the Home Karma geometry tests and existing layout API suite. | PASS |
| HOME-04-LIFE | A failed write keeps the current draft and note. A conflict keeps the draft and requires explicit discard and reload before another write. Karma ignores a late response from an old owner. The browser delivers a held save after a validated cross-tab lock and verifies the draft, note, and late revision are absent. | PASS |
| HOME-04-VIEW | The real editor ran at 390×844 touch and 1280×800 keyboard in light and night, with reduced motion, focus return, 44px editor controls, no horizontal scroll, and no serious or critical axe results. The four `preview-*` attachments in the Town Playwright report show the rotated furniture and open doorway. The test also verifies the occupied-cell status and disabled Place action. | PASS |
| PLACE-09-CHOICE | Server tests exercise the reachable steps immediately before, at, and after the Building 2, Town 3, and Town 5 thresholds, plus the maximum Town level. Existing engine vectors pin each exact XP boundary. One stable choice per milestone, all nine authored options, and server rejection of a duplicate or unearned placement use the same revisioned layout API. Ordinary paid assets still use the Stamp wallet entitlement. The browser saved one active-building choice from the Courtyard. | PASS |
| PLACE-09-REVERSE | Browser reverses the qualifying check-in through the real authenticated Town API. The ornament changes to an empty anchor while its exact layout choice remains in the saved room. Restoring the check-in restores the ornament without another layout write. Server tests allow the same dormant choice to survive an unrelated edit and reject a new unavailable choice. | PASS |

Phone and desktop reference captures use synthetic records. The editor stays alongside the preview on desktop and stacks it above controls on mobile. The art and controls were inspected on those captures. Independent owner art review remains pending. The Home lazy chunk is 50,909 bytes raw and 15,078 gzip bytes. The original ornament sheet is 2,761 bytes and requested only for a visible ornament. The editor loads the wallet once when opened, independent of item count, and adds no continuous animation.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition |
| --- | --- | --- | --- |
| `homeLayoutWrite` fixed-starter and all-items palette serialization, `saveOlder`, and their prototype controls | Home editor and its Karma/Playwright assertions | Editable room draft over the existing Home layout endpoint | Deleted. Fixtures exercise actual per-item writes and external revision conflicts. |
| `homeLayoutProblems` starter-only validation and a fixed-geometry Home scene | Home and starter layout tests | Live Home footprint validation and the scene projection of persisted items | Deleted the duplicate starter validation. Test cases exercise the shared room model. The initial furnishings remain the revision-0 default. |
| Legacy layouts and active Stamp entitlements | Room read and write API | Existing room persistence and Stamp wallet | Retained. The browser includes unrecognized parsed items unchanged in its draft. Canonical earned ornament IDs use Town eligibility. Historical catalog/instance pairs still follow the existing non-milestone entitlement contract. |

- This is a feature replacement on `e15091b2`. Production added 935 and removed 316 physical lines, including 60 lines reindented in each direction. Tests added 343 and removed 92 lines. Guidance and feature docs added two and removed two lines before this evidence file. No generated bundle or screenshots committed.
- One layout owner before and after. `/town/home/:room` reads and writes `/api/town/layouts/{room}`. The editor keeps one local draft and one candidate separate from the confirmed revision. The server still checks owner, room budget, geometry, and active entitlements. A failed revision is never used as the base for an automatic retry.
- The existing layout schema, migration, progression thresholds, game-only Stamp ledger, and practical room actions remain. No milestone claim route or second reward ledger was added.
- HOME-05 owns accepting or reapplying a conflicted draft, versioned Undo, confirmed Reset, and malformed record recovery.

## Verification

- `PATH="$PWD/.venv/bin:$PATH" make test-fast` — PASS, including planning validation, 135 Python unit tests, and 21 Node tests. The shell uses repository Python dependencies via PATH.
- `make lint-web`, `make typecheck-web`, `make lint-python`, and `make typecheck-python` — PASS, existing lint and type baselines match.
- `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` with local Chromium 156 in `CHROME_BIN` — PASS, 719 tests, 78.03% statement coverage.
- `./scripts/coverage-gate.sh server` — PASS, 483 tests, one existing skip, 81.75% coverage. The separately gated Town p50 was 130.65ms.
- `make build-frontends` — PASS, production output and release manifest. The existing 650 kB initial bundle advisory is still emitted at 728.95 kB.
- `npx playwright test --config apps/web/e2e/playwright.config.ts` — PASS, 230 tests including all 13 Home journeys on `38709fd6`.
- `npx playwright test --project=suite` — PASS, 61 tests on `865ef3af`.

The first full Town run had 229 passes and one failure in the existing weekly-review browser test. Its keyboard helper attempted to focus Later before the app cleared the busy state from the prior encrypted Save. The helper now waits for the real enabled control before sending Enter. All original behaviors and assertions remain in the suite.

## Handoff

- PR creation follows the local checks above. The public PR description closes only #467.
- Follow-up Home work is tracked in [HOME-05 #468](https://github.com/Vivekpsps3/vivek-monorepo/issues/468). Owner visual review is separate from implementation verification.
