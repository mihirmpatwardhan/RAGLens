"""
RAGLense - Knowledge Base Router

CRUD operations for knowledge bases.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.api.v1.schemas.knowledge import (
    CreateKBRequest,
    KBListResponse,
    KBResponse,
    UpdateKBRequest,
)
from app.infrastructure.db.models.knowledge import KnowledgeBase

router = APIRouter(prefix="/knowledge-bases", tags=["Knowledge Bases"])


@router.post(
    "",
    response_model=KBResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new knowledge base",
)
async def create_knowledge_base(
    request: CreateKBRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Create a new knowledge base with the specified settings."""
    kb = KnowledgeBase(
        name=request.name,
        description=request.description,
        owner_id=current_user.id,
        icon=request.icon,
        color=request.color,
        settings=request.settings.model_dump(),
    )
    db.add(kb)
    await db.flush()
    await db.refresh(kb)

    return KBResponse.model_validate(kb)


@router.get(
    "",
    response_model=KBListResponse,
    summary="List all knowledge bases",
)
async def list_knowledge_bases(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    page_size: int = 20,
):
    """List all knowledge bases owned by the current user."""
    offset = (page - 1) * page_size

    # Count
    count_result = await db.execute(
        select(func.count()).where(KnowledgeBase.owner_id == current_user.id)
    )
    total = count_result.scalar() or 0

    # Fetch
    result = await db.execute(
        select(KnowledgeBase)
        .where(KnowledgeBase.owner_id == current_user.id)
        .order_by(KnowledgeBase.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = [KBResponse.model_validate(kb) for kb in result.scalars().all()]

    return KBListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/{kb_id}",
    response_model=KBResponse,
    summary="Get a knowledge base",
)
async def get_knowledge_base(
    kb_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get a single knowledge base by ID."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.owner_id == current_user.id,
        )
    )
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge base not found",
        )

    return KBResponse.model_validate(kb)


@router.patch(
    "/{kb_id}",
    response_model=KBResponse,
    summary="Update a knowledge base",
)
async def update_knowledge_base(
    kb_id: uuid.UUID,
    request: UpdateKBRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update a knowledge base's name, description, or settings."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.owner_id == current_user.id,
        )
    )
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge base not found",
        )

    update_data = request.model_dump(exclude_unset=True)
    if "settings" in update_data and update_data["settings"]:
        update_data["settings"] = update_data["settings"].model_dump() if hasattr(update_data["settings"], "model_dump") else update_data["settings"]

    for field, value in update_data.items():
        setattr(kb, field, value)

    await db.flush()
    await db.refresh(kb)

    return KBResponse.model_validate(kb)


@router.delete(
    "/{kb_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a knowledge base",
)
async def delete_knowledge_base(
    kb_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Delete a knowledge base and all associated documents/chunks."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.owner_id == current_user.id,
        )
    )
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge base not found",
        )

    await db.delete(kb)
