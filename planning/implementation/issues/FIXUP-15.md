# FIXUP-15 — Move cosmetic placement from the catalog preview into Home

- Stable key: `FIXUP-15`
- GitHub leaf: [#593](https://github.com/Vivekpsps3/vivek-monorepo/issues/593)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `HOME-01`, `HOME-02`, `HOME-03`, `HOME-04`, `HOME-05`, `GAME-02`
- Conflict groups: `town-ui`, `private-routes`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Give decorating one durable Home placement flow and put browsing and purchases in their real Home/workshop context.

## Requirements

The new Town header links to /town/cosmetics, whose Place free item control appends to a panel labeled Saved layout. Its sample layout is scoped to a component-owned in-memory map. A reload restores the sample, so the page currently presents temporary placement as saved.

Reproduce on the audited revision with synthetic data. Open /town/cosmetics?item=oak-seat on the merged catalog build, place the item in an unused cell and reload. Check the Saved layout list before and after.

Browser baseline [ab2507c9](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab2507c9e51c6c3c4dbcf5b307d30f50b3e406b6). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [HOME-01 / #466](https://github.com/Vivekpsps3/vivek-monorepo/issues/466), [HOME-02 / #449](https://github.com/Vivekpsps3/vivek-monorepo/issues/449), [HOME-03 / #450](https://github.com/Vivekpsps3/vivek-monorepo/issues/450), [HOME-04 / #467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467), [HOME-05 / #468](https://github.com/Vivekpsps3/vivek-monorepo/issues/468), [GAME-02 / #471](https://github.com/Vivekpsps3/vivek-monorepo/issues/471).

## Source paths

- `apps/web/src/app/town/home-room.component.ts`
- `apps/web/src/app/town/workshop.component.ts`
- `apps/web/src/app/town/cosmetic-catalog.ts`
- `apps/web/src/app/town/town.component.html`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. After the revision-aware Home editor and workshop are available, migrate real catalog entry and existing item deep links into those flows. Reuse the 24 real assets and their shared catalog metadata.
3. Remove the session-only placement experience. A retained read-only sample must describe its sample status in context and present no saved-layout claim or misleading write control.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-15-A1 | An existing catalog item deep link and a new Home visitor | Open from Town, select a free item and save in an actual room | The existing item resolves with useful context. A confirmed room placement survives reload and reports failures through the canonical editor. | Actual room write, reload and conflict/Undo journey |
| FIXUP-15-A2 | Shop item, unsupported asset, or unavailable artwork | Enter from an old link or the workshop | The correct catalog item, description or fallback appears, and ownership/revisions and invalid layouts are preserved by their canonical owners. | Legacy route, preview fallback and workshop checks |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove the parallel component-local placement map and its misleading Saved layout controls once canonical Home/workshop consumers cover them. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Open /town/cosmetics?item=oak-seat on the merged catalog build, place the item in an unused cell and reload. Check the Saved layout list before and after.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

This is preview retirement after prerequisites. Layout persistence, four rooms, editing, Undo and purchase/refund stay with their existing roadmap leaves. Keep public art, prices, variants and existing milestone eligibility.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-15.md`. Close only this leaf with the implementation PR.
