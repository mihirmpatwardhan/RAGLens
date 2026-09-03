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

from fastapi import APIRouter, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession, get_kb_role
from app.api.v1.schemas.knowledge import (
    ConversationResponse,
    CreateConversationRequest,
    MessageResponse,
    SendMessageRequest,
)
from app.application.retrieval.pipeline import (
    RetrievalPipeline,
    _RAG_SYSTEM_PROMPT_STRICT,
    _RAG_SYSTEM_PROMPT_ENHANCED,
    _RAG_USER_TEMPLATE,
)
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
    kb_id: uuid.UUID | None = Query(None, description="Filter conversations by Knowledge Base ID"),
):
    stmt = select(Conversation).where(
        Conversation.user_id == current_user.id,
        Conversation.is_archived == False,  # noqa: E712
    )
    if kb_id:
        stmt = stmt.where(Conversation.knowledge_base_id == kb_id)
        
    result = await db.execute(stmt.order_by(Conversation.updated_at.desc()))
    convs = result.scalars().all()
    return [ConversationResponse.model_validate(c) for c in convs]

@router.get("/conversations/grouped")
async def list_conversations_grouped(current_user: CurrentUser, db: DbSession):
    """Returns conversations grouped by Knowledge Base ID for hierarchical sidebar rendering."""
    from app.infrastructure.db.models.knowledge import KnowledgeBase
    
    stmt = select(Conversation).where(
        Conversation.user_id == current_user.id,
        Conversation.is_archived == False,
    ).order_by(Conversation.updated_at.desc())
    convs_result = await db.execute(stmt)
    convs = convs_result.scalars().all()
    
    kb_ids = [c.knowledge_base_id for c in convs if c.knowledge_base_id]
    kbs = {}
    if kb_ids:
        kb_stmt = select(KnowledgeBase).where(KnowledgeBase.id.in_(kb_ids))
        kbs_result = await db.execute(kb_stmt)
        kbs = {kb.id: kb for kb in kbs_result.scalars().all()}
        
    workspaces_map = {}
    global_convs = []
    
    for c in convs:
        c_resp = ConversationResponse.model_validate(c).model_dump(mode="json")
        if c.knowledge_base_id:
            kb_id_str = str(c.knowledge_base_id)
            if kb_id_str not in workspaces_map:
                kb_obj = kbs.get(c.knowledge_base_id)
                workspaces_map[kb_id_str] = {
                    "id": kb_id_str,
                    "name": kb_obj.name if kb_obj else "Unknown Workspace",
                    "color": kb_obj.color if kb_obj and hasattr(kb_obj, "color") else "blue",
                    "icon": kb_obj.icon if kb_obj and hasattr(kb_obj, "icon") else "folder",
                    "conversations": []
                }
            workspaces_map[kb_id_str]["conversations"].append(c_resp)
        else:
            global_convs.append(c_resp)
            
    return {
        "workspaces": list(workspaces_map.values()),
        "global": global_convs
    }


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
    response_class=StreamingResponse,
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

    # 2. Load conversation history BEFORE saving current message (last 10 msgs = 5 turns)
    # Bug fix: was using .asc().limit(10) which fetched the FIRST 10 messages of all time,
    # not the most recent 10. For long conversations this gave the LLM stale old context.
    # Fix: fetch most-recent 10 descending, then reverse to chronological order for the LLM.
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    prior_messages = list(reversed(history_result.scalars().all()))
    conversation_history = [
        {"role": m.role, "content": m.content}
        for m in prior_messages
    ]

    # 3. Save user message
    user_msg = Message(
        conversation_id=conv_id,
        role="user",
        content=request.content,
    )
    db.add(user_msg)
    conv.message_count += 1
    await db.commit()

    # 4. Prepare retrieval pipeline
    pipeline = RetrievalPipeline(db, request.knowledge_base_id or conv.knowledge_base_id)

    # 5. True SSE streaming generator with LiteLLM token-by-token streaming
    async def sse_generator() -> AsyncGenerator[str, None]:
        start_time = time.time()
        accumulated_text = ""
        token_count = 0
        last_keepalive = time.time()

        status_message = (
            "Searching your workspace and checking claims against web sources..."
            if request.answer_mode == "enhanced"
            else "Searching your workspace..."
        )
        yield f"event: status\ndata: {json.dumps({'message': status_message})}\n\n"
        try:
            retrieval_res = await pipeline.retrieve_and_generate_context(
                request.content,
                conversation_history=conversation_history,
                answer_mode=request.answer_mode,
            )
        except Exception as retrieval_exc:
            logger.exception("Retrieval pipeline failed: %s", retrieval_exc)
            empty_trace = {
                "query_original": request.content,
                "query_rewritten": request.content,
                "retrieved_chunks": [],
                "reranked_chunks": [],
                "prompt_tokens": 0,
                "total_latency_ms": 0,
                "stages": {},
            }
            retrieval_res = {
                "trace": empty_trace,
                "user_prompt": (
                    f"The user asked: {request.content}\n\n"
                    f"No documents could be retrieved due to an error: {retrieval_exc}. "
                    "Inform the user of the error and ask them to try again."
                ),
                "history_messages": conversation_history,
                "citations": [],
            }

        # Emit citations together with the trace.  The UI needs the citation
        # metadata (including extracted image paths) before the answer tokens
        # arrive in order to render relevant document figures inline.
        trace_payload = {
            **retrieval_res["trace"],
            "citations": retrieval_res.get("citations", []),
        }
        yield f"event: trace\ndata: {json.dumps(trace_payload)}\n\n"

        try:
            import litellm  # type: ignore[import-untyped]

            # Build provider/model/key like FallbackLLMProvider does
            from app.infrastructure.llm import _get_api_key_for_provider, _build_model_string

            user_prompt = retrieval_res["user_prompt"]

            # Select correct system prompt based on mode
            active_system_prompt = (
                _RAG_SYSTEM_PROMPT_ENHANCED
                if request.answer_mode == "enhanced"
                else _RAG_SYSTEM_PROMPT_STRICT
            )

            # Build full multi-turn messages for the LLM:
            # [system] + [prior history] + [current user RAG prompt]
            # This gives the LLM the full conversation context for accurate follow-ups.
            history_msgs = retrieval_res.get("history_messages", [])
            llm_messages = [{"role": "system", "content": active_system_prompt}]
            # Inject prior turns (without the last user message since it's in user_prompt)
            for h_msg in history_msgs:
                llm_messages.append({"role": h_msg["role"], "content": h_msg["content"]})
            # Add the RAG-grounded current user message
            llm_messages.append({"role": "user", "content": user_prompt})

            logger.info(
                "LLM messages: %d prior history turns + RAG user prompt (%d chars)",
                len(history_msgs),
                len(user_prompt),
            )

            # Try each provider in the fallback chain with real streaming
            streamed = False
            errors = []
            for provider in settings.LLM_FALLBACK_CHAIN:
                api_key = _get_api_key_for_provider(provider, settings)
                if not api_key:
                    errors.append(f"{provider}: no API key")
                    logger.debug("Skipping provider '%s': no API key configured.", provider)
                    continue

                # Build the correct model string:
                # If DEFAULT_LLM_MODEL already has a provider prefix (e.g. "openrouter/..."),
                # use it directly for that provider; otherwise use the helper.
                default_model = settings.DEFAULT_LLM_MODEL
                if provider == "openai" and "/" not in default_model:
                    # Plain model name like "gpt-4o-mini" — use directly
                    model_string = default_model
                elif default_model.startswith(f"{provider}/"):
                    # e.g. "openrouter/meta-llama/..." for openrouter provider
                    model_string = default_model
                else:
                    # Use the fallback model map for this provider
                    model_string = _build_model_string(provider, default_model)

                logger.info("Attempting SSE stream via provider=%s model=%s", provider, model_string)

                try:
                    stream = await litellm.acompletion(
                        model=model_string,
                        messages=llm_messages,
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

                        # Send SSE keepalive comment every 10s to prevent proxy buffering
                        now = time.time()
                        if now - last_keepalive > 10:
                            yield ": keepalive\n\n"
                            last_keepalive = now

                    streamed = True
                    logger.info("Streaming completed via %s model=%s (%d tokens)", provider, model_string, token_count)
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

        async def _save_db():
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

        # Await DB persistence before emitting done event so the message is
        # guaranteed to be in the database when the client receives done.
        await _save_db()

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",   # Disable nginx/proxy buffering for true streaming
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
        },
    )
