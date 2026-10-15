import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import create_app  # noqa: E402
from src.crypto import (  # noqa: E402
    compute_shared_secret,
    encrypt_message,
    export_public_key,
    generate_ecc_key,
    import_public_key,
)


ALLOWED_ORIGIN = "https://portfolio.example"


def _exchange_keys(socket_client):
    client_private_key = generate_ecc_key()
    request_id = "key-exchange-1"
    socket_client.emit(
        "exchange_keys",
        {
            "request_id": request_id,
            "public_key": export_public_key(client_private_key.public_key()).hex(),
        },
    )
    reply = next(
        message["args"][0]
        for message in socket_client.get_received()
        if message["name"] == "server_public_key"
    )
    assert reply["request_id"] == request_id
    server_public_key = import_public_key(bytes.fromhex(reply["public_key"]))
    shared_key = compute_shared_secret(client_private_key, server_public_key)
    return shared_key


def _encrypted_payload(shared_key, prompt, request_id):
    iv, tag, ciphertext = encrypt_message(shared_key, prompt)
    return {
        "request_id": request_id,
        "iv": iv.hex(),
        "ciphertext": ciphertext.hex(),
        "tag": tag.hex(),
    }


def _event(socket_client, event_name):
    return next(
        message["args"][0]
        for message in socket_client.get_received()
        if message["name"] == event_name
    )


def test_socket_events_exchange_key_decrypt_and_correlate_request_ids():
    received_prompts = []
    app, socketio = create_app(
        llm_response=lambda prompt: received_prompts.append(prompt) or f"answer: {prompt}",
        allowed_origins=[ALLOWED_ORIGIN],
    )
    assert app.debug is False
    client = socketio.test_client(app, headers={"Origin": ALLOWED_ORIGIN})
    assert client.is_connected()

    shared_key = _exchange_keys(client)
    request_id = "decrypt-42"
    payload = _encrypted_payload(shared_key, "hello from the browser", request_id)
    assert "shared_key" not in payload
    client.emit("decrypt_message", payload)

    reply = _event(client, "decrypted_message")
    assert reply == {"request_id": request_id, "text": "answer: hello from the browser"}
    assert received_prompts == ["hello from the browser"]


def test_socket_sessions_cannot_decrypt_each_others_prompts():
    received_prompts = []
    app, socketio = create_app(
        llm_response=lambda prompt: received_prompts.append(prompt) or "answer",
        allowed_origins=[ALLOWED_ORIGIN],
    )
    first_client = socketio.test_client(app, headers={"Origin": ALLOWED_ORIGIN})
    second_client = socketio.test_client(app, headers={"Origin": ALLOWED_ORIGIN})
    first_key = _exchange_keys(first_client)
    second_key = _exchange_keys(second_client)
    assert first_key != second_key

    second_payload = _encrypted_payload(second_key, "second session prompt", "cross-session-9")
    first_client.emit("decrypt_message", second_payload)

    error = _event(first_client, "error")
    assert error == {
        "request_id": "cross-session-9",
        "message": "The encrypted prompt could not be processed.",
    }
    assert received_prompts == []


def test_socket_decrypt_errors_are_generic_and_keep_the_request_id():
    app, socketio = create_app(
        llm_response=lambda prompt: "unused",
        allowed_origins=[ALLOWED_ORIGIN],
    )
    client = socketio.test_client(app, headers={"Origin": ALLOWED_ORIGIN})
    _exchange_keys(client)
    client.emit(
        "decrypt_message",
        {"request_id": "invalid-tag-7", "iv": "00" * 12, "ciphertext": "00", "tag": "00" * 16},
    )

    error = _event(client, "error")
    assert error["request_id"] == "invalid-tag-7"
    assert error["message"] == "The encrypted prompt could not be processed."
    assert "InvalidTag" not in error["message"]


def test_socket_disconnect_removes_its_session_key():
    app, socketio = create_app(
        llm_response=lambda prompt: "unused",
        allowed_origins=[ALLOWED_ORIGIN],
    )
    client = socketio.test_client(app, headers={"Origin": ALLOWED_ORIGIN})
    _exchange_keys(client)
    sessions = app.extensions["site_socket_sessions"]
    assert len(sessions) == 1
    assert next(iter(sessions.values()))["shared_key"] is not None

    client.disconnect()

    assert sessions == {}


def test_engineio_handshake_allows_configured_origin_and_rejects_others():
    app, _ = create_app(llm_response=lambda prompt: "unused", allowed_origins=[ALLOWED_ORIGIN])
    test_client = app.test_client()
    allowed = test_client.get(
        "/socket.io/?EIO=4&transport=polling",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    denied = test_client.get(
        "/socket.io/?EIO=4&transport=polling",
        headers={"Origin": "https://attacker.example"},
    )

    assert allowed.status_code == 200
    assert allowed.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    assert denied.status_code in {400, 403}


@pytest.mark.parametrize("origins", ["*", [], ["*"]])
def test_wildcard_or_empty_cors_configuration_is_rejected(origins):
    with pytest.raises(ValueError):
        create_app(llm_response=lambda prompt: "unused", allowed_origins=origins)
