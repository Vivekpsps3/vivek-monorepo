# FIXUP-19 — Keep Town appearance preview and Apply together

- Stable key: `FIXUP-19`
- GitHub leaf: [#607](https://github.com/Vivekpsps3/vivek-monorepo/issues/607)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `NAV-04`, `SCENE-08`
- Conflict groups: `account-settings`, `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`
- Priority: P1

## Outcome

Let users change the scene and understand what will be applied in one compact preference panel.

## Requirements

At 390px the season control starts near y490 and Save season near y1357. The list starts with a full calendar-month explanation. Sound is editable in the same draft but Save season names only one of the persisted settings.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [NAV-04 / #389](https://github.com/Vivekpsps3/vivek-monorepo/issues/389), [SCENE-08 / #446](https://github.com/Vivekpsps3/vivek-monorepo/issues/446).

## Source paths

- `apps/web/src/app/settings/appearance-section.component.html`
- `apps/web/src/app/settings/appearance-section.component.ts`
- `apps/web/src/app/settings/appearance-section.component.css`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Lead with current settings and choice controls. Pair changed settings with a compact preview and reachable Apply/Discard. Put the season mapping and date explanation in one opt-in explanation.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-19-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | At phone width select season or sound and immediately reach an enabled Apply whose label covers the edited preferences. Preview, confirmed save and failed save remain distinguishable. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-19-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | At desktop and 320px by keyboard and touch, apply or discard and visit Town. Theme remains independent and settings retain per-owner/device scope, audio gesture, and reduced-motion behavior. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove repeated ready-state season/privacy-style paragraphs and replace the misleading Save season label. Keep necessary sound and date meaning where a user needs it. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-19.md`. Close only this leaf from its implementation PR.
