# Initial scene and ornament catalog

This is the bounded first catalog for PLACE-01 to render and PLACE-08/09 to
implement. Art review may amend its visuals before implementation; changing its
scope or eligibility requires a matching packet/leaf amendment. This is not a
promise of unlimited customization or an asset-production backlog outside the queue.

## Common asset contract

Retain the existing 96px Town sprite display convention and establish a common
logical grid/baseline in PLACE-01 studies. An asset declares catalog version,
stable ASCII ID (maximum 40 characters), logical bounds, baseline, compatible
anchor class, static frame, theme variants when necessary and attribution.
Ornaments use authored SVG sources and fixed variant IDs; never store arbitrary
SVG, path, URL, animation code or a user-entered title. Keep decorative art out of
the accessibility tree; its interactive anchor carries the useful name/state.

## Scene inventory

| Set | Initial content | Owner |
| --- | --- | --- |
| Place foundation | coastal sky/sea, inhabited ground, chalk path, garden fence, civic sign | PLACE-01 studies / PLACE-04 scene |
| Existing structures | Library, Inn, Treasury, forge/garden/cottage stages and locked/empty lots | reuse Town assets; PLACE-04 coherent placement and truthful stages |
| Private integrations | existing Clinic/Gym stage/locked sprites only | Health stage facade; no new private achievement ornament |
| Habit response | one growth/window/smoke response per style, plus static changed-state indicator | PLACE-05 |
| Media shelf | tome, reel, scroll, gem, each with consistent display pedestal/label | reuse World kind vocabulary; PLACE-10 |
| Travel shelf | small suitcase keepsake and illustrative destination token | PLACE-11; source data remains actual trip identity/span |
| Learning | existing beacon with clear inspectable state | PLACE-06/07; no learning XP |
| Residents | existing four identities, static pose plus minimal purposeful vignette variants | PLACE-12 |

The scene is composed before adding the remaining variants. Existing assets may
be retained or refined in place; avoid shipping both prototype and final catalogs.
Library/Inn shelves show at most three named keepsakes at once and a labelled
“More” action for a bounded paginated view. Multiple records of the same type
remain independently inspectable by source identity; decoration choice never
changes a record's meaning.

## Fixed placement anchors

Version 1 has twelve optional cosmetic anchors: four garden-edge anchors, four
path-edge anchors and four civic-frontage anchors. Exact positions are authored
against the reviewed scene and shared through the Town scene projection; IDs are
stable (`garden-0`–`garden-3`, `path-0`–`path-3`, `civic-0`–`civic-3`). Civic anchors
cannot cover entrances, lot targets or labels. All anchors are inspectable in the
list/keyboard arrangement view. None is a draggable collision surface.

Persist at most twelve occupied entries, one asset variant per anchor, with a
16KiB maximum JSON request body and explicit layout/catalog versions. Server
validation rejects extra fields, duplicate/unknown anchors, unsupported variants,
incompatible placements and newly placed ineligible assets. Eligibility uses
canonical public Town facts only. Supported previously saved but now ineligible
choices are preserved and represented as an empty unavailable anchor until facts
permit them again. The UI explains a failed restore/Undo caused by changed
eligibility rather than overwriting newer state.

## Milestone choice sets

Use existing thresholds, not newly tuned XP values. These are three stable
public milestone identities, each unlocking a choice of three ornaments:

| Milestone key | Eligibility from existing facts | Choice set |
| --- | --- | --- |
| `habit-level-2` | at least one non-archived occupied habit reaches existing building level 2 | stepping stone, small planter, wooden lantern |
| `town-level-3` | Town reaches existing level 3 | wind vane, shell marker, path lamp |
| `town-level-5` | Town reaches existing level 5 | bench, bird bath, civic pennant |

A choice set grants one placed ornament instance; changing taste switches its
variant through the same layout editor and requires no new achievement. Each
milestone can occupy one compatible anchor. The server checks the uniqueness of
that milestone instance as well as placement structure. No purchasing, inventory
quantity, randomized rarity, scarce currency or reward-claim transaction exists.
Eligibility corrections/archive operations follow the existing public facts;
there is no inferred lifetime achievement ledger. Show upcoming eligibility
plainly, including why an archived habit no longer supplies an active milestone.

Do not persist milestone source habit IDs, private Health facts, budget status,
Media/Travel titles or review content. Keepsakes derived from source records live
on their bounded shelves, separately from these nine public cosmetic options.
