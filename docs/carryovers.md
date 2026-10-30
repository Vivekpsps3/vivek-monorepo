# Carryovers

Deferred from the Town TB1 security review of pull request #27
(https://github.com/Vivekpsps3/vivek-monorepo/pull/27#pullrequestreview-5709495527).
These need DDL. This follow-up does not add an Alembic revision. Head stays `site_town_v1`.

- Composite foreign key `(habit_id, user_id)` from `habit_checkins` and `habit_cadences` to `habits(id, user_id)`, which needs `UNIQUE(id, user_id)` on `habits`.
- Explicit `ondelete="RESTRICT"` on `habit_cadences.habit_id`. That foreign key is currently NO ACTION. `habit_checkins.habit_id` is already `RESTRICT`.
- Index on `habit_cadences.user_id` (`ix_habit_cadences_user_id`). `habits` and `habit_checkins` already index `user_id`.
- Database CHECK constraints on `per_week` (1..7), `slot` range, and `building_style`.

TB2B enforces these without that DDL. An owner-scoped habit lookup always takes the child's `user_id` from the looked-up habit, never from the request, and request validation covers `per_week`, `slot`, and `building_style`.
