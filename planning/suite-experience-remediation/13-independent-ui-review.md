# UI and interaction review for the repo improvement plan

Review date: 2026-10-25. Evidence: source inspection of the current checkout, not rendered screenshots or live production behavior. User-reported failures must remain labeled user reported until reproduced. Source-confirmed behavior and investigation candidates are distinguished below.

## 1. Overall direction

The suite currently has reusable warm paper/ink tokens, shared controls, theme preference, short motion, reduced-motion support, reduced-transparency support and contrast tests. Preserve those useful foundations while changing the visual language. `packages/ui/tokens.css` already provides semantic colors, spacing, type, radii, shadows and accessibility preferences; replace/extend these centrally, then migrate app surfaces in bounded increments. Do not install a second design system or move Finance, Travel or Media behavior into shared UI code.

A modern liquid-glass direction should use a quiet gradient canvas, a translucent sticky header, clear floating primary actions, soft rounded cards and restrained depth. Keep data surfaces sufficiently opaque and textual hierarchy strong. Use gentle transitions between stable states; avoid animating every data change or creating blurred layers behind long scrolling lists. The visual goal is calm, flowing and polished, with one obvious next action per scene.

### Proposed common specification

- [ ] Define semantic canvas, opaque content, glass chrome, inset-control, elevated-popover, accent, danger, text and border tokens for light/dark themes. Glass needs a solid fallback where backdrop filters or reduced transparency demand it.
- [ ] Use 4/8px spacing primitives, consistent 16/24/32px panel rhythm, 12/16/24px radii, and at most two elevation styles per scene. Establish heading/body/meta roles before changing individual font sizes.
- [ ] Reserve blur for small navigation and overlay surfaces. Financial tables, itinerary data and long text remain readable on stable surfaces.
- [ ] Set one icon family/stroke weight and consistent icon/button geometry. Every icon-only control has an accessible name. Hub is a labeled compact control, never an unlabeled glyph alone.
- [ ] Use motion for state continuity, roughly 120–220ms. No perpetual decorative motion, layout shifts while saving, or scrolling parallax. Reduced motion removes nonessential transitions.
- [ ] Define action hierarchy: one primary action per contextual group; secondary for useful alternatives; quiet destructive actions behind intentional confirmation where appropriate.
- [ ] Verify text and control contrast against actual composed backgrounds in both themes. Semantic states use text/icons as well as color.
- [ ] Reference widths: 320, 390, 768, 1280 and 1440px; 200% zoom; landscape small height; keyboard opening on mobile; safe-area insets; long translated-looking names even if UI is English.
- [ ] Controls should aim for 44px touch targets; density can reduce visual footprint while retaining a larger hit area. No horizontal document overflow.

## 2. Navigation and suite coherence

### UX-01 — Persistent Hub control (P1, source confirmed)

Finance has Hub in desktop tabs and the mobile tabbar (`apps/finance/frontend/src/app/core/layout/main-layout.component.html:33`, `:78`). Travel puts Hub in More and a footer (`apps/travel/backend/static/index.html`). Media puts Hub inside both desktop/mobile account menus (`apps/media/backend/static/index.html`). This requires different discovery behavior and extra actions.

- [ ] Add the same compact icon + “Hub” anchor in a persistent app header for Finance, Travel and Media, visible at all supported widths and scroll positions.
- [ ] Keep Hub distinct from app home. App wordmarks continue returning to that app’s landing screen.
- [ ] Place this control consistently near the app identity. Give it its own hit area; ensure it survives crowded headers, mobile keyboard, overlays and safe areas.
- [ ] Keep underlying href `/hub`; Finance may use RouterLink for its internal navigation. Do not accidentally use a hash-only route in Travel/Media.
- [ ] Verify unsaved edits follow the existing draft/guard policy and interrupted navigation can be canceled without losing text.
- [ ] Test every app landing/deep detail/create/settings/calendar/error route at mobile/desktop and after scrolling. One activation reaches Hub; back returns predictably.

### UX-02 — Navigation vocabulary and density (P2)

Finance has five app sections plus Hub in mobile tabs, with different desktop/mobile wording (What you have/Have, Spending/Spend, Recurring/Repeat, Planning/Plan). Media has five mobile tabs including Add. Travel has Upcoming/Calendar/PTO plus prominent New trip. These can retain domain differences, but chrome shape, active state, account location and Hub placement should align.

- [ ] Establish a suite shell contract, implemented with shared CSS/primitives and app-owned markup/adapters.
- [ ] Audit Finance six-target mobile width; move Hub to the persistent header and assess whether the five remaining sections fit at 320px with readable labels.
- [ ] Keep route labels stable where possible; document intentional abbreviations and verify accessible names use the complete label.
- [ ] Preserve `aria-current`, logical focus order, skip links, and page-title focus after navigation.
- [ ] Avoid two simultaneous competing desktop/mobile navs in the accessibility tree at breakpoints.

## 3. Hub review

The authenticated Hub lives under Finance frontend (`apps/finance/frontend/src/app/hub/hub.component.*`), while `apps/site` is the public personal site. Reworking the hub should not accidentally target only the public site.

### UX-03 — Hub hierarchy (P2)

Current Hub uses date/name, two large side panels and a Finance bar, repeated open links, and full theme controls in the header. It exposes useful state-specific information, which should be retained.

- [ ] Design the first screen around three equally recognizable app entry cards, each with one stable Open action and one concise state summary.
- [ ] Put current trip, active media and financial overview in a clear visual grid with predictable card identities; retain domain-specific content only where actionable.
- [ ] Make full-card navigation compatible with nested deep links; avoid nested anchors or ambiguous clickable background areas.
- [ ] Retain locked-vault disclosure and browser-local Finance model. New visual summaries must not require transmitting balances.
- [ ] Keep detail breakdowns secondary. Avoid empty informational blocks that push all app entry controls below the fold.
- [ ] Provide local loading/skeleton/error/empty states without shifting other cards.

### UX-04 — Hub recovery asymmetry (P1/P2, source confirmed)

Travel unavailable state has only explanatory text (`hub.component.html:54`); Media unavailable state has Retry (`:82`). Finance links retry to its app. These differ without a clear user reason.

- [ ] Add consistent per-app retry affordances with loading/disabled state; retain the always-available app navigation action.
- [ ] Show whether a summary is stale versus unavailable, with last-successful time where available.
- [ ] Test one failed summary does not block the other two or sign the user out unnecessarily.

### UX-05 — Account editing semantics (P2, source confirmed semantic concern)

Hub wraps ordinary text-editing forms in `role="menu"` (`hub.component.html:21`), including name and username changes. A menu widget has interaction expectations different from a form popover.

- [ ] Move profile edits to a dialog/settings panel, or give the existing popover appropriate non-menu semantics and keyboard behavior.
- [ ] Handle outside click, Escape, focus restoration, unsaved values, loading and inline errors explicitly.
- [ ] Reduce header theme-control dominance on small screens; keep a consistent account/settings location while preserving theme access.

## 4. Travel review

### UX-06 — Trip creation mental model (P1, user reported confusion; source confirmed fields)

`views/composer.mjs:264` renders named city segments and a separate Trip name input. The calendar controls precede them, and save gates require dates and one named city. To the user this can read as two competing trip names.

- [ ] Present the flow as Dates → Destinations → optional details, with a single canonical trip title.
- [ ] If title is generated from cities, show a non-editable summary plus an explicit Rename action; retain one visible editable title field when renamed.
- [ ] Destination fields must explicitly say “Destination city” and show their date range. Explain only the uncommon parts, not every obvious field.
- [ ] Preserve typed city/title values through date changes, splitting, resizing, validation errors and retries. Clearly describe truncation/removal if dates change.
- [ ] Save only required minimum data; optional flight, notes and activity editors open on request.

### UX-07 — Split affordance and boundary language (P1, source confirmed semantic mismatch; visual failure user reported)

`views/composer.mjs:272` renders a select labeled “Split N after” and a “Split…” button, but `composer-model.mjs:134` treats the selected day as the first day of the new segment. CSS `.composer-city` gives explicit grid placement only to label/input; additional select/buttons rely on auto placement (`app.css:395`).

- [ ] Replace “Split…” with “Add destination” / “Change city on [date]” or make split language and boundary math agree.
- [ ] Group boundary date and action on a deliberate responsive row. Show before/after destination ranges before committing.
- [ ] Single-day trips cannot split; first/last-day boundaries, adjacent splits, multiple splits and removing a middle destination have explicit rules.
- [ ] Keep focus on the newly added destination name after adding and on a logical retained control after removing.
- [ ] Test semantic date boundaries and DOM layout/interactions, not only pure model functions.

### UX-08 — Calendar interaction and draft lifecycle (P1/P2, candidate defects requiring browser verification)

Composer calendar applies `touch-action:none` inline and in CSS; a pointer drag redraws calendar markup. `mountComposer()` adds a window resize listener with no visible teardown. Save has no in-flight guard or disabled saving state (`views/composer.mjs:285` onward).

- [ ] Test whether ordinary page scrolling is trapped when a mobile gesture starts on the calendar; preserve normal vertical scrolling or provide an explicit range mode.
- [ ] Make keyboard range selection and date-entry alternatives obvious; do not require dragging.
- [ ] Provide clear selected-range summary and explicit reset; maintain focus during redraws.
- [ ] Add submit-pending guard and backend-safe duplicate submission handling; failed saves preserve input and allow one intentional retry.
- [ ] Remove route-scoped listeners on unmount; verify repeated visits/resizes do not redraw detached composers or accumulate work.

### UX-09 — Progressive disclosure on trip detail (P1, source confirmed)

`views/trip.mjs:216` renders every transport role even when empty; every itinerary day gets an inline add form (`:229`); Parking/Budget/Notes/Reminders are always rendered (`:289`). This matches the user’s complaint about verbose empty “Getting there” and daily planning areas.

- [ ] Use a compact trip summary and populated itinerary by default. Show add actions as quiet contextual controls rather than an entire unfilled editor.
- [ ] Hide empty transport groups; show a single “Add travel” action opening a mode-first sheet.
- [ ] Hide unplanned daily blocks or collapse them into “X unplanned days”; support date-specific add from the calendar/timeline.
- [ ] Keep an obvious route to add an activity for any date, including a fully empty trip.
- [ ] Make parking, budget, notes and reminders optional modules. Existing data always remains visible or clearly discoverable.
- [ ] Provide short, clear field labels, visible required markers and one save/cancel row per editor. Advanced fields belong behind a deliberate More details action.

### UX-10 — Flight lookup flow (P1)

Existing `actions/flight.mjs` and full transport form have lookup behavior, but composer’s optional `legFields()` exposes carrier/number/from/to/times without a lookup affordance (`views/new-trip.mjs:17`).

- [ ] Start flight entry with flight number + departure date, with optional origin to disambiguate. Automatically look up after enough information is entered, with a visible loading state.
- [ ] Show candidate legs for codeshares/multiple departures; display route, date and local timezone before selection.
- [ ] Display populated schedule with provider/time-of-refresh and a clean “Edit times” button. Manual values stay authoritative until user explicitly refreshes/replaces them.
- [ ] Separate scheduled, estimated and actual times; explain overnight arrival with date and destination timezone.
- [ ] Disabled/unconfigured/unavailable provider states must offer useful manual entry immediately and a retry action where applicable.

### UX-11 — Map usability and error states (P1)

Map is omitted entirely when no coordinates exist (`views/trip.mjs:284`), even if the trip has named cities. Composer creates named stays without coordinates. Full stay/plan forms expose Find on map (`views/new-trip.mjs`); quick adds do not. Leaflet already calls `invalidateSize()` on details toggle and after mount (`views/trip.mjs:373–376`), so do not prescribe this as a missing fix without reproducing the problem.

- [ ] Treat missing coordinates, geocoder failure, map-library failure, blocked tile requests and collapsed-container sizing as different states.
- [ ] Surface a meaningful map placeholder when cities exist but need location resolution, with a clear “Choose location” action.
- [ ] Let users confirm geocoding matches and adjust an incorrect place. Resolve ambiguity without silently choosing another city with the same name.
- [ ] Tile failure retains the places list and offers retry/open-in-map links. Keep attribution visible and map controls keyboard accessible.
- [ ] Test map resize, hidden→visible, repeated trip navigation, one/multiple points, no points, and third-party outage.

### UX-12 — Per-day PTO (P1, source confirmed limitation)

Composer uses one Counts as PTO checkbox. Trip editor has counts_as_pto and an aggregate PTO days override (`views/trip.mjs:189–190`). This cannot explain which days are working, holidays or PTO.

- [ ] Provide a compact day-by-day selector within trip dates. Weekdays default PTO when trip PTO is enabled; weekends default excluded.
- [ ] Let users explicitly mark each weekday as PTO / not PTO. Show reason for automatically excluded weekends; preserve per-day overrides during edits.
- [ ] Display recalculated total immediately and explain effects on the PTO balance/forecast without requiring navigation away.
- [ ] Keep aggregate legacy values until a migration decision is explicit; never silently reinterpret an old custom total as individual dates.
- [ ] Test ranges across weekends, month/year boundaries, overlapping trips, date edits, cancellations and policy changes.

## 5. Media review

### UX-13 — Uniform library items and saved-only expansion (P1, source confirmed)

`views.mjs:220–285` groups music separately; artist items inject every `item.music.albums` album and track as unsaved (`item:null`) nodes. `app.mjs:702` gives artists a separate heading and always-open content rather than the same library-row structure. This explains both inconsistency and catalogue leakage.

- [ ] Use the same card/row shell for artist, album, song, TV, movie, book and game, with optional type-specific compact metadata.
- [ ] Add a subtle accessible expansion button on artist rows; collapsed by default and independent from the Open artist link.
- [ ] Expansion shows only saved children. Do not infer personal membership from catalogue relationships, provider details or ratings embedded in an artist record.
- [ ] Separate “In your library” and “Explore discography” on the artist detail screen. Lazy-load catalogue content only after explicit exploration.
- [ ] Clarify whether standalone tracks should appear independently and under expanded parents; prevent duplicate counts and make sorting/filtering/pagination semantics consistent.
- [ ] Identity must use provider/internal IDs, not lowercased display names; current title-based grouping risks conflating same-named artists/albums/songs and remasters.

### UX-14 — Artist state semantics (P1, source confirmed)

`format.mjs:16` includes Following, Anticipating, Listening, Listened, Paused and Unfollowed for artists. Search already says Follow, creating inconsistent expectations.

- [ ] Use Following/Unfollowed for artist personal state. Keep song/album listening states on their own entries.
- [ ] Remove artists from Now/Hub listening summaries unless there is an associated currently listening track or album and the summary makes that relationship explicit.
- [ ] Migrate old artist statuses transparently; preserve original data where interpretation is uncertain and do not mark unsaved songs listened automatically.
- [ ] Update generic filters, counters, quick add, detail controls, search actions and all summary consumers together.

### UX-15 — Artist portrait selection (P2)

`format.mjs:93` uses an artist’s artwork URL directly; no portrait search/selection UI was identified in this pass.

- [ ] Add “Choose photo” on artist detail with searchable provider results, meaningful source attribution, preview/crop and explicit Save/Cancel.
- [ ] Keep the previous portrait until a new choice saves; support reset to provider default and error/retry states.
- [ ] Persist the user’s chosen portrait as personal override so background enrichment does not overwrite it.
- [ ] Use safe image handling and a stable fallback. Handle broken image URLs without layout shift.

### UX-16 — Search trust and discoverability (P1)

Existing `app.mjs:827` already renders a provider-degradation sentence and manual add fallback; `runSearch` also has request ticketing and inline error panels. Do not replace these with generic toasts or claim all errors are currently hidden. Investigate where provider partial failures collapse into a convincing no-results state and why The Gentlemen changes across requests.

- [ ] Distinguish No matches, Some sources unavailable, Unsupported type, Sign-in required, Rate limited and Failed request.
- [ ] Keep query/type in the URL and preserve them through retry/back navigation.
- [ ] Show title, year, type, creator/network where useful, and provider identity so movie and TV adaptations can be distinguished.
- [ ] A zero-result response with degraded providers must say the search is incomplete and provide retry plus manual add.
- [ ] Search results’ Add/Follow buttons currently use `tabindex=-1` (`app.mjs:814`); custom arrow-key handling exists. Verify discoverable keyboard access, then prefer standard reachable buttons or expose clear composite-widget instructions and semantics.
- [ ] Test repeated The Gentlemen searches as movie/TV/all, punctuation/case variants, one unavailable provider, stale requests arriving late and query edits during in-flight loads.

### UX-17 — TV ongoing, ended and caught up (P1)

`views.mjs:412` has derived caughtUpText and detail has Mark next watched plus season controls (`app.mjs:1119`). There is no prominent caught-up command in that section. Completion and future broadcast lifecycle need independent treatment.

- [ ] Display series lifecycle chips with text: Ongoing, Ended, Canceled, Unknown, and appropriate source freshness. Personal watched status must not imply ended.
- [ ] Add “Mark caught up” to mark only known released regular episodes as watched; disclose the scope, support undo and avoid marking future episodes.
- [ ] Show “Caught up · Waiting for next episode/season” in library/detail/Now when appropriate.
- [ ] On newly released episodes, move derived caught-up state to new-episode available without changing a person’s unrelated follow/paused preference.
- [ ] Define specials/unknown air dates, region/timezone release cutoffs, empty episode metadata and ended shows explicitly.
- [ ] Keep season navigation accessible; distinguish selected season, watched season, unavailable metadata and future season.

## 6. Additional source-grounded improvements

### UX-18 — User-facing failure copy (P2, source confirmed)

Finance API banner says “Start the backend. Then try again.” (`main-layout.component.html:90`). That is implementation guidance rather than product recovery.

- [ ] Replace with ordinary user-facing connection/session recovery. Keep development diagnostics in developer tooling.
- [ ] Match action-specific messages across apps: what failed, whether edits remain, and what retry does. Show persistent local errors for failed writes, with toasts supplementary.

### UX-19 — Focus and modal contract (P1/P2, audit candidate)

Finance tutorial is a div-based aria-modal dialog (`main-layout.component.html:124`); Travel/Media use native dialogs. Verify tutorial focus trap, Escape, background inertness, scroll locking and restoration before treating as a confirmed accessibility failure.

- [ ] Standardize behavior without forcing one framework into all apps. Use native dialogs or tested shared low-level primitives with app-owned contents.
- [ ] Avoid multiple modal layers, hidden active inputs, and mobile keyboard covering submit controls.
- [ ] Test errors, cancellation, route navigation while open, browser back and destructive-confirm retries.

### UX-20 — Design ownership and CSS layering (P2, source confirmed maintenance concern)

Media `app.css` contains repeated base/navigation/layout/motion rules at distant locations; Travel also appends composer and later overrides. This makes visual fixes hard to reason about.

- [ ] Organize tokens → shell → reusable controls → page components → responsive/accessibility overrides, with scoped ownership and a documented cascade.
- [ ] Keep shared visual primitives in packages/ui and shared browser interaction primitives in packages/browser; keep provider/state/domain code inside its app.
- [ ] Avoid sweeping CSS rewrites combined with provider/schema changes. Land coherent visual slices that can be compared and rolled back.

## 7. Review and execution matrix

Each work item should have a source anchor, reproduction fixture, target behavior, implementation checklist, tests, screenshots where applicable and owner. Use statuses Reported / Source confirmed / Reproduced / Designed / Implemented / Verified rather than one ambiguous Done checkbox.

- [ ] Wave 1: capture fixtures/screenshots; establish tokens/shell contract; reproduce navigation, split, search inconsistency and map failure; freeze provider/personal-state API contracts.
- [ ] Wave 2: independent app owners implement persistent Hub and app-specific task simplifications; backend owners implement per-day PTO, catalogue separation and lifecycle/following contracts.
- [ ] Wave 3: integrate design across app routes, migrations and hub summaries; verify error and empty states before adding cosmetic polish.
- [ ] Wave 4: screenshot/interaction/a11y review for full matrix; run all touched quality gates locally before any PR.

Route coverage minimum:

| Surface | Scenes |
| --- | --- |
| Hub | Ready, all empty, partial app outage, finance locked, account edits/errors, long identity, admin |
| Finance | Home, Have/assets/holdings, Spending/activity/import/calendar, Recurring/pay/spend, Planning/tools, vault unlock, profile/admin, save failure |
| Travel | Upcoming/current/past, new trip incomplete/selected/multi-city, trip minimal/populated/edit/errors, calendar/week/month, PTO settings/forecast, settings/provider missing, map/geocoder outage |
| Media | Now empty/current/caught-up, library mixed kinds/filter/pagination/artist expanded, search all/type/partial/outage, manual add/prefill, artist photo/discography, TV seasons/episode, calendar partial, edit conflict |
| Public site | Home, Work, About, encryption demo, shared theme changes; protect from accidental suite token regressions |

Acceptance artifacts:

- [ ] Desktop/mobile light/dark screenshots for every changed scene, including empty/loading/error states.
- [ ] Keyboard-only journey for app → detail/create → save → Hub → return; visible focus, expected order and preserved drafts.
- [ ] Reduced-motion, reduced-transparency and high-contrast preference runs with usable solid fallbacks.
- [ ] Meaningful Playwright checks for clipping/overflow, persistent Hub visibility, split semantics, saved-only library, caught-up behavior and provider recovery.
- [ ] Existing contrast tests adjusted to the new valid palette rather than bypassed; screenshot fixtures updated after review, not automatically blessed.
- [ ] Preserve every AGENTS.md test gate that touches changes; no test skips or lowered floors to open PRs.
