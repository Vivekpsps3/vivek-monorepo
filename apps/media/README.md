# Media

Private journal for movies, series, books, artists, songs, albums, and games. It lives at `/media/` on the suite and uses the finance sign-in. Personal ratings and notes stay in `media.db`.

Search can enrich a title from TMDB, MusicBrainz, the Cover Art Archive, Open Library, or RAWG. Set `MEDIA_SCRAPE_MODE=1` to also ask TVMaze and the iTunes Search API for series and movies. Those calls are public metadata only. The journal still works when the providers are down or unconfigured: add the title by hand.

The calendar shows episodes for series you saved, movies you are anticipating, and sequels or spin-offs of movies you watched. A month or a year is not placed on the 1st. Follow-ups are not added to the library.

See [docs/MEDIA.md](../../docs/MEDIA.md).
