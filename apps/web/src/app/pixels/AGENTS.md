# Pixels

[Data service](pixels-data.service.ts) owns source loading;
[pure score engine](../../../../../packages/ui/pixels/pixels-score.ts) owns scoring.
[Year model](pixels-model.ts) and [life model](life-model.ts) own their projections.
Reuse them instead of copying date, dominance, cap or threshold calculations.

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
