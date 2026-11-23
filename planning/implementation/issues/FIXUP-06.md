# FIXUP-06 — Give Town games one Arcade entry and keep Media Games focused

- Stable key: `FIXUP-06`
- GitHub leaf: [#584](https://github.com/Vivekpsps3/vivek-monorepo/issues/584)
- Parents: [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578), [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304)
- Kind: `implementation`
- Dependencies: `ROOM-10`, `GAME-10`, `GAME-11`, `GAME-12`
- Conflict groups: `media-collections`, `private-routes`, `town-ui`
- Verification profiles: `docs`, `web_front`, `media_front`
- Priority: P1

## Outcome

Make the Arcade a clear place to play and Media Games a clear collection to browse.

## Requirements

Town Arcade links to /media/library?kind=game, the ordinary Media Games collection. Both play tables appear ahead of saved games, with the first saved game at y1682 on phone. Music has another rhythm entry. Existing game packets already own gameplay and rewards.

Reproduce on the audited revision with synthetic data. Open Games from Media with one saved game, then Arcade from Town and compare what each entry offers.

Browser baseline [27c99dc2](https://github.com/Vivekpsps3/vivek-monorepo/commit/27c99dc28370c5d2c49382bc1486faeb98c3573f). Follow the selected coastal Town design and common acceptance contract.


Verify prerequisite outcomes on fresh main. [ROOM-10 / #460](https://github.com/Vivekpsps3/vivek-monorepo/issues/460), [GAME-10 / #478](https://github.com/Vivekpsps3/vivek-monorepo/issues/478), [GAME-11 / #480](https://github.com/Vivekpsps3/vivek-monorepo/issues/480), [GAME-12 / #481](https://github.com/Vivekpsps3/vivek-monorepo/issues/481).

## Source paths

- `apps/web/src/app/town/town-exterior.ts`
- `apps/media/frontend/src/library.component.ts`
- `apps/media/frontend/src/arcade.component.ts`
- `apps/media/frontend/src/music-bar.component.ts`

## Target paths

The named source owners and affected existing browser journeys.

## Steps

1. Reproduce the observed starting state and recheck fresh main and open claims.
2. Give Town Arcade a stable context that opens the play area with a lightweight path to tracked Games. Ordinary Media Games lands on saved games and progress.
3. Use one canonical rhythm flow for Arcade and Music bar. Restore the appropriate source on exit and preserve established links.
4. Run the packet profiles and applicable actual-diff gates. Record successful and failure journeys with local evidence.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| FIXUP-06-A1 | Town and Media with a saved game | Open Arcade from Town and Games from Media | Both canonical games are reachable immediately from Arcade. A saved game appears in the first phone viewport from Media Games. Each context has a clear exit. | Touch, keyboard and Back |
| FIXUP-06-A2 | Canonical minigames merged | Start, pause, resume and exit both games and use the Music rhythm entry | All entries reuse the same game state and eligible reward identities. Play creates no Media record. | Session continuity, owner clearing and no Media mutation |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Superseded UI in the affected slice | Remove full play-table panels from ordinary Media Games and any superseded launch/state paths after migrating their consumers. | Presentation or entry replacement | List migrated consumers, removed markup/paths and surviving journeys. |

## Non-goals

Preserve the canonical editors, source ownership, data semantics, existing routes and supported user records. The content already assigned to open roadmap leaves remains in those packets.

## Test scenarios

- Open Games from Media with one saved game, then Arcade from Town and compare what each entry offers.
- Use 390×844 and 1280×800 in light and night. Check keyboard, touch and reduced motion, plus 320px and 200% text for shared layout changes.

## Risks

Coordinate with GAME-12/GAME-14. Mechanics, grants and preferences stay in existing game packets.

## Completion evidence

Record the tested SHA, exact command results, before/after acceptance captures and removal evidence in `planning/implementation/evidence/FIXUP-06.md`. Close only this leaf with the implementation PR.
