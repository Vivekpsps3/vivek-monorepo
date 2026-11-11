# PLACE-06 — Make World objects inspectable and unrecorded landscapes welcoming

- Stable key: `PLACE-06`
- GitHub leaf: [#310](https://github.com/Vivekpsps3/vivek-monorepo/issues/310)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-02`, `PLACE-03`, `PLACE-05`, `UX-04`
- Conflict groups: `world-ui`, `world-render`, `world-camera`
- Verification profiles: `web_front`, `server_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Make World objects inspectable and unrecorded landscapes welcoming.

## Requirements

Object-specific inspection, recorded-activity overlay meaning and complete first playable gate; deterministic generation unchanged.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/web/src/app/world/render/renderer.ts`
- `apps/web/src/app/world/ui/world.component.ts`
- `apps/web/src/app/world/logic/fog.ts`
- `apps/web/src/app/world/logic/reading.ts`

## Target paths

- `apps/web/src/app/world/render/renderer.ts`
- `apps/web/src/app/world/ui/world.component.ts`
- `apps/web/src/app/world/logic/fog.ts`
- `apps/web/src/app/world/logic/reading.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Hit-test painted objects with the existing camera transform; define overlap chooser and pan/tap threshold using pointer capture/cancel.
3. Open informative source/date/reason panels and supported exact source actions; retain concept sheet and expose DOM object/list equivalents.
4. Present unrecorded past as quiet visible terrain, future as horizon and unavailable facts as uncertainty. Preserve lit calculation as optional recorded-activity overlay.
5. Complete first playable review across all three scales and remove center-only activation branches where replaced, preserving week navigation.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-06-OBJECT | overlapping objects at resized/panned camera positions | tap versus drag, cancel or keyboard-inspect | correct object opens; drag never activates; source/date and focus agree | transform vectors and actual pointer/keyboard tests |
| PLACE-06-QUIET | unrecorded/future/unavailable/recorded days | toggle activity overlay and inspect | honest distinct states; no implication of failure/rest and no hidden source objects | state fixtures and visual review |
| PLACE-06-ENGINE | existing golden fixtures and old week URLs | render new interaction/presentation | identical generation vectors and preserved keyboard/date/list journeys | purity/golden suite and first playable capture |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove migrated center-only activation and duplicate inspector state; retain full dated list and existing camera/generation owners. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

OBJECT: overlapping objects at resized/panned camera positions; QUIET: unrecorded/future/unavailable/recorded days; ENGINE: existing golden fixtures and old week URLs. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-06.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
