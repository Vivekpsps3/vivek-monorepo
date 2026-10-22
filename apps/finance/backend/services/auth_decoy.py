"""Stable fake login material for usernames that are not enrolled.

Random decoys are an existence oracle: a second request changes, and a real
account does not. The bytes here are HMAC-derived from a server secret so the
same identifier always looks the same, and the lengths match a real P-256
signing-key wrap (WebCrypto PKCS8 is 138 bytes, packed AES-GCM adds 28).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
from pathlib import Path

from apps.finance.backend.kdf_policy import MIN_PBKDF2_ITERATIONS

logger = logging.getLogger("finance.auth")

# packages/browser encryptPackedAesGcm: 12-byte IV || ciphertext || 16-byte tag.
_AES_GCM_PACKING = 28
# WebCrypto exportKey('pkcs8') for ECDSA P-256.
_P256_PKCS8_BYTES = 138
AUTH_WRAP_BYTES = _AES_GCM_PACKING + _P256_PKCS8_BYTES
_SALT_BYTES = 16
_cached_key: bytes | None = None
_warned_ephemeral = False


def _sqlite_file() -> Path | None:
    from apps.finance.backend.database import SQLALCHEMY_DATABASE_URL

    url = SQLALCHEMY_DATABASE_URL
    if ":memory:" in url or not url.startswith("sqlite:///"):
        return None
    path = url.removeprefix("sqlite:///")
    if not path:
        return None
    return Path(path)


def _read_secret_file(path: Path) -> bytes | None:
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if len(raw) < 32:
        return None
    return raw


def _fsync_dir(directory: Path) -> None:
    try:
        fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def _publish_secret(path: Path, raw: bytes, *, exclusive: bool) -> bool:
    """Write a temp file, fsync, then link or replace into place.

    ``exclusive`` uses ``os.link`` so two processes creating the file keep the
    first complete secret. A corrupt file is replaced instead.
    """
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    except OSError:
        return False
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, raw)
        os.fsync(fd)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        return False
    finally:
        os.close(fd)
    try:
        if exclusive:
            os.link(tmp, path)
        else:
            os.replace(tmp, path)
    except FileExistsError:
        return False
    except OSError:
        return False
    else:
        if exclusive:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        _fsync_dir(path.parent)
        return True
    finally:
        try:
            if tmp.exists():
                os.unlink(tmp)
        except OSError:
            pass


def _ensure_secret_file(path: Path) -> bytes | None:
    existing = _read_secret_file(path)
    if existing is not None:
        return existing
    fresh = secrets.token_bytes(32)
    if path.exists():
        logger.error("auth decoy secret at %s is missing or short; regenerating", path)
        if _publish_secret(path, fresh, exclusive=False):
            return fresh
        return _read_secret_file(path)
    if _publish_secret(path, fresh, exclusive=True):
        return fresh
    # Another process published a complete file between the read and the link.
    return _read_secret_file(path)


def reset_decoy_state() -> None:
    """Drop the process cache. Tests use this to simulate a restart."""
    global _cached_key, _warned_ephemeral
    _cached_key = None
    _warned_ephemeral = False


def _persistent_key() -> bytes:
    global _cached_key, _warned_ephemeral
    if _cached_key is not None:
        return _cached_key
    database = _sqlite_file()
    raw: bytes | None = None
    if database is not None:
        raw = _ensure_secret_file(database.parent / "auth-decoy-secret")
    if raw is None:
        raw = secrets.token_bytes(32)
        if database is not None and not _warned_ephemeral:
            _warned_ephemeral = True
            logger.error(
                "auth decoy secret is process-local; set AUTH_DECOY_SECRET to keep responses stable across restarts"
            )
    _cached_key = hashlib.sha256(b"finance-auth-decoy-v1\0" + raw).digest()
    return _cached_key


def decoy_key() -> bytes:
    configured = os.getenv("AUTH_DECOY_SECRET", "").strip()
    if configured:
        return hashlib.sha256(b"finance-auth-decoy-v1\0" + configured.encode()).digest()
    return _persistent_key()


def _stretch(purpose: str, identifier: str, size: int) -> bytes:
    key = decoy_key()
    label = identifier.strip().lower().encode()
    out = bytearray()
    counter = 1
    while len(out) < size:
        out += hmac.new(key, purpose.encode() + b"\0" + label + b"\0" + str(counter).encode(), hashlib.sha256).digest()
        counter += 1
    return bytes(out[:size])


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def decoy_passwordless_material(identifier: str) -> dict:
    """Same JSON shape as a current enrollment, with no vault DEK and no recovery wrap."""
    return {
        "auth": {
            "kdf_salt_b64": _b64(_stretch("auth-salt", identifier, _SALT_BYTES)),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_private_key_b64": _b64(_stretch("auth-wrap", identifier, AUTH_WRAP_BYTES)),
            "recovery_wrapped_private_key_b64": "",
        },
    }
