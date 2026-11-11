# PLACE-13 — Unify compact Hub arrivals, dated navigation and factual recaps

- Stable key: `PLACE-13`
- GitHub leaf: [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-03`, `PLACE-07`, `PLACE-10`, `PLACE-11`, `UX-03`, `HUB-02`
- Conflict groups: `hub-main`, `private-shell`, `pixels-hub-card`, `town-hall`
- Verification profiles: `web_front`, `server_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Unify compact Hub arrivals, dated navigation and factual recaps.

## Requirements

One place at three scales; useful direct arrivals, small Hub footprint and optional existing encrypted-review link.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/hub/hub.component.html`
- `apps/web/src/app/routes.ts`
- `apps/web/src/app/pixels/pixels-shell.component.html`

## Target paths

- `apps/web/src/app/hub/hub.component.ts`
- `apps/web/src/app/hub/hub.component.html`
- `apps/web/src/app/routes.ts`
- `apps/web/src/app/pixels/pixels-shell.component.html`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Add clear sibling/scale navigation and useful shared dated language while preserving all direct URLs and practical controls.
3. Use the existing compact summary/strip for one factual recent-change/visit action; no second map, inbox or review preview and no extra duplicate source fetch.
4. Project an on-demand dated recap from current bounded facts with coverage/source links; link the sole encrypted review editor only when TOWN-06 is actually available.
5. Preserve Year as primary Pixels arrival, intentional Life choice and reliable keyboard focus/back/reload; remove competing arrival context helpers.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-13-ARRIVE | Hub, direct and sibling routes | open dated action/back/reload | compact useful arrival, selected context and exact canonical links | shell/Hub/cross-scale browser journeys |
| PLACE-13-RECAP | partial/empty/rich range and review available/unavailable | open recap and optional review action | facts/coverage honest; no private note copy or invented narrative/dead link | network/DOM marker assertions and range fixture |
| PLACE-13-SHARE | concurrent summary consumers and one failed source | arrive and retry | bounded reused responses, independent source states and no second store | held-response/request-count regressions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove duplicate arrival/return builders and prototype recap stores; Hub summary remains composition and review remains Town-owned. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

ARRIVE: Hub, direct and sibling routes; RECAP: partial/empty/rich range and review available/unavailable; SHARE: concurrent summary consumers and one failed source. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-13.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
