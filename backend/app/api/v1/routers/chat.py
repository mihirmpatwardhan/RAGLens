"""
RAGLense - Chat Router

Manages conversations and message streaming (SSE).
Uses true token-by-token streaming via LiteLLM acompletion(stream=True)
so the user sees text appearing immediately rather than waiting for the full response.
"""

import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession, get_kb_role
from app.api.v1.schemas.knowledge import (
    ConversationResponse,
    CreateConversationRequest,
    MessageResponse,
    SendMessageRequest,
)
from app.application.retrieval.pipeline import RetrievalPipeline, _RAG_SYSTEM_PROMPT, _RAG_USER_TEMPLATE
from app.core.config import get_settings
from app.infrastructure.db.models.knowledge import Conversation, Message

router = APIRouter(prefix="/chat", tags=["Chat"])
settings = get_settings()
logger = logging.getLogger(__name__)


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat conversation",
)
async def create_conversation(
    request: CreateConversationRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    if request.knowledge_base_id:
        role = await get_kb_role(request.knowledge_base_id, current_user, db)
        if role is None:
            raise HTTPException(status_code=403, detail="Not authorized to access this knowledge base")
            
    conv = Conversation(
        user_id=current_user.id,
        title=request.title,
        knowledge_base_id=request.knowledge_base_id,
        model=request.model or settings.DEFAULT_LLM_MODEL,
        temperature=request.temperature if request.temperature is not None else settings.DEFAULT_TEMPERATURE,
        system_prompt=request.system_prompt,
    )
    db.add(conv)
    await db.flush()
    await db.refresh(conv)
    return ConversationResponse.model_validate(conv)


@router.get(
    "/conversations",
    response_model=list[ConversationResponse],
    summary="List all conversations",
)
async def list_conversations(
    current_user: CurrentUser,
    db: DbSession,
):
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.is_archived == False,  # noqa: E712
        )
        .order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()
    return [ConversationResponse.model_validate(c) for c in convs]


@router.get(
    "/conversations/{conv_id}/messages",
    response_model=list[MessageResponse],
    summary="Get conversation messages",
)
async def get_messages(
    conv_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    # Verify ownership
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    return [MessageResponse.model_validate(m) for m in messages]


@router.post(
    "/conversations/{conv_id}/messages",
    summary="Send a message and stream the response",
)
async def send_message(
    conv_id: uuid.UUID,
    request: SendMessageRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    # 1. Verify conversation
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    kb_id_to_use = request.knowledge_base_id or conv.knowledge_base_id
    if kb_id_to_use:
        role = await get_kb_role(kb_id_to_use, current_user, db)
        if role is None:
            raise HTTPException(status_code=403, detail="Not authorized to access this knowledge base")

    # 2. Save user message
    user_msg = Message(
        conversation_id=conv_id,
        role="user",
        content=request.content,
    )
    db.add(user_msg)
    conv.message_count += 1
    await db.commit()

    # 3. Run retrieval pipeline (embeddings + vector search + reranking)
    #    This is done BEFORE streaming so we can emit the full trace event first.
    pipeline = RetrievalPipeline(db, request.knowledge_base_id or conv.knowledge_base_id)
    retrieval_res = await pipeline.retrieve_and_generate_context(request.content)

    # 4. True SSE streaming generator with LiteLLM token-by-token streaming
    async def sse_generator() -> AsyncGenerator[str, None]:
        start_time = time.time()
        accumulated_text = ""
        token_count = 0

        # Emit trace first so the pipeline inspector shows immediately
        yield f"event: trace\ndata: {json.dumps(retrieval_res['trace'])}\n\n"

        try:
            import litellm  # type: ignore[import-untyped]

            # Build provider/model/key like FallbackLLMProvider does
            from app.infrastructure.llm import _get_api_key_for_provider, _build_model_string

            user_prompt = retrieval_res["user_prompt"]

            # Try each provider in the fallback chain with real streaming
            streamed = False
            errors = []
            for provider in settings.LLM_FALLBACK_CHAIN:
                api_key = _get_api_key_for_provider(provider, settings)
                if not api_key:
                    errors.append(f"{provider}: no API key")
                    continue

                # Use the configured model override for google/openai
                if provider == "google":
                    model_string = "gemini/gemini-2.0-flash"
                elif provider == "openai":
                    model_string = settings.DEFAULT_LLM_MODEL if "/" not in settings.DEFAULT_LLM_MODEL else "gpt-4o"
                else:
                    model_string = _build_model_string(provider, settings.DEFAULT_LLM_MODEL)

                try:
                    stream = await litellm.acompletion(
                        model=model_string,
                        messages=[
                            {"role": "system", "content": _RAG_SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        temperature=settings.DEFAULT_TEMPERATURE,
                        max_tokens=settings.DEFAULT_MAX_TOKENS,
                        api_key=api_key,
                        stream=True,
                        num_retries=0,
                    )

                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content if chunk.choices else None
                        if delta:
                            accumulated_text += delta
                            token_count += 1
                            yield f"event: token\ndata: {json.dumps({'token': delta})}\n\n"

                    streamed = True
                    logger.info("Streaming completed via %s (%d tokens)", provider, token_count)
                    break

                except Exception as exc:
                    err_msg = f"{provider}: {exc}"
                    errors.append(err_msg)
                    logger.warning("Streaming provider %s failed: %s", provider, exc)
                    # If we already streamed some tokens, stop — don't try next provider
                    if accumulated_text:
                        break

            if not streamed and not accumulated_text:
                # All providers failed — emit a clear error message
                error_summary = " | ".join(errors)
                error_text = (
                    f"⚠️ **Could not reach any LLM provider.**\n\n"
                    f"Errors: `{error_summary}`\n\n"
                    f"Your documents are indexed correctly. Please check your API keys in `.env`."
                )
                accumulated_text = error_text
                yield f"event: token\ndata: {json.dumps({'token': error_text})}\n\n"

        except Exception as exc:
            error_text = f"⚠️ Streaming error: {exc}"
            accumulated_text = error_text
            yield f"event: token\ndata: {json.dumps({'token': error_text})}\n\n"
            logger.exception("Unexpected error in SSE generator")

        # Persist assistant message to DB after streaming completes
        total_latency_ms = int((time.time() - start_time) * 1000)
        trace = retrieval_res["trace"]
        trace["total_latency_ms"] = trace.get("total_latency_ms", 0) + total_latency_ms

        try:
            from app.infrastructure.db.base import async_session_factory
            async with async_session_factory() as generator_db:
                assistant_msg = Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content=accumulated_text,
                    model=conv.model,
                    tokens_prompt=trace.get("prompt_tokens", 0),
                    tokens_completion=token_count,
                    cost=0,
                    latency_ms=trace["total_latency_ms"],
                    pipeline_trace=trace,
                    citations=retrieval_res["citations"],
                    retrieved_chunks=trace.get("retrieved_chunks", []),
                )
                generator_db.add(assistant_msg)

                generator_conv_result = await generator_db.execute(
                    select(Conversation).where(Conversation.id == conv_id)
                )
                generator_conv = generator_conv_result.scalar_one()
                generator_conv.message_count += 1
                generator_conv.updated_at = datetime.now(UTC)
                await generator_db.commit()
        except Exception as db_exc:
            logger.error("Failed to persist assistant message: %s", db_exc)

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering for true streaming
        },
    )
