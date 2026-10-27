"""One principal for every domain route.

The server identity package owns users, challenges and the existing session cookie.
Domains ask this dependency for the signed-in person instead of keeping a
second principal type or calling Finance over HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from apps.server.database import get_db


@dataclass(frozen=True)
class Principal:
    id: int
    username: str | None
    display_name: str


def require_principal(
    request: Request, response: Response, db: Session = Depends(get_db, scope="function")
) -> Principal:
    from apps.server.identity.session import get_current_user

    user = get_current_user(request, response, db)
    username = user.username if isinstance(user.username, str) else None
    display_name = user.display_name if isinstance(user.display_name, str) else None
    return Principal(int(user.id), username, display_name or username or "You")
