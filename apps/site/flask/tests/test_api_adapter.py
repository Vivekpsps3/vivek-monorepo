import asyncio
import importlib
import sys
from pathlib import Path

from httpx import ASGITransport, AsyncClient
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import create_app  # noqa: E402


class FakeChat:
    async def chat(self, messages, model=None):
        await asyncio.sleep(0.01)
        return f"{model}:{messages[-1]['content']}"


def test_importing_adapter_tools_does_not_load_external_chat_clients():
    assert "src.chat" not in sys.modules
    importlib.import_module("testing")
    assert "src.chat" not in sys.modules
    assert "openai" not in sys.modules


def test_first_chat_token_refresh_runs_outside_the_event_loop(monkeypatch):
    import threading
    import time

    chat_module = importlib.import_module("src.chat")
    bot = chat_module.GitHubCopilotChat()
    main_thread = threading.get_ident()
    token_threads = []

    def slow_token_refresh():
        token_threads.append(threading.get_ident())
        time.sleep(0.03)
        bot.token = "temporary-access-token"

    class FakeContent:
        def __aiter__(self):
            self.sent = False
            return self

        async def __anext__(self):
            if self.sent:
                raise StopAsyncIteration
            self.sent = True
            return b'data: {"choices":[{"delta":{"content":"answer"}}]}\n'

    class FakeResponse:
        status = 200

        def __init__(self):
            self.content = FakeContent()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def post(self, *_args, **_kwargs):
            return FakeResponse()

    bot.get_token = slow_token_refresh
    monkeypatch.setattr(chat_module.aiohttp, "ClientSession", lambda **_kwargs: FakeSession())

    result = asyncio.run(bot.chat([{"role": "user", "content": "hello"}]))

    assert result == "answer"
    assert len(token_threads) == 1
    assert token_threads[0] != main_thread


def test_api_adapter_keeps_overlapping_model_requests_isolated():
    app = create_app(chatter_factory=lambda model_id: FakeChat(), allowed_origins=["https://portfolio.example"])

    async def request_completions():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            first, second = await asyncio.gather(
                client.post(
                    "/chat/completions",
                    json={"model": "gpt-4o", "messages": [{"role": "user", "content": "first prompt"}]},
                ),
                client.post(
                    "/chat/completions",
                    json={"model": "o1", "messages": [{"role": "user", "content": "second prompt"}]},
                ),
            )
        return first, second

    first, second = asyncio.run(request_completions())

    assert first.status_code == second.status_code == 200
    assert first.json()["choices"][0]["message"]["content"] == "gpt-4o:first prompt"
    assert second.json()["choices"][0]["message"]["content"] == "o1:second prompt"


@pytest.mark.parametrize("stream", [False, True])
def test_api_adapter_returns_safe_502_for_provider_errors(stream):
    class BrokenChat:
        async def chat(self, messages, model=None):
            raise RuntimeError("private prompt and provider response details")

    app = create_app(chatter_factory=lambda model_id: BrokenChat(), allowed_origins=["https://portfolio.example"])

    async def send_request():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(
                "/chat/completions",
                json={
                    "model": "gpt-4o",
                    "stream": stream,
                    "messages": [{"role": "user", "content": "private prompt"}],
                },
            )

    response = asyncio.run(send_request())

    assert response.status_code == 502
    assert response.json() == {"detail": "The chat provider request failed."}
    assert "private prompt" not in response.text


def test_unknown_streaming_model_is_rejected_before_response_starts():
    def unexpected_client(model_id):
        pytest.fail("Unknown models must be rejected before loading a chat client")

    app = create_app(chatter_factory=unexpected_client, allowed_origins=["https://portfolio.example"])

    async def send_request():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(
                "/chat/completions",
                json={"model": "unknown-model", "stream": True, "messages": [{"role": "user", "content": "x"}]},
            )

    response = asyncio.run(send_request())

    assert response.status_code == 400
    assert response.json() == {"detail": "Unknown model"}
