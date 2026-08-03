"""
RAGLens Tests — Vector dimension safety guard (test_vector_dimension_guard.py)

Tests:
  1. First ingestion: KB row gets embedding_model + vector_dimension written
  2. Matching dimensions: no error raised on subsequent ingestion
  3. Mismatched dimensions: DimensionMismatchError raised before any vector write
  4. Retrieval guard: mismatched query dimension raises DimensionMismatchError
"""

import uuid

import pytest

from app.application.ingestion.dimension_guard import (
    DimensionMismatchError,
    check_and_set_kb_embedding,
    verify_query_dimension,
)


class TestDimensionGuardIngestion:
    """Tests for check_and_set_kb_embedding() used during ingestion."""

    @pytest.mark.asyncio
    async def test_first_ingestion_writes_embedding_metadata(self, async_db, mock_kb):
        """
        On first ingestion (kb.vector_dimension == 0 or unset),
        the guard must write the active model and dimension to the KB row.
        """
        # Reset to "unset" state
        mock_kb.embedding_model = ""
        mock_kb.vector_dimension = 0
        await async_db.flush()

        await check_and_set_kb_embedding(
            db=async_db,
            kb_id=mock_kb.id,
            active_model="text-embedding-3-small",
            active_dim=1536,
        )
        await async_db.flush()

        # Reload
        await async_db.refresh(mock_kb)
        assert mock_kb.embedding_model == "text-embedding-3-small"
        assert mock_kb.vector_dimension == 1536

    @pytest.mark.asyncio
    async def test_matching_dimensions_no_error(self, async_db, mock_kb):
        """
        When the stored dimension matches the active embedding dimension,
        no exception should be raised.
        """
        mock_kb.embedding_model = "text-embedding-3-small"
        mock_kb.vector_dimension = 1536
        await async_db.flush()

        # Should not raise
        await check_and_set_kb_embedding(
            db=async_db,
            kb_id=mock_kb.id,
            active_model="text-embedding-3-small",
            active_dim=1536,
        )

    @pytest.mark.asyncio
    async def test_dimension_mismatch_raises_error(self, async_db, mock_kb):
        """
        When stored dimension (1536) doesn't match active dimension (384),
        DimensionMismatchError must be raised BEFORE any vector write.
        """
        mock_kb.embedding_model = "text-embedding-3-small"
        mock_kb.vector_dimension = 1536
        await async_db.flush()

        with pytest.raises(DimensionMismatchError) as exc_info:
            await check_and_set_kb_embedding(
                db=async_db,
                kb_id=mock_kb.id,
                active_model="BAAI/bge-small-en-v1.5",
                active_dim=384,
            )

        error_msg = str(exc_info.value)
        assert "384" in error_msg
        assert "1536" in error_msg

    @pytest.mark.asyncio
    async def test_unknown_kb_id_raises_value_error(self, async_db):
        """A non-existent KB ID should raise ValueError."""
        fake_kb_id = uuid.uuid4()

        with pytest.raises(ValueError, match="Knowledge base"):
            await check_and_set_kb_embedding(
                db=async_db,
                kb_id=fake_kb_id,
                active_model="text-embedding-3-small",
                active_dim=1536,
            )


class TestDimensionGuardRetrieval:
    """Tests for verify_query_dimension() used during retrieval."""

    @pytest.mark.asyncio
    async def test_matching_query_dimension_passes(self, async_db, mock_kb):
        """Query with correct dimensions should pass silently."""
        mock_kb.vector_dimension = 1536
        await async_db.flush()

        # Should not raise
        await verify_query_dimension(db=async_db, kb_id=mock_kb.id, query_dim=1536)

    @pytest.mark.asyncio
    async def test_mismatched_query_dimension_raises(self, async_db, mock_kb):
        """Query with 384-dim against a 1536-dim KB must raise DimensionMismatchError."""
        mock_kb.vector_dimension = 1536
        await async_db.flush()

        with pytest.raises(DimensionMismatchError):
            await verify_query_dimension(db=async_db, kb_id=mock_kb.id, query_dim=384)

    @pytest.mark.asyncio
    async def test_uninitialized_kb_dimension_skips_check(self, async_db, mock_kb):
        """
        If KB.vector_dimension == 0 (KB exists but has no documents yet),
        the check should skip silently rather than raise.
        """
        mock_kb.vector_dimension = 0
        await async_db.flush()

        # Should not raise — no vectors stored yet
        await verify_query_dimension(db=async_db, kb_id=mock_kb.id, query_dim=1536)
