# Media journal

> Current unified development/deployment commands are in [Operations](OPERATIONS.md).
> Standalone app commands below are historical domain references.

Media is a separate app in `apps/media/`. The suite hosts it at `/media/`. It checks the finance session cookie by calling the finance API. It does not open `finance.db`, the encrypted vault, or travel data.

Personal data is private to the signed-in user: library entries, the one overall rating and review, optional experiences, episode progress, season watched marks and season ratings, artist album scores, artist song scores, favorites, tags, and anticipation. Album and song scores are stored on their own rows. They do not change the artist rating, and the artist rating does not change them. Catalog rows hold public metadata and can be shared by provider id. There is no public profile, feed, or social action.

`GET /api/summary` returns a short authenticated snapshot for the Hub: items in progress, recent review excerpts, anticipated releases, and the next episode of a followed show. It does not include the full review text.

`GET /api/calendar?month=YYYY-MM` returns that month for the signed-in user. Omit `month` to use the current month.

## Logging

Manual entry is enough. From the journal: search, or Add, then set a status, a rating out of 10 in half steps, and an optional review. Unrated is an empty rating. Zero is a real score.

An experience (a viewing, reread, listen, or replay) has its own date, notes, and optional score. Saving one does not change the overall rating or review.

Follow an artist from search to save them and load their studio albums and the songs on those albums from MusicBrainz. Rate the artist, each album, and each song separately. A blank score stays unrated. Zero is a real score. Clearing one score does not clear the others.

TV progress is manual. Mark the next aired episode, or toggle a single episode. Future episodes stay upcoming. On a series, each season also has its own watched checkbox and rating. Those scores do not change the show rating, the summary, the review, or any episode mark. The summary and review stay the one written opinion for the whole show. A season does not have its own description. A season with no stored episodes can still be added. Clearing that season, when it is not watched and has no rating, removes it. Book and game progress is an optional page, percent, or hour value.

Release dates keep the precision they were given. A month or a year is not shown as a specific day. `MEDIA_TODAY=YYYY-MM-DD` overrides the clock in tests.

## Calendar

The calendar lists three kinds of dates:

- Episodes of every series in the library, including shows you finished or dropped, when the air date falls in the month. A show saved from TVMaze refreshes its episode list from TVMaze. A show saved from TMDB refreshes seasons only when `TMDB_API_KEY` is set. A show you typed in uses the episodes you entered. The journal does not look up a TVMaze id for a manual title.
- Movies marked anticipating, or flagged as anticipated. A day lands on that day. A month or a year stays in a "sometime in" band for that month or year.
- Sequels and spin-offs of movies you finished, or logged a watch or rewatch for. Want, in progress, paused, and dropped do not count unless a watch or rewatch is logged. When the movie was saved from TMDB and a key is set, its collection is included. Wikidata supplies sequels (`P156`, and films that follow this one), spin-offs (`P2512`), and later parts of the same series (`P179`). Results are cached for about 24 hours and are not added to the library. A follow-up you already finished is left off.

The movie title and year are sent to Wikidata, and to TMDB when a key is set. Episode refresh sends the provider id already stored for that show. If a lookup fails, saved episodes stay as they were. The first view loads a limited number of uncached lookups; open the month again to fill in the rest.

## Metadata providers

| Provider | Needs a key | Used for |
| --- | --- | --- |
| TMDB | `TMDB_API_KEY` for the official API. Movie search still works without it by reading TMDB’s public search page. | Movies and series when a key is set. Movies only, from the public page, when it is not. Poster. Vote average on TMDB’s 0–10 scale comes from the official API. |
| TVMaze | No | Series search. The calendar also refreshes episodes for a show already saved from TVMaze. |
| iTunes Search | No, and only when `MEDIA_SCRAPE_MODE` is on | Extra movie results. Artwork and description. No critic score. |
| Steam store search | No | Games when `RAWG_API_KEY` is not set. Title and capsule image. No Metacritic score. |
| MusicBrainz | No | Artists, songs, and albums. Following an artist loads that artist's studio albums and songs. No key. |
| Cover Art Archive | No | Album artwork, addressed by MusicBrainz release id. |
| Open Library | No | Books and covers. |
| RAWG | `RAWG_API_KEY` | Games when the key is set. Rating stays on RAWG’s 0–5 scale. |

Keys stay on the server. The browser never receives them. Provider failures leave saved entries readable. Rotten Tomatoes, Metacritic, Spotify, and IGDB are not used.

Series search calls TVMaze with no key. Movie search calls TMDB’s official API when `TMDB_API_KEY` is set, and otherwise reads TMDB’s public search page for the title and poster. Game search calls RAWG when `RAWG_API_KEY` is set, and otherwise calls Steam’s public store search. `MEDIA_SCRAPE_MODE=1` is optional and off by default. When it is on, movie search also calls the iTunes Search API. A TMDB result for the same title and year is kept and the iTunes duplicate is dropped. Turning the flag off leaves TVMaze, the public movie page, and Steam search in place. It does not stop the calendar from refreshing a show you already saved from TVMaze.

Wikidata is used only for the calendar follow-up lookup above. It does not need a key. It is not used for search.

## Local run

`make media-install` then `make media-dev` serves the app on port 8091. Sign-in for the suite is still `/auth/login` on the suite origin. Docker stores the database at `data/media.db` via `MEDIA_DATABASE_URL`.

Theme choice is `media-theme` in this browser: `system`, `light`, or `dark`.
