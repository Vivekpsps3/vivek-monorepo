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

Weight, resting heart rate, blood pressure, sleep, labs, and checkups are created, corrected, and deleted through that store. Each kind shows its latest value and date, a 12-point sparkline with the same text, and 100 records. Show more reveals older rows. Labs group by name and show value, unit, and below, in, above, or no range. Those words only compare typed numbers. A save sends the expected revision. Display units do not rewrite stored kilograms, lab units, or revisions. Logged dates stay on the original day. Deletion requires the exact confirmation phrase.

Use [health constants](health/health.constants.ts) and existing pure logic for units,
thresholds, and badges. Do not duplicate conversion or XP math.

Reuse shared controls. Town reset fixtures and worker clock ownership stay
deterministic. Root test gates apply, including Town Playwright and server
coverage for Town backend work.

Reading Hall's [asset metadata](library-room.assets.ts) owns bounds, anchors,
layers, palette, and source. One rectangle paints and picks; the higher layer wins.
Pan and zoom use it. A tap opens the front object. A drag or pointer cancel does not.
The keyboard list reaches those objects. Art loads only on the room route. No
off-route room animation. Camera is not a second store.
