# Vector stores package
from app.infrastructure.vector_stores.base import VectorStoreAdapter
from app.infrastructure.vector_stores.chroma_store import ChromaVectorStoreAdapter
from app.infrastructure.vector_stores.qdrant_store import QdrantVectorStoreAdapter


def get_vector_store() -> VectorStoreAdapter:
    """Factory: returns the configured vector store adapter.

    Reads VECTOR_DB_PROVIDER from settings:
      - "qdrant"  → QdrantVectorStoreAdapter  (default, Phase 3+)
      - "chroma"  → ChromaVectorStoreAdapter  (legacy / fallback)

    Both adapters share the same VectorStoreAdapter interface so callers
    never need to know which backend is active.
    """
    from app.core.config import get_settings
    provider = get_settings().VECTOR_DB_PROVIDER

    if provider == "qdrant":
        return QdrantVectorStoreAdapter()

    # Default / legacy fallback
    return ChromaVectorStoreAdapter()


__all__ = [
    "VectorStoreAdapter",
    "ChromaVectorStoreAdapter",
    "QdrantVectorStoreAdapter",
    "get_vector_store",
]
