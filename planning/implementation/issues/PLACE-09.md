# PLACE-09 — Offer bounded milestone ornaments through existing progression

- Stable key: `PLACE-09`
- GitHub leaf: [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-02`, `PLACE-05`, `PLACE-08`
- Conflict groups: `town-main`, `town-lots`, `town-read-service`
- Verification profiles: `web_front`, `server_back`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Offer bounded milestone ornaments through existing progression.

## Requirements

Use the three [initial catalog](../../living-world/catalog.md) milestone identities and three choices each; one placed instance per milestone, all eligibility from canonical public Town facts. The sets are: an active occupied habit at building level 2 → stepping stone/planter/wooden lantern; Town level 3 → wind vane/shell marker/path lamp; Town level 5 → bench/bird bath/civic pennant. Eligibility uses existing thresholds and introduces no new XP math.

Existing-level cosmetic entitlement, meaningful choice and reversible eligibility without reward/XP ledger.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/web/src/app/town/town.constants.ts`
- `apps/web/src/app/town/town-levels.ts`
- `apps/server/town/constants.py`
- `apps/web/src/app/world/render/renderer.ts`

## Target paths

- `apps/web/src/app/town/town.constants.ts`
- `apps/web/src/app/town/town-levels.ts`
- `apps/server/town/constants.py`
- `apps/web/src/app/world/render/renderer.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Define a small authored catalog of milestone keys and three choices per selected existing level/stage, with clear preview/next threshold and no new progression math.
3. Derive eligibility deterministically from existing public authoritative Town facts; never persist private Treasury/Health eligibility or titles.
4. Integrate choice/placement through PLACE-08 only; restore saved choices without duplicate claiming or celebration on reload.
5. Recompute reversal/removed eligibility, retain stored unavailable choice and show neutral anchor with explanation; verify max-level experience remains useful.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-09-CHOICE | just-before/at/after milestone and maximum level | reach threshold, choose/preview/save/reload | exact existing milestone; one stable identity, three understandable options and no extra XP | threshold vectors and actual choice flow |
| PLACE-09-REVERSE | source/XP correction removes eligibility | refresh and restore facts later | stored choice preserved but not rendered as earned; no duplicate reward endpoint | reversal/restoration model/browser tests |
| PLACE-09-PRIVATE | Finance/Health locked versus unlocked | inspect catalog/save choice | only public Town eligibility and catalog IDs persist; no private-derived marker | payload/storage/DOM privacy assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove provisional reward counters/inboxes if introduced; entitlement stays derived and placement uses the sole layout owner. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

CHOICE: just-before/at/after milestone and maximum level; REVERSE: source/XP correction removes eligibility; PRIVATE: Finance/Health locked versus unlocked. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-09.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
