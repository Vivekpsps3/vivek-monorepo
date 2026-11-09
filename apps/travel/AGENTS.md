# Travel

- [Frontend](frontend/src/) owns routes and forms; [backend routers](backend/routers/)
  own API validation and owner-scoped reads/writes.
- [Leave service](backend/services/leave_math.py) owns exact PTO policy/balance math;
  [trip PTO service](backend/services/pto.py) owns trip day allocation/backfill.
- [Public API](frontend/src/public-api.ts) is the supported shell integration.
  Finance data crosses through its public API and the existing spending registry.

Preserve currencies as separate Travel amounts: a multi-currency trip total is not
Finance's USD total. Keep day boundaries, carry/cap/reset/history and hours-per-workday
semantics explicit. Charts display server points; components must not grow a second
balance engine. Policy removal must preserve historical entries and conflict behavior.

Reuse existing menus, confirmation, date and field controls. Migrate both real
consumers before deleting repeated editor logic. Preserve keyboard access, save-error
drafts and chart-only recovery; a failed summary must not hide usable forms.

Read [TRAVEL](../../docs/TRAVEL.md) for the affected journey and root instructions
for applicable gates. Pure chart/date behavior has Node tests under
[static tests](backend/static/tests/); browser journeys live in [e2e](e2e/).
Schema work also follows [MIGRATIONS](../../docs/MIGRATIONS.md).
