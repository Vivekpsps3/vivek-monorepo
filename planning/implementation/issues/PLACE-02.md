# PLACE-02 — Expose bounded dated facts and learning annotations with honest provenance

- Stable key: `PLACE-02`
- GitHub leaf: [#306](https://github.com/Vivekpsps3/vivek-monorepo/issues/306)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-01`, `TOWN-02`, `SAFE-05`
- Conflict groups: `pixels-year`, `town-read-service`, `world-read-service`
- Verification profiles: `web_front`, `server_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Expose bounded dated facts and learning annotations with honest provenance.

## Requirements

Architecture facts/identity and Pixels learning annotations; preserve all existing XP/score and source distinctions.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/server/world/read.py`
- `apps/server/pixels/router.py`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/world/data/world-controller.ts`

## Target paths

- `apps/server/world/read.py`
- `apps/server/pixels/router.py`
- `apps/web/src/app/pixels/pixels-data.service.ts`
- `apps/web/src/app/world/data/world-controller.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Build the canonical F1 fixture with episode, finished book, concept, habit and trip differences; map each displayed fact to its current owning response.
3. Extend only missing bounded source fields/counts, including concept annotations in Pixels; keep selected-day named detail lazy, owner-scoped and cancellable.
4. Document stable source identity, exact civil dates/spans, truncation and supported source routes. Reuse source status/deadline owners rather than adding a global feed.
5. Migrate actual detail/annotation consumers and remove copied joins/normalization only where their semantics match.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-02-FACT | F1 and overlapping/truncated source history | load/select a day | each fact has stable identity and provenance; intentional XP/count/artifact differences are explained | API/model vectors and cross-view fixture matrix |
| PLACE-02-LEARN | understood, archived and deleted concepts | load Pixels and reverse/delete understanding | annotation agrees with World; original Pixels scores stay byte-for-byte equivalent | score regression vectors and actual browser annotation |
| PLACE-02-BOUND | rich history, two owners and held source responses | select/change/leave/lock | bounded queries and request counts; no foreign or obsolete publication; independent failures survive | held-response/request-count and owner tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove actual repeated source joins/status branches adopted by current consumers; no persistent activity warehouse. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

FACT: F1 and overlapping/truncated source history; LEARN: understood, archived and deleted concepts; BOUND: rich history, two owners and held source responses. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-02.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
