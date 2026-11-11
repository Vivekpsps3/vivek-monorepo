# PLACE-10 — Bring completed Media home as source-linked library keepsakes

- Stable key: `PLACE-10`
- GitHub leaf: [#314](https://github.com/Vivekpsps3/vivek-monorepo/issues/314)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-02`, `PLACE-06`, `PLACE-09`, `TOWN-02`
- Conflict groups: `town-main`, `world-read-service`, `media-records`
- Verification profiles: `web_front`, `server_back`, `media_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Bring completed Media home as source-linked library keepsakes.

## Requirements

Book-comes-home signature; existing completed-kind allowlist, precise completion dates and source reversal.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/server/world/read.py`
- `apps/media/backend/services/records.py`
- `apps/web/src/app/town/town.component.ts`
- `apps/web/src/app/world/logic/reading.ts`

## Target paths

- `apps/server/world/read.py`
- `apps/media/backend/services/records.py`
- `apps/web/src/app/town/town.component.ts`
- `apps/web/src/app/world/logic/reading.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Use existing completed records and bounded approved read projections, not provider fetching or another completion/reward record.
3. Render a small curated type-based local keepsake catalog on a library shelf and existing World artifact; lazy detail identifies exact item and completion date.
4. Use exact existing Media item routes; explain episode-credit versus finished-artifact differences and truncation.
5. Retract on undo/delete/date correction, preserve archived supported history, and prevent replay storms on first import/long absence.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-10-MEDIA | episode plus completed book/movie/TV/game with dates | complete/revisit/inspect source | qualifying keepsake and World occurrence agree; exact item/date; episode distinction explained | API/source fixture and actual cross-app journey |
| PLACE-10-UNDO | completion reversed/deleted/redated | reload each scale | derived object retracts/moves; no copied title/reward persists or duplicate effect | source reversal tests |
| PLACE-10-LOAD | large history and unavailable Media | arrive/inspect bounded shelf | caps/coverage honest; no provider IO or N+1; Town remains usable | provider spy/request count and state screenshots |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Delete temporary copied completion/keepsake caches; retain source-owned records and existing artifact normalization. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

MEDIA: episode plus completed book/movie/TV/game with dates; UNDO: completion reversed/deleted/redated; LOAD: large history and unavailable Media. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-10.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
