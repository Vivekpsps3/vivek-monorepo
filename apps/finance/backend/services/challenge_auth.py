import base64
import hashlib
import secrets
from datetime import timedelta

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.finance.backend.auth import utc_now_naive
from apps.finance.backend.models import AuthChallenge, User

CHALLENGE_TTL = timedelta(minutes=5)
PROTOCOL = "vault-auth-v1"
PURPOSE_LOGIN = "login"
PURPOSE_USERNAME_CHANGE = "username_change"
PURPOSES = frozenset({PURPOSE_LOGIN, PURPOSE_USERNAME_CHANGE})


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def challenge_message(challenge: AuthChallenge, origin: str) -> str:
    """The exact string the client must sign.

    The challenge id and purpose are inside the string, so a signature captured
    for one challenge or one action cannot be replayed against another.
    """
    return "\n".join(
        [
            PROTOCOL,
            origin,
            str(challenge.challenge_id),
            str(challenge.purpose),
            challenge.expires_at.isoformat(),
        ]
    )


def issue_challenge(
    db: Session, user: User, origin: str, purpose: str = PURPOSE_LOGIN
) -> tuple[AuthChallenge, str, str]:
    if purpose not in PURPOSES:
        raise ValueError("Unsupported challenge purpose")
    raw = secrets.token_urlsafe(32)
    expires_at = utc_now_naive() + CHALLENGE_TTL
    challenge = AuthChallenge(
        user_id=user.id,
        challenge_id=secrets.token_urlsafe(24),
        challenge_hash=_hash(raw),
        expires_at=expires_at,
        purpose=purpose,
    )
    db.add(challenge)
    db.flush()
    return challenge, raw, challenge_message(challenge, origin)


def _open_challenge(db: Session, user: User, challenge_id: str, raw: str) -> AuthChallenge | None:
    """Cheap reject path. A missing, expired, consumed, or mismatched challenge never reaches ECDSA."""
    challenge = db.query(AuthChallenge).filter(AuthChallenge.challenge_id == challenge_id).first()
    if (
        not challenge
        or challenge.user_id != user.id
        or challenge.consumed_at
        or challenge.expires_at < utc_now_naive()
    ):
        return None
    if not user.auth_public_key_b64 or not secrets.compare_digest(
        challenge.challenge_hash, _hash(raw)
    ):
        return None
    return challenge


def _same_message(submitted: str, issued: str) -> bool:
    submitted_bytes = submitted.encode()
    issued_bytes = issued.encode()
    if len(submitted_bytes) != len(issued_bytes):
        return False
    return secrets.compare_digest(submitted_bytes, issued_bytes)


def _consume(db: Session, challenge: AuthChallenge) -> bool:
    """Mark the row used once. A concurrent second update matches zero rows."""
    result = db.execute(
        update(AuthChallenge)
        .where(AuthChallenge.id == challenge.id, AuthChallenge.consumed_at.is_(None))
        .values(consumed_at=utc_now_naive())
    )
    db.flush()
    changed = getattr(result, "rowcount", 0)
    return changed == 1


def verify_challenge(
    db: Session,
    user: User,
    challenge_id: str,
    raw: str,
    message: str,
    signature_b64: str,
    origin: str,
    purpose: str,
) -> bool:
    challenge = _open_challenge(db, user, challenge_id, raw)
    if challenge is None or challenge.purpose != purpose:
        return False
    # Rebuild from the stored purpose. Checking the caller's purpose above is
    # what rejects a login challenge presented to rename, and the reverse.
    if not _same_message(message, challenge_message(challenge, origin)):
        return False
    try:
        signature = base64.b64decode(signature_b64, validate=True)
        if len(signature) != 64:
            return False
        public_key = serialization.load_der_public_key(
            base64.b64decode(user.auth_public_key_b64, validate=True)
        )
        if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(
            public_key.curve, ec.SECP256R1
        ):
            return False
        public_key.verify(
            encode_dss_signature(
                int.from_bytes(signature[:32]), int.from_bytes(signature[32:], "big")
            ),
            message.encode(),
            ec.ECDSA(hashes.SHA256()),
        )
    except (ValueError, InvalidSignature):
        return False
    return _consume(db, challenge)
