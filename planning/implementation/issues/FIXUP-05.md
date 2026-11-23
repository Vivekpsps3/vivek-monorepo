# FIXUP-05 — Put saved Media before room introductions

- Stable key: `FIXUP-05`
- GitHub leaf: [#583](https://github.com/Vivekpsps3/vivek-monorepo/issues/583)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `MUX-04`, `MUX-05`, `MUX-06`, `ROOM-06`, `ROOM-07`, `ROOM-08`, `ROOM-09`
- Conflict groups: `media-collections`
- Verification profiles: `docs`, `media_front`
- Priority: P1

## Outcome

Start ordinary collection browsing with a saved item or a useful empty action and keep authored room interactions reachable.

## Requirements

With saved records on a 390×844 phone, the first film titles begin around y1500, the series at y1301, the book at y1493 and the artist at y1753. Theater repeats room labels, and Music shows stage/tools before the artist wall.

Reproduce on the audited revision with synthetic data. Save one film, series, book and artist. Enter each category through Media navigation and look for the first saved item without scrolling or using an in-page jump.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [MUX-04 / #400](https://github.com/Vivekpsps3/vivek-monorepo/issues/400), [MUX-05 / #401](https://github.com/Vivekpsps3/vivek-monorepo/issues/401), [MUX-06 / #402](https://github.com/Vivekpsps3/vivek-monorepo/issues/402), [ROOM-06 / #456](https://github.com/Vivekpsps3/vivek-monorepo/issues/456), [ROOM-07 / #457](https://github.com/Vivekpsps3/vivek-monorepo/issues/457), [ROOM-08 / #458](https://github.com/Vivekpsps3/vivek-monorepo/issues/458), [ROOM-09 / #459](https://github.com/Vivekpsps3/vivek-monorepo/issues/459).

## Source paths

- `apps/media/frontend/src/library.component.ts`
- `apps/media/frontend/src/library-filters.mjs`
- `apps/media/frontend/src/theater.component.ts`
- `apps/media/frontend/src/episode-lounge.component.ts`
- `apps/media/frontend/src/book-shelf.component.ts`
- `apps/media/frontend/src/music-bar.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Give the collection and filters a compact header. Present a real poster, continuation, book or artist before secondary room panels.
3. Put screening, reading desk, viewing notes and stage tools where they have context. Reuse canonical editors and preserve collection/filter/scroll return.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-05-A1 | Saved records and a filtered empty result | Open Movies, Series, Books or Music at 390×844 and 1280×800 | A named first item and its open/continue action are fully visible without scrolling. Empty filters offer a relevant action. | Populated and empty browser bounds in both themes |
| FIXUP-05-A2 | Saved progress, notes, long titles and grouped music | Open a record or room action, edit and return | The same item/category/filter/page/scroll and artist grouping restore. Saved reads remain DB-only. | Canonical record links, keyboard/touch and request assertions |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove repeated no-play copy and anchor-jump cards whose only job is to bypass an introductory block. Keep one clear boundary where relevant. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Save one film, series, book and artist. Enter each category through Media navigation and look for the first saved item without scrolling or using an in-page jump.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Preserve exact completion/progress semantics. FIXUP-06 owns game-launch placement.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-05.md`. Close only this leaf with the implementation PR.
