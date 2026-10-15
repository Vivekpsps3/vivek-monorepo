import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.crypto import (  # noqa: E402
    compute_shared_secret,
    decrypt_message_for_session,
    encrypt_message,
    generate_ecc_key,
)


def test_browser_payload_uses_socket_session_key_and_ignores_client_key():
    server_private = generate_ecc_key()
    browser_private = generate_ecc_key()
    browser_key = compute_shared_secret(browser_private, server_private.public_key())
    server_key = compute_shared_secret(server_private, browser_private.public_key())
    assert browser_key == server_key

    iv, tag, ciphertext = encrypt_message(browser_key, "private prompt")
    payload = {
        "iv": iv.hex(),
        "tag": tag.hex(),
        "ciphertext": ciphertext.hex(),
        "shared_key": (b"attacker-controlled" * 2).hex(),
    }

    assert decrypt_message_for_session({"shared_key": server_key}, payload) == b"private prompt"


def test_browser_payload_without_a_negotiated_session_key_is_rejected():
    with pytest.raises(ValueError, match="Key exchange is not complete"):
        decrypt_message_for_session({}, {"iv": "00", "ciphertext": "00", "tag": "00"})
