# PLACE-01 — design and baseline evidence

- Leaf: [#305](https://github.com/Vivekpsps3/vivek-monorepo/issues/305);
  parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Context: owner requested roadmap review and full Town/Pixels/World design setup,
  2026-11-14. Work is discovery/design, not app implementation.
- Branch/worktree: `agent/place-01-design`, `/tmp/vivek-place-01`.
- Base/current production-tested revision:
  `5bc07c2aab4345446f408d6e331cd1bef193f4d6`; documentation checks cover this
  revision plus the design-pack diff. No application source changes.
- Fresh checks: `git fetch origin main` and GitHub main SHA matched; #305 open
  with no claim comments; `gh pr list --state open` returned no PRs. PLACE-01 has
  no prerequisite leaves. CON-02 and TOWN-03 remained open. Live planner was read
  before selecting the owner-requested workstream. No shared checkout changes.
  Publication recheck found cleanup PR #359; its actual files do not overlap this
  diff. Main was still the recorded base, and #305 still had no competing claim.

## Acceptance

| Row | Proof | Result |
| --- | --- | --- |
| PLACE-01-ART | [Design index](../../living-world/design/README.md), 64 state/theme/size SVG compositions plus original catalog, [render inventory](../../living-world/design/render-results.json), [reasoned review](../../living-world/design/review.md) | Rendered static reference complete; owner visual approval remains pending |
| PLACE-01-STORY | [Annotated storyboard](../../living-world/design/storyboard.md): founding, pending/confirmed/failed/Undo, dated inspection, passage/return, anchor/save/conflict states, pointer and keyboard/focus equivalents | Design contract complete; real feature input journeys are not claimed |
| PLACE-01-BASE | [Measurement record and complete reproduction](../../living-world/design/baseline.md), [raw route results](../../living-world/design/baseline-results.json); existing production build and disposable rich-history fixture | Baseline captured; future-feature budgets remain required and unmeasured |

The source baseline includes active/archived history over more than three years,
leap day, overlapping/planned trips, concentrated completed Media and archived
concepts. It is load evidence, not a substitute for the F0–F5 feature journeys.
Static doubled typography is not execution of browser zoom/accessibility support.
Owner review and an independent participant walkthrough were not performed.

## Deletion and compatibility

| Candidate | Consumers / surviving owner | Disposition | Proof |
| --- | --- | --- | --- |
| Competing visual proposals | Existing Living World specification and new linked design pack | No competing committed proposal found; no deletion invented | Source specification remains the sole scope authority; README links to concrete studies |
| Production render, score, dates, storage and APIs | Existing Town/World/Pixels owners | Retained | No app/server/package/script/config changes; future replacements stay in their exact packets |

This adds documentation, editable vector studies and measurement inventories.
Production code added/deleted/moved: **0 / 0 / 0**. Domain policy implementations,
state/cache owners and public entry points are unchanged. No simplification or
LOC savings are claimed. No supported behavior, data or assertion is removed.
Study sprite groups are self-contained review art, not a second shipped catalog.

## Verification

| Command / execution | Result | Meaning |
| --- | --- | --- |
| `python3 planning/implementation/plan.py list --live` and `launch PLACE-01` | PASS | Live selection/packet expansion; not product readiness proof |
| `make build-frontends` on recorded base | PASS | Production bundle and release manifest built; existing unused-template-import warnings retained |
| Temporary synthetic launcher + `node /tmp/place01-measure.cjs EMITTED_ORIGIN` | PASS | Three real cold routes, API/resource sizes and World pointer trace; no uncaught page errors |
| `node /tmp/place01-render.cjs` | PASS | 65 static compositions rendered; final text-bound inventory has zero canvas overflow |
| Representative PNG visual inspection | PASS for agent reference review | Composition, corrected enlarged controls/headings, phone/date panels and catalog inspected; no human approval inferred |
| `make test-fast` in design worktree | PASS | Doc paths/budgets, planner validation/fixtures, boundaries/blame/UX guards, 98 Python script tests and 21 Node tests; e2e discovery explicitly lists without executing |
| `git diff --check` | PASS | No whitespace errors; repeated after final evidence edits |

Early measurement attempts with Playwright's installed clock produced empty
Resource Timing entries; those runs were discarded. Final capture overrides Date
only. Early SVG captures had document-type/screenshot errors, and enlarged-text
review exposed clipping; final rendering uses an HTML image on the same local
origin and the corrected art. These are tool/design corrections, not skipped or
weakened gates. No application Karma/Playwright suite is required by this docs-only
diff; measurement execution does not claim those suites passed.

Local artifacts: `/tmp/place01-artifacts` contains baseline route PNGs, all design
PNGs, raw measurement JSON and `world-pan-trace.json`. Portable editable SVGs and
measurement/render inventories are included in the design pack. No private data
or committed screenshot binaries.

## Handoff

- PR: [#360](https://github.com/Vivekpsps3/vivek-monorepo/pull/360), open for review;
  design commit `81c2765`. Initial CI is running; no CI pass is claimed here.
- Scoped status receipts: [leaf #305](https://github.com/Vivekpsps3/vivek-monorepo/issues/305#issuecomment-6874169259)
  and [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6874169620).
  Parent bodies and queue metadata were not rewritten.
- Merge/deploy/activation: not performed; no application changes are claimed.
- Current design: one proposed coastal reference, owner taste review pending.
- Next actor: use the [roadmap handoff](../../living-world/design/next.md), rerun
  the live queue, verify actual prerequisites and launch the selected packet.
  PLACE-02 is the next Living World fact-contract packet after PLACE-01; route
  and Town prerequisites remain required for PLACE-03/04.
