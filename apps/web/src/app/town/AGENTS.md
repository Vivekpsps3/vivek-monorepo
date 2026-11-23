# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. UI projects those
results. Habit streak weeks and Finance budget-kept weeks differ; treasury
integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local Health records
through Finance's public vault API. Clinic and Gym mount
[the health room](health/health-room.component.ts).
Check owner and generation before publishing plaintext. Preserve corrupt rows,
revision conflicts, and drafts. Never send private Health values in Town payloads.
Cross-domain Town views receive approved stages and counts only.

Clinic creates, corrects, and deletes weight, heart rate, blood pressure, sleep, labs, and checkups. Each kind shows latest, sparkline, and 100 records. Labs group below, in, above, or no range. Saves send the expected revision. Units do not rewrite values. Logged dates stay immutable. Deletion needs the exact phrase. Sessions, exercises, and routines use health_workouts in kilograms, metres, and seconds. Drafts keep measured date, logged date, set ids, and entered sets. A stale save keeps it. Archiving leaves past sets unchanged. Records stay in health_prs. The upstairs wall and cabinet read one progress view of those records and completed sets, with no second row. Estimates stay derived. Review: `/town/review` only, no XP. No plaintext workout endpoint.

Use [health constants](health/health.constants.ts) for units, thresholds, and badges.
Do not duplicate conversion or XP math.

Town reset fixtures and worker clock stay deterministic.
See [scene-appearance](../platform/scene-appearance.ts). Gym objects open that dialog.

The Town exterior, Reading Hall, Hall, and [cosmetic catalog](cosmetic-catalog.ts) share the y-down [frame](library-room.scene.ts).
Higher layer wins. Pan, zoom, tap, drag, cancel use it. `/town/hall` shows rules,
progress, and history. `/town/cosmetics` lists twelve free starters and twelve shop items.
Milestone ornaments stay separate. Keyboard and the URL share cutaway. Locked,
empty, and archived lots. Check-in marks clear on Undo, owner or day change. The keepsake shelf stores nothing. Clinic and Gym read [loadTownHealthStages](health/index.ts).
