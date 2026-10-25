from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.finance.backend.kdf_policy import MAX_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS
from apps.finance.backend.schemas_vault import VaultCreateRequest
from apps.finance.backend.services.username_policy import (
    USERNAME_MAX,
    USERNAME_MIN,
    USERNAME_PATTERN,
)

UserRoleValue = Literal["admin", "user"]


class EmailMixin(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_basic(cls, value: str) -> str:
        clean = value.strip().lower()
        if "@" not in clean or clean.startswith("@") or clean.endswith("@"):
            raise ValueError("Invalid email")
        return clean


class UserPublic(EmailMixin):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None = None
    display_name: str
    role: UserRoleValue
    is_active: bool
    must_change_password: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class LoginRequest(EmailMixin):
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    user: UserPublic
    csrf_token: str


class AuthPrivateKeyWrap(BaseModel):
    kdf_salt_b64: str = Field(..., min_length=16, max_length=4096)
    kdf_iterations: int = Field(
        MIN_PBKDF2_ITERATIONS, ge=MIN_PBKDF2_ITERATIONS, le=MAX_PBKDF2_ITERATIONS
    )
    wrapped_private_key_b64: str = Field(..., min_length=16, max_length=8192)
    # Legacy field; recovery-key path removed. Empty string means unused.
    recovery_wrapped_private_key_b64: str = Field("", max_length=8192)


class PasswordlessEnrollRequest(BaseModel):
    username: str = Field(
        ..., min_length=USERNAME_MIN, max_length=USERNAME_MAX, pattern=USERNAME_PATTERN
    )
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    auth: AuthPrivateKeyWrap
    # Same vault payload as bootstrap/invitation so migration is one step to a usable vault.
    vault: VaultCreateRequest


class InvitationEnrollRequest(BaseModel):
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    vault: VaultCreateRequest
    auth: AuthPrivateKeyWrap


class PasswordlessBootstrapRequest(BaseModel):
    username: str = Field(
        ..., min_length=USERNAME_MIN, max_length=USERNAME_MAX, pattern=USERNAME_PATTERN
    )
    display_name: str = Field(..., min_length=1, max_length=160)
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    vault: VaultCreateRequest
    auth: AuthPrivateKeyWrap


DISPLAY_NAME_MAX = 160


def normalize_display_name(value: str) -> str:
    """Same rule for signup and the account name editor."""
    name = " ".join(str(value or "").split())
    if not name:
        raise ValueError("Enter a name.")
    if len(name) > DISPLAY_NAME_MAX:
        raise ValueError("Name must be 160 characters or fewer.")
    return name


class PasswordlessSignupRequest(BaseModel):
    """Self-signup. Closed unless AUTH_SIGNUP_MODE opens it."""

    username: str = Field(
        ..., min_length=USERNAME_MIN, max_length=USERNAME_MAX, pattern=USERNAME_PATTERN
    )
    display_name: str = Field("", max_length=DISPLAY_NAME_MAX)
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    vault: VaultCreateRequest
    auth: AuthPrivateKeyWrap
    invite_code: str = Field("", max_length=256)


class PasswordlessChallengeRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    # Omitted by the login client. Rename asks for username_change.
    purpose: Literal["login", "username_change"] = "login"


class PasswordlessChallengeResponse(BaseModel):
    challenge_id: str
    challenge: str
    message: str
    expires_at: datetime


class PasswordlessVerifyRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    challenge_id: str = Field(..., min_length=16, max_length=128)
    challenge: str = Field(..., min_length=32, max_length=256)
    message: str = Field(..., min_length=1, max_length=2048)
    signature_b64: str = Field(..., min_length=16, max_length=256)


class DisplayNameUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=DISPLAY_NAME_MAX)


class UsernameChangeRequest(BaseModel):
    """New username plus a fresh login challenge signature.

    The signature is the same proof ``/auth/passwordless/verify`` checks. The
    username is validated in the handler so a bad name is 400, not a parse error.
    """

    username: str = Field(..., max_length=256)
    challenge_id: str = Field(..., min_length=16, max_length=128)
    challenge: str = Field(..., min_length=32, max_length=256)
    message: str = Field(..., min_length=1, max_length=2048)
    signature_b64: str = Field(..., min_length=16, max_length=256)


class MeResponse(BaseModel):
    user: UserPublic
    csrf_token: str | None = None
    # True only when this response was served through the local dev auth bypass.
    local_dev: bool = False


class AdminUserCreate(BaseModel):
    username: str = Field(
        ..., min_length=USERNAME_MIN, max_length=USERNAME_MAX, pattern=USERNAME_PATTERN
    )
    display_name: str = Field(..., min_length=1, max_length=160)
    role: UserRoleValue = "user"


class AdminInvitationResponse(UserPublic):
    enrollment_token: str


class InvitationPreview(BaseModel):
    username: str
    display_name: str
    expires_at: datetime


class AdminUserUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=160)
    role: UserRoleValue | None = None
    is_active: bool | None = None


class AdminUserContentReset(BaseModel):
    confirm: str = Field(..., min_length=5, max_length=64)


class SelfDataResetRequest(BaseModel):
    confirm: str = Field(..., min_length=13, max_length=13)


class BootstrapStatusResponse(BaseModel):
    needs_setup: bool


class SignupPolicyResponse(BaseModel):
    mode: Literal["closed", "open", "invite", "allowlist"]
    signup_open: bool
    invite_code_required: bool
