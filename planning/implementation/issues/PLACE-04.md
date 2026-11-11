# PLACE-04 — Replace the Town tile scene with a composed interactive coastal garden

- Stable key: `PLACE-04`
- GitHub leaf: [#308](https://github.com/Vivekpsps3/vivek-monorepo/issues/308)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-01`, `TOWN-03`, `TOWN-04`, `TOWN-05`
- Conflict groups: `town-main`, `town-lots`, `world-ui`, `town-hall`
- Verification profiles: `web_front`, `server_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Replace the Town tile scene with a composed interactive coastal garden.

## Requirements

Beautiful first garden, informative buildings and a single public Town scene projection where both renderers actually need it.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/world/render/renderer.ts`
- `apps/web/src/app/world/town-layout.ts`

## Target paths

- `apps/web/src/app/town/town.component.html`
- `apps/web/src/app/town/town-lot.component.ts`
- `apps/web/src/app/world/render/renderer.ts`
- `apps/web/src/app/world/town-layout.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Build bounded positioned DOM/local SVG garden/civic composition from PLACE-01 studies, with real lot controls and a quick Tend today action.
3. Expose only approved placement/stage facts through Town public API; migrate World consumer in this PR where stage decisions are shared.
4. Render library/inn from their own building progression, Treasury from Finance facade and Health from stages; retain distinct loading/empty/locked/unavailable states.
5. Connect Hall appearance preview and existing edit/history controls; preserve list alternative and remove old tile render path once all actions migrate.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-04-SCENE | F0/F2 across theme/viewport/zoom matrix | arrive/select/tend | reviewed scene and legible task hierarchy; no clipping or blocked practical action | art rubric and responsive browser artifacts |
| PLACE-04-BUILD | different Town/library/inn levels and Finance lock | inspect in Town and World | same truthful approved stages; no private or habit-derived Treasury facts | stage projection vectors and lock/browser tests |
| PLACE-04-EQUIV | keyboard/list users and archived/locked/empty lots | inspect and invoke every supported action | same task coverage, meaningful names, focus and Today behavior | actual DOM/list keyboard journeys |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove superseded tile-scene composition and migrated duplicate stage selection; retain accessible list behavior and source owners. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

SCENE: F0/F2 across theme/viewport/zoom matrix; BUILD: different Town/library/inn levels and Finance lock; EQUIV: keyboard/list users and archived/locked/empty lots. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-04.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
