# Town and private Health

The [Town server](../../../../server/town/) owns habit/XP/calendar rules;
[clock](../../../../server/town/clock.py) is the time authority. UI code projects
those results rather than maintaining a competing ledger. Habit streak weeks and
Finance budget-kept weeks have different meanings; treasury integration must preserve that.

[Health store](health/health-store.service.ts) owns browser-local Health records
through Finance's public vault API. Keep one store and immediate lock/session
invalidation. Check owner and generation after every asynchronous stage before
publishing/returning plaintext. Preserve corrupt/unsupported rows, revision conflicts
and drafts; never send private Health values through Town server payloads.
Cross-domain Town presentation receives approved stages/counts only.

Use [health constants](health/health.constants.ts) and existing pure logic for units,
thresholds and badges. Do not duplicate conversion or XP math to simplify a template.

Keep dialogs and display components small by reusing shared interaction owners;
extract only when it removes repeated decisions. Town reset fixtures and worker
clock ownership must remain deterministic. Root test gates apply, including the
Town Playwright config for affected screens and server coverage for Town backend work.
