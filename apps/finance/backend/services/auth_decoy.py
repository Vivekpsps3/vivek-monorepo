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
import tempfile
import threading
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
_decoy_lock = threading.Lock()


def _sqlite_file() -> Path | None:
    from apps.finance.backend.database import SQLALCHEMY_DATABASE_URL

    url = SQLALCHEMY_DATABASE_URL
    if ":memory:" in url or not url.startswith("sqlite:///"):
        return None
    path = url.removeprefix("sqlite:///")
    if not path:
        return None
    return Path(path)


def _classify_secret(path: Path) -> tuple[str, bytes | None]:
    """Return ``ok``, ``absent``, ``short``, or ``error``.

    ``error`` means the file may be intact but could not be read. Callers must
    not replace it.
    """
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return "absent", None
    except OSError as exc:
        logger.error(
            "auth decoy secret at %s cannot be read (%s); leaving the file in place",
            path,
            getattr(exc, "errno", exc),
        )
        return "error", None
    if len(raw) < 32:
        return "short", None
    return "ok", raw


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
    """Write a unique temp file, fsync, then link or replace into place.

    ``exclusive`` uses ``os.link`` so two creators keep the first complete secret.
    A short file is replaced instead.
    """
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    except OSError:
        return False
    tmp = Path(tmp_name)
    try:
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, raw)
            os.fsync(fd)
        except OSError:
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
        _fsync_dir(path.parent)
        return True
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


def _ensure_secret_file(path: Path) -> bytes | None:
    status, existing = _classify_secret(path)
    if status == "ok":
        return existing
    if status == "error":
        return None
    fresh = secrets.token_bytes(32)
    if status == "short":
        logger.error("auth decoy secret at %s is short; regenerating", path)
        published = _publish_secret(path, fresh, exclusive=False)
    else:
        published = _publish_secret(path, fresh, exclusive=True)
    if not published and status == "absent":
        status, existing = _classify_secret(path)
        return existing if status == "ok" else None
    status, on_disk = _classify_secret(path)
    if status == "ok":
        return on_disk
    return None


def reset_decoy_state() -> None:
    """Drop the process cache. Tests use this to simulate a restart."""
    global _cached_key, _warned_ephemeral
    with _decoy_lock:
        _cached_key = None
        _warned_ephemeral = False


def _persistent_key() -> bytes:
    global _cached_key, _warned_ephemeral
    with _decoy_lock:
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
        out += hmac.new(
            key, purpose.encode() + b"\0" + label + b"\0" + str(counter).encode(), hashlib.sha256
        ).digest()
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
