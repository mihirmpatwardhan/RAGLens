"""
RAGLens - RBAC Models

Implements role-based access control for Knowledge Bases via a membership table.

Roles:
  owner   — full control (create, delete, manage members)
  editor  — can upload/delete documents, query, but cannot delete the KB or manage members
  viewer  — read-only: can query and browse documents, cannot modify anything

Design:
  - Every KB's creator is automatically added as 'owner' in this table.
  - Clerk Organization roles are NOT used here because we want KB-level granularity
    (a user can be an editor in KB-A and viewer in KB-B).
  - FastAPI deps in deps.py use this table for access checks.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base

VALID_ROLES = {"owner", "editor", "viewer"}


class KnowledgeBaseMember(Base):
    """Membership record linking a user to a knowledge base with a role."""

    __tablename__ = "knowledge_base_members"
    __table_args__ = (
        UniqueConstraint("knowledge_base_id", "user_id", name="uq_kb_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="viewer"
    )  # owner | editor | viewer
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<KBMember kb={self.knowledge_base_id} user={self.user_id} role={self.role}>"
