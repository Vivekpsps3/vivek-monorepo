"""Stable library title order for letters SQLite lower() leaves alone."""

import unicodedata


def title_sort_key(title: str) -> str:
    folded = unicodedata.normalize("NFKD", title or "").casefold()
    stripped = "".join(character for character in folded if not unicodedata.combining(character))
    return stripped or folded
