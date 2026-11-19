# Connections, dates and authoritative records

Connection contract supporting the [selected design](design.md) and
[application journeys](applications.md). The small connector-survey issues establish
installed versions and real hosting/reachability before their dependent adapters.
Source ownership and read-only intent are selected; actual owner credentials and
vault access are never assumed by this planning delivery.

## Ownership model

| Fact | Authority | Other experiences may do |
| --- | --- | --- |
| Balances, holdings, transactions, budgets and calculations | Finance's existing encrypted store/services | Render through approved browser APIs; use the same mutations; clear on lock |
| Trip itinerary, destinations, PTO and Travel cost lines | Travel's existing server/services | Open the actual trip/day; derive souvenirs; show a separately labeled spend projection |
| Media catalog identity and personal saves/progress/notes | Media's catalog and owner-scoped entries | Group and display the same canonical entry; update through Media |
| Measurements and existing PR history | Existing encrypted Health store | Show full private values only after unlock; publish only approved stages/counts to exterior Town |
| Habit checks and existing Town progression | Town server/clock | Render committed responses and derived stages; do not replay rewards from component mounts |
| Photo files, original metadata and album membership | Immich | Read selected metadata/thumbnails and keep stable source references; open originals |
| Personal notes, backlinks, people/place knowledge | Obsidian vault | Read an owner-selected projection and open the exact note; do not establish a competing note editor |
| Existing World concepts | Existing concepts storage until a selected migration | Present elsewhere, export or link deliberately; preserve name/note/source/understood date and IDs |
| Decorative layout and fictional play state | A separately specified app-owned cosmetic/game record | Store positions/choices and game-only outcomes; link facts by identity rather than copying their meaning |

Single source of truth means each fact has an explicit owner, not that every field
must be forced into one giant model. A cached projection is replaceable and has
source identity, freshness, eligibility and invalidation. Server-owned summaries
must not absorb decrypted Finance or Health values.

## Linking contract

Use stable source references, conceptually `{source, kind, id}` plus optional
occurrence/date and a resolvable destination. This is a proposed link shape, not
authorization for a universal record warehouse or event bus. Keep source-specific
fields and permission decisions in the source owner. Store a relation only when
needed by an actual selected feature.

Examples: an Immich asset displayed in a home frame; an Obsidian note explicitly
attached to a trip; a Finance transaction tagged to a Travel trip; a Media item
selected for a shelf. References survive a title rename. Missing/deleted/locked
sources get clear local states. Removing a frame or link never deletes the source.
Removing the source must not leave a false finished-trip/book display behind.

Editing through a room and the direct application changes the same record. Define
refresh/invalidation between mounted views and across tabs without inventing a
second store. Keep optimistic revisions, correction conflicts, Undo and owner
checks on the authoritative write path.

## Immich discovery and proposed flow

The owner already uses Immich. Its official docs describe date/time-frame search
and API keys with selectable permissions. These support a connector investigation;
they do not establish the owner's installed endpoint/version or remote reachability.
Sources: [searching](https://docs.immich.app/features/searching/),
[API-key setup](https://docs.immich.app/features/command-line-interface/).

1. Establish Immich server URL/version, whether it is reachable from the app/server
   and phone, whose account/assets are in scope, and whether selected albums or all
   eligible timeline assets should appear. Do not request the owner to paste a key
   into an issue or committed document.
2. Define the minimum read permissions and credential lifecycle. Compare a scoped
   authenticated server adapter with a browser/local bridge depending on deployment.
   Keep revocation, owner isolation and app recovery in the design.
3. Inspect the installed version's search/date and thumbnail/original-link contract.
   Query a bounded selected day/span and page through results. Decide date grouping
   explicitly: photo's original local capture date vs a user-selected timezone.
4. Render thumbnails in Pixels and selected rooms, preserving asset identity and
   original metadata. Open in Immich; selection for a display creates a reference,
   not a second full-resolution photo library.
5. Handle renamed/deleted assets, videos, missing capture dates, duplicates/stacks,
   huge days, pagination, thumbnails that fail and a disconnected home server.
   Cached titles/images clear on disconnect/owner change according to the selected
   privacy/cache policy.

Visibility needs a deliberate contract: archived, hidden, locked, trashed and
partner-shared assets are not interchangeable. Proposed default is the owner's
ordinary allowed timeline subset; make inclusion changes explicit. Immich docs
show that archived assets can still appear in searches and that partner sharing
does not include all metadata/features. A generic search call is insufficient as
a visibility policy. Sources: [FAQ](https://docs.immich.app/FAQ/),
[partner sharing](https://docs.immich.app/features/partner-sharing/),
[locked folder](https://docs.immich.app/features/locked-folder/).

Acceptance: correct source/civil date; pagination without duplicate assets;
unavailable differs from zero photos; excluded assets absent; no cross-owner reuse;
asset selection does not duplicate originals; a revoked key disables further reads;
return from Immich preserves the selected Pixels/Town context where the platform
allows it. Test fixtures are synthetic; a real connection requires separate evidence.

## Obsidian discovery and proposed flow

Obsidian remains the editor and knowledge authority. The official URI protocol can
open a vault/note, and Daily Notes defines a configurable date format/folder.
Neither feature makes local note contents readable by a remote web server.
Sources: [Obsidian URI](https://obsidian.md/help/uri),
[Daily notes](https://obsidian.md/help/Plugins/Daily%2Bnotes).

Start by identifying vault location, desktop/phone sync, daily-note naming/folder,
frontmatter conventions and whether excerpts may be cached outside the vault.
Compare these integration shapes before choosing one:

| Shape | Enables | Tradeoff to settle |
| --- | --- | --- |
| Link only | Open the exact existing note from a date/record | No in-app text/photos/graph read; missing notes cannot be reliably detected remotely |
| Owner-selected read bridge or export | Dated excerpts, titles, tags and explicit relation references | Requires an authorized way to make selected vault data available; sync/conflict/privacy design needed |
| Always-available sync/adapter | Rich dated views across devices | More operational and credential surface; choose only if it matches existing hosting/sync |

Proposed first content scope is daily-note titles/excerpts and explicitly dated
notes. Define date precedence: configured daily-note path, explicit date property,
or owner-assigned link. Filesystem modified time does not establish the date a
memory happened. A note may belong to several dates; an undated note stays undated.
Do not invent people/place connections from names in prose.

Preserve Markdown links and handle safe excerpts, embeds, attachments, wiki-links,
frontmatter, renamed/moved/deleted notes and unavailable vault access. Sanitize
rendered content. The connector does not write back or silently create notes when
opening a nonexistent date. A URI deep link is a navigation tool, not two-way sync.

Acceptance: a configured dated note appears on the intended civil date; rename or
missing-note state is explainable; exact path opens on supported devices; excluded
folders/frontmatter remain excluded; disconnect/owner change removes private
projections. A local-only vault has a useful disconnected state on phone.

## Flight lookup and travel capture

TUX-01 keeps FlightAware AeroAPI v4 and selects the contract on
[TUX-02](../implementation/issues/TUX-02.md). The app can configure an API key
for `https://aeroapi.flightaware.com/aeroapi`. It cannot select a sunset v2/v3
key, a tier, or another host. There is no scraper and no second provider.

A departure months ahead, while the schedules end stays within one calendar
year, uses `GET /schedules/{date_start}/{date_end}` with the airline and flight
number. A later exclusive end is unsupported. Near departure uses
`GET /flights/{ident}` from 10 days ago through the formable two-day window.
The UTC day exactly two days ahead uses schedules. Dates before 2011-01-01 are
unsupported. Older dates on or after that day use `GET /history/flights/{ident}`
when the account includes historical data. Personal tier excludes historical
flights. A missing key is external configuration. This discovery records no
production integration result.

Schedules can return a published timetable without `fa_flight_id`, airport
time zones, or estimated and actual times. The adapter leaves those null. One
lookup is one page (`max_pages=1`) inside the existing 20-second timeout, with
no response cache. Published fees and tier limits are in the TUX-02 contract.
Manual entry remains available. Official sources:
[AeroAPI capabilities](https://www.flightaware.com/commercial/aeroapi/),
[OpenAPI 4.17.1](https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml),
[future schedule identifiers](https://support.flightaware.com/hc/en-us/articles/33161341318935-Why-Is-A-Frequently-Used-Endpoint-Returning-A-Null-Value).

The end-to-end request has one declared budget; release database transaction
ownership before I/O. A retry must preserve chosen candidates and manual overrides.
No match, unsupported date range, missing key, rejected key, historical
entitlement, throttle, timeout and suite-session failure have distinct remedies. Preview shows provenance and fetch
time. User approval of inferred fields precedes saving a leg/trip.

Flight identity and occurrence matter: future schedules may not have the same
provider flight ID as operational data. Design matching for an airline/flight/date/
route occurrence and codeshares, without deduplicating unrelated legs by number
alone. Scheduled times can change; preserve user overrides and explain updates.

## Dates and cross-source memories

- Photo capture, trip's local civil dates, episode air dates, Media completion,
  habit day, note date and logged/modified timestamp remain separate fields.
- Select and document a grouping policy for Pixels; show original local times/zones
  when relevant. Midnight, DST, date-line travel and missing offsets need examples.
- Exact-date links carry a validated date and enough return context. Unlock and
  settings return to the chosen trip/day/category without losing the draft.
- A past-day view only displays available historical facts. Current holdings or
  body measurements cannot be reconstructed for an arbitrary day from today's state.
- Scores and rewards retain their existing semantics until explicitly amended;
  importing a photo/note does not award habit credit or mark a trip completed.

## Later map of places and people

Keep this as owner-described distant discovery. Obsidian properties/links and
Immich locations might provide optional references, but residence, relationship,
time span and a photo location represent different facts. Future design must choose
which facts the owner records, how they map, how uncertainty is shown and whether
the map lives in Travel, Pixels or Town. No people database or location-history
collector is selected in this planning exercise.
