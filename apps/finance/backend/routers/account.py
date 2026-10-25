"""Signed-in account settings. Username changes keep the same user id."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from apps.finance.backend.auth import get_current_user, public_user, utc_now_naive
from apps.finance.backend.database import get_db
from apps.finance.backend.models import User
from apps.finance.backend.schemas_auth import (
    DisplayNameUpdate,
    UsernameChangeRequest,
    UserPublic,
    normalize_display_name,
)
from apps.finance.backend.services.username_change import change_username

router = APIRouter(tags=["account"])


@router.patch("/account/name", response_model=UserPublic)
def change_account_name(
    body: DisplayNameUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserPublic:
    try:
        current_user.display_name = normalize_display_name(body.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    current_user.updated_at = utc_now_naive()
    db.commit()
    db.refresh(current_user)
    return UserPublic.model_validate(public_user(current_user))


@router.patch("/account/username", response_model=UserPublic)
def change_account_username(
    body: UsernameChangeRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserPublic:
    updated = change_username(db, current_user, body, request)
    return UserPublic.model_validate(public_user(updated))
