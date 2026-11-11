# Acceptance, verification and release

## Three equal release bars

| Bar | Required evidence | Failure example |
| --- | --- | --- |
| Beautiful | rendered compositions, theme/viewport matrix and reasoned visual review against PLACE-01 | new sprites inside unchanged generic cards; tiny unreadable town |
| Interactive | actual pointer/touch/keyboard journeys, feedback/error/Undo/focus evidence | canvas looks clickable but only pans; animation blocks Today |
| Informative | exact date/source/count/progression/coverage assertions and source actions | a brighter day implies a better life; habit weeks shown as budget weeks |

Each leaf owns these bars for its changed experience. PLACE-14 integrates evidence;
it must not become a dumping ground for known broken interactions. No checklist
is pre-marked passed. Planning validation proves structure, not the experience.

## Canonical fixture stories

- **F0 First visit:** unfounded Town, one first habit, empty Media/Travel, locked
  Finance. Found, check, inspect, revisit its date, Undo; no fabricated history.
- **F1 Ordinary life:** daily/weekly habits, rest day, skipped/pending entries,
  episode versus completed book, concept understood, planned and completed trips.
  Exact source-date meanings differ as documented; all are honestly explained.
- **F2 Rich history:** at least three years, leap day, overlapping trips, many
  finished items including truncation, archived habit/concept, several milestones.
  Inspect lazily and navigate without unbounded source fetches.
- **F3 Uncertainty:** one unavailable source, slow/expired response, no Finance
  plan, empty source, locked vault, unavailable Health, stale snapshot. Usable
  sources remain usable; uncertainty is never silently counted as zero activity.
- **F4 Safety:** two owners with unique synthetic markers; hold load/check/layout
  save/decrypt, then lock/switch/leave. Resolve old work; nothing repaints or leaks.
- **F5 Return:** long absence, maximum Town level, source reversal/deletion,
  cleared local preferences, unsupported layout version and cross-device conflict.
  Place stays welcoming; errors preserve supported data and offer useful recovery.

Fixtures extend the existing isolated worker/server/clock/reset owners. Use actual
API/UI workflows for the critical loops; mocks are appropriate for held responses,
not a substitute for live source integration. Record generated seed revision,
server/client clocks, viewport, theme, browser and tested commit.

## Interaction and accessibility matrix

At minimum render 390×844 and 1280×900 in both themes, plus 320px width and 200%
text zoom stress cases. Exercise touch, mouse and keyboard; reduced motion and
forced-colors/high contrast; sound off; storage failure; slow source and retry.
All actions have 44px targets, visible focus, sensible tab sequence and useful
names. Text/control contrast meets current repository requirements. Preserve one
main landmark, arrival focus and no later focus stealing. No hidden pointer-only
controls, unlabeled selectable cells or modal focus escapes. Table/list modes
perform the same inspect/source/visit tasks. Fix relevant axe findings, including
moderate semantic defects; existing severity gates are a floor, not a waiver.

Every journey tests refresh, deep link and browser Back/Forward. A selected day
survives cross-scale passage; a selected Life span remains its actual span. Check
DST, ISO/Sunday year boundary, birthday privacy/Feb29 and browser/server day mismatch.
A source reversal removes derived keepsakes without replaying celebration. Focus
returns to the invoking object/cell; if removed, choose a documented nearby target.

## Performance budgets

These are proposed feature acceptance budgets, to be established on a documented
reference device/profile by PLACE-01 and met or explicitly amended before feature
implementation. They do not lower any existing gate.

- Pending feedback appears within 100ms of local input; confirmed visual response
  starts within one rendered frame after the authoritative response is applied.
- Pointer pan/selection targets 60fps: p95 main-thread frame work ≤16.7ms on the
  recorded reference profile. Record drag traces and separate asset decode/network.
- Zero continuous animation work while hidden or idle; no new long task >50ms
  during steady panning on the bounded rich-history fixture.
- Core scene adds at most 150KiB compressed lazy-route JS and 300KiB transferred
  initial art beyond the measured existing route baseline. Optional variants and
  audio are lazy; measure actual production payloads rather than source sizes.
- No new per-tile/day/object requests. Selected detail fetches once per current
  selection/window; repeat subscribers reuse the current owner snapshot. Record
  baseline and final counts with held-response tests and 3-year fixture traces.
- Preserve TOWN-02's existing 600ms p50 passive-history gate and all current API
  limits/timeouts. Frontend budgets cannot hide slower or broader server queries.

If a budget cannot be met, record evidence and a concrete scope/budget amendment;
do not quietly remove assertions, add retries, or substitute a faster empty fixture.

## Exact verification ownership

Run `python3 planning/implementation/plan.py launch PLACE-xx` for the packet's
expanded commands, plus root/app gates required by the actual diff. All leaves run
`make test-fast`. Documentation-only PLACE-01 runs the docs profile; if its design
artifacts introduce executable demo code, the actual-diff frontend gates apply.

Web changes require `make lint-web`, `make typecheck-web`,
`npm run test:web -- --watch=false --browsers=ChromeHeadlessCI`,
`make build-frontends`, `npx playwright test --config apps/web/e2e/playwright.config.ts`
and the shell `npx playwright test --project=suite` from the current web profile.
Server changes add `make lint-python`, `make typecheck-python` and
`./scripts/coverage-gate.sh server`; migrations add `make db-check` and
`make db-validate-seeded`. Media/Travel/Finance/shared changes add their existing
profiles and actual affected journeys; do not assume the Town project covers them.
Engine changes require purity tests and golden vectors already selected by lint/
unit ownership. Discovery/list-only output never counts as execution.

Record exact passed/failed/not-run commands, counts, revision, fixture and visual
review in the existing per-leaf evidence template. Meaningful regression tests
should cover triggers and outcomes; do not mirror implementation or snapshot every
pixel. Keep useful original assertions when replacing render paths.

## Review gates and rollout

1. **Design gate (PLACE-01):** concrete compositions, interaction storyboard,
   information hierarchy, catalog and performance baseline are reviewable.
2. **First playable gate:** actual garden check-in, informative object inspection
   and dated passage work together. Record a short synthetic capture plus keyboard
   transcript. Review beauty before commissioning the remaining catalog.
3. **Personal-place gate:** revision-aware placement, milestone choice and return
   on another session work without a second ledger or private persistence.
4. **History gate:** media/travel/concept provenance, resident conditions and
   compact Hub arrivals agree on the same source facts and honest differences.
5. **Release gate (PLACE-14):** complete matrix, request/frame/bundle measurements,
   migration rehearsal and rollback procedure, with no unresolved must-pass row.

Prefer incremental replacement of owned routes, not a permanent old/new fork.
If a temporary rollout flag is needed, give it one owner, a short removal leaf or
explicit removal work in PLACE-14, and the same supported-data behavior in both
states. Keep read compatibility for layout versions during rollback; disable only
new cosmetic writes if needed, never delete user layouts or source records.
Application deployment/merge still follows existing user authorization workflow.
A planning merge or completed design does not prove production activation.

Optional qualitative walkthrough tasks: locate today's habit in five seconds,
explain why an object exists without help, return to a selected day, arrange one
ornament without dragging, and understand an unavailable source. Record actual
participants/findings when available; do not invent usability scores or treat an
agent screenshot review as independent human validation.
