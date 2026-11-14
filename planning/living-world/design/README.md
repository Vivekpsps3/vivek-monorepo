# Living World design studies

Town is the place you tend. World is where you revisit its history. Pixels gives
you perspective and a precise way back into that history. Hall explains the rules
and opens the one private review editor. These are connected views of existing
facts, not four new apps.

Prepared for [PLACE-01](../../implementation/issues/PLACE-01.md), 2026-11-14.
These are editable, rendered vector studies and an implementation handoff.
Owner visual approval and application implementation are pending. The existing
[product specification](../README.md) and exact packets still own scope.

Start with the [first garden, desktop](town-first-1280-light.svg),
[first garden, phone](town-first-390-dark.svg),
[selected memory](world-memory-390-light.svg) and
[Pixels atlas](pixels-partial-1280-dark.svg).
Then read the [interaction storyboard](storyboard.md),
[visual review](review.md), [measured baseline](baseline.md) and
[roadmap handoff](next.md).

## Compositions

Every row has light/dark studies at 390 and 1280, a 320px stress view and a
390px study with text doubled and reflowed. The SVG height includes scrollable
content: an 844px phone viewport does not need to fit the entire page at once.
These are static art, so controls illustrate affordances; they do not execute.

| State | 390 light | 390 dark | 1280 light | 1280 dark | 320 light / dark | 200% text light / dark |
| --- | --- | --- | --- | --- | --- | --- |
| Before founding | [View](town-unfounded-390-light.svg) | [View](town-unfounded-390-dark.svg) | [View](town-unfounded-1280-light.svg) | [View](town-unfounded-1280-dark.svg) | [Light](town-unfounded-320-light.svg) / [Dark](town-unfounded-320-dark.svg) | [Light](town-unfounded-390-light-text200.svg) / [Dark](town-unfounded-390-dark-text200.svg) |
| First garden | [View](town-first-390-light.svg) | [View](town-first-390-dark.svg) | [View](town-first-1280-light.svg) | [View](town-first-1280-dark.svg) | [Light](town-first-320-light.svg) / [Dark](town-first-320-dark.svg) | [Light](town-first-390-light-text200.svg) / [Dark](town-first-390-dark-text200.svg) |
| Established town | [View](town-mature-390-light.svg) | [View](town-mature-390-dark.svg) | [View](town-mature-1280-light.svg) | [View](town-mature-1280-dark.svg) | [Light](town-mature-320-light.svg) / [Dark](town-mature-320-dark.svg) | [Light](town-mature-390-light-text200.svg) / [Dark](town-mature-390-dark-text200.svg) |
| Current week | [View](world-current-390-light.svg) | [View](world-current-390-dark.svg) | [View](world-current-1280-light.svg) | [View](world-current-1280-dark.svg) | [Light](world-current-320-light.svg) / [Dark](world-current-320-dark.svg) | [Light](world-current-390-light-text200.svg) / [Dark](world-current-390-dark-text200.svg) |
| Selected memory | [View](world-memory-390-light.svg) | [View](world-memory-390-dark.svg) | [View](world-memory-1280-light.svg) | [View](world-memory-1280-dark.svg) | [Light](world-memory-320-light.svg) / [Dark](world-memory-320-dark.svg) | [Light](world-memory-390-light-text200.svg) / [Dark](world-memory-390-dark-text200.svg) |
| Empty atlas | [View](pixels-empty-390-light.svg) | [View](pixels-empty-390-dark.svg) | [View](pixels-empty-1280-light.svg) | [View](pixels-empty-1280-dark.svg) | [Light](pixels-empty-320-light.svg) / [Dark](pixels-empty-320-dark.svg) | [Light](pixels-empty-390-light-text200.svg) / [Dark](pixels-empty-390-dark-text200.svg) |
| Partial atlas | [View](pixels-partial-390-light.svg) | [View](pixels-partial-390-dark.svg) | [View](pixels-partial-1280-light.svg) | [View](pixels-partial-1280-dark.svg) | [Light](pixels-partial-320-light.svg) / [Dark](pixels-partial-320-dark.svg) | [Light](pixels-partial-390-light-text200.svg) / [Dark](pixels-partial-390-dark-text200.svg) |
| Hall | [View](hall-390-light.svg) | [View](hall-390-dark.svg) | [View](hall-1280-light.svg) | [View](hall-1280-dark.svg) | [Light](hall-320-light.svg) / [Dark](hall-320-dark.svg) | [Light](hall-390-light-text200.svg) / [Dark](hall-390-dark-text200.svg) |

Phone Pixels shows an eight-week window into the existing calendar, with weekday
references and a selected-date panel. Production must keep month/date/legend
discoverable while scrolling; this study does not authorize changing UX-05's
calendar geometry. At 320px or enlarged text, the equivalent dated table is the
initial treatment when seven 44px targets cannot fit. Desktop's small cells still
need keyboard/grid navigation and an equivalent list; a small painted square is
not by itself an adequate touch target.

## Art source and provenance

[Catalog sheet](catalog.svg): original authored vector studies created for this
repository, with no external images, fonts, sounds or copied character art.
The reference is the repository's existing local Town/World sprite vocabulary
and [shared design guide](../../../docs/DESIGN_GUIDE.md). No third-party art
license or remote asset dependency is introduced. Existing repository asset
licenses remain unchanged. These studies are not a completed replacement catalog.

All sprites use a **96×96 logical box**, ground baseline **y=94**, nominal base
plane **y=88**, and axis-aligned integer coordinates. Structural steps use a 2px
grid; major walls/roof steps generally use 4px multiples. SVG paths remain editable.
Map scale may change; readable DOM labels and 44px controls must not scale down
with the scenery. Building stage variants must change silhouettes using each
building's own authoritative stage. The mature composition is a placement study,
not evidence that all final stage variants are drawn.

Sea, inhabited ground and foreground plants form three restrained planes.
Chalk paths connect entrances; library books, inn luggage and garden trellis
give each structure a readable purpose. Interface text uses shared warm ink/paper
and teal; the coastal palette belongs to scene art. No perpetual motion is
required. A selected target has a boundary and a corresponding named inspector.

The embedded sprite groups are study copies for self-contained review images.
PLACE-04 must reuse/refine the existing production assets and adopt one catalog;
it must not ship these study copies alongside a competing production catalog.
