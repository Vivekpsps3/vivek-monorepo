"""Shared signed-64-bit bounds for database IDs in API paths."""

import re

from fastapi import HTTPException
from pydantic import BeforeValidator

MAX_PATH_ID = 2**63 - 1


def bounded_path_id(detail: str) -> BeforeValidator:
    """Keep each resource's unknown-ID response without sending invalid IDs to SQL."""

    def validate(value: object) -> int:
        try:
            if re.fullmatch(r"[+-]?[0-9]+", str(value)):
                parsed = int(str(value))
                if 1 <= parsed <= MAX_PATH_ID:
                    return parsed
        except ValueError:
            pass
        raise HTTPException(status_code=404, detail=detail)

    return BeforeValidator(validate)
