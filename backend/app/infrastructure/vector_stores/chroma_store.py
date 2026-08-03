"""
RAGLense - ChromaDB Vector Store Adapter

Saves and searches text chunk embeddings using ChromaDB.
Uses a singleton client for connection pooling.
"""

import logging

from app.core.config import get_settings
from app.infrastructure.vector_stores.base import VectorStoreAdapter

settings = get_settings()
logger = logging.getLogger(__name__)

# Module-level singleton for ChromaDB client
_chroma_client = None


def _get_chroma_client():
    """Get or create a singleton ChromaDB PersistentClient."""
    global _chroma_client
    if _chroma_client is None:
        try:
            import chromadb
            _chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
            logger.info(f"ChromaDB PersistentClient initialized at: {settings.CHROMA_PERSIST_DIR}")
        except Exception as e:
            logger.warning(f"Could not initialize ChromaDB PersistentClient: {e}")
            _chroma_client = None
    return _chroma_client


class ChromaVectorStoreAdapter(VectorStoreAdapter):
    """Vector database adapter for ChromaDB with connection pooling."""

    def __init__(self):
        self._client = _get_chroma_client()
        self._in_memory_db: dict[str, list] = {}  # Fallback for when ChromaDB is unavailable

    def _get_collection(self, collection_name: str, create: bool = True):
        """Get a ChromaDB collection, optionally creating it."""
        if self._client is None:
            return None
        try:
            if create:
                return self._client.get_or_create_collection(collection_name)
            else:
                return self._client.get_collection(collection_name)
        except Exception as e:
            logger.warning(f"ChromaDB collection '{collection_name}' error: {e}")
            return None

    async def add_embeddings(
        self,
        collection_name: str,
        ids: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        documents: list[str],
    ) -> None:
        import asyncio

        collection = self._get_collection(collection_name, create=True)
        if collection is not None:
            try:
                def _do_upsert():
                    # Use upsert to handle re-ingestion of the same chunks gracefully
                    collection.upsert(
                        ids=ids,
                        embeddings=embeddings,
                        metadatas=metadatas,
                        documents=documents,
                    )

                await asyncio.to_thread(_do_upsert)
                logger.info(f"Upserted {len(ids)} embeddings to Chroma collection '{collection_name}'")
                return
            except Exception as e:
                logger.warning(f"ChromaDB upsert failed: {e}. Falling back to in-memory store.")

        # Fallback to in-memory
        if collection_name not in self._in_memory_db:
            self._in_memory_db[collection_name] = []

        for idx, item_id in enumerate(ids):
            self._in_memory_db[collection_name].append({
                "id": item_id,
                "embedding": embeddings[idx],
                "metadata": metadatas[idx],
                "document": documents[idx],
            })

    async def similarity_search(
        self,
        collection_name: str,
        query_embedding: list[float],
        top_k: int = 5,
        filters: dict | None = None,  # Chroma filters accepted but not applied here
    ) -> list[dict]:
        import asyncio

        collection = self._get_collection(collection_name, create=False)
        if collection is not None:
            try:
                # Clamp n_results to the number of documents actually in the collection.
                # ChromaDB raises InvalidArgumentError if n_results > collection count.
                actual_count = collection.count()
                if actual_count == 0:
                    return []
                safe_top_k = max(1, min(top_k, actual_count))

                def _do_query():
                    return collection.query(
                        query_embeddings=[query_embedding],
                        n_results=safe_top_k,
                    )

                results = await asyncio.to_thread(_do_query)

                formatted_results = []
                if results and "ids" in results and len(results["ids"]) > 0:
                    for idx, item_id in enumerate(results["ids"][0]):
                        distance = results["distances"][0][idx] if "distances" in results else 0.0
                        # ChromaDB returns L2 distances; convert to similarity score (0-1)
                        score = max(0.0, 1.0 - (distance / 2.0))
                        formatted_results.append(
                            {
                                "id": item_id,
                                "score": score,
                                "metadata": results["metadatas"][0][idx] if "metadatas" in results else {},
                                "document": results["documents"][0][idx] if "documents" in results else "",
                            }
                        )
                return formatted_results
            except Exception as e:
                logger.warning(f"ChromaDB search failed: {e}. Falling back to in-memory.")

        # Fallback to in-memory mock
        mem_collection = self._in_memory_db.get(collection_name, [])
        results = []
        for item in mem_collection[:top_k]:
            results.append({
                "id": item["id"],
                "score": 0.9,
                "metadata": item["metadata"],
                "document": item["document"],
            })
        return results

    async def delete_embeddings(
        self,
        collection_name: str,
        ids: list[str],
    ) -> None:
        collection = self._get_collection(collection_name, create=False)
        if collection is not None:
            try:
                collection.delete(ids=ids)
                logger.info(f"Deleted {len(ids)} vectors from '{collection_name}'")
                return
            except Exception as e:
                logger.warning(f"ChromaDB deletion failed: {e}.")

        # Fallback cleanup
        if collection_name in self._in_memory_db:
            self._in_memory_db[collection_name] = [
                item for item in self._in_memory_db[collection_name] if item["id"] not in ids
            ]

    async def delete_collection(self, collection_name: str) -> None:
        """Delete an entire collection from ChromaDB."""
        if self._client is not None:
            try:
                self._client.delete_collection(collection_name)
                logger.info(f"Deleted ChromaDB collection: {collection_name}")
            except Exception as e:
                logger.warning(f"Failed to delete ChromaDB collection '{collection_name}': {e}")

        self._in_memory_db.pop(collection_name, None)
