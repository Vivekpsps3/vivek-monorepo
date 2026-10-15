import logging
import os
from collections.abc import Callable, Sequence
from typing import Any

from flask import Flask, request
from flask_socketio import SocketIO, emit

from src import crypto
from src.config import configured_allowed_origins

MAX_REQUEST_ID_LENGTH = 128
logger = logging.getLogger(__name__)


def _request_id(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("request_id")
    if isinstance(value, str) and 0 < len(value) <= MAX_REQUEST_ID_LENGTH:
        return value
    return None


def _default_llm_response(prompt: str) -> str:
    # Keep local model setup out of app imports and tests. The demo server receives
    # plaintext after decrypting it and sends that prompt to its configured model.
    from src.llm import get_chat_response

    return get_chat_response(prompt)


def create_app(
    llm_response: Callable[[str], str] | None = None,
    allowed_origins: str | Sequence[str] | None = None,
) -> tuple[Flask, SocketIO]:
    """Build an isolated Socket.IO app, with its model call injectable for tests."""
    app = Flask(__name__)
    app.config["DEBUG"] = False
    origins = configured_allowed_origins(allowed_origins)
    socketio = SocketIO(app, async_mode="threading", cors_allowed_origins=list(origins))
    sessions: dict[str, dict[str, bytes | None]] = {}
    server_private_key = crypto.generate_ecc_key()
    server_public_key_hex = crypto.export_public_key(server_private_key.public_key()).hex()
    respond = llm_response or _default_llm_response
    app.extensions["site_socket_sessions"] = sessions

    @socketio.on("connect")
    def handle_connect():
        logger.info("Encryption demo client connected")
        sessions[request.sid] = {"shared_key": None}

    @socketio.on("disconnect")
    def handle_disconnect():
        sessions.pop(request.sid, None)
        logger.info("Encryption demo client disconnected")

    @socketio.on("exchange_keys")
    def exchange_keys(client_key_data):
        request_id = _request_id(client_key_data)
        try:
            session = sessions.get(request.sid)
            if session is None:
                raise ValueError("Client session is not initialized")
            session["shared_key"] = None

            public_key_hex = (
                client_key_data.get("public_key")
                if isinstance(client_key_data, dict)
                else client_key_data
            )
            if not isinstance(public_key_hex, str) or len(public_key_hex) > 512:
                raise ValueError("Invalid public key")

            client_public_key = crypto.import_public_key(bytes.fromhex(public_key_hex))
            shared_key = crypto.compute_shared_secret(server_private_key, client_public_key)
            session["shared_key"] = shared_key

            if request_id is None:
                emit("server_public_key", server_public_key_hex)
            else:
                emit("server_public_key", {"request_id": request_id, "public_key": server_public_key_hex})
        except Exception as error:
            logger.warning("Encryption demo key exchange failed (%s)", type(error).__name__)
            emit("error", {"request_id": request_id, "message": "Key exchange failed"})

    @socketio.on("decrypt_message")
    def decrypt_message(data):
        request_id = _request_id(data)
        try:
            session = sessions.get(request.sid)
            plaintext = crypto.decrypt_message_for_session(session, data)
            response_text = respond(plaintext.decode("utf-8"))
            if not isinstance(response_text, str):
                raise TypeError("The model response must be text")
            emit("decrypted_message", {"request_id": request_id, "text": response_text})
        except Exception as error:
            logger.warning("Encryption demo prompt could not be processed (%s)", type(error).__name__)
            emit(
                "error",
                {
                    "request_id": request_id,
                    "message": "The encrypted prompt could not be processed.",
                },
            )

    return app, socketio


app, socketio = create_app()


if __name__ == "__main__":
    logger.info("Starting encryption demo with debug mode disabled")
    port = int(os.environ.get("SITE_PORT", "5000"))
    socketio.run(
        app,
        host=os.environ.get("SITE_HOST", "0.0.0.0"),
        port=port,
        debug=os.environ.get("SITE_DEBUG", "false").lower() in {"1", "true", "yes"},
    )
