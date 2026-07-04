"""
RAGLense - OpenAI Embeddings Provider

Generates embeddings using the official OpenAI Python SDK with proper
retry handling, batching, and error messages.
"""

import logging
from app.core.config import get_settings
from app.infrastructure.embeddings.base import EmbeddingProvider

settings = get_settings()
logger = logging.getLogger(__name__)

# Max texts per batch for the OpenAI embeddings API
_BATCH_SIZE = 100


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Generates text embeddings using the OpenAI API via the official SDK."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.model = model or settings.DEFAULT_EMBEDDING_MODEL
        self._client = None

    def _get_client(self):
        """Lazily create the AsyncOpenAI client."""
        if self._client is None:
            if not self.api_key:
                return None
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                max_retries=3,
                timeout=30.0,
            )
        return self._client

    async def embed_query(self, text: str) -> list[float]:
        """Generate embedding for a single query string."""
        client = self._get_client()
        if client is None:
            logger.warning(
                "OpenAI API key not configured. Returning zero vector. "
                "Set OPENAI_API_KEY to enable real embeddings."
            )
            return [0.0] * settings.DEFAULT_EMBEDDING_DIMENSION

        try:
            response = await client.embeddings.create(
                input=text,
                model=self.model,
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"OpenAI embedding failed for query: {e}")
            raise

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of document strings with batching."""
        client = self._get_client()
        if client is None:
            logger.warning(
                "OpenAI API key not configured. Returning zero vectors. "
                "Set OPENAI_API_KEY to enable real embeddings."
            )
            return [[0.0] * settings.DEFAULT_EMBEDDING_DIMENSION for _ in texts]

        if not texts:
            return []

        all_embeddings: list[list[float]] = []

        # Process in batches to avoid API limits
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i : i + _BATCH_SIZE]
            try:
                response = await client.embeddings.create(
                    input=batch,
                    model=self.model,
                )
                # Sort by index to maintain order
                sorted_data = sorted(response.data, key=lambda x: x.index)
                all_embeddings.extend([item.embedding for item in sorted_data])
            except Exception as e:
                logger.error(f"OpenAI embedding batch failed (batch {i // _BATCH_SIZE}): {e}")
                raise

        logger.info(f"Generated {len(all_embeddings)} embeddings using {self.model}")
        return all_embeddings
