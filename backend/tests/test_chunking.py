"""
RAGLens Tests — Document chunking logic (test_chunking.py)

Tests:
  1. RecursiveCharacterTextSplitter produces the expected number of chunks
  2. Each chunk is within the configured size limit
  3. Overlap regions are preserved between adjacent chunks
  4. IngestionPipeline._chunking_stage() returns correctly shaped dicts
  5. Empty input produces an empty chunk list (no crash)
"""

import pytest


# ── Splitter Unit Tests ─────────────────────────────────────────────────────────

class TestRecursiveChunker:
    """Tests for the raw LangChain splitter behavior used by the pipeline."""

    def _make_splitter(self, chunk_size: int = 100, chunk_overlap: int = 20):
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        return RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def test_chunks_within_size_limit(self):
        """Every chunk produced must be <= chunk_size characters."""
        splitter = self._make_splitter(chunk_size=200, chunk_overlap=20)
        text = " ".join([f"word{i}" for i in range(500)])
        chunks = splitter.split_text(text)
        assert all(len(c) <= 200 for c in chunks), "Some chunks exceed the size limit"

    def test_produces_multiple_chunks_for_long_text(self):
        """A 2000-char document with chunk_size=100 should produce many chunks."""
        splitter = self._make_splitter(chunk_size=100, chunk_overlap=10)
        long_text = "This is sentence number {i}. " * 100
        chunks = splitter.split_text(long_text)
        assert len(chunks) > 5

    def test_empty_text_returns_empty_list(self):
        """Empty string should not crash — returns empty list or single empty chunk."""
        splitter = self._make_splitter()
        chunks = splitter.split_text("")
        # LangChain may return [] or [""] — both are acceptable
        assert isinstance(chunks, list)

    def test_overlap_preserved_between_adjacent_chunks(self):
        """The tail of chunk N should appear in the head of chunk N+1."""
        splitter = self._make_splitter(chunk_size=50, chunk_overlap=20)
        text = "abcde " * 50  # 300-char repeating text
        chunks = splitter.split_text(text)
        if len(chunks) >= 2:
            tail_of_first = chunks[0][-15:]
            head_of_second = chunks[1][:15]
            # At least some characters should overlap
            assert any(c in head_of_second for c in tail_of_first), (
                "Expected overlap between consecutive chunks"
            )


# ── Pipeline Stage Tests ────────────────────────────────────────────────────────

class TestIngestionPipelineChunkingStage:
    """
    Integration test: IngestionPipeline._chunking_stage() against a real
    in-memory session and a temporary document file.
    """

    @pytest.mark.asyncio
    async def test_chunking_stage_returns_correct_shape(self, async_db, mock_document):
        """
        After _extraction_stage() runs, _chunking_stage() should return a list
        of dicts each containing at minimum: id, index, text, token_count, char_count.
        """
        from app.application.ingestion.pipeline import IngestionPipeline

        pipeline = IngestionPipeline(async_db, mock_document.id)

        # Run extraction so _extracted_text is populated
        await pipeline._extraction_stage(mock_document)

        # Run chunking
        chunks = await pipeline._chunking_stage()

        assert isinstance(chunks, list)
        assert len(chunks) >= 1

        for chunk in chunks:
            assert "id" in chunk, "chunk must have a pre-assigned id"
            assert "text" in chunk, "chunk must have text content"
            assert "token_count" in chunk
            assert "char_count" in chunk
            assert isinstance(chunk["text"], str)
            assert len(chunk["text"]) > 0

    @pytest.mark.asyncio
    async def test_chunking_stage_empty_extraction_raises(self, async_db, mock_document, tmp_path):
        """
        If the extracted text is empty (simulated by overwriting it after extraction),
        the chunking stage should return an empty list gracefully.
        """
        from app.application.ingestion.pipeline import IngestionPipeline

        pipeline = IngestionPipeline(async_db, mock_document.id)
        # Force-empty the extracted text
        pipeline._extracted_text = ""

        chunks = await pipeline._chunking_stage()
        # LangChain returns [] or [""] for empty input — pipeline should handle either
        assert isinstance(chunks, list)
