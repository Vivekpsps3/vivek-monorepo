# PLACE-03 — Connect exact-date visits and reliable return across Town, World and Pixels

- Stable key: `PLACE-03`
- GitHub leaf: [#307](https://github.com/Vivekpsps3/vivek-monorepo/issues/307)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-01`, `CON-02`
- Conflict groups: `private-routes`, `world-ui`, `pixels-year`, `pixels-life`
- Verification profiles: `web_front`, `server_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Connect exact-date visits and reliable return across Town, World and Pixels.

## Requirements

Interaction cross-scale date passage, canonical URL compatibility and distinct week/span definitions.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/web/src/app/world/logic/camera.ts`
- `apps/web/src/app/pixels/pixels-dates.ts`

## Target paths

- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/web/src/app/world/logic/camera.ts`
- `apps/web/src/app/pixels/pixels-dates.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Implement validated World day alongside legacy week; preserve Pixels Year/Life date and span context. Specify invalid/conflicting parameter normalization.
3. Add Visit this day/span and canonical return actions using bounded history state, safe route identifiers and date-only URLs; no arbitrary return URL.
4. Preserve browser Back/Forward and selected-object/cell focus; coalesce drag movement rather than pushing history frames.
5. Update actual route manifest/composition only as needed; remove duplicate URL/date-passage parsing after migration.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-03-ROUND | selected Year day and birthday-relative Life span | visit World and return/back/forward/reload | exact date/span/view restored; lost history state has useful canonical dated fallback | browser round trip and reload tests |
| PLACE-03-DATE | Feb29, Sunday/ISO boundaries, DST and mismatched client/server day | parse legacy/conflicting/invalid links | stable safe context; no date semantics conflation or redirect loop | pure date/URL vectors |
| PLACE-03-FOCUS | keyboard and touch selection with filters/scroll | open and close detail, navigate away/back | correct invoking or nearby focus; no private URL values and no frame history spam | actual browser focus/history assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Delete competing date-passage URL builders in migrated consumers; preserve existing date algorithms and supported links. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

ROUND: selected Year day and birthday-relative Life span; DATE: Feb29, Sunday/ISO boundaries, DST and mismatched client/server day; FOCUS: keyboard and touch selection with filters/scroll. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-03.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
