"""Analytics routes backed by live workspace data."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import case, func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.api.v1.schemas.knowledge import AnalyticsOverview
from app.infrastructure.db.models.knowledge import Conversation, Document, KnowledgeBase, Message

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get(
    "/overview",
    response_model=AnalyticsOverview,
    summary="Get workspace analytics overview",
)
async def get_overview_metrics(
    current_user: CurrentUser,
    db: DbSession,
):
    """Return real aggregate metrics for the signed-in user's workspace."""
    kb_count, total_chunks, storage_used, kb_tokens = (
        await db.execute(
            select(
                func.count(KnowledgeBase.id),
                func.coalesce(func.sum(KnowledgeBase.chunk_count), 0),
                func.coalesce(func.sum(KnowledgeBase.storage_bytes), 0),
                func.coalesce(func.sum(KnowledgeBase.total_tokens), 0),
            ).where(KnowledgeBase.owner_id == current_user.id)
        )
    ).one()

    total_documents = (
        await db.execute(
            select(func.count(Document.id))
            .select_from(Document)
            .join(KnowledgeBase, Document.knowledge_base_id == KnowledgeBase.id)
            .where(KnowledgeBase.owner_id == current_user.id)
        )
    ).scalar_one()

    total_conversations = (
        await db.execute(
            select(func.count(Conversation.id)).where(Conversation.user_id == current_user.id)
        )
    ).scalar_one()

    total_messages = (
        await db.execute(
            select(func.count(Message.id))
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == current_user.id)
        )
    ).scalar_one()

    assistant_count, avg_latency_ms, successful_answers, total_cost = (
        await db.execute(
            select(
                func.count(Message.id),
                func.coalesce(func.avg(Message.latency_ms), 0.0),
                func.coalesce(
                    func.sum(case((func.length(Message.content) > 0, 1), else_=0)),
                    0,
                ),
                func.coalesce(func.sum(Message.cost), 0.0),
            )
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == current_user.id,
                Message.role == "assistant",
            )
        )
    ).one()

    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    queries_today = (
        await db.execute(
            select(func.count(Message.id))
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == current_user.id,
                Message.role == "user",
                Message.created_at >= today_start,
            )
        )
    ).scalar_one()

    queries_this_week = (
        await db.execute(
            select(func.count(Message.id))
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == current_user.id,
                Message.role == "user",
                Message.created_at >= week_start,
            )
        )
    ).scalar_one()

    success_rate = (
        float(successful_answers) / float(assistant_count) if assistant_count else 1.0
    )

    return AnalyticsOverview(
        total_knowledge_bases=int(kb_count or 0),
        total_documents=int(total_documents or 0),
        total_chunks=int(total_chunks or 0),
        total_vectors=int(total_chunks or 0),
        total_conversations=int(total_conversations or 0),
        total_messages=int(total_messages or 0),
        storage_used_bytes=int(storage_used or 0),
        total_tokens_used=int(kb_tokens or 0),
        total_cost=float(total_cost or 0.0),
        avg_query_latency_ms=float(avg_latency_ms or 0.0),
        success_rate=success_rate,
        queries_today=int(queries_today or 0),
        queries_this_week=int(queries_this_week or 0),
    )
