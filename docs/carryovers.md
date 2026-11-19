# Carryovers

Deferred from the Town TB1 security review of pull request #27
(https://github.com/Vivekpsps3/vivek-monorepo/pull/27#pullrequestreview-5709495527).
`site_town_ownership_v1` now enforces them. The public 422 responses still come
from the Town write validators. Authorization still looks up the caller's habit.

- Composite foreign key `(habit_id, user_id)` from `habit_checkins` and `habit_cadences` to `habits(id, user_id)`, with `UNIQUE(id, user_id)` on `habits`. Both delete rules are `RESTRICT`.
- Index `ix_habit_cadences_user_id`.
- CHECK constraints: `building_style` forge/garden/cottage, `per_week` 1..7 on habits and cadences, `slot` 0..5, and `name` / `name_key` length 1..40.
