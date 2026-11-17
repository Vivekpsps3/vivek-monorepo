# Practical applications and memory journeys

Detailed journeys following the [audit](audit.md). The [selected design](design.md)
settles the earlier alternatives: direct-selection 2.5D scenes, all game systems,
complete workouts plus PRs, and compact Hub arrival. The [small issue map](issues.md)
and exact packets divide delivery. Application changes below remain planned outcomes,
not implemented fixes; connector deployment specifics belong to their survey leaves.

## Navigation and interaction across the suite

Build an inventory of every route, nested tab, modal and common action. For each,
record the actual starting state, action count, scrolling before the first useful
record, exit/return behavior, direct URL and phone/desktop differences. Distinguish
authentication/unlock from unnecessary navigation; do not hide required security
steps to improve a click metric.

Proposed navigation budget: from an already-open unlocked app, frequent destinations
such as Holdings, a selected Media category and upcoming trips are one direct
navigation action away. From anywhere in the suite, direct app/destination access
should take at most two actions. Check these targets with layouts before adopting
them as final acceptance. Pin/favorite destinations are optional; the default
navigation must be understandable without configuration or keyboard shortcuts.

Retain one consistent suite switcher and current-place label. Desktop can expose
persistent grouped destinations; phone needs a deliberate section picker or short
visible primary list with a clearly named overflow. Avoid nested horizontal bars
that require remembering a hidden fifth destination. Preserve query/date/scroll
on return, including after unlock and settings. Define behavior for browser Back,
explicit Back to collection, direct refresh and a link opened in another tab.

Every screen needs an obvious primary action, local secondary actions, a sensible
empty-state invitation and legible success/error feedback. Destructive actions keep
the domain's appropriate confirmation/Undo; imported financial replacement and
permanent Health deletion are not equivalent operations.

## Finance

Keep the existing encrypted record store, calculation/import engine, recovery,
revision semantics and useful functionality. The revamp concerns organization,
presentation and discoverability; removing a wrapper must not remove its feature.

| Surface | Proposed experience | Required actions/details and acceptance |
| --- | --- | --- |
| Home | Compact financial picture and direct destinations in the Treasury style | Current net worth and this month's cashflow; clear posted/projected distinction; direct Holdings/Activity/Bills/Planning; useful first-time setup without displacing real records |
| Holdings | A first-class destination with compact totals and positions immediately visible | Search/filter by account/symbol; sort/group; add/edit/delete; refresh per/all; source and quote/position dates; unknown basis/unvalued positions; Fidelity preview/resume/export preserved |
| Assets and debts | Clear account-based view with understandable net-worth relationship | Add/edit/remove correct record; distinguish debt and card activity; retain account date/source; no duplicate cash or investment count |
| Activity | One ledger with deliberate spending/income/all views | Search, date/range/account/category/trip filters; row details; correction/Undo; CSV/import receipts; direct selection of a date from Pixels/Travel |
| Bills and subscriptions | Due-date overview and one understandable recurring commitment list | Distinguish fixed bill/subscription without making users hunt separate editors; upcoming/overdue/autopay states; preserve each type's real fields and timing |
| Pay and compensation | Pay sources and history with a clear relationship to recorded income | Jobs, schedules, compensation, share sales, estimates and overlap adjustment remain explicit; changing a forecast never silently edits posted activity |
| Planning | A visible tool index and deep links to the chosen tool | Retirement/simulation, savings goal, debt payoff, portfolio projection and stock research each have clear inputs/output; projections never look like actual results |
| Imports | Contextual entry plus a discoverable import history/recovery surface | Bank/brokerage flows retain preview, dedupe, provenance, staging, partial failures, receipts and Undo guarantees; no duplicate competing import engine |
| Finance settings/security | Clear data/recovery/lock actions in the shared settings structure | Return to originating task; lock clears every plaintext Finance/Health view; reset scope stays explicit |

Reduce vertical chrome: combine redundant headings, compact summary/date labels,
move rare export/import controls into a clearly named local action menu where
appropriate, and use disclosure for detailed basis/provenance. Keep uncertainty
warnings adjacent to affected values rather than deleting them to save space.
Proposed acceptance: on a representative populated Holdings screen at both audited
sizes, the first position and its main value are visible without scrolling. Verify
the same principle on Activity, bills and pay rather than hard-coding one layout.

Cover all imports, large accounts, unknown prices, stale quotes, losses, zero values,
long names, malformed records, slow refresh, conflict, interrupted import and recovery.
Home/holdings/planning charts need values/table alternatives and a consistent style.

## Media

### Organization and hierarchy

Expose Movies, Series, Books, Music and Games visibly. Compare category routes with
URL-backed category navigation; keep old kind links working. Keep a deliberate Now
view for continuing something and upcoming releases, rather than using one mixed
grid as the only home for the collection.

Music defaults to an artist-centered presentation with saved albums/songs grouped
under their credited artists. Preserve an explicit Albums and Songs view for users
who want it. One membership appears once per selected collection context; the same
canonical item can be reached through other contexts without looking like two saves.
Group album-first saves even when the artist is not explicitly followed. Do not
silently mark an artist followed or its entire discography saved. Multi-artist
albums, compilations and unidentified/manual credits need deliberate fallback groups.

| Journey | Required behavior |
| --- | --- |
| Save an artist | Following is explicit; catalog browsing is separate from library membership; existing saved children appear in the artist collection |
| Save an album first | Resolve known artist/release-group identity; group the album in the artist context without adding a fake follow; unresolved credits remain usable |
| Save a song first | Distinguish standalone song membership from known album relationships; do not auto-save unknown tracks or albums |
| Save from discography | Show Saved/Save consistently and navigate to the same item; repeat save is idempotent for that provider identity |
| Choose a release/edition | Distinguish album work/release group from a pressing; preserve notes/rating; do not merge by similar title |
| Unfollow/remove an artist | Preserve independently saved albums/songs; explain the affected action before applying it |
| Find a real duplicate | Compare canonical source identities and personal fields; propose a reviewed merge only when equivalence is established; preserve conflicts/provenance |

### Type-specific presentation

- Movies: poster shelves, watched/want/in-progress organization, selected rating,
  personal note and actual viewing date when present. A completion date is not
  necessarily a complete viewing history; rewatch scope requires a new decision.
- Series: seasons/episodes, next available episode, aired vs future/unknown dates,
  caught-up state distinct from ended/canceled lifecycle; existing next-episode and
  Undo behavior accessible from both room and direct view.
- Books: covers/spines, author, read/current/to-read shelves, page/progress editing,
  completion and notes. Author collections require actual identity or clearly
  labeled grouping; no invented bibliographic relationship.
- Music: artist wall, album artwork and track rows with coherent local hierarchy;
  song/album ratings do not overwrite artist ratings. Display groups and saved
  membership counts must agree with the chosen collection context.
- Games: recognizable box/cabinet presentation and owned progress/status controls;
  distinguish played/completed/want using existing supported meanings.

Search, Add manually and Save from search should form one coherent capture journey
with the chosen type retained. Show provider coverage, pending metadata and retry
without requiring a second manual save. Normal saved reads remain database-only;
refresh/discovery is explicit. Type-specific empty states teach the relevant action.

Detail pages put the work, personal progress/rating/note and primary action ahead of
metadata maintenance. Preserve explicit save, dirty drafts, version conflicts,
owner isolation and recovery. Back to collection returns to the actual category,
search/filter, expanded artist, pagination and scroll. Changing type normalizes
incompatible status filters; Books cannot silently remain filtered to Following.

Acceptance uses album-first/artist-first/song-first fixtures, same-title distinct
works, collaboration/compilation, missing art, hundreds of saves, network/provider
outage, unsaved edits, repeated saves and source identity repair. The reproduced
one-record/two-card case must be resolved through grouping, not deletion of data.

## Travel

### Capture with less typing

Offer clear entry choices: **Flight number and date**, **Booking/import** if selected,
and **Plan manually**. Flight-first starts before manually entering a complete trip.
Lookup proposes origin/destination, local dates/times, zones, airline and available
schedule detail. Show ambiguous candidates for explicit choice. Ask whether the
leg belongs to a new trip or an existing one; propose a destination rather than
treating an arrival airport as the final city or lodging.

Review inferred trip boundaries, add return/connection legs, and confirm before
save. One outbound flight cannot establish return date, duration, lodging or PTO.
Keep an incomplete draft without manufacturing those facts. Decide how a draft
maps to current required trip fields before authorizing a schema change.

Advance schedule lookup, near-departure updates and historical recovery are distinct
capabilities. Specify date coverage, source, confidence/freshness, fees/configuration,
timeouts and manual fallback for each. See [flight discovery](connections.md).

Booking capture candidates: paste a confirmation, upload/select an `.ics` calendar
file, or choose a supported booking source. Decide scope before designing parser
infrastructure. Show extracted fields with provenance, let the owner correct them,
and deduplicate by reliable booking/leg identity. No email-account integration or
arbitrary uploaded-document storage is assumed by this proposal.

### Trip experience

| Surface | Proposed experience and acceptance |
| --- | --- |
| Trips home | Illustrated destination cards/postcards with date/status and one useful next action; upcoming and past deliberately organized; PTO summary does not overwhelm trips |
| Trip detail | A coherent itinerary/timeline with local transport times, lodging, activities, notes, reminders and costs; map plus equivalent place list; compact phone priorities |
| Itinerary capture | Contextual Add for the selected day; sensible reused locations/currencies/time zones; no retyping the whole trip to add one row; save errors retain drafts |
| Destination/lodging | Distinguish destination city, airport and accommodation; explicit place selection; useful text when map/geocoding is unavailable |
| Flight cards | Scheduled/estimated/actual separately labeled; codeshares and overnight/date-line legs legible; explicit user overrides survive refresh |
| PTO | Existing exact server math, day allocations and overlap warnings; planning context attached to the relevant trip; editing dates preserves intersecting choices |
| Costs | Separate planned/booked costs and actual Finance activity, per currency; link/reconcile them only under an explicit matching model |
| Calendar | Saved date source and date span retained; direct opening of trip/day; source failures do not remove usable saved itinerary |
| Memories | Past trip opens dated Immich photos and Obsidian notes, map and real itinerary; absent photos do not make the trip incomplete |

Styling should continue through editors and timelines: passport/ticket/terminal
motifs with readable forms and dates, not only a destination cover image. Required
cases include future planning beyond two days, multi-city/connection/overnight,
no provider key, timezone/date line, API throttling, schedule change, offline saved
read, draft recovery, double-submit retry, deletion/Undo and multi-currency trips.

## Pixels

Keep Year and Life orientations, calendar accuracy and accessible table equivalents.
Expand a day from score/counts into a dated memory view. Proposed day contents:
Immich thumbnails, Obsidian daily/dated notes, named completed/consumed Media where
dates exist, trip/day/place, habit entries, and optional private Health/Finance
sections after unlock. A photo is evidence of its capture date, not a habit score.
Do not increase existing activity levels merely because a connector returned more
files unless the owner explicitly selects and specifies new scoring.

Provide compact preview and a fuller day view; compare an expandable panel with a
dedicated date route before settling navigation. Date scrub, previous/next day,
month/year and source filters need phone and desktop storyboards. A photo opens
its original; a note opens its exact Obsidian path; a record opens its canonical
editor. Return preserves date, year/life range, filters, selected item and scroll.

Use a neutral “nothing linked/recorded here” state and keep connector availability
separate from empty history. Support a day with hundreds of photos through bounded
paging and progressive thumbnails. Photo visibility, capture timezone and note-date
mapping belong to the [connection contract](connections.md). Existing birthday/age
privacy and distinct Sunday/ISO/Life spans remain explicit.

## Hub, search, settings and public pages

Hub's role depends on the arrival decision. Keep the useful merged agenda, source
summaries, quick add, shortcuts and calendar-feed management. If Town becomes home,
compare a compact planner reached from the Hall with retaining `/hub` as a direct
tool. Do not rebuild completed Hub work or duplicate agendas in every building.

Search should open actual destinations/records in the current style and retain
private Finance results only while unlocked. Existing search is a foundation;
reviving the previously canceled command-bar product is a separate decision.
Quick add routes to the same app-owned write operation as the building editor.

Settings should group appearance/game preferences, connector setup and existing
account/security/recovery controls understandably. Add capability checking,
last-success/failure, disconnect and return-to-draft for connectors. Prefer saved
appearance choices over per-app competing theme controls. Audio/motion/game effects
need their own user settings if selected.

The public portfolio was not identified as a problem in this conversation and was
not visually audited. Confirm whether “rest of the app” includes its art direction
before expanding scope to public pages. Identity/login/settings remain covered as
shared suite journeys. No public disclosure of private game/life data is proposed.

## Cross-suite acceptance inventory

Each future packet must name every relevant surface, including the analogous ones
outside the owner's initial example. At minimum: find/open, create, edit, remove/
Undo, search/filter/sort/page, import/refresh, direct URL, browser history, deep-link
unlock return, keyboard/focus, phone touch, rich/empty/partial source, failed save,
two-owner switch and delayed response after leave/lock. Verify the actual user
outcome, not just presence of a button or a passing screenshot.
