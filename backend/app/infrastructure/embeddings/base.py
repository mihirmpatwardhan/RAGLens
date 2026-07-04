"""
RAGLense - Embeddings Interface

Abstract base class for all embedding models.
"""

from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    """Abstract interface for embedding generation."""

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]:
        """Generate embedding vector for a query string."""
        pass

    @abstractmethod
    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate embedding vectors for a list of document strings."""
        pass
