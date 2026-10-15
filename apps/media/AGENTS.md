# Media journal

Follow the [root handoff](../../AGENTS.md) and [Media docs](../../docs/MEDIA.md).

- Media is a private journal in `apps/media/` with its own SQLite file, `media.db`. It must not open `finance.db`, `travel.db`, or the finance vault.
- The suite uses the finance session cookie. Reads authorize through finance `GET /api/auth/me`. Writes use `POST /api/auth/session` and the finance CSRF token.
- Ratings, reviews, experiences, progress, and anticipation are scoped to the signed-in finance user id. Catalog metadata may be shared. Personal rows are not.
- Manual entry is the primary workflow. TMDB and RAWG are optional server-side metadata. MusicBrainz, the Cover Art Archive, and Open Library do not need keys. Do not add Spotify, Trakt, or scraping.
- An experience must not change the canonical rating or review.
- Run `make media-test` after backend or journal UI changes. The root Makefile owns the command.
