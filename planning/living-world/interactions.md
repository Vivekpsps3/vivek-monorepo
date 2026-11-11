# Interaction and information specification

## Town composition

Desktop: scene is the primary place, Today is an adjacent compact working panel;
selected building details appear without displacing the active checklist. Phone:
scene overview, selected-lot summary and Today in that order, with a direct “Tend
today” jump so art does not obstruct the main task. Keep a useful initial scene
within the viewport; do not shrink text to fit the whole settlement. Selectable
lots have DOM controls; visible labels and a list alternative identify all lots.

Selecting a building opens its name, purpose, stage, underlying source status,
actual progression and next threshold when one exists. Existing library/inn
levels must come from their own building facts rather than applying Town level
to every structure. Health continues to expose approved stages only. Treasury
uses Finance budget-kept weeks only, with locked/unavailable/no-plan distinct.
No map inspector may disclose more than the existing public facade permits.

## Check-in state machine

| State | Display | Allowed behavior |
| --- | --- | --- |
| Ready | current completion/cadence | submit check-in or existing Undo |
| Pending | pressed intent and progress, explicitly unsaved | suppress duplicate submission; preserve navigation |
| Confirmed | actual server result and lot response | announce once; offer Undo |
| Failed | previous committed state and inline reason | retry the intended operation; no earned effect |
| Undo pending/confirmed | existing undo semantics | retract the displayed effect from the authoritative response |
| Owner/day/route changed | invalidate obsolete work | no late toast, animation, private fact or snapshot publication |

Never reward a failed POST. Stage swaps occur only for real stage changes; ordinary
checks use a bounded local effect. Rapid checks on different habits remain
independent; repeated same-habit intent does not duplicate XP or celebrations.
Backdated entries affect their actual day and explain that date. Reduced motion
uses a stable changed-state indicator and text. Rest, missed, pending and done
retain the existing history distinctions and cadence rules.

## Cross-scale date passage

Keep canonical routes `/town`, `/town/world`, `/pixels`, `/pixels/life` and planned
`/town/hall`; improve their composition rather than minting three new apps.
Pixels Year already owns `year` and `day`; World retains ISO-Monday `week` and
adds a validated civil-date `day` selection. Omitted day preserves legacy week
behavior. Normalize conflicting week/day deterministically to the selected valid
day's World Monday; replace invalid parameters with a safe current context and
explain recovery without redirect loops. Do not change URL on every drag frame.

A date passage carries only validated dates, view identifiers and optional
non-sensitive source identity. Preserve Year/Life origin, selected span, filters
and scroll/focus through bounded router history state. On refresh, the URL still
restores the date; if in-memory return state is gone, offer a canonical dated
Pixels link. Never trust arbitrary return URLs or store private text in URLs.
Browser Back traverses meaningful visits/selections, not camera animation frames.

Sunday aggregation weeks, World Monday weeks and birthday-relative Life spans
remain separate. “Visit this week” uses the selected span's start day and clearly
shows its full range; it does not silently relabel a Life span as an ISO week.
Feb 29, year boundaries, DST and server/browser timezone mismatch need fixtures.

## World inspection

Hit-test rendered structures/artifacts against the same camera transform used to
paint them; deterministic overlapping targets have an explicit chooser. A tap
opens that object, not merely the viewport-center week. A drag beyond the defined
pointer threshold pans and never activates. Pointer cancellation, resize, zoom,
reduced motion and theme redraw preserve selection. A keyboard DOM list of
visible objects gives equivalent inspect/source actions; the full dated list
remains available without operating the canvas.

Inspector rows: object kind/title, exact occurrence date or span, reason for its
representation, source state and a meaningful action. Media/trip source actions
open the exact existing item/trip route. Concepts use the existing concept sheet.
Habits use existing history/edit capabilities without silently marking a day.
Never add dead “Open source” links when no supported target exists. Paginated
`finished_more` counts remain labelled and expandable through bounded source reads,
not falsely represented as all named objects already loaded.

The existing lit/fog calculation is retained as recorded-activity data. Relabel
its meaning clearly; change the presentation so an unrecorded day is a visible
quiet landscape, not a void or failure. Future is a distinct horizon. Unavailable
source data is an explicit uncertainty state, not quietness. Do not infer rest
without a recorded rest state. An optional activity overlay may emphasize
recorded days; hiding it must not hide objects or falsify counts. Generation and
stable object placement remain unchanged unless a separately versioned engine
change is justified and preserves old supported history.

## Pixels: pattern plus particularity

Keep Year, Life, activity/app color modes, table equivalents and numerical
summaries. Make “recorded activity” explicit instead of “quality of your life.”
Add a compact composition strip/details for selected days with the actual counts
and named loaded moments. Concepts are a separate learning annotation/count,
not a retroactive extra point in the shipped weighted score. Show the scoring
explanation and its limits; counts, XP, intensity and milestone eligibility are
not interchangeable. Distinguish no recorded data from source unavailable.

Month/day references, selected date and legend stay visible/discoverable on the
rotated phone grid under UX-05. PLACE-07 uses those results rather than rewriting
calendar geometry. Crosshair/selection outlines and patterns convey selection
without relying only on hue. A view/filter change preserves the selected date
when valid; otherwise explicitly announces the nearest supported selection.

Life keeps birthday privacy, optional age, existing span definitions and planned
trip marks. Use “recorded since DATE” and “lived, no suite data” where supported.
Do not present 90 minimum rows as an expected death date, prescribe a lifespan,
or imply that pre-account years contain no meaningful experiences. Year is the
primary arrival; Life is an intentional perspective view.

## Arrange and milestone choice

First version: a small fixed set of decoration anchors around the garden/civic
path. Pick an unlocked ornament, preview in a compatible anchor, rotate only
where an authored variant exists, then Save or Cancel. Also support select-anchor
→ choose-item with keyboard; dragging is optional. No freeform collision solver.
Undo restores the previous saved layout through a revision-aware write. Failed
saves keep a clearly unsaved same-owner preview; conflicts show current saved
layout and retain a local draft only while that session remains valid.

Automatic base placement is always available; Reset requires a concrete preview
and confirmation. Names, health values, Finance status and source titles never
enter cosmetic layout payloads. Source-derived keepsakes appear in display
shelves from live facts; they are not copied into the layout record. If a source
is reversed/deleted, retract its derived keepsake. A now-ineligible cosmetic
choice can remain stored but is unavailable to place and rendered as a neutral
empty anchor until eligibility returns; explain this rather than silently deleting
user arrangement data. Lock clears private overlays immediately and cannot
visually relabel a private locked source as a public achievement.

## Arrivals, recaps and review

Keep Town/World/Pixels as useful direct destinations with sibling links, shared
selected-date language and consistent return actions. Do not remove direct routes
or bury practical controls in a scene. Hub stays compact and informative; it may
show one specific recent change and a dated visit action from the existing
summary, never a second complete map, reward inbox or private review preview.

A recap is an on-demand projection of a selected range: named source moments,
habit counts, coverage and links. It is not a new stored weekly story, nor an
inference about mood or life quality. When available, link TOWN-06's encrypted
review editor for the same ISO week; never duplicate notes in a recap, Hub,
server response or local preference. No forced Sunday modal.
