# PLACE-11 — Make trips inspectable souvenirs with truthful spans and destinations

- Stable key: `PLACE-11`
- GitHub leaf: [#315](https://github.com/Vivekpsps3/vivek-monorepo/issues/315)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-02`, `PLACE-06`, `PLACE-09`, `TOWN-02`
- Conflict groups: `town-main`, `world-read-service`, `travel-summary`
- Verification profiles: `web_front`, `server_back`, `travel_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Make trips inspectable souvenirs with truthful spans and destinations.

## Requirements

Journey-remembered signature, actual trip dates versus Town credit date, planned distinction and generated-biome disclosure.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/server/world/read.py`
- `apps/travel/backend/routers/trips.py`
- `apps/web/src/app/world/engine/normalize.ts`
- `apps/web/src/app/pixels/pixels-model.ts`

## Target paths

- `apps/server/world/read.py`
- `apps/travel/backend/routers/trips.py`
- `apps/web/src/app/world/engine/normalize.ts`
- `apps/web/src/app/pixels/pixels-model.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Use source-owned trip identity/destination/span with existing completion eligibility; keep planned trip marks distinct from earned souvenirs.
3. Render a small local souvenir at the inn and dated World inspection; show exact source trip action, date span and generated landscape explanation.
4. Handle overlapping trips, missing place/latitude, cancelled/reversed/deleted trips and time boundaries without forcing one semantic trip winner everywhere.
5. Keep current deterministic biome normalization and document its illustrative latitude/hash behavior rather than implying real geography.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-11-TRIP | planned/completed/late-logged and overlapping trips | visit/inspect on each scale | actual span, source and eligibility explain intentional Town/World/Pixels differences | source-date fixture matrix and cross-app browser |
| PLACE-11-CHANGE | trip edit/cancel/delete and missing destination | reload and inspect | derived souvenir retracts/updates; honest fallback and no made-up place | reversal/fallback tests |
| PLACE-11-BIOME | existing seed/latitude/hash vectors | render souvenir overlay | same deterministic terrain; explicit illustrative geography and bounded reads | golden vectors/request counts and visual review |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove copied trip/memento ledgers and duplicate eligibility decisions; retain Travel owner and World normalization. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

TRIP: planned/completed/late-logged and overlapping trips; CHANGE: trip edit/cancel/delete and missing destination; BIOME: existing seed/latitude/hash vectors. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-11.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
