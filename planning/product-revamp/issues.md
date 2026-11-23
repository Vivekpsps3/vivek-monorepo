# Issue map

This map groups published issues by scope. Use the [execution queue](../implementation/README.md) and exact packet to select work. The [completion registry](../implementation/completed/registry.json) records merged PRs and their commits.

The original 56 acceptance rows remain assigned to their accountable children. OPS-06 remains an independent open leaf.

The [FIXUP audit](fixup-audit-2026-11-23.md) records the reproduced UX gaps and their
[tracker](https://github.com/Vivekpsps3/vivek-monorepo/issues/578). Use the same
execution queue for FIXUP work.

## STYLE

STYLE-01 through STYLE-04 ([#382](https://github.com/Vivekpsps3/vivek-monorepo/issues/382)–[#385](https://github.com/Vivekpsps3/vivek-monorepo/issues/385)) are merged and archived.

## NAV

NAV-01 through NAV-04 ([#386](https://github.com/Vivekpsps3/vivek-monorepo/issues/386)–[#389](https://github.com/Vivekpsps3/vivek-monorepo/issues/389)) are merged and archived.

## FUX

FUX-01 through FUX-07 ([#390](https://github.com/Vivekpsps3/vivek-monorepo/issues/390)–[#396](https://github.com/Vivekpsps3/vivek-monorepo/issues/396)) are merged and archived.

## MUX

MUX-01 through MUX-09 ([#397](https://github.com/Vivekpsps3/vivek-monorepo/issues/397)–[#405](https://github.com/Vivekpsps3/vivek-monorepo/issues/405)) are archived. Later leaves still name them as prerequisites. Proof is in the completion registry.

## TUX

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [TUX-01 / #406](https://github.com/Vivekpsps3/vivek-monorepo/issues/406) | Verify advance-flight schedule coverage and select the adapter contract | Current merged invariants only |
| [TUX-02 / #407](https://github.com/Vivekpsps3/vivek-monorepo/issues/407) | Support bounded advance-flight lookup with preserved overrides | [TUX-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/406) |
| [TUX-03 / #408](https://github.com/Vivekpsps3/vivek-monorepo/issues/408) | Persist incomplete trip drafts without inventing return dates | Current merged invariants only |
| [TUX-04 / #409](https://github.com/Vivekpsps3/vivek-monorepo/issues/409) | Create trips from flight number and date with review | [TUX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/407), [TUX-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/408), [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [STYLE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/383) |
| [TUX-05 / #410](https://github.com/Vivekpsps3/vivek-monorepo/issues/410) | Import flight calendar bookings through an explicit preview | [TUX-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/408), [STYLE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/383) |
| [TUX-06 / #411](https://github.com/Vivekpsps3/vivek-monorepo/issues/411) | Turn trip detail into a readable contextual itinerary | [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384) |
| [TUX-07 / #412](https://github.com/Vivekpsps3/vivek-monorepo/issues/412) | Style upcoming and past trips with map/text parity | [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384), [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387) |
| [TUX-08 / #413](https://github.com/Vivekpsps3/vivek-monorepo/issues/413) | Make PTO forecasts and trip allocations easier to inspect | [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384), [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387) |
| [TUX-09 / #414](https://github.com/Vivekpsps3/vivek-monorepo/issues/414) | Reconcile planned costs and posted Finance transactions explicitly | [FUX-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/392), [TUX-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/411) |
| [TUX-10 / #422](https://github.com/Vivekpsps3/vivek-monorepo/issues/422) | Expose bounded named trip memories and honest source dates | [TUX-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/411), [PIX-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/421) |

## PHOTO

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [PHOTO-01 / #415](https://github.com/Vivekpsps3/vivek-monorepo/issues/415) | Survey Immich version, reachability, permissions and date visibility | Current merged invariants only |
| [PHOTO-02 / #416](https://github.com/Vivekpsps3/vivek-monorepo/issues/416) | Add owner-scoped Immich connection and revoke/retry controls | [PHOTO-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/415), [NAV-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/389) |
| [PHOTO-03 / #417](https://github.com/Vivekpsps3/vivek-monorepo/issues/417) | Read a selected Immich day with bounded metadata and thumbnails | [PHOTO-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/416) |
| [PHOTO-04 / #424](https://github.com/Vivekpsps3/vivek-monorepo/issues/424) | Show dated photos in Pixels and open the original asset | [PHOTO-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/417), [PIX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/423) |

## NOTE

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [NOTE-01 / #418](https://github.com/Vivekpsps3/vivek-monorepo/issues/418) | Survey Obsidian vault access, sync and date conventions | Current merged invariants only |
| [NOTE-02 / #419](https://github.com/Vivekpsps3/vivek-monorepo/issues/419) | Connect a read-only selected Obsidian projection safely | [NOTE-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/418), [NAV-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/389) |
| [NOTE-03 / #420](https://github.com/Vivekpsps3/vivek-monorepo/issues/420) | Resolve dated notes and stable note links across renames | [NOTE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/419) |
| [NOTE-04 / #425](https://github.com/Vivekpsps3/vivek-monorepo/issues/425) | Display dated note excerpts in Pixels with exact Obsidian open | [NOTE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/420), [PIX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/423) |

## PIX

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [PIX-01 / #421](https://github.com/Vivekpsps3/vivek-monorepo/issues/421) | Expose stable dated facts and learning annotations without changing scores | Current merged invariants only |
| [PIX-02 / #423](https://github.com/Vivekpsps3/vivek-monorepo/issues/423) | Build a named daily-memory view with exact source actions | [PIX-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/421), [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387), [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384) |
| [PIX-03 / #426](https://github.com/Vivekpsps3/vivek-monorepo/issues/426) | Style Year and Life as an orientable memory atlas | [PIX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/423), [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384) |

## HEAL

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [HEAL-01 / #427](https://github.com/Vivekpsps3/vivek-monorepo/issues/427) | Mount the private Health entry shell with shared units and field errors | [STYLE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/383), [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387) |
| [HEAL-02 / #428](https://github.com/Vivekpsps3/vivek-monorepo/issues/428) | Create, edit and delete vital measurements | [HEAL-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/427) |
| [HEAL-03 / #429](https://github.com/Vivekpsps3/vivek-monorepo/issues/429) | Complete lab-result groups and checkup editing | [HEAL-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/427) |
| [HEAL-04 / #430](https://github.com/Vivekpsps3/vivek-monorepo/issues/430) | Render latest Health values and bounded measurement history | [HEAL-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/428), [HEAL-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/429), [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384) |
| [HEAL-05 / #436](https://github.com/Vivekpsps3/vivek-monorepo/issues/436) | Prove all private Health routes clear and recover through the vault | [HEAL-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/430), [FIT-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/435) |

## FIT

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [FIT-01 / #431](https://github.com/Vivekpsps3/vivek-monorepo/issues/431) | Register versioned private workout exercises, routines and sessions | [HEAL-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/427) |
| [FIT-02 / #432](https://github.com/Vivekpsps3/vivek-monorepo/issues/432) | Persist and resume a revision-aware workout session draft | [FIT-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/431) |
| [FIT-03 / #433](https://github.com/Vivekpsps3/vivek-monorepo/issues/433) | Log load, reps, bodyweight, time and distance sets | [FIT-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/432), [STYLE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/383) |
| [FIT-04 / #434](https://github.com/Vivekpsps3/vivek-monorepo/issues/434) | Start workouts from routines or a previous session | [FIT-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/433) |
| [FIT-05 / #435](https://github.com/Vivekpsps3/vivek-monorepo/issues/435) | Combine session-derived bests with editable legacy PRs | [FIT-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/433), [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/384) |
| [FIT-06 / #437](https://github.com/Vivekpsps3/vivek-monorepo/issues/437) | Apply the twenty settled badge names and separate game medals | [FIT-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/435) |
| [FIT-07 / #438](https://github.com/Vivekpsps3/vivek-monorepo/issues/438) | Add an optional local rest timer with safe session return | [FIT-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/433), [NAV-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/389) |

## SCENE

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [SCENE-01 / #439](https://github.com/Vivekpsps3/vivek-monorepo/issues/439) | Compose scene objects with shared visible and selectable bounds | [STYLE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/385) |
| [SCENE-02 / #440](https://github.com/Vivekpsps3/vivek-monorepo/issues/440) | Replace the habit tile grid with the six-district Town exterior | [SCENE-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/439) |
| [SCENE-03 / #441](https://github.com/Vivekpsps3/vivek-monorepo/issues/441) | Enter layered rooms and inspect useful objects | [SCENE-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/439), [NAV-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/387) |
| [SCENE-04 / #442](https://github.com/Vivekpsps3/vivek-monorepo/issues/442) | Keep all habit, Today and history actions usable in the new Town | [SCENE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/440) |
| [SCENE-05 / #443](https://github.com/Vivekpsps3/vivek-monorepo/issues/443) | Give committed habit actions specific reversible scene feedback | [SCENE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/442) |
| [SCENE-06 / #444](https://github.com/Vivekpsps3/vivek-monorepo/issues/444) | Build Hall rules, progress and existing editor links | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [SCENE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/442) |
| [SCENE-07 / #445](https://github.com/Vivekpsps3/vivek-monorepo/issues/445) | Deliver the sole encrypted weekly reflection and one Hub link | [SCENE-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/444), [NAV-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/388) |
| [SCENE-08 / #446](https://github.com/Vivekpsps3/vivek-monorepo/issues/446) | Add owner-specific seasons and restrained scene ambience | [SCENE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [NAV-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/389) |
| [SCENE-09 / #447](https://github.com/Vivekpsps3/vivek-monorepo/issues/447) | Derive Media and Travel keepsakes from canonical sources | [PIX-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/421), [TUX-10](https://github.com/Vivekpsps3/vivek-monorepo/issues/422), [MUX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/398) |
| [SCENE-10 / #448](https://github.com/Vivekpsps3/vivek-monorepo/issues/448) | Visit an exact past date in Town and return to Pixels | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [PIX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/423) |

## HOME

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [HOME-02 / #449](https://github.com/Vivekpsps3/vivek-monorepo/issues/449) | Create the twelve starter and twelve shop cosmetic assets | [STYLE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/385) |
| [HOME-03 / #450](https://github.com/Vivekpsps3/vivek-monorepo/issues/450) | Compose four decoratable Home rooms with useful objects | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [HOME-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/449) |
| [HOME-01 / #466](https://github.com/Vivekpsps3/vivek-monorepo/issues/466) | Persist bounded room layouts with owner and revision checks | [TOWN-07](https://github.com/Vivekpsps3/vivek-monorepo/issues/255), [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [GAME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/465) |
| [HOME-04 / #467](https://github.com/Vivekpsps3/vivek-monorepo/issues/467) | Place, rotate and recolor room objects through preview and Save | [HOME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/466), [HOME-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/450) |
| [HOME-05 / #468](https://github.com/Vivekpsps3/vivek-monorepo/issues/468) | Recover layout conflicts, Undo and Reset without losing a draft | [HOME-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/467) |
| [HOME-06 / #469](https://github.com/Vivekpsps3/vivek-monorepo/issues/469) | Bind private photos and records to decorative frames safely | [HOME-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/467), [PHOTO-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/417), [NOTE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/420) |

## ROOM

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [ROOM-01 / #451](https://github.com/Vivekpsps3/vivek-monorepo/issues/451) | Open real account drawers in the Treasury accounts hall | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [FUX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/391) |
| [ROOM-02 / #452](https://github.com/Vivekpsps3/vivek-monorepo/issues/452) | Inspect Holdings and Activity from the Treasury gallery | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [FUX-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/390), [FUX-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/392) |
| [ROOM-03 / #453](https://github.com/Vivekpsps3/vivek-monorepo/issues/453) | Use bills and planning tools in the Treasury study | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [FUX-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/393), [FUX-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/394), [FUX-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/395) |
| [ROOM-04 / #454](https://github.com/Vivekpsps3/vivek-monorepo/issues/454) | Book and inspect a real journey in the terminal hall | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [TUX-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/409), [TUX-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/411) |
| [ROOM-05 / #455](https://github.com/Vivekpsps3/vivek-monorepo/issues/455) | Explore travel maps, PTO, costs and souvenirs in connected rooms | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [TUX-07](https://github.com/Vivekpsps3/vivek-monorepo/issues/412), [TUX-08](https://github.com/Vivekpsps3/vivek-monorepo/issues/413), [TUX-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/414), [SCENE-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/447) |
| [ROOM-06 / #456](https://github.com/Vivekpsps3/vivek-monorepo/issues/456) | Browse and update real books inside the Library | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MUX-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/401), [SCENE-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/447) |
| [ROOM-07 / #457](https://github.com/Vivekpsps3/vivek-monorepo/issues/457) | Browse films and personal notes in the Theater | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MUX-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/400), [MUX-08](https://github.com/Vivekpsps3/vivek-monorepo/issues/404) |
| [ROOM-08 / #458](https://github.com/Vivekpsps3/vivek-monorepo/issues/458) | Continue series from the Theater's episode lounge | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MUX-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/400), [MUX-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/405) |
| [ROOM-09 / #459](https://github.com/Vivekpsps3/vivek-monorepo/issues/459) | Explore saved artists, records and songs in the Music bar | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MUX-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/399), [MUX-08](https://github.com/Vivekpsps3/vivek-monorepo/issues/404) |
| [ROOM-10 / #460](https://github.com/Vivekpsps3/vivek-monorepo/issues/460) | Connect tracked games and Town games inside the Arcade | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MUX-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/402) |
| [ROOM-11 / #461](https://github.com/Vivekpsps3/vivek-monorepo/issues/461) | Start and log complete workouts on the Gym floor | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [FIT-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/433), [FIT-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/434) |
| [ROOM-12 / #462](https://github.com/Vivekpsps3/vivek-monorepo/issues/462) | Inspect workout progress, manual PRs and trophies upstairs | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [FIT-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/435), [FIT-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/437) |
| [ROOM-13 / #463](https://github.com/Vivekpsps3/vivek-monorepo/issues/463) | Track vital measurements in the Clinic rooms | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [HEAL-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/428), [HEAL-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/430) |
| [ROOM-14 / #464](https://github.com/Vivekpsps3/vivek-monorepo/issues/464) | Explore lab history and checkups in the Clinic archive | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [HEAL-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/429), [HEAL-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/430) |
| [ROOM-16 / #470](https://github.com/Vivekpsps3/vivek-monorepo/issues/470) | Display dated photos and notes in Home and Terminal galleries | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [PHOTO-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/424), [NOTE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/425), [HOME-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/469) |
| [ROOM-15 / #485](https://github.com/Vivekpsps3/vivek-monorepo/issues/485) | Make the Library study the home of saved concepts and notes | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [MERGE-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/484), [NOTE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/420) |

## GAME

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [GAME-01 / #465](https://github.com/Vivekpsps3/vivek-monorepo/issues/465) | Implement the game-only Stamp wallet and entitlement contract | Current merged invariants only |
| [GAME-02 / #471](https://github.com/Vivekpsps3/vivek-monorepo/issues/471) | Buy and refund cosmetic unlocks at the workshop | [GAME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/465), [HOME-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/449), [HOME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/466), [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441) |
| [GAME-03 / #472](https://github.com/Vivekpsps3/vivek-monorepo/issues/472) | Track optional chapter quests with once-only completion | [GAME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/465), [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441) |
| [GAME-05 / #473](https://github.com/Vivekpsps3/vivek-monorepo/issues/473) | Give residents reachable dialogue and persistent relationship ranks | [GAME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/465), [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441) |
| [GAME-06 / #474](https://github.com/Vivekpsps3/vivek-monorepo/issues/474) | Author Mara and Ada's Library and Treasury conversations | [GAME-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/473), [ROOM-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/451), [ROOM-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/456) |
| [GAME-07 / #475](https://github.com/Vivekpsps3/vivek-monorepo/issues/475) | Author Imani and Jun's Terminal and Gym conversations | [GAME-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/473), [ROOM-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/454), [ROOM-11](https://github.com/Vivekpsps3/vivek-monorepo/issues/461) |
| [GAME-08 / #476](https://github.com/Vivekpsps3/vivek-monorepo/issues/476) | Author Wren and Sol's culture and Hall conversations | [GAME-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/473), [ROOM-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/459), [SCENE-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/444) |
| [GAME-09 / #477](https://github.com/Vivekpsps3/vivek-monorepo/issues/477) | Add twelve discoverable Town object interactions | [SCENE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [GAME-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/472) |
| [GAME-10 / #478](https://github.com/Vivekpsps3/vivek-monorepo/issues/478) | Build Memory Shelves as a complete six-pair minigame | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441) |
| [GAME-04 / #479](https://github.com/Vivekpsps3/vivek-monorepo/issues/479) | Ship the six authored Town chapters and their keepsakes | [GAME-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/472), [HOME-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/467), [ROOM-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/454), [ROOM-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/456), [GAME-10](https://github.com/Vivekpsps3/vivek-monorepo/issues/478) |
| [GAME-11 / #480](https://github.com/Vivekpsps3/vivek-monorepo/issues/480) | Build Harbor Rhythm with touch, keyboard and untimed play | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [NAV-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/389) |
| [GAME-12 / #481](https://github.com/Vivekpsps3/vivek-monorepo/issues/481) | Grant capped minigame rewards from validated play receipts | [GAME-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/465), [GAME-10](https://github.com/Vivekpsps3/vivek-monorepo/issues/478), [GAME-11](https://github.com/Vivekpsps3/vivek-monorepo/issues/480) |
| [GAME-13 / #482](https://github.com/Vivekpsps3/vivek-monorepo/issues/482) | Display chapter, discovery, friendship and arcade collections | [GAME-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/479), [GAME-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/474), [GAME-07](https://github.com/Vivekpsps3/vivek-monorepo/issues/475), [GAME-08](https://github.com/Vivekpsps3/vivek-monorepo/issues/476), [GAME-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/477), [GAME-12](https://github.com/Vivekpsps3/vivek-monorepo/issues/481) |
| [GAME-14 / #483](https://github.com/Vivekpsps3/vivek-monorepo/issues/483) | Persist game, audio and motion preferences without task friction | [NAV-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/389), [SCENE-08](https://github.com/Vivekpsps3/vivek-monorepo/issues/446), [GAME-11](https://github.com/Vivekpsps3/vivek-monorepo/issues/480) |

## MERGE

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [MERGE-01 / #484](https://github.com/Vivekpsps3/vivek-monorepo/issues/484) | Move saved World concepts to a canonical Library-study route | [SCENE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/441), [PIX-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/421) |
| [MERGE-02 / #486](https://github.com/Vivekpsps3/vivek-monorepo/issues/486) | Redirect legacy World date and week links with useful return | [MERGE-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/484), [SCENE-10](https://github.com/Vivekpsps3/vivek-monorepo/issues/448), [PIX-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/423), [ROOM-15](https://github.com/Vivekpsps3/vivek-monorepo/issues/485) |
| [MERGE-03 / #487](https://github.com/Vivekpsps3/vivek-monorepo/issues/487) | Remove the superseded standalone World presentation | [MERGE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/486), [SCENE-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/440), [SCENE-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/447), [ROOM-15](https://github.com/Vivekpsps3/vivek-monorepo/issues/485) |

## QA

| Issue | Small outcome | Prerequisites |
| --- | --- | --- |
| [QA-01 / #488](https://github.com/Vivekpsps3/vivek-monorepo/issues/488) | Reconcile all twenty Town findings and thirty-one mutation survivors | [SCENE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/442), [SCENE-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/443), [SCENE-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/444) |
| [QA-02 / #489](https://github.com/Vivekpsps3/vivek-monorepo/issues/489) | Review integrated visual, keyboard and touch acceptance | [ROOM-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/451), [ROOM-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/452), [ROOM-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/453), [ROOM-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/454), [ROOM-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/455), [ROOM-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/456), [ROOM-07](https://github.com/Vivekpsps3/vivek-monorepo/issues/457), [ROOM-08](https://github.com/Vivekpsps3/vivek-monorepo/issues/458), [ROOM-09](https://github.com/Vivekpsps3/vivek-monorepo/issues/459), [ROOM-10](https://github.com/Vivekpsps3/vivek-monorepo/issues/460), [ROOM-11](https://github.com/Vivekpsps3/vivek-monorepo/issues/461), [ROOM-12](https://github.com/Vivekpsps3/vivek-monorepo/issues/462), [ROOM-13](https://github.com/Vivekpsps3/vivek-monorepo/issues/463), [ROOM-14](https://github.com/Vivekpsps3/vivek-monorepo/issues/464), [ROOM-15](https://github.com/Vivekpsps3/vivek-monorepo/issues/485), [ROOM-16](https://github.com/Vivekpsps3/vivek-monorepo/issues/470), [GAME-13](https://github.com/Vivekpsps3/vivek-monorepo/issues/482) |
| [QA-03 / #490](https://github.com/Vivekpsps3/vivek-monorepo/issues/490) | Verify cross-source privacy, revisions and recovery | [QA-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/489), [HEAL-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/436), [HOME-05](https://github.com/Vivekpsps3/vivek-monorepo/issues/468), [HOME-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/469), [PHOTO-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/424), [NOTE-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/425), [GAME-12](https://github.com/Vivekpsps3/vivek-monorepo/issues/481), [SCENE-07](https://github.com/Vivekpsps3/vivek-monorepo/issues/445) |
| [QA-04 / #491](https://github.com/Vivekpsps3/vivek-monorepo/issues/491) | Measure rich-scene frames, payloads and request budgets | [QA-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/489), [MERGE-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/487) |
| [QA-05 / #492](https://github.com/Vivekpsps3/vivek-monorepo/issues/492) | Rehearse preserving rollout and record integrated release readiness | [QA-01](https://github.com/Vivekpsps3/vivek-monorepo/issues/488), [QA-02](https://github.com/Vivekpsps3/vivek-monorepo/issues/489), [QA-03](https://github.com/Vivekpsps3/vivek-monorepo/issues/490), [QA-04](https://github.com/Vivekpsps3/vivek-monorepo/issues/491), [OPS-06](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) |

## Retained independent leaves

- [OPS-06 / #277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277): Record real off-host restore and independent alert activation evidence.

[TOWN-07 / #255](https://github.com/Vivekpsps3/vivek-monorepo/issues/255), [DISC-02 / #265](https://github.com/Vivekpsps3/vivek-monorepo/issues/265), and [OPS-05 / #276](https://github.com/Vivekpsps3/vivek-monorepo/issues/276) are archived. The Town ownership migration is merged in [PR #532](https://github.com/Vivekpsps3/vivek-monorepo/pull/532).
The Cards design is [planning/implementation/cards.md](../implementation/cards.md).
The app is not built, implementation stays unselected, and parent
[#195](https://github.com/Vivekpsps3/vivek-monorepo/issues/195) stays open.
