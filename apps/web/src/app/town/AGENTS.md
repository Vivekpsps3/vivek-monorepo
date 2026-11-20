# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. UI code projects
those results. Habit streak weeks and
Finance budget-kept weeks differ; treasury integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local Health records
through Finance's public vault API. Clinic and Gym mount
[the health room](health/health-room.component.ts) for locked, setup, and unlock
routing. The room is not a second store. Check owner and generation after every
asynchronous stage before publishing plaintext. Preserve corrupt rows, revision
conflicts, and drafts. Never send private Health values in Town payloads.
Cross-domain Town views receive approved stages and counts only.

Clinic creates, corrects, and deletes weight, heart rate, blood pressure, sleep, labs, and checkups. Each kind shows its latest value, date, a 12-point sparkline, and 100 records. Show more reveals older rows. Labs group by name and show value, unit, and below, in, above, or no range. Those words only compare typed numbers. A save sends the expected revision. Display units do not rewrite stored kilograms, lab units, or revisions. Logged dates stay on the original day. Deletion requires the exact confirmation phrase. Gym registers exercises, routines, and sessions in health_workouts as kilograms, metres, and seconds. Oversized records stay drafts. Personal records stay in health_prs. No plaintext workout endpoint.

Use [health constants](health/health.constants.ts) and existing pure logic for units,
thresholds, and badges. Do not duplicate conversion or XP math.

Reuse shared controls. Town reset fixtures and worker clock ownership stay deterministic. Root test gates apply, including Town Playwright for affected screens.

Reading Hall's [asset metadata](library-room.assets.ts) owns display bounds,
anchors, layering, theme schemes, and source attribution. Use the same rectangle
for artwork and selection. Load room art only from the room route and keep the
object list usable when art fails. No room animation runs off-route.
