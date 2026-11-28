# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. Habit streak weeks and Finance budget-kept weeks differ; treasury
integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local records through Finance's vault API.
[Health rooms](health/health-room.component.ts) put vault and record actions first.
Check owner and generation before publishing plaintext. Preserve corrupt rows,
revision conflicts, and drafts. Never send private Health values in Town payloads.
Cross-domain Town views receive approved stages and counts only.

Clinic creates, corrects, and deletes weight, heart rate, blood pressure, sleep, labs, and checkups. Each kind shows latest, sparkline, and 100 records. Labs group below, in, above, or no range. Saves send the expected revision. Units do not rewrite values. Logged dates stay immutable. Deletion needs the exact phrase. Sessions, exercises, and routines use health_workouts in kilograms, metres, and seconds. Drafts keep measured date, logged date, set ids, and entered sets. A stale save keeps it. Archiving leaves past sets unchanged. Records stay in health_prs. Upstairs projects those records and sets once. Estimates stay derived. Guarded `/town/review` preserves drafts and source. No XP. No plaintext workout endpoint. Rest timer is local; leave or lock disposes.

Use [health constants](health/health.constants.ts) for units and thresholds.
Do not duplicate XP conversion.

Finished chapters grant 10 Stamps and a keepsake once. Discoveries grant nothing. Samples award no XP.

Town's y-down [frame](library-room.scene.ts) supports [paint picking](town-exterior.component.ts). Home projects one layout, checks revisions and entitlements, preserves unsupported records, and clears drafts and notes on lock. `/town/memory` and `/town/rhythm` keep the session board. Play receipts grant Stamps and omit Health and Finance. [Workshop](workshop.component.ts) confirms fixed prices and refunds unused furniture. Locked, empty, and archived lots clear check-in marks on Undo, owner, or day change. Clinic and Gym read [loadTownHealthStages](health/index.ts). Welcome grants 2 Stamps once; ranks do not decay; away residents stay listed.
