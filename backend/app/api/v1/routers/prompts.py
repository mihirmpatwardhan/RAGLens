"""
RAGLens — Prompt Template Router (Phase 2)

Full CRUD for reusable, named prompt templates. Each template stores the raw
content (may contain {{variable}} Jinja-style placeholders), a list of variable
names for the UI to render fill-in fields, and default LLM settings.

Endpoints:
  POST   /prompts                  — Create a new template
  GET    /prompts                  — List the current user's templates (+ public ones)
  GET    /prompts/{template_id}    — Fetch a single template
  PUT    /prompts/{template_id}    — Update a template (owner only)
  DELETE /prompts/{template_id}    — Delete a template (owner only)
"""

import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, DbSession, get_kb_role
from app.core.config import get_settings
from app.infrastructure.db.models.knowledge import KnowledgeBase, PromptTemplate
from app.infrastructure.db.models.rbac import KnowledgeBaseMember
from app.infrastructure.db.models.user import User

router = APIRouter(prefix="/prompts", tags=["Prompt Templates"])
settings = get_settings()

# Regex to extract {{variable_name}} placeholders from template content
_VAR_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def _extract_variables(content: str) -> list[str]:
    """Extract ordered, deduplicated variable names from {{var}} placeholders."""
    seen: set[str] = set()
    vars_list: list[str] = []
    for match in _VAR_PATTERN.finditer(content):
        name = match.group(1)
        if name not in seen:
            seen.add(name)
            vars_list.append(name)
    return vars_list


# ──────────────────────────────────────────────
# Pydantic Schemas
# ──────────────────────────────────────────────

class PromptTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    content: str = Field(..., min_length=1, max_length=32000)
    knowledge_base_id: uuid.UUID | None = Field(
        None,
        description="Optional KB scope. Omit for a global template.",
    )
    is_public: bool = Field(
        default=False,
        description="If True, all users can view (but not modify) this template.",
    )
    default_model: str = Field(default="gpt-4o", max_length=100)
    default_temperature: float = Field(default=0.1, ge=0.0, le=2.0)


class PromptTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    content: str | None = Field(None, min_length=1, max_length=32000)
    knowledge_base_id: uuid.UUID | None = Field(None, description="Workspace scope; null for personal template")
    is_public: bool | None = None
    default_model: str | None = Field(None, max_length=100)
    default_temperature: float | None = Field(None, ge=0.0, le=2.0)


class PromptTemplateResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    knowledge_base_id: uuid.UUID | None
    name: str
    description: str | None
    content: str
    variables: list[str]
    is_public: bool
    default_model: str
    default_temperature: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PromptTemplateListResponse(BaseModel):
    items: list[PromptTemplateResponse]
    total: int


async def _accessible_kb_ids(current_user: User, db: AsyncSession) -> list[uuid.UUID]:
    """Return workspaces the user owns or is a member of."""
    result = await db.execute(
        select(KnowledgeBase.id)
        .outerjoin(
            KnowledgeBaseMember,
            KnowledgeBaseMember.knowledge_base_id == KnowledgeBase.id,
        )
        .where(
            or_(
                KnowledgeBase.owner_id == current_user.id,
                KnowledgeBaseMember.user_id == current_user.id,
            )
        )
        .distinct()
    )
    return list(result.scalars().all())


async def _can_read_template(
    template: PromptTemplate,
    current_user: User,
    db: AsyncSession,
) -> bool:
    """Apply template visibility without leaking private workspace prompts."""
    if template.owner_id == current_user.id:
        return True
    if not template.is_public:
        return False
    if template.knowledge_base_id is None:
        return True
    return await get_kb_role(template.knowledge_base_id, current_user, db) is not None


# ──────────────────────────────────────────────
# Create
# ──────────────────────────────────────────────

@router.post(
    "",
    response_model=PromptTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new prompt template",
)
async def create_prompt_template(
    payload: PromptTemplateCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> PromptTemplateResponse:
    """Create a reusable, named prompt template.

    Variable placeholders use ``{{variable_name}}`` syntax. The ``variables``
    field in the response is auto-extracted from the content.
    """
    if payload.knowledge_base_id:
        role = await get_kb_role(payload.knowledge_base_id, current_user, db)
        if role not in {"owner", "editor"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You need editor access to attach a template to this workspace.",
            )

    variables = _extract_variables(payload.content)

    template = PromptTemplate(
        owner_id=current_user.id,
        knowledge_base_id=payload.knowledge_base_id,
        name=payload.name,
        description=payload.description,
        content=payload.content,
        variables=variables,
        is_public=payload.is_public,
        default_model=payload.default_model,
        default_temperature=payload.default_temperature,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return PromptTemplateResponse.model_validate(template)


# ──────────────────────────────────────────────
# List
# ──────────────────────────────────────────────

@router.get(
    "",
    response_model=PromptTemplateListResponse,
    summary="List prompt templates",
)
async def list_prompt_templates(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    kb_id: uuid.UUID | None = Query(None, description="Filter by knowledge base"),
    include_public: bool = Query(True, description="Include public templates from other users"),
) -> PromptTemplateListResponse:
    """List owned templates and shared templates from accessible workspaces."""
    from sqlalchemy import func

    if include_public:
        accessible_kb_ids = await _accessible_kb_ids(current_user, db)
        shared_scope = or_(
            PromptTemplate.knowledge_base_id.is_(None),
            PromptTemplate.knowledge_base_id.in_(accessible_kb_ids),
        )
        where = or_(
            PromptTemplate.owner_id == current_user.id,
            (PromptTemplate.is_public == True) & shared_scope,  # noqa: E712
        )
    else:
        where = PromptTemplate.owner_id == current_user.id

    stmt = select(PromptTemplate).where(where)

    if kb_id is not None:
        stmt = stmt.where(PromptTemplate.knowledge_base_id == kb_id)

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        stmt.order_by(PromptTemplate.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = [PromptTemplateResponse.model_validate(t) for t in result.scalars().all()]
    return PromptTemplateListResponse(items=items, total=int(total))


# ──────────────────────────────────────────────
# Get single
# ──────────────────────────────────────────────

@router.get(
    "/{template_id}",
    response_model=PromptTemplateResponse,
    summary="Get a single prompt template",
)
async def get_prompt_template(
    template_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> PromptTemplateResponse:
    """Retrieve a prompt template by ID. Must be owner or template must be public."""
    result = await db.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")

    if not await _can_read_template(template, current_user, db):
        raise HTTPException(status_code=403, detail="Access denied to this prompt template")

    return PromptTemplateResponse.model_validate(template)


# ──────────────────────────────────────────────
# Update
# ──────────────────────────────────────────────

@router.put(
    "/{template_id}",
    response_model=PromptTemplateResponse,
    summary="Update a prompt template",
)
async def update_prompt_template(
    template_id: uuid.UUID,
    payload: PromptTemplateUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> PromptTemplateResponse:
    """Update a prompt template. Only the owner can modify it."""
    result = await db.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")

    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can modify this template")

    if "knowledge_base_id" in payload.model_fields_set:
        if payload.knowledge_base_id:
            role = await get_kb_role(payload.knowledge_base_id, current_user, db)
            if role not in {"owner", "editor"}:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You need editor access to attach a template to this workspace.",
                )
        template.knowledge_base_id = payload.knowledge_base_id

    if payload.name is not None:
        template.name = payload.name
    if payload.description is not None:
        template.description = payload.description
    if payload.content is not None:
        template.content = payload.content
        template.variables = _extract_variables(payload.content)
    if payload.is_public is not None:
        template.is_public = payload.is_public
    if payload.default_model is not None:
        template.default_model = payload.default_model
    if payload.default_temperature is not None:
        template.default_temperature = payload.default_temperature

    template.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(template)
    return PromptTemplateResponse.model_validate(template)


# ──────────────────────────────────────────────
# Delete
# ──────────────────────────────────────────────

@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a prompt template",
)
async def delete_prompt_template(
    template_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a prompt template. Only the owner can delete it."""
    result = await db.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")

    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this template")

    await db.delete(template)
