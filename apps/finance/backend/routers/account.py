"""Signed-in account settings. Username changes keep the same user id."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.finance.backend.auth import get_current_user, public_user
from apps.finance.backend.database import get_db
from apps.finance.backend.models import User
from apps.finance.backend.schemas_auth import UsernameChangeRequest, UserPublic
from apps.finance.backend.services.username_change import change_username

router = APIRouter(tags=["account"])


@router.patch("/account/username", response_model=UserPublic)
def change_account_username(
    body: UsernameChangeRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserPublic:
    updated = change_username(db, current_user, body, request)
    return UserPublic.model_validate(public_user(updated))
