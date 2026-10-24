"""Username rules used by passwordless signup and username changes.

Signup's request models accept ``^[a-zA-Z0-9_.-]{3,64}$`` and the handlers
store ``normalize_email`` (strip, then lowercase). ``@`` cannot appear, so an
email address is not a username. Uniqueness is case-insensitive because only
the lowercase form is stored.
"""

from __future__ import annotations

import re

USERNAME_MIN = 3
USERNAME_MAX = 64
USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]+$"
USERNAME_RE = re.compile(rf"^[a-zA-Z0-9_.-]{{{USERNAME_MIN},{USERNAME_MAX}}}$")


class InvalidUsername(ValueError):
    """The candidate fails the signup username rules."""


def stored_username(raw: object) -> str:
    """Return the lowercase username signup would store."""
    if not isinstance(raw, str) or USERNAME_RE.fullmatch(raw) is None:
        raise InvalidUsername("Invalid username")
    return raw.strip().lower()
