import base64
import hashlib
import secrets
from datetime import timedelta

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from sqlalchemy.orm import Session

from apps.finance.backend.auth import utc_now_naive
from apps.finance.backend.models import AuthChallenge, User

CHALLENGE_TTL = timedelta(minutes=5)
PROTOCOL = "vault-auth-v1"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def issue_challenge(db: Session, user: User, origin: str) -> tuple[AuthChallenge, str, str]:
    raw = secrets.token_urlsafe(32)
    expires_at = utc_now_naive() + CHALLENGE_TTL
    challenge = AuthChallenge(
        user_id=user.id,
        challenge_id=secrets.token_urlsafe(24),
        challenge_hash=_hash(raw),
        expires_at=expires_at,
    )
    db.add(challenge)
    db.flush()
    message = "\n".join([PROTOCOL, origin, expires_at.isoformat()])
    return challenge, raw, message


def _open_challenge(db: Session, user: User, challenge_id: str, raw: str) -> AuthChallenge | None:
    """Cheap reject path. A missing, expired, consumed, or mismatched challenge never reaches ECDSA."""
    challenge = db.query(AuthChallenge).filter(AuthChallenge.challenge_id == challenge_id).first()
    if not challenge or challenge.user_id != user.id or challenge.consumed_at or challenge.expires_at < utc_now_naive():
        return None
    if not user.auth_public_key_b64 or not secrets.compare_digest(challenge.challenge_hash, _hash(raw)):
        return None
    return challenge


def verify_challenge(db: Session, user: User, challenge_id: str, raw: str, message: str, signature_b64: str) -> bool:
    challenge = _open_challenge(db, user, challenge_id, raw)
    if challenge is None:
        return False
    try:
        signature = base64.b64decode(signature_b64, validate=True)
        if len(signature) != 64:
            return False
        public_key = serialization.load_der_public_key(base64.b64decode(user.auth_public_key_b64, validate=True))
        if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(public_key.curve, ec.SECP256R1):
            return False
        public_key.verify(
            encode_dss_signature(int.from_bytes(signature[:32]), int.from_bytes(signature[32:], "big")),
            message.encode(),
            ec.ECDSA(hashes.SHA256()),
        )
    except (ValueError, InvalidSignature):
        return False
    challenge.consumed_at = utc_now_naive()
    db.flush()
    return True
