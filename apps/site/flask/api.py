import logging
import os
import time
import uuid
from collections.abc import Callable, Sequence
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from src.config import configured_allowed_origins

logger = logging.getLogger(__name__)
MODEL_IDS = (
    "gpt-4o",
    "o1",
    "gemini-2.0-flash-001",
    "claude-3.5-sonnet",
    "claude-3.7-sonnet",
    "claude-3.7-sonnet-thought",
    "o3-mini",
)
class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str = "copilot"


class ModelList(BaseModel):
    object: str = "list"
    data: list[ModelInfo]


class OpenAiCompatibleChatMessage(BaseModel):
    role: str
    content: str


class OpenAiCompatibleChatCompletionRequest(BaseModel):
    model: str = "gpt-4o"
    messages: list[OpenAiCompatibleChatMessage]
    max_tokens: Optional[int] = 1024
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False


class OpenAiCompatibleChoice(BaseModel):
    index: int = 0
    message: OpenAiCompatibleChatMessage
    finish_reason: Optional[str] = "stop"
    logprobs: Optional[Any] = None


class OpenAiCompatibleUsage(BaseModel):
    prompt_tokens: int = 5
    completion_tokens: int = 10
    total_tokens: int = 15


class OpenAiCompatibleChatCompletionResponse(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4()}")
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: list[OpenAiCompatibleChoice]
    usage: OpenAiCompatibleUsage = Field(default_factory=OpenAiCompatibleUsage)
    system_fingerprint: Optional[str] = None


class OpenAiCompatibleDelta(BaseModel):
    content: Optional[str] = None
    role: Optional[str] = None


class OpenAiCompatibleChunkChoice(BaseModel):
    index: int = 0
    delta: OpenAiCompatibleDelta
    finish_reason: Optional[str] = None
    logprobs: Optional[Any] = None


class OpenAiCompatibleChatCompletionChunk(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4()}")
    object: str = "chat.completion.chunk"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: list[OpenAiCompatibleChunkChoice]
    system_fingerprint: Optional[str] = None


def create_app(
    chatter_factory: Callable[[str], Any] | None = None,
    allowed_origins: str | Sequence[str] | None = None,
) -> FastAPI:
    """Create the OpenAI-compatible adapter without loading credentials or models."""
    api_app = FastAPI(title="OpenAI Compatible Chat Adapter")
    api_app.add_middleware(
        CORSMiddleware,
        allow_origins=list(configured_allowed_origins(allowed_origins)),
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    chatters: dict[str, Any] = {}

    def get_chatter(model_id: str):
        if model_id not in chatters:
            if chatter_factory is None:
                # The optional GitHub-backed adapter is imported and initialized only
                # after a chat request arrives, never while importing this module.
                from src.chat import GitHubCopilotChat

                chatters[model_id] = GitHubCopilotChat(model=model_id)
            else:
                chatters[model_id] = chatter_factory(model_id)
        return chatters[model_id]

    async def chat_response(model_id: str, messages: list[OpenAiCompatibleChatMessage]) -> str:
        if model_id not in MODEL_IDS:
            raise HTTPException(status_code=400, detail="Unknown model")
        formatted_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
        try:
            return await get_chatter(model_id).chat(formatted_messages, model=model_id)
        except Exception as error:
            logger.warning("Chat provider request failed (%s)", type(error).__name__)
            raise HTTPException(status_code=502, detail="The chat provider request failed.") from None

    @api_app.get("/models", response_model=ModelList)
    async def list_models(authorization: Optional[str] = Header(None)):
        logger.info("Models requested (authenticated=%s)", authorization is not None)
        return ModelList(data=[ModelInfo(id=model_id) for model_id in MODEL_IDS])

    @api_app.post("/chat/completions")
    async def create_chat_completion(
        request: OpenAiCompatibleChatCompletionRequest,
        authorization: Optional[str] = Header(None),
    ):
        logger.info(
            "Chat completion requested (authenticated=%s, stream=%s, model=%s)",
            authorization is not None,
            request.stream,
            request.model,
        )
        if request.model not in MODEL_IDS:
            raise HTTPException(status_code=400, detail="Unknown model")
        if request.stream:
            stream_id = f"chatcmpl-{uuid.uuid4()}"
            response_content = await chat_response(request.model, request.messages)
            return StreamingResponse(
                stream_real_response(request.model, stream_id, response_content),
                media_type="text/event-stream",
            )
        response_content = await chat_response(request.model, request.messages)
        response_message = OpenAiCompatibleChatMessage(role="assistant", content=response_content)
        return OpenAiCompatibleChatCompletionResponse(
            model=request.model,
            choices=[OpenAiCompatibleChoice(message=response_message)],
        )

    return api_app


async def stream_real_response(model_id, stream_id, text):
    words = text.split(" ")
    created_time = int(time.time())
    first_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(delta=OpenAiCompatibleDelta(role="assistant"), index=0)],
    )
    yield f"data: {first_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    for index, word in enumerate(words):
        delta_content = word + (" " if index < len(words) - 1 else "")
        chunk_data = OpenAiCompatibleChatCompletionChunk(
            id=stream_id,
            model=model_id,
            created=created_time,
            choices=[OpenAiCompatibleChunkChoice(delta=OpenAiCompatibleDelta(content=delta_content), index=0)],
        )
        yield f"data: {chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    final_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(delta=OpenAiCompatibleDelta(), finish_reason="stop", index=0)],
    )
    yield f"data: {final_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    yield "data: [DONE]\n\n"


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("SITE_API_PORT", "8085")))
