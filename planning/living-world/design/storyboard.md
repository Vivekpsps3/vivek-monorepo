# First playable journey and control contract

This elaborates [interactions](../interactions.md); exact implementation scope
stays in PLACE-02–13 and the retained Town/UX packets. All content below is
synthetic. Frames are proposed states, not screenshots of working features.

## Arrive and establish a garden

Frame 1: [before founding](town-unfounded-390-light.svg). The heading is “A place
to begin”; the primary control is **Choose a first habit**. A short explanation
says the garden starts when the habit is saved. Existing Media/Travel history is
not retroactively awarded. No forced naming ceremony, tutorial carousel or reward
inbox sits before the real action.

Pointer/touch opens the existing habit dialog. Keyboard Tab reaches the same
button; Enter opens the dialog and focuses its name field. Suggestions populate
the same form. Name, cadence and building style use existing validation and
defaults. Choosing the garden style makes the first study's trellis appropriate;
another style uses its own coherent response, without silently changing the saved
style. Cancel/Escape returns focus to the invoking control with no foundation.

Frame 2: [first garden](town-first-390-dark.svg). Save stays pending until the
server succeeds. Failure preserves the draft and shows the actual field/network
error. Success replaces the unfounded state and announces “Habit saved. Your town
is founded.” It does not count a check-in. Put focus on the corresponding Today
row; do not make an animation a focus destination. Library/Inn/Treasury remain
present and retain their real source states and stages.

## Tend, fail safely and Undo

The action's full accessible name is **Mark Read 20 pages done for today**.
The compact visible label may be “Mark reading done” when the adjacent name makes
the referent clear. The relevant civil date is always available from Today.

| Frame / trigger | Visible state and copy | Focus / keyboard | Meaning |
| --- | --- | --- | --- |
| Ready | Read 20 pages · Daily · ready to check | Enter/Space on its button | Existing committed completion; no effect playing |
| POST in flight | “Saving check…”; pressed intent identified as unsaved | Keep focus; suppress duplicate same-habit intent | No flower, XP or completion announced yet |
| Authoritative success | “Read 20 pages checked for 29 October.”; “Undo” | Button becomes the equivalent Undo action; announce once | Apply returned XP/stage; one 150–450ms growth/window effect at that lot |
| Server failure | “Check not saved. Try again.” plus useful reason | Retry stays on the row | Preserve prior committed state and draft intent; no earned effect |
| Undo pending | “Undoing check…” | Keep invoking focus | Existing undo operation; not an independent negative XP rule |
| Undo confirmed | “Check removed for 29 October.” | Return to ready button | Render returned authoritative state; retract the effect; no second award |
| Undo failure | “Could not undo. Your check is still saved.” | Offer Retry Undo | Continue showing the confirmed state |
| Day changed | Existing server-day-change explanation | Return to the reloaded row when present | Do not guess that an old intent applies to the new date |

Two different habits can save independently. A duplicate tap/keypress on one
pending row cannot duplicate a write or award. A backdated operation names its
actual date. Reduced motion replaces the flourish with a stable changed-state
marker and the same text. Navigating away, locking or switching owners invalidates
pending publication; a late response cannot animate, toast or restore an old
private overlay. A stale-owner failure is discarded rather than shown to the next
owner. Rest/skipped/pending statuses retain their existing semantics.

The phone **Tend today** link moves to the Today heading and focuses it, so a
decorative scene never delays the practical action. Desktop keeps Today beside
the scene. Inspector selection must not replace or scroll away an active checklist.

## Inspect a place and its source

Frame 3: [current-week inspection](world-current-1280-light.svg).
A habit's garden identifies the habit, exact check date/span, source, reason and
supported history/edit action. Opening the inspector never records a check.
Fixed Library and Inn show their own levels, thresholds and source availability;
they do not inherit Town level. Treasury says **Finance locked**, **No budget
plan**, **Budget data unavailable**, or a real budget-week contribution as
appropriate. Health gets only the approved stage facade.

Frame 4: [a selected book](world-memory-390-dark.svg).
“The Lantern Atlas · Book completed · 15 August 2026” explains why the tome is
here. **Open this book** navigates to the exact existing Media detail route for
that source ID. Trip inspection uses its inclusive recorded span and existing
trip route. Concept inspection opens the existing concept sheet; its annotation
does not add Pixels score. If a supported source route does not exist, show a
useful factual explanation and the existing owning feature action instead of
inventing a dead link.

Pointer down records the intended target. Movement exceeding **8 CSS pixels**
becomes a pan and cancels activation; pointercancel always cancels. Hit testing
uses the paint transform, including zoom/resize. Overlapping objects open a named
chooser in deterministic visual order. Pointer-up selects only when the intended
target and current generation still agree. Taps do not select the centered week
as a substitute for selecting the object.

Keyboard uses **Objects in this view** as a DOM list, with one named button per
object and the same inspector/source actions. Existing arrow/Shift-arrow camera
controls remain available in the focused map region. Escape closes an inspector
or chooser and restores its invoking object/list control; if removed, focus the
dated list heading. No canvas-only hit target carries the only accessible name.
The dated list remains usable with forced colors, no motion and no canvas.

Unrecorded days stay visible as quiet landscapes, labeled **No recorded activity**.
Future days are a distinct horizon. A source failure says **Media unavailable ·
Retry** and preserves other sources. It never becomes a claim that the person
rested, did nothing, or lived a worse day. Partial item loading explicitly names
the loaded count and **More**; only a bounded source read expands it.

## Select a day, visit it and return

Frame 5: [selected Pixels day](pixels-partial-1280-dark.svg).
Year is the default arrival. Life is an intentional sibling view with its existing
birthday/privacy and span semantics. Activity/app colors, counts and weighted
score keep their current owners; learning is a separate annotation. The selected
panel always shows date, available counts, loaded named moments, uncertainty and
**Visit 15 August**. The scoring explanation states what colors can and cannot
say. No prototype tint is a new scoring formula.

The grid has a single managed keyboard entry point using its existing navigation
model; focus and selection remain visible without color alone. Enter opens day
details. The equivalent dated table offers the same inspect/visit actions. At
320px or 200% text, prefer the table when seven 44px touch targets cannot fit.
The expanded view must preserve the selected date rather than reset to January.

Frame 6: activate **Visit 15 August**. Navigate to
`/town/world?week=2026-08-10&day=2026-08-15`. Arrival focuses World’s dated heading,
centers the correct landscape and exposes the matching date inspector. Valid
`day` wins over a conflicting `week`; normalize week to its ISO Monday once.
Invalid dates get one safe recovery notice and canonical parameters, with no loop.
The existing URL without `day` retains week behavior. Panning does not add a
history entry per animation frame.

Frame 7: **Back to 15 August in Pixels** returns to
`/pixels?year=2026&day=2026-08-15`, restores Year/app-color/table selection and
scroll/focus from bounded router history, then focuses the invoking cell or row.
Refresh still restores the date from URL. If ephemeral return state was lost,
the canonical dated Pixels link still works. Never accept an arbitrary return URL.

Life's “Visit this span” uses its actual span-start day and displays the full
birthday-relative range. A Sunday scoring week never silently becomes a Monday
World week. Feb 29, December/January, DST and a server/browser civil-day mismatch
are explicit implementation fixtures. Browser Back/Forward follows meaningful
selections and visits; owner changes clear private return snapshots.

## Choose and arrange an ornament

This is PLACE-08/09, after the first playable slice. Selecting an eligible existing
milestone shows exactly three authored choices from the [catalog](../catalog.md).
The visible controls are **Preview**, **Choose anchor**, **Save arrangement** and
**Cancel**. No new currency, inventory or reward claim is needed.

Keyboard selects an anchor in the ordered list `garden-0`–`garden-3`,
`path-0`–`path-3`, `civic-0`–`civic-3`, then one compatible variant. Pointer may
select the same anchors; dragging is optional. A focus ring and **Unsaved preview**
label distinguish a local preview from saved state. Entrances and lot controls
remain unobstructed. Only authored orientations are offered.

Save sends approved IDs plus catalog/layout version and expected revision to the
Town owner; maximum twelve occupied anchors and 16KiB. The confirmed response
sets **Arrangement saved · Undo**. Undo is another revision-aware save of the
previous supported arrangement. A conflict says **Your arrangement changed in
another session** and shows current saved state; keep a same-session draft for
explicit reapplication, never silently overwrite it. A failed save retains a
clearly unsaved same-owner preview. Unknown/corrupt versions remain intact with
a recovery message. Reset shows an exact default preview before confirmation.

An eligibility correction preserves supported stored IDs but shows the affected
anchor as unavailable until eligible again. Explain a rejected Undo/reapply.
Source keepsakes are derived shelves, not cosmetic layout entries. Never persist
habit IDs, titles, notes, budget status or private Health data in ornament JSON.

## Hall, residents and arrivals

[Hall](hall-390-light.svg) has Progress & rules, Appearance and Weekly review.
Rules use existing constants and actual history/edit actions. Appearance previews
the canonical device-scoped season and optional sound, off by default; storage
failure must not prevent use. Automatic season describes browser month mapping,
not inferred geography. Sound needs deliberate opt-in and a persistent mute.

Weekly review opens TOWN-06's single encrypted ISO-week editor. A locked vault
shows Unlock; an unavailable editor shows an honest explanation. Hall, Hub,
recaps and map inspectors never copy review plaintext into another editor or
server-readable projection.

Residents stay a small authored cast: Guide orients; the library keeper points
to a real keepsake; the gardener explains an actual habit; the records keeper
explains coverage. A short optional vignette uses known facts, has Close/Escape,
and never invents mood or private biography. Decoration and visits require no
attendance, affection points or daily gifts.

Hub offers one compact existing-summary arrival, such as **A book completed on
15 August · Visit day**, plus owning-app actions. A selected-range recap reports
actual counts/moments and coverage, with a link to the one encrypted review when
available. No second full map, stored personal narrative or forced weekly modal.
