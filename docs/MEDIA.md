# Media journal

Media is a separate app in `apps/media/`. The suite hosts it at `/media/`. It checks the finance session cookie by calling the finance API. It does not open `finance.db`, the encrypted vault, or travel data.

Personal data is private to the signed-in user: library entries, the one overall rating and review, optional experiences, episode progress, favorites, tags, and anticipation. Catalog rows hold public metadata and can be shared by provider id. There is no public profile, feed, or social action.

`GET /api/summary` returns a short authenticated snapshot for the Hub: items in progress, recent review excerpts, anticipated releases, and the next episode of a followed show. It does not include the full review text.

## Logging

Manual entry is enough. From the journal: search, or Add, then set a status, a rating out of 10 in half steps, and an optional review. Unrated is an empty rating. Zero is a real score.

An experience (a viewing, reread, listen, or replay) has its own date, notes, and optional score. Saving one does not change the overall rating or review.

TV progress is manual. Mark the next aired episode, or toggle a single episode. Future episodes stay upcoming. Book and game progress is an optional page, percent, or hour value.

Release dates keep the precision they were given. A month or a year is not shown as a specific day. `MEDIA_TODAY=YYYY-MM-DD` overrides the clock in tests.

## Metadata providers

| Provider | Needs a key | Used for |
| --- | --- | --- |
| TMDB | `TMDB_API_KEY` | Movies and series. Poster and vote average on TMDB’s 0–10 scale. |
| TVMaze | No, and only when `MEDIA_SCRAPE_MODE` is on | Series. Summary and average on TVMaze’s 0–10 scale. |
| iTunes Search | No, and only when `MEDIA_SCRAPE_MODE` is on | Movies. Artwork and description. No critic score. |
| MusicBrainz | No | Songs and albums. |
| Cover Art Archive | No | Album artwork, addressed by MusicBrainz release id. |
| Open Library | No | Books and covers. |
| RAWG | `RAWG_API_KEY` | Games. Rating stays on RAWG’s 0–5 scale. |

Keys stay on the server. The browser never receives them. Provider failures leave saved entries readable. Rotten Tomatoes, Metacritic, Spotify, and IGDB are not used.

`MEDIA_SCRAPE_MODE=1` is optional and off by default. When it is on, movie and series search also calls TVMaze and the iTunes Search API. Those are public catalog APIs, not page scrapers. A TMDB result for the same title and year is kept and the public duplicate is dropped. Turning the flag off leaves manual entry and the other providers unchanged.

## Local run

`make media-install` then `make media-dev` serves the app on port 8091. Sign-in for the suite is still `/auth/login` on the suite origin. Docker stores the database at `data/media.db` via `MEDIA_DATABASE_URL`.

Theme choice is `media-theme` in this browser: `system`, `light`, or `dark`.
