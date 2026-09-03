"""
RAGLens - Fallback Embedding Provider (Phase 2)

Primary: OpenAI text-embedding-3-small
Fallback: Local BAAI/bge-small-en-v1.5 via sentence-transformers

The fallback model is ~33MB and uses the same sentence-transformers package
already present in dependencies (added in Phase 1 for the cross-encoder).
It produces 384-dim vectors vs OpenAI's 1536-dim — a dimensional mismatch
would break similarity search if you mix vectors. The provider therefore:

  1. Checks which mode is active (openai vs local) and keeps consistent.
  2. Pads or truncates is NOT done — instead a warning is logged that existing
     ChromaDB/Qdrant collections built with OpenAI embeddings are incompatible
     with local embeddings and new collections should be created.
  3. When falling back, sets ACTIVE_EMBEDDING_DIM on the instance so callers
     can detect the change.

The local model runs in asyncio.to_thread to avoid blocking the event loop.
"""

import asyncio
import logging

from app.infrastructure.embeddings.base import EmbeddingProvider

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100

# Module-level singleton for the local SentenceTransformer model.
_local_model: object | None = None
_local_model_name: str | None = None


def _load_local_model(model_name: str):
    """Load (or return cached) local SentenceTransformer model — blocking."""
    global _local_model, _local_model_name

    if _local_model is not None and _local_model_name == model_name:
        return _local_model

    from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]

    logger.info("Loading local embedding model: %s", model_name)
    _local_model = SentenceTransformer(model_name)
    _local_model_name = model_name
    logger.info("Local embedding model loaded successfully.")
    return _local_model


def _sync_encode_local(model_name: str, texts: list[str]) -> list[list[float]]:
    """Synchronously encode texts with the local model — runs in thread pool."""
    model = _load_local_model(model_name)
    embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return [emb.tolist() for emb in embeddings]


class FallbackEmbeddingProvider(EmbeddingProvider):
    """Embedding provider with OpenAI primary and local HuggingFace fallback.

    When OpenAI embedding succeeds, returns 1536-dim vectors (text-embedding-3-small).
    When EMBEDDING_FALLBACK_TO_LOCAL=True and OpenAI fails, returns 384-dim vectors
    from bge-small-en-v1.5.

    Note: Mixing vector dimensions in the same ChromaDB/Qdrant collection will
    cause search errors. The fallback should only be used when creating a new
    collection or after a full re-index. A warning is logged on every fallback use.
    """

    def __init__(self) -> None:
        from app.core.config import get_settings
        self._settings = get_settings()
        self._openai_client = None
        # Set active_dim to reflect the actual provider we'll use
        if self._settings.DEFAULT_EMBEDDING_PROVIDER == "local":
            self.active_dim: int = self._settings.LOCAL_EMBEDDING_DIMENSION
        else:
            self.active_dim = self._settings.DEFAULT_EMBEDDING_DIMENSION

    def _get_openai_client(self):
        if self._openai_client is None:
            if not self._settings.OPENAI_API_KEY:
                return None
            from openai import AsyncOpenAI
            self._openai_client = AsyncOpenAI(
                api_key=self._settings.OPENAI_API_KEY,
                max_retries=2,
                timeout=30.0,
            )
        return self._openai_client

    async def _try_openai(self, texts: list[str]) -> list[list[float]]:
        """Try OpenAI embeddings; raises on failure."""
        client = self._get_openai_client()
        if client is None:
            raise ValueError("OPENAI_API_KEY not set")

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i: i + _BATCH_SIZE]
            response = await client.embeddings.create(
                input=batch,
                model=self._settings.DEFAULT_EMBEDDING_MODEL,
            )
            sorted_data = sorted(response.data, key=lambda x: x.index)
            all_embeddings.extend([item.embedding for item in sorted_data])

        self.active_dim = self._settings.DEFAULT_EMBEDDING_DIMENSION
        logger.info(
            "OpenAI embeddings: %d vectors (%s)",
            len(all_embeddings),
            self._settings.DEFAULT_EMBEDDING_MODEL,
        )
        return all_embeddings

    async def _use_local_fallback(self, texts: list[str]) -> list[list[float]]:
        """Use local bge-small-en-v1.5 model as fallback."""
        model_name = self._settings.LOCAL_EMBEDDING_MODEL
        logger.warning(
            "Using LOCAL embedding fallback (%s, %d-dim). "
            "Do NOT mix these vectors with existing OpenAI-embedded collections — "
            "re-index the collection if dimensions changed.",
            model_name,
            self._settings.LOCAL_EMBEDDING_DIMENSION,
        )
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i: i + _BATCH_SIZE]
            batch_embeddings = await asyncio.to_thread(
                _sync_encode_local, model_name, batch
            )
            all_embeddings.extend(batch_embeddings)

        self.active_dim = self._settings.LOCAL_EMBEDDING_DIMENSION
        logger.info("Local embeddings: %d vectors (%s)", len(all_embeddings), model_name)
        return all_embeddings

    async def _use_local_primary(self, texts: list[str]) -> list[list[float]]:
        """Use local model as PRIMARY — no OpenAI attempt, no warning."""
        model_name = self._settings.LOCAL_EMBEDDING_MODEL
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i: i + _BATCH_SIZE]
            batch_embeddings = await asyncio.to_thread(
                _sync_encode_local, model_name, batch
            )
            all_embeddings.extend(batch_embeddings)
        self.active_dim = self._settings.LOCAL_EMBEDDING_DIMENSION
        logger.info("Local embeddings: %d vectors (%s)", len(all_embeddings), model_name)
        return all_embeddings

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed texts. Uses local model directly when DEFAULT_EMBEDDING_PROVIDER=local,
        otherwise tries OpenAI first with local as fallback."""
        if not texts:
            return []

        # When explicitly configured to use local — skip OpenAI entirely (no wasted retries)
        if self._settings.DEFAULT_EMBEDDING_PROVIDER == "local":
            return await self._use_local_primary(texts)

        try:
            return await self._try_openai(texts)
        except Exception as exc:
            logger.warning("OpenAI embedding failed: %s", exc)
            if self._settings.EMBEDDING_FALLBACK_TO_LOCAL:
                return await self._use_local_fallback(texts)
            logger.error("EMBEDDING_FALLBACK_TO_LOCAL=False and OpenAI failed. Returning zero vectors.")
            dim = self._settings.DEFAULT_EMBEDDING_DIMENSION
            return [[0.0] * dim for _ in texts]

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        results = await self.embed_documents([text])
        return results[0] if results else [0.0] * self.active_dim


# ──────────────────────────────────────────────
# Process-lifetime singleton
# ──────────────────────────────────────────────

_embedding_provider_instance: FallbackEmbeddingProvider | None = None


def get_embedding_provider() -> FallbackEmbeddingProvider:
    """Return a process-lifetime FallbackEmbeddingProvider singleton.

    Avoids re-creating the OpenAI AsyncClient and re-loading any local model
    on every request. Safe for use across concurrent async requests.
    """
    global _embedding_provider_instance
    if _embedding_provider_instance is None:
        _embedding_provider_instance = FallbackEmbeddingProvider()
    return _embedding_provider_instance
