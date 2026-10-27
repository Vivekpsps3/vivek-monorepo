# Research, decisions, and open evidence

Sources checked 2026-10-25. These are implementation constraints and design references, not proof of the installed application's live behavior. Revalidate provider capabilities during implementation; do not assume today's documentation or a missing-key fallback covers every title/date.

## Engineering method

- [Fowler: YAGNI](https://martinfowler.com/bliki/Yagni.html): build present capabilities; refactoring and self-testing support change rather than violate YAGNI. Applied here by removing redundant active systems and avoiding future-plugin/schema/queue infrastructure.
- [Fowler: Monolith First](https://martinfowler.com/bliki/MonolithFirst.html): separate deployment has coordination cost. The repo already deploys one service, so this plan simplifies its internal composition rather than claiming a new distributed-to-monolith migration.
- [Agile Alliance: Extreme Programming](https://agilealliance.org/glossary/xp/): short testing/feedback cycles and simple design inform the one-branch iterative workflow.
- [XP rules reference](https://extremeprogrammingalliance.com/about-extreme-programming-xp/extreme-programming-xp-rules/): a secondary pointer to Don Wells's rules was readable; the original extremeprogramming.org endpoint returned 502 during this audit. Do not claim it was read successfully.

This plan is a detailed backlog of actual owner stories and observed problems, not an upfront mandate to build speculative platform features. Keep design decisions revisable by the architecture spike and early vertical feedback.

## Provider primary references

| Reference | Verified takeaway and plan use |
| --- | --- |
| [FlightAware developer portal](https://www.flightaware.com/aeroapi/portal/documentation) | Portal exists, but fetched output did not expose usable endpoint schemas. Repo's existing adapter is implementation evidence; verify the current endpoint/schema in the spike rather than treating portal HTML as full verification. |
| [FlightAware null-value guidance](https://support.flightaware.com/hc/en-us/articles/33161341318935-Why-Is-A-Frequently-Used-Endpoint-Returning-A-Null-Value) | Flight identity/availability can be limited by future horizon and code association. Explain no schedule match and keep manual entry; do not guarantee arbitrary future lookup. |
| [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) | Requires visible attribution, valid browser Referer, correct HTTPS endpoint and ordinary caching; public service is best effort and excludes bulk/offline prefetch. Existing same-origin referrer policy is a concrete compatibility concern. |
| [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) | Public endpoint has aggregate maximum 1 request/second, identifying agent, caching and switchability requirements; autocomplete is prohibited. Keep deliberate user lookup or choose a suitable alternate service. |
| [TVMaze API](https://www.tvmaze.com/api) | Multi-result show search supports user disambiguation and stable saved IDs; single search can choose unpredictably among identical names. Use chosen identity for later detail/episodes. |
| [TMDB search then detail](https://developer.themoviedb.org/docs/search-and-query-for-details) | Search chooses an ID; detail hydrates the chosen work. Supports separating transient suggestions from saved metadata. |
| [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) and [rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting) | Search, lookup and browse are distinct; stable entity IDs and meaningful user agent matter, and pacing is required. Coordinate search/detail/catalog requests. |
| [MediaWiki Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo) | Image metadata/URLs are available through a supported API. Candidate starting point for the user-selected portrait flow, including source metadata; licensing suitability must be validated per returned image. |

No new paid account was created, no provider key was read, and no live authenticated user data was accessed. A public request to vivekpanchagnula.com returned no extractable page content; live visual coherence remains a browser review task.

## Recorded decisions

| Decision | Adopted plan | Rationale / acceptance |
| --- | --- | --- |
| Product story | Public identity → shared workspace → focused tools → Hub | Removes competing site/app identity without mixing private and public data. |
| Frontend | One root Angular app/workspace with lazy app-owned features, subject to bounded evidence spike | Largest existing UI already Angular; remove custom router/renderer systems rather than add another framework. |
| Backend | One explicit FastAPI factory, engine/session/principal and active migration chain | Production topology already unified; remove compatibility scaffolding and import side effects. |
| Domain boundaries | Apps own behavior/data; composition imports only public entrypoints | Share infrastructure/presentation, not universal domain records. |
| Artist state | Following-only, independent rating/review | No meaningless artist-only listening or fake song progress. |
| Library semantics | Explicit membership only | Metadata existence and discography browsing never imply personal save. |
| Search persistence | Bounded transient query cache; durable saved detail/enrichment only | Matches owner preference and provider limits without permanent query history. |
| PTO | Date-level amounts/defaults, weekends zero, legacy unallocated mode preserved | Required granular control without inventing historical leave dates. |
| TV | Personal intent + derived aired progress + production lifecycle | Supports caught up while future seasons continue. |
| Design | Fluid, restrained glass with readable solid content and accessible fallbacks | Meets new direction while keeping useful dense data. |
| Delivery | One PR/image with small internal tested integration slices | Honors atomic review/release while retaining XP feedback. |

## Open questions resolved through evidence, not speculative frameworks

- [ ] Flight provider: current schedule horizon/codeshares and available credentials; select one viable provider path and document limits.
- [ ] Map: reproduce header/tile/library/geocoder failures independently under assembled server; confirm narrow referrer/Trusted Types solution with real map rendering.
- [ ] New trip: capture reported duplicate title/split visual symptom; source confirms field-role confusion and boundary mismatch, not literal duplicate title inputs.
- [ ] Music migration: inspect representative legacy score/manual rows in disposable fixtures; decide conflict mapping without assuming provider IDs always exist.
- [ ] PTO: test custom legacy allocations/overlap and record deterministic transition; do not block baseline date toggles on a holiday/payroll engine.
- [ ] Public SEO: inspect generated HTML and network chunks. Existing route config is not runtime proof of prerender.
- [ ] One-runtime spike: prove CSP/Leaflet/vault/session/SEO/deletion benefits. If it fails, revise the controlling architecture decision explicitly and keep one coherent final model.
- [ ] Optional features: half-day PTO, sophisticated image crop, background queues, user-configurable provider priorities and every imaginable music release category are not prerequisites. Add only a demonstrated present need; retain explicit baseline stories.

When product intent is already clear, agents choose ordinary implementation details and continue. Escalate only a material unresolved data interpretation or external account requirement; show a concrete proposed outcome and keep independent work moving.
