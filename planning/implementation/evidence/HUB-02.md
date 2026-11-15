# HUB-02 — implementation evidence

- Leaf: [#244](https://github.com/Vivekpsps3/vivek-monorepo/issues/244). Parent [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) remains open.
- Codex context: branch `agent/hub-02`, isolated worktree `/tmp/vivek-hub-02`.
- Base main: `d9629ddde1fe0fe39b4b74f7427a2ab964937346`. Implementation/tested tree: `a5977037974dacfd7159d5e32fd248f176a92b6f`; this evidence is a subsequent documentation commit.
- Fresh main, live leaf/comments, parent #93, exact local packet and open PRs were read before implementation. No open/overlapping PRs or competing claims. SAFE-04's validated lock subscription, SAFE-05's bounded lifecycle contracts, and UX-03's roving compact Pixels strip are present on this main. Main was fetched again before verification and remains at the same base.
- [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/244#issuecomment-6889045536). No merge or deployment authorization is inferred.

## Acceptance

| Row | Executed behavior proof | Result |
| --- | --- | --- |
| NEXT1 | `test_up_next.py`: Dec 25–Jan 7 inclusive; next-day exclusion; overdue reminders only for unfinished trips; done/undated exclusions; midnight untimed; stored flight wall time and timezone; one-day trip; 50-row bound; four SELECTs for 60 trips; cross-owner read and write refusal. The UTC-midnight test changes both today and the end of the window between UTC and Los Angeles. Existing `test_summary.py` preserves next-trip defaults and fields. | PASS |
| NEXT1 | `up-next.spec.ts`: month/year/leap rollover, exact dated saved Media events, watched/postponed/follow-up exclusions, overdue/untimed/timed/source ordering, unchanged wall time. `hub-up-next.spec.ts`: one Travel summary, one Media summary, one GET per needed saved month; keyboard source filters make no additional reads; retrying Media leaves Travel at one request. | PASS |
| NEXT1 | Finance facade's local week fixture spans Dec 28–Jan 3, includes both endpoints, sums bills and subscriptions without deduplication, excludes inactive/invalid/undated/outside dates, and returns only `billsDueThisWeek` in addition to the preexisting snapshot. Locked, cancelled, unavailable and expired results have no count. Up next receives only the integer, never bill names/amounts/IDs. | PASS |
| NEXT2 | `up-next.component.spec.ts`: one full ReminderIn PATCH despite double activation; optimistic Done, failure rollback, successful Undo, failed Undo rollback, eight-second timeout, cancellation on owner/reload/disposal, old Undo invalidation after reload, stale source behavior and source expiration. `hub-up-next.spec.ts` exercises keyboard Done, failed save, retry and Undo with exact serialized bodies including due time/kind/notes. API tests prove those full replacements preserve the same fields and the done stamp contract. | PASS |
| NEXT2 | `hub-load.spec.ts`: summary/month reads start together, second-month 401/503 settles the whole Media source honestly, both held months lose the same source deadline, and a caller abort drops all late responses. Existing Hub owner-switch/lock tests preserve generation guards, stale snapshots and independent usable cards. Episode Done/Undo now invalidates an earlier Media read and refreshes the same summary/calendar snapshot; unit and browser regressions prove watched dates leave Up next without refetching Travel. | PASS |
| HSTATE1 | Four viewport/theme browser cases (390/1280, light/dark), each with populated and empty workspaces: Up next leads below the greeting; source filters, next links and reminder controls remain keyboard usable; all tested actions have 44px targets; no horizontal overflow; axe has no violations. Source recovery remains visible with filtered rows. Existing Town TF5, Pixels, lock, stale and expiration journeys execute in the same full web suite. | PASS |
| HSTATE1 | Greeting boundaries at 04:00/05:00/11:00/12:00/16:00/17:00; trimmed names and no dangling comma. Six-row cap, Today/This week/Later groups, owning-app links for hidden rows, count-only Finance, one planning action for a fully empty window, and no false empty claim during an outage are unit tested. Existing Town XP meaning and one enabled Town/Pixels card remain unchanged. | PASS |

Fixtures are synthetic. Ordinary Media calendar GET remains database-only; no provider client or refresh endpoint was added. Existing Media calendar/provider prohibition tests ran in the Media coverage gate. The new browser request observer also rejects provider/refresh calls.

Visual evidence stays outside committed source. The web Playwright report contains eight populated/empty full-page screenshots. Additional before/after captures are `/tmp/hub-visuals/{before,after}-{390,1280}-{light,dark}.png`, with matching metrics JSON. Before was rebuilt from unchanged main; after uses the implementation tree and the same synthetic trip/media/town fixtures. The locked Finance card shrank from 234 to 178px on phone and 244 to 184px on desktop in both themes. The existing 91-cell, 13-week strip and its 22px cell cap remain intact.

## Deletion and compatibility

| Candidate | Previous consumer | Surviving owner / disposition | Proof |
| --- | --- | --- | --- |
| Card-only Travel `trip` state and `result.body.next_trip` reducer | Hub's `loadTravel` and Next trip card | Deleted the partial reducer/store. One decoded `TravelSummary` serves both views; `trip` is now a derived getter. | Source request-count browser test; old owner/stale/unit journeys |
| Travel Hub summary's call into `build_home`, with full trip/PTO/budget/note assembly | `/travel/api/summary` | Removed that heavy path. The summary now owns one owner-scoped Trip query plus selectinloaded stays/transports/reminders, preserving next-trip fields and adding bounded upcoming rows. `build_home` remains the live Travel Home owner. | Next-trip parity tests; four SELECTs for 60 trips; Travel coverage |
| Separate future agenda fetch/state, old oversized release presentation | Hub card loading and release preview | No agenda loader existed on the base, so none is claimed deleted. The new presentation receives the existing source snapshot/state; it makes no source GETs. The always-expanded Coming up block is replaced by a closed More releases disclosure, retaining imprecise releases. | One-set-of-reads test; existing release-label specs and unknown-date card test |
| Full-width Finance/Town card rules and large empty/locked Hub presentations | Hub template/CSS | Deleted full-width rules for Finance/Town, removed their obsolete empty-state configuration, and replaced the oversized Hub presentation with compact copy and existing controls. Pixels stays full-width. No disabled Town seam or duplicate Town card exists on this base; the real cards are preserved. | Populated/empty captures and axe at all four sizes/themes; existing Town/Pixels browser journeys |

- Classification: **feature**, with a bounded read-path deletion. This is not a negative-LOC simplification.
- Whole implementation closure against the base: production **+626 / −90 = +536 physical lines**, tests **+710 / −54 = +656**, guidance +5, test-discovery wiring +1/−1. No moved files or generated output. Production includes +26/−1 blank lines and +6/−1 comment-prefix lines (lexical count, not an AST metric); no formatting-only removal is claimed as a saving.
- Before/after: one Travel card reducer becomes one complete Travel source reducer, shared by two real consumers. One Media summary loader becomes one source load joining the same summary and one/two saved calendar months. Existing Finance load is reused for both card and bill count. No second source cache, event warehouse, generic registry, background poller, or event bus.
- The new component owns only filters and bounded mutation/Undo lifecycle. The full replacement body remains the Travel API's responsibility. Existing Hub generation/abort guards and Finance lock clearing remain publication owners. New necessary code is the dated projection/decoder, compact list, source-month join, count projection, and mutation guards.
- Follow-up date-rule changes stay in Travel's summary, Finance's browser facade, and the existing Media calendar. Hub projection/decoder/template are the corresponding narrow consumers. Existing PTO/currency math, Finance encryption/revisions/AAD, Town XP, Pixels scoring and routes are retained.

## Verification

Local environment: Node v24.11.1 (`/tmp/node24/bin`), repository `.venv` Python 3.12, Chrome 156 from `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `PATH` includes the venv for `make test-fast`; `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` point to that Chrome. Coverage and retry gates were not changed.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS: 110 Python script tests, 21 Node tests, doc/blame/boundary/UX/discovery checks |
| `make lint-python` | PASS: Ruff format, Ruff and suppression ratchets |
| `make typecheck-python` | PASS: mypy ratchet |
| `make lint-web` | PASS: all four existing ESLint ratchets and engine-purity test |
| `make typecheck-web` | PASS: all seven TypeScript projects |
| `COVERAGE_FILE=/tmp/hub-travel.coverage ./scripts/coverage-gate.sh travel` | PASS: 225 tests; 89.44% statement coverage, floor 80.41% |
| `COVERAGE_FILE=/tmp/hub-media.coverage ./scripts/coverage-gate.sh media` | PASS: 208 tests; 84.37% statement coverage, floor 70.60% |
| `node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 122 tests, zero skips |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 872 tests, coverage enabled |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 756 tests. Statements 82.45%, branches 69.79%, functions 82.89%, lines 86.39% |
| `make build-frontends` | PASS: production build and deterministic release metadata |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 95 tests, zero retries; populated/empty matrix and axe included |
| `npx playwright test --project=suite` | PASS: 30 tests, zero retries |
| `make e2e` | PASS: rebuilt production bundle; 264 passed, 8 existing conditional skips, zero retries |

Earlier failures were repaired before PR creation: two old Travel fixtures lacked the additive field; new subscription/enum fixtures required their actual types; light selected ghost filters failed contrast (now existing secondary controls); desktop grid stretching prevented the compact-card height assertion (now natural-height cards). Initial fast checks used system Python without Alembic; the required check passed with the repository venv. Initial simultaneous Python coverage runs shared a data file and were discarded; the isolated per-domain reports above are authoritative. The final full web run also exposed an existing Town visibility test race: Chromium returned a response but could no longer retrieve its body, and the async predicate swallowed that protocol failure. The test now captures the real server response through route.fetch before fulfillment (including timezone slashes); date/timezone and both unchecked-habit assertions remain. The focused five-test file passed before the full rerun. No failed assertion, coverage floor or discovery gate was weakened.

Logs are `/tmp/hub-{quality-final,travel-coverage,media-coverage,node,finance-karma,web-karma,build,web-e2e,suite-e2e,finance-e2e}.log`. The final web static/unit/build/browser gates cover the final tree. Python, Finance unit and Node owners are unchanged since their passing implementation gate runs. Local proof is separate from CI, merge and deployment.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/369, closes only #244 and references #93.
- Roadmap #134 scoped append-only note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6889340162.
- Actual status: implemented and all required local gates passed; not merged/deployed/activated.
- External prerequisites/decisions: none for this feature. Expanded agenda/Quick add/calendar subscriptions retain their own leaves.
- Next actor: CI and reviewer. Local implementation is complete; CI was running when the PR opened. Merge/deploy requires owner authorization.
