# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. UI projects those
results. Habit streak weeks and Finance budget-kept weeks differ; treasury
integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local Health records
through Finance's public vault API. Clinic and Gym mount
[the health room](health/health-room.component.ts) for locked, setup, and unlock
routing. The room is not a second store. Check owner and generation after every
asynchronous stage before publishing plaintext. Preserve corrupt rows, revision
conflicts, and drafts. Never send private Health values in Town payloads.
Cross-domain Town views receive approved stages and counts only.

Clinic creates, corrects, and deletes weight, heart rate, blood pressure, sleep, labs, and checkups. Each kind shows its latest, sparkline, and 100 records. Labs group by name and show below, in, above, or no range. Saves send the expected revision. Display units do not rewrite stored values. Logged dates stay immutable. Deletion requires the exact confirmation phrase. Sessions, exercises, and routines use health_workouts in kilograms, metres, and seconds. A draft keeps measured date, logged date, set ids, and only entered sets. A stale save keeps it. Personal records stay in health_prs. No plaintext workout endpoint.

Use [health constants](health/health.constants.ts) and existing pure logic for units,
thresholds, and badges. Do not duplicate conversion or XP math.

Reuse shared controls. Town reset fixtures and worker clock ownership stay
deterministic. Root test gates apply, including Town Playwright and server
coverage for Town backend work.

The Town exterior and the Reading Hall share the y-down [frame](library-room.scene.ts).
One rectangle paints and picks; the higher layer wins. Pan, zoom, tap, drag, and
cancel use it. Keyboard and list share cutaway, fade, and the sheet. The URL keeps
both. Locked, empty, and archived lots too. Room art loads only on the Reading Hall
route. Clinic and Gym read [loadTownHealthStages](health/index.ts).
