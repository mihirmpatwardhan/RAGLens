"""
RAGLens - Qdrant Vector Store Adapter

Drop-in replacement for ChromaVectorStoreAdapter implementing the same
VectorStoreAdapter interface. Uses the async qdrant-client for all I/O.

Multi-tenant isolation strategy:
  - Each Knowledge Base maps to its own Qdrant collection named "kb_<uuid>".
  - The same naming scheme is used by ChromaDB, so no pipeline changes needed.
  - Within a collection, metadata payloads carry document_id, filename, etc.
  - Similarity search is always scoped to the requested collection — vectors from
    one KB can NEVER appear in results for another KB.

Collection creation:
  - Collections are created on first upsert with COSINE distance metric.
  - Vector size is read from settings.DEFAULT_EMBEDDING_DIMENSION (1536 for OpenAI).
    When the local embedding fallback is active (384-dim), the collection is created
    at 384-dim. Mixing dims in the same collection raises a Qdrant error, which
    surfaces as an ingestion pipeline failure and is logged clearly.
"""

import logging

from app.core.config import get_settings
from app.infrastructure.vector_stores.base import VectorStoreAdapter

logger = logging.getLogger(__name__)
settings = get_settings()

# Module-level singleton client
_qdrant_client: object | None = None


def _get_qdrant_client():
    """Return or create the singleton AsyncQdrantClient."""
    global _qdrant_client
    if _qdrant_client is not None:
        return _qdrant_client

    try:
        from qdrant_client import AsyncQdrantClient  # type: ignore[import-untyped]

        kwargs: dict = {"url": settings.QDRANT_URL}
        if settings.QDRANT_API_KEY:
            kwargs["api_key"] = settings.QDRANT_API_KEY
        if settings.QDRANT_PREFER_GRPC:
            kwargs["prefer_grpc"] = True
            kwargs["grpc_port"] = settings.QDRANT_GRPC_PORT

        _qdrant_client = AsyncQdrantClient(**kwargs)
        logger.info("QdrantClient initialized → %s", settings.QDRANT_URL)
    except Exception as exc:
        logger.error("Failed to initialize QdrantClient: %s", exc)
        _qdrant_client = None

    return _qdrant_client


async def _ensure_collection(client, collection_name: str, vector_size: int) -> None:
    """Create the Qdrant collection if it does not already exist."""
    from qdrant_client.models import (  # type: ignore[import-untyped]
        Distance,
        VectorParams,
    )

    try:
        existing = await client.get_collection(collection_name)
        # Collection exists — verify vector size matches
        existing_size = existing.config.params.vectors.size
        if existing_size != vector_size:
            logger.warning(
                "Qdrant '%s' exists with vector_size=%d but current model gives %d-dim vectors. "
                "Dimension mismatch will cause failures. Re-create the collection.",
                collection_name,
                existing_size,
                vector_size,
            )
        return
    except Exception:
        # Collection does not exist — create it
        pass

    await client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(
            size=vector_size,
            distance=Distance.COSINE,
        ),
    )
    logger.info(
        "Created Qdrant collection '%s' (size=%d, distance=COSINE)",
        collection_name,
        vector_size,
    )




def _build_qdrant_filter(filters: dict) -> "object":
    """Translate a generic filter dict into a Qdrant Filter model.

    Expected input format (produced by retrieval/_build_qdrant_date_filter):
        {
            "must": [
                {"key": "source_date", "range": {"gte": "<ISO>", "lte": "<ISO>"}}
            ]
        }

    Returns a qdrant_client.models.Filter object, or None if translation fails.
    """
    try:
        from qdrant_client.models import (  # type: ignore[import-untyped]
            DatetimeRange,
            FieldCondition,
            Filter,
            Range,
        )

        must_conditions = []
        for condition in filters.get("must", []):
            key = condition.get("key")
            range_spec = condition.get("range", {})
            if not key or not range_spec:
                continue

            gte = range_spec.get("gte")
            lte = range_spec.get("lte")

            # Try DatetimeRange first (for ISO datetime strings like source_date)
            try:
                from datetime import datetime as _dt

                gte_dt = _dt.fromisoformat(gte) if gte else None
                lte_dt = _dt.fromisoformat(lte) if lte else None
                must_conditions.append(
                    FieldCondition(
                        key=key,
                        range=DatetimeRange(gte=gte_dt, lte=lte_dt),
                    )
                )
            except (ValueError, TypeError):
                # Fall back to numeric Range for non-datetime fields
                must_conditions.append(
                    FieldCondition(
                        key=key,
                        range=Range(
                            gte=float(gte) if gte is not None else None,
                            lte=float(lte) if lte is not None else None,
                        ),
                    )
                )

        if must_conditions:
            return Filter(must=must_conditions)
        return None

    except Exception as exc:
        logger.warning("Failed to build Qdrant filter (%s): %s — skipping filter", filters, exc)
        return None


class QdrantVectorStoreAdapter(VectorStoreAdapter):
    """Async Qdrant adapter — same interface as ChromaVectorStoreAdapter.

    Collection naming: "kb_<knowledge_base_uuid>" (identical to Chroma naming).
    This ensures multi-tenant isolation: one KB = one collection.
    """

    def __init__(self, vector_size: int | None = None) -> None:
        self._client = _get_qdrant_client()
        # Vector size may be overridden when local embeddings produce a different dim.
        self._vector_size = vector_size or settings.DEFAULT_EMBEDDING_DIMENSION

    async def add_embeddings(
        self,
        collection_name: str,
        ids: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        documents: list[str],
    ) -> None:
        """Upsert vectors and payloads into the named collection."""
        if self._client is None:
            logger.error("Qdrant client not available — skipping upsert.")
            return

        # Infer vector size from first embedding if available
        vector_size = len(embeddings[0]) if embeddings else self._vector_size
        await _ensure_collection(self._client, collection_name, vector_size)

        from qdrant_client.models import PointStruct  # type: ignore[import-untyped]

        points = [
            PointStruct(
                id=str(ids[i]),
                vector=embeddings[i],
                payload={
                    **metadatas[i],
                    "document": documents[i],
                },
            )
            for i in range(len(ids))
        ]

        # Batch upsert in chunks of 100 to stay within Qdrant payload limits
        batch_size = 100
        for start in range(0, len(points), batch_size):
            batch = points[start: start + batch_size]
            await self._client.upsert(collection_name=collection_name, points=batch)

        logger.info(
            "Upserted %d vectors into Qdrant collection '%s'",
            len(ids),
            collection_name,
        )

    async def similarity_search(
        self,
        collection_name: str,
        query_embedding: list[float],
        top_k: int = 5,
        filters: dict | None = None,
    ) -> list[dict]:
        """Search for the top_k most similar vectors in the named collection."""
        if self._client is None:
            logger.error("Qdrant client not available — returning empty results.")
            return []

        try:
            # Ensure collection exists (it may not if no documents have been indexed yet)
            await _ensure_collection(self._client, collection_name, len(query_embedding))

            # Translate generic filter dict to Qdrant Filter model (used for temporal queries)
            qdrant_filter = None
            if filters:
                qdrant_filter = _build_qdrant_filter(filters)

            results = await self._client.search(
                collection_name=collection_name,
                query_vector=query_embedding,
                limit=top_k,
                with_payload=True,
                query_filter=qdrant_filter,
            )
        except Exception as exc:
            logger.error("Qdrant search failed in collection '%s': %s", collection_name, exc)
            return []

        formatted: list[dict] = []
        for hit in results:
            payload = hit.payload or {}
            formatted.append({
                "id": str(hit.id),
                # Qdrant COSINE returns scores in [0, 1] — directly usable.
                "score": round(float(hit.score), 4),
                "metadata": {k: v for k, v in payload.items() if k != "document"},
                "document": payload.get("document", ""),
            })

        return formatted

    async def delete_embeddings(
        self,
        collection_name: str,
        ids: list[str],
    ) -> None:
        """Delete specific points from the named collection."""
        if self._client is None:
            return

        from qdrant_client.models import PointIdsList  # type: ignore[import-untyped]

        try:
            await self._client.delete(
                collection_name=collection_name,
                points_selector=PointIdsList(points=ids),
            )
            logger.info("Deleted %d points from Qdrant collection '%s'", len(ids), collection_name)
        except Exception as exc:
            logger.warning("Qdrant delete failed in '%s': %s", collection_name, exc)

    async def delete_collection(self, collection_name: str) -> None:
        """Delete the entire collection (e.g. when a KB is deleted)."""
        if self._client is None:
            return
        try:
            await self._client.delete_collection(collection_name)
            logger.info("Deleted Qdrant collection: %s", collection_name)
        except Exception as exc:
            logger.warning("Failed to delete Qdrant collection '%s': %s", collection_name, exc)
