# Travel

- [Frontend](frontend/src/) owns routes and forms; [backend routers](backend/routers/)
  own API validation and owner-scoped reads/writes.
- [Leave service](backend/services/leave_math.py) owns exact PTO policy/balance math;
  [trip PTO service](backend/services/pto.py) owns trip day allocation/backfill.
- [Public API](frontend/src/public-api.ts) is the supported shell integration.
  Finance data crosses through its public API and the existing spending registry.
  A booked cost links, for this session, to one posted transaction from that
  registry. The link does not write Finance. Planned, booked, and posted stay
  separate by currency, and a linked payment is counted once. Lock or a deleted
  source clears the private spend and leaves the Travel cost usable.

Hub summary date windows require both start/end, in order, at most 42 days.
Omitted dates retain the 14-day/overdue projection and the current next-trip card.
The calendar feed shares this dated assembly with no 50-row summary display cap;
its fixed date window and response-size bound belong to server composition.

Preserve currencies as separate Travel amounts: a multi-currency trip total is not
Finance's USD total. Keep day boundaries, carry/cap/reset/history and hours-per-workday
semantics explicit. Charts display server points, including history and the
accrual boundary, without a second balance engine. Policy removal must preserve
historical entries and conflict behavior.

Reuse existing menus, confirmation, date and field controls. Migrate both real
consumers before deleting repeated editor logic. Preserve keyboard access, save-error
drafts and chart-only recovery; a failed summary must not hide usable forms.
FlightAware settings use the same editor from suite Settings, the transport
dialog, and flight-first planning. Keep that draft mounted and cancel obsolete
lookups. Plan-a-trip draft and PTO rules stay in TRAVEL.md.

Read [TRAVEL](../../docs/TRAVEL.md) for the affected journey and root instructions
for applicable gates. Pure chart/date behavior has Node tests under
[static tests](backend/static/tests/); browser journeys live in [e2e](e2e/).
Schema work also follows [MIGRATIONS](../../docs/MIGRATIONS.md).
