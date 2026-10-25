"""Typed failures for domain routes.

Suite session expiry stays HTTP 401 on the existing auth errors. Provider
authentication uses this type and is never returned as 401.
"""

from __future__ import annotations


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        field_errors: dict[str, str] | None = None,
        retry_after: int | None = None,
    ):
        super().__init__(message)
        # A provider or validation failure must not look like a signed-out session.
        if status_code == 401:
            status_code = 502
            if code in {"", "unauthorized"}:
                code = "provider_auth"
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field_errors = field_errors
        self.retry_after = retry_after
