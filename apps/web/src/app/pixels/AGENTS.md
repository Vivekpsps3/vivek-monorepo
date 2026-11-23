# Pixels

[Data service](pixels-data.service.ts) owns source loading;
[pure score engine](../../../../../packages/ui/pixels/pixels-score.ts) owns scoring.
[Year model](pixels-model.ts) and [life model](life-model.ts) own their projections.
Reuse them instead of copying date, dominance, cap or threshold calculations.

`GET /api/pixels/day` projects occurrence ids, civil dates, and coverage for the
selected day, plus active concept annotations. Archive, delete, or a new
understood date calls the existing concept routes and retracts that annotation.
Channel counts stay on `GET /api/pixels`.
The score engine still reads only those counts.

`/pixels/day` names one civil day. Year and Life stay numerical and link here
with the originating year or life-week span. Each also opens `/town` with one
validated visit: that Year day, or the birthday-relative Life span unchanged.
Town keeps its layout. The visit does not rebuild rooms, levels, or balances. [Atlas labels](atlas.ts) name that
day's Sunday week, ISO week, and life span, plus a text-only preview of the one
selected day. They do not score and they do not load thumbnails. Slots list
saved records and keep empty, absent, expired, unavailable, and locked apart.
A failed Finance join stays unavailable. Photos, notes, and the weekly review
stay unconnected.

Keep calendar-day, Sunday-week and life-span meanings distinct. Preserve leap days,
partial spans and the existing birthday/privacy contract. Do not expose private
Finance amounts/names through server activity counts.

Bound a user action across all source windows and joins, cancel actual work where
supported, and prevent stale owner/route results from publication. Keep independent
source failures and locked/expired/absent states distinguishable. A grid/timeline
change must preserve its equivalent table, keyboard access, focus and details.

Before removing a seemingly duplicated test import, check Karma discovery: the
small import under packages/ui/src makes the owned scoring suite discoverable.
Run root web/shared gates and affected Pixels browser journeys. Use held-response
and request-count assertions for loading changes, and pure score/date vectors for math.
