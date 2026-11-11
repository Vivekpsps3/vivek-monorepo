# PLACE-08 — Persist and edit a bounded personal Town layout with revision safety

- Stable key: `PLACE-08`
- GitHub leaf: [#312](https://github.com/Vivekpsps3/vivek-monorepo/issues/312)
- Parents: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `PLACE-04`, `TOWN-07`, `CON-03`
- Conflict groups: `town-main`, `town-models`, `town-writes`, `schema-head`
- Verification profiles: `web_front`, `server_back`, `schema`
- Planning baseline: `0ed83e95a3727acc4f512dd2ac77211d8a622407`, 2026-11-11; fresh-read current main/claims before work.

Read root and applicable subtree AGENTS, [queue](../README.md), [workflow](../workflow.md), [Living World plan](../../living-world/README.md), its linked specifications and [scope reconciliation](../../living-world/scope.md). These relative repository links become available on main after the planning amendment merges. This packet owns one complete PR; close only this leaf.

## Outcome

Persist and edit a bounded personal Town layout with revision safety.

## Requirements

The [initial catalog](../../living-world/catalog.md) fixes twelve anchors, nine milestone options, 16KiB request limit and public eligibility/uniqueness validation. Implement its bounded persistence contract.

Arrange interaction and cosmetic persistence contract; fixed anchors/catalog IDs, no source/private values.

Owner priorities beautiful, interactive and informative are equal acceptance bars. All retained legacy commitments remain in scope under their existing packets.

## Source paths

- `apps/server/town/models.py`
- `apps/server/town/router.py`
- `apps/server/town/writes.py`
- `apps/web/src/app/town/town.component.ts`

## Target paths

- `apps/server/alembic/versions/`
- `apps/server/tests/`

- `apps/server/town/models.py`
- `apps/server/town/router.py`
- `apps/server/town/writes.py`
- `apps/web/src/app/town/town.component.ts`
- `apps/web/e2e/`

## Steps

1. Establish current source behavior and live prerequisites/claims; baseline actual facts before changing consumers.
2. Add one versioned owner/revision-bound layout record and preserving migration from the current schema head; retain account deletion behavior.
3. Validate catalog/anchor compatibility, maximum payload, unknown IDs/fields and optimistic conflicts on existing auth/CSRF paths.
4. Implement select-anchor → preview-item → Save/Cancel, keyboard equivalent, prior-layout Undo and explicit Reset preview; dragging is optional.
5. Handle two-device conflict, unsupported/corrupt record, network failure and owner/route disposal without destructive fallback or lost same-session draft.
6. Run launch-expanded profiles plus actual-diff root gates locally; record exact acceptance, visual, removal and verification evidence before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| PLACE-08-LAYOUT | known anchors/items and two sessions | save/reload/Undo/reset/conflict | bounded valid layout persists; conflict visible and saved revision not overwritten | API/model and actual keyboard/browser flow |
| PLACE-08-MIG | existing rows and foreign owner/malformed payload | upgrade, mutate and delete account | records preserved; foreign writes/invalid IDs rejected; single head | migration rehearsal and auth/CSRF tests |
| PLACE-08-RECOVER | unsupported/corrupt layout or failed/held save | preview, leave/switch owner, resolve response | data preserved; useful fallback and no stale draft publication | marker/held-response and recovery fixtures |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded paths in this slice | Remove device-only arrangement prototypes and copied placement state after both Town/World consume the saved approved layout. | Feature replacement; report additions honestly | Named real consumers, removed responsibility and surviving behavior tests; record none when no actual candidate exists |

## Non-goals

- No universal activity/reward ledger, duplicate domain math, private-data persistence or unrelated framework migration.
- No weakening legacy acceptance, test selection, coverage, dates, recovery, source limits or owner/lock guards.

## Test scenarios

LAYOUT: known anchors/items and two sessions; MIG: existing rows and foreign owner/malformed payload; RECOVER: unsupported/corrupt layout or failed/held save. Include relevant F0–F5, failure/held-response/owner and actual input-mode stories from acceptance.md.

## Risks

Actual shared files require serialized ownership despite conflict labels. Existing main may already satisfy a requirement: record current proof instead of recreating it. Art, interaction and factual clarity each need evidence; green unit tests do not prove beauty. Schema/source contracts remain with their owners. Rescope an oversized slice explicitly before implementation; preserve every acceptance requirement.

## Completion evidence

Use [the evidence template](../templates/evidence.md) in `planning/implementation/evidence/PLACE-08.md` after execution. Record tested revision, fixture, exact passed/failed/not-run commands, acceptance IDs, art review and before/after request/payload/frame measurements when affected. Include actual removed paths versus additions. PR/merge/activation are separate. No completion or deployment is asserted by this plan.
