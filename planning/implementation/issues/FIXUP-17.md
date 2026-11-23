# FIXUP-17 — Make the mobile app switcher lead with app destinations

- Stable key: `FIXUP-17`
- GitHub leaf: [#605](https://github.com/Vivekpsps3/vivek-monorepo/issues/605)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `NAV-01`, `FIXUP-01`
- Conflict groups: `private-routes`, `private-shell`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Make the next app easy to find by sight, touch or keyboard while retaining direct task shortcuts.

## Requirements

At 390px the switcher lists 35 links in one long menu. Finance and Media sublinks push Town to y744 and Pixels to y942 in the menu’s initial scroll position. App headings, local sections and long labels have the same presentation.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [NAV-01 / #386](https://github.com/Vivekpsps3/vivek-monorepo/issues/386), [FIXUP-01 / #579](https://github.com/Vivekpsps3/vivek-monorepo/issues/579).

## Source paths

- `apps/web/src/app/private-layout.component.html`
- `apps/web/src/app/private-layout.component.css`
- `apps/web/src/app/private-layout.component.ts`
- `tests/e2e/direct-destinations.spec.ts`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Lead with the small set of app destinations and the current place. Put secondary destinations in scannable groups with deliberate hierarchy, keeping frequently used cross-app destinations within the existing action budget.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-17-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | From any app at 320 and 390px, open the switcher and scan all primary apps including Health. Each can be reached in two navigation actions and the rendered menu stays inside the visual viewport. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-17-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Use Tab, arrow navigation where supported, Escape and touch across primary and secondary links. Current state, focus return, browser Back, and canonical direct links continue to work. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Replace the interleaved mobile list order that makes users pass app sublinks to find primary app names. Reuse current sections and guards. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-17.md`. Close only this leaf from its implementation PR.
