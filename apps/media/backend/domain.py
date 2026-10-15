"""Shared enums for the media journal. Personal rows never reuse these as labels."""

KINDS = ("movie", "tv", "book", "track", "album", "game")
STATUSES = ("want", "anticipating", "in_progress", "completed", "paused", "dropped")
EXPERIENCE_KINDS = ("watch", "rewatch", "read", "reread", "listen", "replay", "play")
PROGRESS_UNITS = ("page", "percent", "episode", "hour")
SOURCES = ("manual", "tmdb", "musicbrainz", "openlibrary", "rawg", "tvmaze", "itunes")
PROVIDER_SOURCES = ("tmdb", "musicbrainz", "openlibrary", "rawg", "tvmaze", "itunes")
PRECISIONS = ("day", "month", "year", "unknown")
RELEASE_STATUSES = ("scheduled", "released", "postponed", "unknown")

REVIEW_LIMIT = 20000
NOTES_LIMIT = 20000
TITLE_LIMIT = 300
SUMMARY_LIMIT = 400
