# FIXUP-27 — Lead Media Search and manual capture with the selected task

- Stable key: `FIXUP-27`
- GitHub leaf: [#615](https://github.com/Vivekpsps3/vivek-monorepo/issues/615)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `MUX-07`
- Conflict groups: `media-collections`, `media-records`
- Verification profiles: `docs`, `media_front`
- Priority: P1

## Outcome

Make the first result or first manual input easy to reach, with useful error recovery at the search that needs it.

## Requirements

A partial provider response with one match places that result at y1824 on 390px and y1283 on desktop. Provider coverage is always open before results and is repeated elsewhere. Search renders two Add manually links and an inline manual form. Standalone Book Add renders provider coverage before Title y608 and Save y877. Explicit Search return from Add manually loses the prior query even after the title was prefilled from it.

Browser and source baseline [bb300824](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46). Use the common revamp acceptance contract and recheck recent merges.

Verify prerequisite outcomes on fresh main. [MUX-07 / #403](https://github.com/Vivekpsps3/vivek-monorepo/issues/403).

## Source paths

- `apps/media/frontend/src/search.component.ts`
- `apps/media/frontend/src/public-api.ts`
- `apps/media/frontend/src/capture.mjs`

## Target paths

The named owners and their affected browser journeys.

## Steps

1. Reproduce the observed path with synthetic records and check the current implementation claims.
2. Place real results and concise per-query failures immediately under Search. Offer one visible manual route and one authoritative manual form. Move provider coverage and duplicated help into one contextual disclosure.
3. Verify ordinary, keyboard/touch and failure journeys. Run launch profiles and actual-diff gates.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-27-A1 | Synthetic account for the primary journey | Exercise the ordinary or direct entry | Search with ready, partial, empty and failed synthetic providers at 390 and 1280px. A real first match, progress or a recovery action is visible early. Valid results stay usable when another provider fails. | Executed browser journey with exact control, route and focus assertions |
| FIXUP-27-A2 | Relevant failure, alternate input or prior state | Retry, return, or use a second input path | Enter manual Book creation and exact-content-type alternatives. The needed input leads, duplicate decisions remain explicit, and drafts, review, retry and return preserve authoritative media identity. Explicit return preserves the original query, kind and source scroll. | Executed recovery and return behavior with domain assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded controls or paths in this slice | Remove the repeated provider coverage and always-rendered second manual form after one intentional workflow covers them. | Replacement or simplification | Before/after UI, migrated consumers and surviving behavior |

## Non-goals

Keep canonical app state, existing record and privacy semantics, supported routes and independent features. This packet owns the named journey.

## Test scenarios

- Reproduce the starting behavior above, then verify both acceptance rows at 390×844 and 1280×800 in light and night.
- Cover touch, keyboard, named focus and reduced motion. Stress 320px and 200% text when touching shared or scene layout.

## Risks

Recheck overlapping work. Preserve supported failure and empty-state meanings, drafts and safe return before deleting old paths.

## Completion evidence

Record the tested SHA, command results, captures and deletion evidence in `planning/implementation/evidence/FIXUP-27.md`. Close only this leaf from its implementation PR.
