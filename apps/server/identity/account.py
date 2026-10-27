"""Signed-in account settings. Username changes keep the same user id."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.server.database import get_db
from apps.server.identity.models import User
from apps.server.identity.schemas import (
    DisplayNameUpdate,
    UsernameChangeRequest,
    UserPublic,
    normalize_display_name,
)
from apps.server.identity.session import get_current_user, public_user, utc_now_naive
from apps.server.identity.username_change import change_username

router = APIRouter(tags=["account"])


@router.patch("/account/name", response_model=UserPublic)
def change_account_name(
    body: DisplayNameUpdate,
    db: Annotated[Session, Depends(get_db, scope="function")],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserPublic:
    try:
        name = normalize_display_name(body.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(display_name=name, updated_at=utc_now_naive())
    )
    db.commit()
    db.refresh(current_user)
    return UserPublic.model_validate(public_user(current_user))


@router.patch("/account/username", response_model=UserPublic)
def change_account_username(
    body: UsernameChangeRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db, scope="function")],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserPublic:
    updated = change_username(db, current_user, body, request)
    return UserPublic.model_validate(public_user(updated))
