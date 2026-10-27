"""Self-signup is closed unless an operator opts in.

Open signup plus the passwordless lookup response lets anyone confirm a
username and download that account's signing-key wrap. Invitation links issued
by an admin stay available in every mode; they are a separate one-time token.
"""

from __future__ import annotations

import hashlib
import os
import secrets

SIGNUP_MODES = ("closed", "open", "invite", "allowlist")
SIGNUP_UNAVAILABLE = "Signup is not available"


def signup_mode() -> str:
    raw = os.getenv("AUTH_SIGNUP_MODE", "closed").strip().lower()
    if raw in SIGNUP_MODES:
        return raw
    return "closed"


def signup_policy() -> dict:
    mode = signup_mode()
    return {
        "mode": mode,
        "signup_open": mode == "open",
        "invite_code_required": mode == "invite",
    }


def _listed(name: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


def _same(left: str, right: str) -> bool:
    return secrets.compare_digest(
        hashlib.sha256(left.encode()).digest(), hashlib.sha256(right.encode()).digest()
    )


def invite_code_matches(code: str) -> bool:
    expected = _listed("AUTH_INVITE_CODES")
    if not expected:
        return False
    candidate = (code or "").strip()
    matched = False
    for item in expected:
        matched = _same(candidate, item) or matched
    return matched


def username_allowlisted(username: str) -> bool:
    allowed = {item.strip().lower() for item in _listed("AUTH_SIGNUP_ALLOWLIST")}
    return bool(allowed) and username.strip().lower() in allowed
