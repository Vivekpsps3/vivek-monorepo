# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. UI projects those
results. Habit streak weeks and Finance budget-kept weeks differ; treasury
integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local Health records
through Finance's public vault API. Clinic and Gym mount
[the health room](health/health-room.component.ts) for locked, setup, and unlock
routing. The room is not a second store. Keep one store and immediate lock/session
invalidation. Check owner and generation after every asynchronous stage before
publishing plaintext. Preserve corrupt/unsupported rows, revision conflicts and
drafts; never send private Health values through Town server payloads.
Cross-domain Town presentation receives approved stages/counts only.

Weight, resting heart rate, blood pressure, sleep, labs, and checkups are created,
corrected, and deleted through that store. Labs group by name and show value, unit,
and below, in, above, or no range. Those words only compare typed numbers. A save
sends the expected revision. Display units do not rewrite stored kilograms or lab
units. Logged dates stay on the original day. Deletion requires the exact confirmation phrase.

Use [health constants](health/health.constants.ts) and existing pure logic for units,
thresholds and badges. Do not duplicate conversion or XP math.

Keep dialogs small by reusing shared interaction owners. Town reset fixtures and
worker clock ownership stay deterministic. Root test gates apply, including Town
Playwright and server coverage for Town backend work.

Reading Hall's [asset metadata](library-room.assets.ts) owns bounds, anchors,
layers, palette and source. One room rectangle paints and picks each object; the
higher layer wins an overlap. Pan and zoom use that rectangle. A tap opens the
front object; a drag or pointer cancel does not. The keyboard list reaches those
objects. Art loads only on the room route, and the list survives an art failure.
No room animation runs off-route. Camera is not a second store.
