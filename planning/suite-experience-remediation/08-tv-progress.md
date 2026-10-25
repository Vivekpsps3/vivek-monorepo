# TV progress, caught-up action, and production lifecycle

Treat three dimensions independently:

1. **Personal intent/progress:** want to watch, watching, paused, dropped, watched.
2. **Derived progress:** caught up to known aired episodes, episodes remaining, waiting for next season, or metadata incomplete.
3. **Production lifecycle:** ongoing/returning, ended, canceled when distinguishable, or unknown, with source and last refresh.

“Watched” must not imply ended. “Caught up” must not mean future episodes are already watched. Lack of known future dates must not prove a show has ended.

## TV-01 — Mark caught up

Current sources: `services/records.py::episode_state/mark_next/mark_watched/save_season`, `models.py::EpisodeProgress/SeasonProgress`, `routers/journal.py`, `static/modules/app.mjs` episode controls. A derived `caught_up` field already exists; extend the actual command and semantics.

- [ ] Add a clearly labeled Mark caught up action to TV detail and an appropriate compact library/Now affordance.
- [ ] Scope defaults to all known aired regular episodes of the show, not merely the visible season. State episode count and cutoff; offer per-season command only with explicit label.
- [ ] Execute atomically on the server with user ownership, CSRF and input validation. Repeating the command is idempotent.
- [ ] Mark only eligible unwatched episodes. Preserve existing watched_on values, historical notes, season ratings and overall review/score.
- [ ] Define aired cutoff: use known air instant when available, otherwise documented provider-local/date behavior. The user's timezone must not shift future dates into the past accidentally.
- [ ] Unknown air date is unknown, not automatically aired for bulk completion. Offer explicit individual override or metadata correction if necessary.
- [ ] Specials excluded by default with a clear optional scope; no-episode and incomplete-provider data get honest “Progress unavailable/incomplete” states rather than confident caught-up claims.
- [ ] Return changed episode IDs/operation token or equivalent so Undo reverses only marks added by that command. Concurrent later edits are preserved or reported as conflicts.
- [ ] Reconcile season watched state with episode progress: prefer episode truth where episodes are known; preserve manual season completion for unknown metadata as explicitly manual. Do not silently unwatch a season or mark future episodes due to one checkbox.
- [ ] Display Caught up · Waiting for next episode/season while personal watch intent remains active.
- [ ] New aired episodes transition derived progress to New episode available; do not override explicit paused/dropped intent.

Acceptance fixture: S1 episodes aired and unwatched, S2 announced with future episodes. Mark caught up changes only aired S1 marks, displays waiting for S2, retains review and season score, and Undo restores only the new marks.

## TV-02 — Production status and refresh

- [ ] Normalize provider lifecycle values into an app-owned enum with original value, source ID and fetched_at. TVMaze currently returns lifecycle data upstream but search normalization discards it.
- [ ] Fetch lifecycle from show detail; search previews may use lightweight fields but saved detail is refreshed with bounded freshness policy.
- [ ] Show readable Ongoing / Ended / Canceled / Status unknown badges in library, detail and applicable search results. Preserve source nuance when provider only knows Ended.
- [ ] Unknown or stale lifecycle is labeled honestly. Manual shows remain unknown until manually set or explicitly linked to a chosen provider show.
- [ ] Provide Link metadata for manual shows through a confirmation picker; never silently attach a similarly named TVMaze result.
- [ ] Refresh episodes/lifecycle outside DB write locks and outside unrestricted read-time fanout; coalesce requests and retain stored metadata on outage.
- [ ] Ongoing shows previously marked completed still surface newly aired episodes appropriately; current `next_episodes` status filtering excludes completed and needs deliberate migration/logic update.
- [ ] Calendar and Hub consume the same next-episode identity, production state and progress rules. Changes remain private per user.
- [ ] Avoid refreshing an entire TV library on every page view; prioritize opened/followed stale shows with strict budgets and a visible retry.

## Regression matrix

- [ ] Ongoing, ended, canceled, unknown, provider conflict and stale lifecycle.
- [ ] All aired watched, one aired unwatched, future-only metadata, no metadata, unknown air dates and specials.
- [ ] New episode added, air date changed, episode renumbering, partial provider page and temporary removal.
- [ ] Mark caught up twice, undo, another tab edits progress, changed season scope and cross-user attempt.
- [ ] Watching, paused, dropped, completed ongoing show, manual linked show and manual unlinked show.
- [ ] Midnight/timezone/DST boundary; no test relies on wall-clock “today” without fixture control.
- [ ] Library, detail, Now, calendar and Hub agree after refresh, reload and Back navigation.
