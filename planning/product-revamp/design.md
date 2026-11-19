# Selected product design

Owner decisions: 2026-11-17. Design and issue planning only; implementation is future
work. This document settles the earlier discovery alternatives. The queue and exact
issue packets own delivery scope. Deployment-specific connector access is established
by its named discovery issue before dependent implementation is claimed ready.

Review the original [Town composition](design/town-overview.svg),
[Hub layout](design/compact-hub.svg) and [Treasury interior](design/treasury-room.svg).
These are conceptual design sheets, not implemented screens or final art approval.

## Experience and navigation

The workspace opens at `/hub`, a compact practical dashboard. Town is a playful,
useful destination reached in one action. Finance, Media, Travel, Health, Pixels and
Town retain direct links; selecting a building or object enters the corresponding
room or canonical record without moving an avatar. No character movement, collision
simulation or platformer controls are part of this design.

Town uses a **2.5D isometric diorama**: orthographic three-quarter rooms, visible
wall thickness, layered objects, short cast shadows, warm lights and composed
foreground/background details. Screen-space UI remains flat and readable. Floor
coordinates are normalized to a bounded room grid; selection uses the displayed
object bounds rather than a second set of footprints. Occluding foreground decor
fades while inspecting an object. Roof/wall cutaways reveal the selected room.

Use original stylized sprite/vector assets in an authored coastal palette: warm
paper/ivory interfaces, deep navy ink, sea-glass teal, coral highlights, brass and
weathered wood. Dark mode is a lamplit night variant with the same silhouettes and
contrast, not a blanket inversion. Pixel texture belongs on art, not small body text.
System body typography, tabular financial numbers, 44px targets and visible focus
remain mandatory. Motion accents are short and event-driven; reduce-motion uses
static light/color changes. Audio is off initially and starts only after a gesture.

The rendering plan extends existing Angular/DOM/SVG/sprite owners. No new general
game engine or frontend rewrite is selected. Each asset records intrinsic size,
anchor, visible/pick bounds, layer, palette variants, license/source and motion states.
Rooms load on entry. No continuous animation runs in hidden rooms or background tabs.

Desktop Town has a composed overview, district shortcuts, zoom/pan, building labels
on focus/selection and a compact Today drawer. Phone opens a district composition
with a building picker and deliberate pan; double-tap is not required. Selecting a
building opens its room; selecting an object opens a side inspector on desktop and
a sheet on phone. A full editor opens in the app-owned route when necessary, with
room/date/selection restored on return. Keyboard users get the same object list,
inspection and actions. Functional rooms are accessible before any habit is logged.

The suite shell has a single current-place breadcrumb and app/destination switcher.
Every frequent unlocked app destination is one navigation action from that app;
cross-app destinations take at most two. Route, date, collection, pagination and
scroll survive Back, explicit return, unlock and settings. The Hub never autoplays
a large scene or expands a game achievement over an urgent practical task.

## Compact Hub

Above the fold: date/greeting, Quick add, the next three actionable agenda entries,
and six compact destination tiles. Destination tiles cover Finance, Travel, Media,
Health, Pixels and Town. Below: one next-trip card, one continue-Media card and a
collapsed Finance summary. Existing agenda/feed/search/quick-add behavior is reused.
Phone uses a two-column tile grid and sequential agenda; desktop uses a two-column
content layout. Town's small static preview is optional and links to the live Town.
Pinning a destination is supported without making configuration necessary.

Quick add offers the existing transaction/trip/Media editors and, when shipped,
workout/measurement entry. Each opens the sole authoritative editor. Search retains
unlocked private Finance results locally and links exact records. The shell stays
useful when a source fails. Sign-in, account and connector settings receive the same
art language as the applications; the public portfolio is outside this amendment.

## Town districts and room/object inventory

| District/building | Rooms | Selectable objects and resulting actions |
| --- | --- | --- |
| Residential / Home | Living room, study, bedroom and courtyard | Furniture opens placement/edit; frame opens a linked photo; shelf opens a saved Media item; desk opens a dated note; garden objects respond to authored interactions |
| Civic / Treasury | Accounts hall, holdings gallery, cashflow office, planning study | Account drawers open balances/debts; holding plaques open positions; ledger opens filtered activity; bill calendar opens commitments; models open existing planning tools |
| Harbor / Terminal | Booking hall, itinerary table, map room, souvenir gallery | Flight board opens transport; desk starts flight-first capture; table opens trip/day; map selects a saved destination; PTO desk opens allocation; postcard opens an actual trip and its dated memories |
| Culture / Theater | Lobby, movie auditorium, series lounge | Posters open canonical films; screening board opens watched/want collections; episode board opens series/next episode; ticket keepsake opens recorded completion/date |
| Culture / Library | Reading hall, current/read/to-read stacks, upstairs study | Book spines open the canonical book; reading desk edits progress; shelf signs choose a collection; study opens preserved concepts and linked Obsidian knowledge |
| Culture / Music bar | Artist wall, record room, song stage | Artist portrait opens artist grouping; records open saved albums; songbook opens songs; stage runs the original rhythm minigame or opens a chosen external music link |
| Culture / Arcade | Game collection, memory table, rhythm cabinet, workshop | Game box opens tracked Media game; tables start the two minigames; workshop opens cosmetic catalog/quests, with no extra Media save created |
| Wellness / Gym | Session floor, routine desk, progress mezzanine, trophy cabinet | Exercise station edits a session exercise/set; routine desk starts from a routine; progress board charts history/bests; cabinet explains existing badges and new game-only medals separately |
| Wellness / Clinic | Reception, vitals room, lab archive, checkup room | Metric station opens measurement history/entry; lab folder opens grouped results/ranges; appointment book opens checkups; units toggle changes display only |
| Civic / Hall | Progress hall, noticeboard, appearance desk, reflection study | Rules show authoritative XP/caps; noticeboard opens optional quests; desk previews seasons/audio; review desk opens the sole encrypted weekly editor or an explicitly linked external note |

The photo gallery is a room in Home/Terminal, and the observatory/study is upstairs
in Library. Neither becomes another top-level app. Residents move between authored
spots as ambience; interaction never requires catching them at a particular hour.
The six existing habit lots remain selectable garden/courtyard features with their
canonical unlock levels, styles and stages. Their presentation changes; their
check-in, cadence, archive, history and progression rules remain authoritative.

Every room has: an authored establishing composition, at least three purposeful
objects, a useful primary action, object-specific information and an explicit exit.
Room issues provide real data/actions; no room is accepted as a decorative link hub.
Data-heavy editors remain legible panels carrying the room's style.

## Practical app behavior

**Finance.** Holdings becomes a first-class destination. Compact totals/date status
and one primary action precede actual positions; the first position is visible at
390×844 and 1280×800 with representative data. Secondary import/export/refresh
actions are organized locally. Accounts, Activity, Bills, Pay, Planning and Imports
each receive one clear destination and the same density review. All existing math,
source uncertainty, posted/projected meanings, recovery and import guarantees stay.
Treasury objects open these same workflows, not a Town ledger.

**Media.** Visible Movies/Series/Books/Music/Games categories replace default mixed
library navigation. Music defaults to artists with saved children; Albums and Songs
are deliberate alternate views. Album-first saves appear under credited artists
without silently following the artist. Compilations/unknown credits have labeled
groups. A saved item appears once per collection context; alternate paths resolve
the same entry. Incompatible type/status filters normalize visibly. Detail Back
restores collection/filters/expanded artist/page/scroll. Saved reads stay DB-only;
discovery/refresh is explicit. Now and Calendar retain existing continuation and
episode/date behavior under coherent theatrical/shelf/record styling.

**Travel.** New trip starts with Flight/date, Calendar booking import or Manual.
Flight lookup proposes a leg and source/timezone-labeled fields. A published
schedule with no airport timezone stays unlabeled. A draft may have
one known leg and no guessed return. After preview, choose an existing trip or
create a draft, add return/destination and confirm dates/PTO. Advanced schedules,
operational updates and historical reads use the [TUX-02 adapter
contract](../implementation/issues/TUX-02.md) and one bounded
request budget. Calendar import accepts supported flight VEVENTs with preview and
dedupe; arbitrary email/document parsing is outside this release. Trip detail is a
styled local-time itinerary with contextual add/edit, maps/text fallback and memories.
Costs display planned/booked lines and posted Finance spend separately. A user can
explicitly associate a cost with Finance transactions; linked display reconciles
rather than adding both as if they were separate payments. No automatic ledger write.

**Pixels.** Year and Life remain orientable numerical views with unchanged scoring.
A selected day opens named records, trip context, photos and dated notes, with
per-source coverage/locked/unavailable state and exact source links. Photo/note
counts do not alter existing activity scores. A full day route preserves originating
view/span/filter/scroll on return. Large photo days page thumbnails; no full originals
download on a year grid. Missing data makes no claim about the quality of that day.

## Gym: sessions and PRs together

The existing Health store remains the private owner. Add encrypted workout records
using the existing vault policy/recovery path, not a plaintext Health API. One
workout collection holds versioned exercise definitions, routine templates and
sessions; kinds are explicit and share no duplicate PR ledger. Collection/schema
limits are validated against the current vault envelope before registration.

Session fields: stable client ID, civil date, immutable logged timestamp, state
draft/completed, optional duration/note, ordered exercises and stable set IDs. An
exercise uses an existing/static or custom definition with type load-reps,
bodyweight-reps, assisted-reps, time-distance or time-only. Sets record type
warmup/work/drop, canonical load/reps/time/distance as relevant, completed flag and
optional effort. Canonical units are kg/metres/seconds; display preferences never
rewrite values. Bounds: 32 exercises/session, 20 sets/exercise, 32KiB serialized
record, 200 custom exercise definitions. Reject oversized records without losing
the editable draft. No superset scheduler or wearable sync is included.

Start blank, from a saved routine or from a previous completed session. A routine
copies planned exercise/set structure into an independent draft; edits never rewrite
history. Referenced custom definitions and routines are archived instead of erased;
sessions retain their exercise kind/unit interpretation when a definition is renamed
or archived. Start/end rest timer is local and optional; no background notifications.
Save draft explicitly, resume after unlock, complete when chosen. Edit/delete a
session with revision conflict recovery and clear confirmation. Partial completion
is explicit, never filled with invented sets.

Progress combines supported manual PRs and completed session sets in one derived
Health projection. It records source references, exercise/date/type, computes best
set/e1RM/pace where meaningful and never materializes duplicate manual PR rows.
Deleting a best reveals the previous valid result. Uncompleted/warmup sets do not
become automatic PRs. Legacy manual PRs retain their original shape/dates and remain
editable; matching an imported/legacy PR to a session is explicit rather than guessed.
All twenty existing badges retain IDs/thresholds and settled names. Game medals
are displayed separately and never claim a medical or athletic achievement.

Clinic initially completes the existing six kinds: weight, resting HR, blood
pressure, sleep, labs and checkups. Latest/date, 12-point history/sparklines with
text alternatives, 100-per-kind initial windows and Show more remain. New arbitrary
metric kinds require later owner selection. Exterior stages never expose private
values; entering Gym/Clinic unlocks the private room content with return preserved.

## Decoration and catalog

Home has four authored rooms. Floor placement uses a 12×12 grid; walls use named
attachment slots. Cap 64 placed objects per room, 16 wall objects, 128KiB total
owner layout split into room-sized records of at most 16KiB. Persist catalog ID,
instance ID, position/anchor, allowed quarter-turn orientation and palette variant.
Doorways and primary interaction objects cannot be obstructed; overlapping decor
requires a declared stackable surface. Exterior has fixed functional entrances and
bounded cosmetic anchors; decorative growth never blocks a practical room.

Flow: inventory → select → preview valid/invalid footprint → rotate/recolor when
supported → Save/Cancel. Pointer drag is optional; selecting a cell works on phone
and keyboard. Undo reverts the latest confirmed layout revision through the same
write path; Reset has a preview and confirmation. On conflict, keep the local draft,
load the current room and offer reapply/cancel; never force-overwrite another device.
Corrupt/unknown items are preserved and reported, not silently deleted.

Starter items are free: oak seat, low table, woven rug, bookshelf, desk, desk lamp,
fern, floor lantern, plain frame, record stand, bed and planter. Purchased unlocks:
shell stool/5, brass sconce/5, paper screen/5, coral cushion/5, tile fountain/10,
reading chair/10, globe/10, hanging ivy/10, glass cabinet/20, skylight panel/20,
model ferry/20 and moon clock/20 Stamps. Unlocks allow repeat placement within caps.
Asset variants are appearances, never new facts. Preserve the existing nine
milestone options separately under their three canonical eligibility identities.

Private photo/note/record references in frames are stored through the vault in a
separate decoration-binding record; public layout stores an opaque frame instance
only. Lock shows neutral artwork and clears titles/thumbnails/excerpts. Removing
a frame never deletes its source; missing/deleted source shows an honest empty frame.

## Game systems and exact economy

All discussed systems are selected: decorating, earned furniture, characters and
relationships, optional quests, discoveries, minigames, progression, collectibles
and a cosmetic economy. Practical functions and starter decoration are never gated.
Existing Town XP, habit streaks, Treasury budget weeks and Health badges keep their
rules. No new universal life XP, rewards for spending money, decay or missed-day loss.

**Stamps** are a game-only, nontransferable cosmetic currency. Start at zero. First
meeting of each of six residents grants 2 once; each of six chapter quests grants
10 once; first completed win in each of two minigames grants 5 per Town civil day
(maximum 10/day). Later plays remain playable with scores and no extra Stamps.
No purchased currency, random loot or notifications are needed. A ledger keyed by
owner and stable reward identity makes grants/purchases idempotent. Concurrent
purchases cannot overspend. Prices above are fixed and visible before confirmation.

Inventory represents unlock entitlements, not competing quantities of the same
catalog item. A full-price refund is allowed only when no active layout uses that
unlock; check and refund atomically. A duplicate retry returns the same receipt.
Game grants are based only on game-state actions. No private financial/health
proof is sent to earn Stamps. Data corrections retract derived keepsakes/stages but
cannot mint currency. Existing milestone eligibility hides ineligible ornaments
while retaining the selected variant for restoration.

**Chapters**, optional with no deadline, form a six-part Town journal:

| Chapter | Three explicit steps | Reward |
| --- | --- | --- |
| Make a home | Enter Home; place a starter item; save layout | 10 Stamps + paper-house postcard |
| Find your shelves | Meet librarian; inspect a sample or saved item; choose a shelf display | 10 + library seal |
| Across the harbor | Meet travel keeper; inspect map or a saved trip; ring the model ferry bell | 10 + harbor postcard |
| A place to play | Visit Arcade; finish either game; inspect its score/medal | 10 + arcade pennant |
| Light the square | Meet treasurer; inspect the public rules board; place a lantern | 10 + brass civic seal |
| Your own little world | Meet all residents; customize two rooms; inspect a chosen memory or a clearly labeled sample | 10 + night-sky print |

Sample objects let empty/locked accounts enjoy the chapters. Samples are labeled
and never create library/trip/Health records. Each quest step records a specific
game action, not inferred real-life completion. Chapter rewards have stable IDs;
repeat interaction/back/reload cannot grant again.

**Residents:** Mara (library), Ada (Treasury), Imani (terminal), Jun (Gym), Wren
(music/arcade) and Sol (Hall/study). Each has five one-time authored conversations:
welcome, how the place works, a creative preference, a short room activity and a
chapter reflection. Each first completed conversation grants one relationship rank,
0–5, with no decay; only the welcome grants the once-only meeting Stamps. Replies
express taste and never grade life performance. Conversations are always reachable
from a resident directory even if their ambient sprite is elsewhere. No chat model
or real-world social graph is introduced.

**Discoveries:** twelve named hotspots across districts, each with one authored
interaction and journal stamp, no currency. Includes tidepool shells, ferry bell,
library globe, theater light booth, music mural, Gym chalkboard, Clinic garden,
Hall sundial, courtyard birdbath, lantern alley, rooftop telescope and arcade sign.
Discovery list names found places and gives optional location hints; no timed expiry.

**Minigames:** Memory Shelves uses six symbol pairs, flip-two turns and a seeded
layout; finish by matching all pairs, with move count and optional elapsed time.
Harbor Rhythm uses a 30-second original four-lane pattern, tap/keyboard controls,
accuracy score and an untimed sequence mode under reduced-motion/access preference.
Both permit pause/quit/restart, sound-off and touch/keyboard play. A small validated
play-session receipt grants the capped reward once; replays never duplicate it.
Untimed mode earns the same completion reward. Scores/medals are game data, not
Media membership or exercise measurements.

## Source connections and World retirement

Immich is read-only source authority for photos. Use bounded selected-day metadata
and thumbnails, eligible owner timeline assets only, explicit archive/partner options
and no hidden/locked/trash inclusion by accident. Credentials/reachability/version
are established in the connector survey. Cached thumbnails are owner scoped and
clear under the selected disconnect/lock policy; no original photo warehouse.

Obsidian remains note authority. Support exact note links and a read-only selected
vault bridge/export for dated title/excerpt projection. The deployed app cannot
assume access to a laptop filesystem. The survey chooses reachable HTTPS bridge,
mounted read-only export or browser import based on the actual setup and records
version/permission evidence. Excerpts and credentials use existing vault protection;
no plaintext note warehouse or second general note editor. Configured daily-note
path/frontmatter date governs date mapping, never modification time.

Existing World concepts move to the Library study, retaining IDs, note/source,
understood date and correction/archive behavior. Existing source inspectors and
dated history move into Pixels/Town rooms; terrain/scenery enriches Town. Legacy
`/town/world?day=` redirects to the exact day in Pixels with Town return context;
legacy `week=` selects that week's Monday. Remove the standalone World renderer/
controller/routes only after these users and records have migrated. Do not edit
applied migrations or discard source normalization still used by new consumers.

The existing encrypted weekly reflection remains a single Hall-owned editor and
Hub link. A week may also hold an explicit Obsidian reference, without automatic
copy/write-back. Reflecting earns no Town XP or Stamps. This preserves the existing
review promise while leaving Obsidian the general thought/knowledge system.

## Acceptance and delivery

Every leaf is one complete small responsibility with real UI/data/error behavior,
one PR, named deletion/compatibility proof and exact local profiles. Backend-only
leaves must expose a complete tested domain contract used by a named following
consumer; no generic unused foundation work. Visual leaves include selected/focus,
empty/loading/locked/error as relevant, both themes and 390/1280 review.

Measure pending feedback within 100ms, no blocked practical input during effects,
and preserve existing frame/query/bundle budgets until fresh baselines establish
explicit approved replacements. No hidden/offscreen animation or provider N+1.
All changed-source root gates run locally before PRs. Owner review judges style,
beauty, interaction and practical usefulness separately; tests do not prove fun.
World data migration, vault recovery, connector isolation and rollback have explicit
leaves. Release leaves prove integrated outcomes, not unspecified feature cleanup.
