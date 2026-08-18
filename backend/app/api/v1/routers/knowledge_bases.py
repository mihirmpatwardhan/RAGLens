"""
RAGLense - Knowledge Base Router

CRUD operations for knowledge bases.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from app.api.v1.deps import (
    CurrentUser,
    DbSession,
    RequireKBEditor,
    RequireKBOwner,
    RequireKBViewer,
)
from app.api.v1.schemas.knowledge import (
    CreateKBRequest,
    KBListResponse,
    KBResponse,
    UpdateKBRequest,
)
from app.infrastructure.db.models.knowledge import KnowledgeBase
from app.infrastructure.db.models.rbac import KnowledgeBaseMember

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
    count_query = (
        select(func.count(func.distinct(KnowledgeBase.id)))
        .outerjoin(KnowledgeBaseMember, KnowledgeBase.id == KnowledgeBaseMember.knowledge_base_id)
        .where(
            or_(
                KnowledgeBase.owner_id == current_user.id,
                KnowledgeBaseMember.user_id == current_user.id,
            )
        )
    )
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch
    fetch_query = (
        select(KnowledgeBase)
        .outerjoin(KnowledgeBaseMember, KnowledgeBase.id == KnowledgeBaseMember.knowledge_base_id)
        .where(
            or_(
                KnowledgeBase.owner_id == current_user.id,
                KnowledgeBaseMember.user_id == current_user.id,
            )
        )
        .distinct()
        .order_by(KnowledgeBase.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(fetch_query)
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
    _: RequireKBViewer,
):
    """Get a single knowledge base by ID."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
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
    _: RequireKBEditor,
):
    """Update a knowledge base's name, description, or settings."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
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
    _: RequireKBOwner,
):
    """Delete a knowledge base and all associated documents/chunks."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
        )
    )
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge base not found",
        )

    # Delete from vector DB before SQL commit
    from app.infrastructure.vector_stores import get_vector_store
    import logging
    logger = logging.getLogger(__name__)
    vector_store = get_vector_store()
    
    # Try deleting the dimension-specific collection
    if kb.vector_dimension:
        try:
            await vector_store.delete_collection(f"kb_{kb_id}_dim{kb.vector_dimension}")
        except Exception as e:
            logger.warning(f"Failed to delete vector collection kb_{kb_id}_dim{kb.vector_dimension}: {e}")
            
    # Also try legacy dimension-less collection
    try:
        await vector_store.delete_collection(f"kb_{kb_id}")
    except Exception:
        pass

    await db.delete(kb)
