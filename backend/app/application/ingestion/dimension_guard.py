"""
RAGLens - Vector Embedding Dimension Safety Guard

Prevents mixing incompatible embedding dimensions in the same ChromaDB/Qdrant
collection, which would cause silent corruption or hard vector-dimension crashes.

Design
------
* First ingestion into a KB:  write ``embedding_model`` + ``vector_dimension``
  to the ``KnowledgeBase`` row (vector_dimension starts at 0).
* Subsequent ingestions:      compare stored dimension against the active provider's
  dimension — raise ``DimensionMismatchError`` if they differ.
* Retrieval:                  ``verify_query_dimension`` checks the query vector
  dimension before executing any similarity search.

Both functions are async-safe and only read/write the KnowledgeBase row in the
caller's session — they do NOT open new DB connections.

Hard constraint compliance
--------------------------
* No blocking calls on the event loop (pure async DB operations).
* Never padded/truncated vectors — the mismatch is always surfaced as an error.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class DimensionMismatchError(ValueError):
    """Raised when the active embedding dimension differs from the stored KB dimension.

    Attributes
    ----------
    kb_id :         The knowledge base UUID involved.
    stored_dim :    Dimension recorded in the KnowledgeBase row.
    active_dim :    Dimension produced by the current embedding provider.
    active_model :  Model name that produced the active_dim.
    """

    def __init__(
        self,
        kb_id: uuid.UUID,
        stored_model: str,
        stored_dim: int,
        active_model: str,
        active_dim: int,
    ) -> None:
        self.kb_id = kb_id
        self.stored_model = stored_model
        self.stored_dim = stored_dim
        self.active_model = active_model
        self.active_dim = active_dim
        super().__init__(
            f"Embedding dimension mismatch for KB {kb_id}. "
            f"Stored: {stored_model!r} ({stored_dim}-dim). "
            f"Active: {active_model!r} ({active_dim}-dim). "
            f"NEVER mix vector dimensions in the same collection — "
            f"re-index the KB or switch back to the original embedding model."
        )


async def check_and_set_kb_embedding(
    db: AsyncSession,
    kb_id: uuid.UUID,
    active_model: str,
    active_dim: int,
) -> None:
    """Enforce dimension consistency during ingestion.

    Behaviour
    ---------
    * ``vector_dimension == 0``   → first ingestion: write model + dim and return.
    * ``vector_dimension == active_dim`` → same model family: return silently.
    * ``vector_dimension != active_dim`` → raise ``DimensionMismatchError``.

    Parameters
    ----------
    db :          Async DB session (caller's — no new connection opened).
    kb_id :       UUID of the knowledge base being ingested into.
    active_model: Name of the embedding model currently in use.
    active_dim :  Dimension count of vectors produced by that model.

    Raises
    ------
    ValueError :             If the KB row is not found in the database.
    DimensionMismatchError : If stored_dim != active_dim and stored_dim != 0.
    """
    from app.infrastructure.db.models.knowledge import KnowledgeBase

    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()

    if kb is None:
        raise ValueError(f"Knowledge base {kb_id} not found in database.")

    if kb.vector_dimension == 0:
        # First ingestion — stamp the model and dimension onto the KB row.
        kb.embedding_model = active_model
        kb.vector_dimension = active_dim
        logger.info(
            "KB %s: embedding model set to %r (%d-dim) on first ingestion.",
            kb_id,
            active_model,
            active_dim,
        )
        await db.flush()
        return

    if kb.vector_dimension != active_dim:
        raise DimensionMismatchError(
            kb_id=kb_id,
            stored_model=kb.embedding_model,
            stored_dim=kb.vector_dimension,
            active_model=active_model,
            active_dim=active_dim,
        )

    # Dimensions match — log only at debug level to avoid noise.
    logger.debug(
        "KB %s: dimension check passed (%d-dim, model=%r).",
        kb_id,
        active_dim,
        active_model,
    )


async def verify_query_dimension(
    db: AsyncSession,
    kb_id: uuid.UUID,
    query_dim: int,
) -> None:
    """Enforce dimension consistency during retrieval / similarity search.

    Parameters
    ----------
    db :       Async DB session.
    kb_id :    UUID of the knowledge base being queried.
    query_dim: Dimension of the embedded query vector.

    Raises
    ------
    DimensionMismatchError : If stored_dim != query_dim and stored_dim != 0.
    """
    from app.infrastructure.db.models.knowledge import KnowledgeBase

    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()

    if kb is None:
        # KB not found — let the vector store surface a more specific error.
        logger.warning("verify_query_dimension: KB %s not found, skipping check.", kb_id)
        return

    if kb.vector_dimension == 0:
        # No documents ingested yet — nothing to compare against.
        return

    if kb.vector_dimension != query_dim:
        raise DimensionMismatchError(
            kb_id=kb_id,
            stored_model=kb.embedding_model,
            stored_dim=kb.vector_dimension,
            active_model="query_embedding_provider",
            active_dim=query_dim,
        )
