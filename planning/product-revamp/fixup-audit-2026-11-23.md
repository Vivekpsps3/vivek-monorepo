# Workspace and Town UX audit, 2026-11-23

The suite has useful editors and room actions. The biggest friction is reaching
them. The phone Town scene and Today compete with instructions and onboarding,
and several practical views put their room introduction above the saved record.
Reading Hall gives the exterior a useful visual reference through its clear
silhouette, depth and grounded objects.

## What was reviewed

- Read the selected design, acceptance, execution queue and live roadmap. Traced
  revamp changes in first-parent history from the design merge through the
  Terminal map/gallery merge, including STYLE, NAV, FUX, MUX, TUX, PIX, HEAL,
  FIT, SCENE and ROOM deliveries. Cross-checked affected work packets and
  implementation evidence. The live issue state was ahead of the checkout's
  planning snapshot. [Design](design.md) · [Acceptance](acceptance.md) ·
  [Roadmap](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) ·
  [Reviewed range](https://github.com/Vivekpsps3/vivek-monorepo/compare/b2bbf722...27c99dc2)
- Opened the deployed public home and the signed-out Hub, Town and Appearance
  entry points. The latter went to sign-in with their intended return path.
  Authenticated review used a production build on an isolated checkout of
  27c99dc2, the existing disposable suite server and synthetic records.
  [Deployed home](https://vivekpanchagnula.com/)
- Inspected 390×844 dark and 1280×800 light across Hub/agenda, Town and its
  visible rooms, locked and unlocked Health, Pixels Year/Life/Day, Media
  collections/capture, Travel Trips, Terminal, Memories, trip detail, trip
  creation and PTO, Finance Home/Holdings/Activity/Bills/Pay/Planning/Imports,
  and Appearance. Repeated selected layouts at 320px. Using the 390px
  fixture, the measurements below are approximate positions before scroll.
- HOME-02 merged during the review. Built ab2507c9 and checked its catalog
  separately with the same synthetic server setup. The art and metadata are
  usable by the future room editor. The standalone placement demo needs
  explicit retirement when its replacement ships.
  [HOME-02](https://github.com/Vivekpsps3/vivek-monorepo/pull/577)

## Findings and owners

| Surface | Observed starting behavior | Packet |
| --- | --- | --- |
| Hub and suite navigation | Health is unavailable in the shortcut grid despite routed Clinic and Gym. Quick add lacks Health. Hub repeats unlock and launcher content. | [FIXUP-01](../implementation/issues/FIXUP-01.md), [FIXUP-12](../implementation/issues/FIXUP-12.md) |
| Town arrivals and overview | On phone, the populated map starts around y599 and Today around y1886. An unfounded account sees the map at y1111 and Today at y2338. Color plates and cropped captions weaken orientation. | [FIXUP-02](../implementation/issues/FIXUP-02.md), [FIXUP-03](../implementation/issues/FIXUP-03.md) |
| Town rooms | Reading Hall and Hall put their inspectors below the mobile scene and persistent controls. Their object selection needs a visible, reversible next action. | [FIXUP-04](../implementation/issues/FIXUP-04.md) |
| Town Harbor | Confirmed the harbor building opens Trips. Entering Terminal requires another navigation and its explicit exit is Trips. | [FIXUP-10](../implementation/issues/FIXUP-10.md) |
| Clinic and Gym | First-visit Clinic repeats setup text below the facade. In the unlocked phone fixture, Clinic's measurements start around y977 and Gym's workouts around y3450. | [FIXUP-11](../implementation/issues/FIXUP-11.md) |
| Media | Saved film, series, book and artist titles start at y1301–1753 after introductory panels. Arcade duplicates a launch context inside the normal Media Games view. | [FIXUP-05](../implementation/issues/FIXUP-05.md), [FIXUP-06](../implementation/issues/FIXUP-06.md) |
| Pixels | Life's current week starts near y1216 and emits “0 activitys.” An ordinary Day repeats a named trip, provenance and facts across multiple sections. | [FIXUP-07](../implementation/issues/FIXUP-07.md), [FIXUP-08](../implementation/issues/FIXUP-08.md) |
| Travel | Three trip creation workflows are stacked on one page. Memories places its first trip at y835 after a rules block. | [FIXUP-09](../implementation/issues/FIXUP-09.md), [FIXUP-14](../implementation/issues/FIXUP-14.md) |
| Finance | The starter Home import opens the bank wizard through a legacy Activity URL. Cancel returns to Activity, outside the regular Imports surface. The seeded Holdings list is already reachable from its own destination and visible on phone. | [FIXUP-13](../implementation/issues/FIXUP-13.md) |
| Cosmetics | A free item appears under “Saved layout,” then disappears on reload. This is currently a component-local preview. | [FIXUP-15](../implementation/issues/FIXUP-15.md) |

## Execution boundaries

The [FIXUP tracker](https://github.com/Vivekpsps3/vivek-monorepo/issues/578)
links exact leaves with reproduction, ownership, verification and removal
targets. The [execution queue](../implementation/README.md) is the working
order. The new leaves sit before integrated QA and preserve the relative order
of existing work. Several leaves need current product outcomes, so confirm their
prerequisites and check overlapping files before claiming work.

Home decoration and shop, the remaining Treasury and Clinic rooms, full
minigames/quests/residents, photo and note connectors, the weekly reflection,
and World migration retain their existing implementation owners. QA-02 and
QA-04 retain integrated visual/accessibility and performance verification.
Owner art acceptance and authenticated production data, credentials and
deployment activation were outside the browser baseline.
