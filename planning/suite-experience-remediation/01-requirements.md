# Requirements and traceability

The owner's wording is normalized here without dropping subtle distinctions. Task identifiers are defined in the [execution board](10-execution-board.md). Check a requirement only after implementation and recorded acceptance evidence; creating this plan does not complete a product requirement.

| ID | Owner requirement | Work packages | Acceptance outcome |
| --- | --- | --- | --- |
| R01 | Return to Hub consistently from Finance, Travel, and Media. | NAV-01, NAV-02 | One visible labeled Hub control in the persistent shell on every route and viewport. |
| R02 | Finance is closest to the desired Hub navigation but still needs improvement. | NAV-02, FIN-01 | Preserve direct access, improve placement and legibility, test scroll and mobile behavior. |
| R03 | New Travel trip split control is broken and looks bad. | TRV-01 | A clear Change city action creates predictable date segments without data loss or layout overflow. |
| R04 | Two trip-name inputs are confusing. | TRV-01 | Distinguish destination from the single optional trip title; one title editor only. |
| R05 | Flight number should automatically fill timings using FlightAware or similar. | TRV-03, API-01 | Valid number plus date triggers bounded lookup and previews local airport times in both creation and editing. |
| R06 | Clean explicit button to override flight details. | TRV-03 | Edit manually and Use flight schedule actions preserve deliberate edits and show provenance. |
| R07 | OpenStreetMap is broken. | TRV-04, API-01 | Production-like map renders and exposes geocoder, library, tile, and no-coordinate failures distinctly. |
| R08 | Choose whether each day counts as PTO. | TRV-02, DB-01 | Per-date choices are stored and update all projections, lists, and previews consistently. |
| R09 | Weekends should not count as PTO by default. | TRV-02 | Saturday and Sunday default to zero; day toggles and totals clearly reflect the policy. |
| R10 | Forms are unobvious. | UX-01, TRV-05, MED-02, FIN-01 | Visible field boundaries, labels, primary action, required state, and retained input on errors. |
| R11 | Getting there is too verbose; reveal it only when adding travel. | TRV-05 | An empty trip has a small Add transport action; role forms appear on demand. |
| R12 | Daily activities are too verbose; empty days should be quiet. | TRV-05 | Compact date strip and contextual Add activity; no full form per empty day. |
| R13 | Artist library presentation is inconsistent with other items. | MED-02 | Artist is the same card/row primitive, size, and interaction family as other items. |
| R14 | Saving an artist must not add/show all their albums and songs in the library. | MED-01, MED-02 | Library membership requires an explicit personal save; metadata availability never implies membership. |
| R15 | Optionally open an artist to browse the rest of their catalog. | MED-01, MED-02 | Separate Browse discography surface with Add/Saved actions and bounded loading. |
| R16 | Search and choose an artist profile picture. | MED-03, SRC-01 | Image search, previews, selection, persistence, attribution, fallback, and reset work per user. |
| R17 | Persist/cache saved library details; ordinary searches probably need no durable DB records. | SRC-01, SRC-03, DB-02 | Search is ephemeral by default; saved item detail persists independently of provider outages. |
| R18 | Artist has a subtle dropdown or expansion. | MED-02 | Collapsed by default; expands only the user's saved albums/songs, with count and accessible toggle. |
| R19 | Artist should not be Listening without a listening song; preferably artists only Following. | MED-01, MED-04 | Adopt following-only artist semantics; only real songs/albums enter listening rails and Hub activity. |
| R20 | Reliable authoritative/scraped metadata for music, TV, movies, shows, and other search kinds. | SRC-01, SRC-02, SRC-03 | Source matrix, provider contracts, explicit fallbacks, detail hydration, and provenance cover all supported kinds. |
| R21 | The Gentlemen intermittently missing; surface errors and reasons. | SRC-02, ERR-01 | Movie/TV ambiguity, active filters, truncation, timeout, cache state, and partial failure are reproducible and visible. |
| R22 | TV caught-up action, ongoing versus ended, broad beautiful flowing liquid-glass redesign, and exploration for similar bugs. | TV-01, TV-02, UX-01, UX-02, QA-01 | One-action caught-up progress, distinct production badge, all-screen critique and redesign, continuing discovery ledger. |
| R23 | Fix the incoherent story across vivekpanchagnula.com, Hub, and subapps. | WEB-01, HUB-01, NAV-01, UX-01 | Public identity → shared private workspace → focused tools, one vocabulary and visual system. |
| R24 | Top-down refactor plan based on actual code and established engineering principles. | ARC-01, ARC-02, ARC-03 | Source-grounded current/target tree, dependency graph, contracts and explicit rationale in the controlling architecture. |
| R25 | Apply YAGNI and delete unnecessary parts rather than accumulating abstractions. | DEL-ALL, ARC-05 | Deletion ledger closed; no speculative plugin engine, generic entity platform or redundant supported runtime. |
| R26 | Combine overlapping systems and remove the sewn-together architecture. | ARC-02, ARC-03, NAV-01 | One web router/build/lock, one server factory/session/DB lifecycle, app-owned domain features. |
| R27 | Reduce handwritten code burden and clean old cruft. | DEL-ALL, WEB-01, DOC-01 | Measured removed/added/moved code and dependencies; retired Flask/deploy/rendering paths and stale instructions removed. |
| R28 | Improve efficiency and efficacy. | ARC-05, SRC-03, QA-01 | DB-only saved reads, bounded provider work, measured payload/query/latency improvements and fewer journey actions. |
| R29 | Improve developer experience and programming habits. | ARC-03, DOC-01, QA-00 | One clean setup/dev/build/test path, typed boundaries, fast meaningful feedback and no duplicated install/config workflows. |
| R30 | Reset as if designed coherently from the ground up; move fast and permit breaking internal changes. | ARC-01, ARC-02, ARC-03, DEL-ALL | Decisive target ownership and deletion of replaced paths, with preserved required user behavior/data rather than a cosmetic reskin. |
| R31 | Follow Extreme Programming principles. | QA-00, QA-01, all implementation tasks | Story examples, bug tests first, minimum vertical changes, independent paired review, frequent green integration and continuous refactoring. |
| R32 | A swarm of powerful agents can execute the plan. | PR-01, QA-01 | Dependency board, exact ownership/reservations, review handoffs and adaptable concurrency without conflicting file writers. |
| R33 | Deliver atomically and iteratively in one refactor PR. | PR-01, DB-01, DB-02, DOC-01 | One PR/image release with small tested internal commits, ordered migrations and honest deploy/rollback semantics. |
| R34 | Tie all previous issues and architecture cleanup into one massive detailed plan. | PR-01, QA-01, DOC-01 | Single linked folder, requirement/issue/task/evidence traceability; earlier product issues remain in acceptance. |

Current acceptance evidence: [R01–R34 map](evidence/requirement-acceptance.md) and [final verification](evidence/final-verification.md). Runtime-removal and release dependencies remain open.

## Explicit subchecks for the combined final requirement

- [x] R22a: A caught-up button marks only aired episodes as watched and supports undo.
- [x] R22b: A show with future seasons remains followed/active and returns to needs-watching when a new episode airs.
- [x] R22c: Ongoing, ended, and unknown are distinct from Watching, Watched, and Caught up.
- [x] R22d: Hub, Finance, Travel, and Media each receive a full route/state UI audit, not just a new stylesheet.
- [x] R22e: The design direction is modern, fluid, and glass-like while remaining readable and responsive.
- [x] R22f: Additional issues discovered during source and browser exploration receive severity, evidence, and tasks.
- [x] R22g: Work is divided into reviewable checklists; the owner selected one agent, superseding parallel execution and independent-agent review.

## Product interpretations to carry forward

1. Prefer the owner's following-only artist suggestion over trying to invent aggregate artist listening progress. An artist's rating and review remain valid; following is separate from the listening state of a recording.
2. Treat search results as transient suggestions. Use a bounded short-lived memory cache if needed for provider limits; a result does not become a library record until Add/Follow. Durable saved metadata and public identity relationships remain supported.
3. Weekdays default to one PTO day; weekends default to zero. Per-date overrides allow a workday on a trip to use zero. Half-day support is a recommended extension, isolated from the required on/off baseline.
4. Destination is not a second trip title. Use destination first and an optional Rename trip disclosure for the title. The exact existing experience needs browser capture: source currently contains a city field and one title field, not proof of two literal title inputs.
5. APIs and permitted extraction both satisfy the metadata intent. Prefer supported provider APIs where they already exist. A free scraper is not an assumed substitute for paid flight coverage; provider capability and horizon must be proven.
6. Update the older visual-style guidance as implementation proceeds: the owner's new glass direction supersedes its ban on gradients. Preserve its financial invariants and accessibility requirements.
