from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.finance.backend.kdf_policy import MAX_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS
from apps.finance.backend.schemas_vault import VaultCreateRequest

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
    username: Optional[str] = None
    display_name: str
    role: UserRoleValue
    is_active: bool
    must_change_password: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: Optional[datetime] = None


class LoginRequest(EmailMixin):
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    user: UserPublic
    csrf_token: str


class AuthPrivateKeyWrap(BaseModel):
    kdf_salt_b64: str = Field(..., min_length=16, max_length=4096)
    kdf_iterations: int = Field(MIN_PBKDF2_ITERATIONS, ge=MIN_PBKDF2_ITERATIONS, le=MAX_PBKDF2_ITERATIONS)
    wrapped_private_key_b64: str = Field(..., min_length=16, max_length=8192)
    # Legacy field; recovery-key path removed. Empty string means unused.
    recovery_wrapped_private_key_b64: str = Field("", max_length=8192)


class PasswordlessEnrollRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    auth: AuthPrivateKeyWrap
    # Same vault payload as bootstrap/invitation so migration is one step to a usable vault.
    vault: VaultCreateRequest


class InvitationEnrollRequest(BaseModel):
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    vault: VaultCreateRequest
    auth: AuthPrivateKeyWrap


class PasswordlessBootstrapRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(..., min_length=1, max_length=160)
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    vault: VaultCreateRequest
    auth: AuthPrivateKeyWrap


class PasswordlessSignupRequest(BaseModel):
    """Self-signup. Closed unless AUTH_SIGNUP_MODE opens it."""
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field("", max_length=160)
    public_key_b64: str = Field(..., min_length=16, max_length=4096)
    vault: VaultCreateRequest
    auth: AuthPrivateKeyWrap
    invite_code: str = Field("", max_length=256)


class PasswordlessChallengeRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)


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


class MeResponse(BaseModel):
    user: UserPublic
    csrf_token: Optional[str] = None
    # True only when this response was served through the local dev auth bypass.
    local_dev: bool = False


class AdminUserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(..., min_length=1, max_length=160)
    role: UserRoleValue = "user"


class AdminInvitationResponse(UserPublic):
    enrollment_token: str


class InvitationPreview(BaseModel):
    username: str
    display_name: str
    expires_at: datetime


class AdminUserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=160)
    role: Optional[UserRoleValue] = None
    is_active: Optional[bool] = None


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
