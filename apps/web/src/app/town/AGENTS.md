# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. UI projects those
results. Habit streak weeks and Finance budget-kept weeks differ; treasury
integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local Health records
through Finance's public vault API. Clinic and Gym mount
[the health room](health/health-room.component.ts). The room is not a second store.
Check owner and generation before publishing plaintext. Preserve corrupt rows,
revision conflicts, and drafts. Never send private Health values in Town payloads.
Cross-domain Town views receive approved stages and counts only.

Clinic creates, corrects, and deletes weight, heart rate, blood pressure, sleep, labs, and checkups. Each kind shows latest, a sparkline, and 100 records. Labs group below, in, above, or with no range. Saves send the expected revision. Units do not rewrite values. Logged dates stay immutable. Deletion needs the exact phrase. Sessions, exercises, and routines use health_workouts in kilograms, metres, and seconds. Drafts keep measured date, logged date, set ids, and entered sets. A stale save keeps it. Archiving leaves past sets unchanged. Records stay in health_prs. Gym progress derives one view of those records and completed sets, with no second row. Estimated max, pace, and previous best stay derived. No plaintext workout endpoint.

Use [health constants](health/health.constants.ts) and existing pure logic for units,
thresholds, and badges. Do not duplicate conversion or XP math.

Reuse shared controls. Town reset fixtures and the worker clock stay
deterministic. Root gates still apply.

The Town exterior and the Reading Hall share the y-down [frame](library-room.scene.ts).
One rectangle paints and picks; the higher layer wins. Pan, zoom, tap, drag, and
cancel use it. Keyboard and list share cutaway, fade, and the sheet. The URL keeps
both without scrolling. Locked, empty, and archived lots too. Room art loads only
on that route. Clinic and Gym read [loadTownHealthStages](health/index.ts).
