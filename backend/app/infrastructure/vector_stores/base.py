"""
RAGLense - Vector Store Adapter Interface

Abstract base class for all vector databases.
"""

from abc import ABC, abstractmethod


class VectorStoreAdapter(ABC):
    """Abstract interface for storing and querying document embeddings."""

    @abstractmethod
    async def add_embeddings(
        self,
        collection_name: str,
        ids: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        documents: list[str],
    ) -> None:
        """Add embedding vectors and associated documents to vector store."""
        pass

    @abstractmethod
    async def similarity_search(
        self,
        collection_name: str,
        query_embedding: list[float],
        top_k: int = 5,
        filters: dict | None = None,
    ) -> list[dict]:
        """Perform semantic search using embedding vector comparison.

        Args:
            filters: Optional metadata filter dict. Format:
                {"must": [{"key": "<field>", "range": {"gte": ..., "lte": ...}}]}
        """
        pass

    @abstractmethod
    async def delete_embeddings(
        self,
        collection_name: str,
        ids: list[str],
    ) -> None:
        """Delete specific vectors from vector store."""
        pass

    async def list_collections(self) -> list[str]:
        """Return a list of collection names in the vector store.

        Default implementation returns an empty list. Override in adapters
        that support collection listing (e.g. Qdrant, Chroma).
        """
        return []
