"""
RAGLense - Chat Router

Manages conversations and message streaming (SSE).
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.api.v1.schemas.knowledge import (
    ConversationResponse,
    CreateConversationRequest,
    MessageResponse,
    SendMessageRequest,
)
from app.infrastructure.db.models.knowledge import Conversation, Message
from app.application.retrieval.pipeline import RetrievalPipeline

router = APIRouter(prefix="/chat", tags=["Chat"])


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
    conv = Conversation(
        user_id=current_user.id,
        title=request.title,
        knowledge_base_id=request.knowledge_base_id,
        model=request.model,
        temperature=request.temperature,
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
            Conversation.is_archived == False,
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

    # 2. Save user message
    user_msg = Message(
        conversation_id=conv_id,
        role="user",
        content=request.content,
    )
    db.add(user_msg)
    conv.message_count += 1
    await db.flush()

    # 3. Instantiate retrieval pipeline
    pipeline = RetrievalPipeline(db, request.knowledge_base_id or conv.knowledge_base_id)
    retrieval_res = await pipeline.retrieve_and_generate(request.content)

    # 4. SSE streaming generator
    async def sse_generator() -> AsyncGenerator[str, None]:
        text_response = (
            f"Based on your knowledge base, here is the information about *{request.content}*:\n\n"
            f"This is a live-streamed, citation-anchored RAG response simulated by RAGLense.\n\n"
            f"### Key Details:\n"
            f"- High groundedness search was executed.\n"
            f"- Semantic similarity vector matching triggered {len(retrieval_res['citations'])} sources.\n\n"
            f"For production pipelines, set your LLM credentials (OpenAI/Anthropic/Gemini) to execute live external LLM generation."
        )

        tokens = text_response.split(" ")
        accumulated_text = ""

        # Emit citations first or trace info
        yield f"event: trace\ndata: {json.dumps(retrieval_res['trace'])}\n\n"
        await asyncio.sleep(0.1)

        # Stream tokens
        for token in tokens:
            word = token + " "
            accumulated_text += word
            yield f"event: token\ndata: {json.dumps({'token': word})}\n\n"
            await asyncio.sleep(0.03)  # standard typing delay

        # Write assistant message to DB once complete
        # We need a new session in the generator because generator runs after router function returns
        from app.infrastructure.db.base import async_session_factory
        async with async_session_factory() as generator_db:
            assistant_msg = Message(
                conversation_id=conv_id,
                role="assistant",
                content=accumulated_text,
                model=conv.model,
                tokens_prompt=120,
                tokens_completion=len(tokens),
                cost=0.0015,
                latency_ms=retrieval_res["trace"]["total_latency_ms"],
                pipeline_trace=retrieval_res["trace"],
                citations=retrieval_res["citations"],
                retrieved_chunks=[],
            )
            generator_db.add(assistant_msg)
            
            # Re-fetch conversation to increment message count
            generator_conv_result = await generator_db.execute(
                select(Conversation).where(Conversation.id == conv_id)
            )
            generator_conv = generator_conv_result.scalar_one()
            generator_conv.message_count += 1
            generator_conv.updated_at = datetime.now(timezone.utc)
            
            await generator_db.commit()

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
