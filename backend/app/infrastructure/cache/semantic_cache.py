"""
RAGLense - Semantic Cache

Caches and retrieves LLM generated answers based on semantic similarity of queries.
Reduces external LLM calls, costs, and response latencies.
"""

import logging

from app.infrastructure.embeddings.openai_embeddings import OpenAIEmbeddingProvider
from app.infrastructure.vector_stores.chroma_store import ChromaVectorStoreAdapter

logger = logging.getLogger(__name__)


class SemanticCache:
    """Uses vector embeddings to match queries against cached results."""

    def __init__(self, threshold: float = 0.95):
        self.embedding_provider = OpenAIEmbeddingProvider()
        self.vector_store = ChromaVectorStoreAdapter()
        self.threshold = threshold
        self.collection_name = "semantic_cache"

    async def get(self, query: str) -> str | None:
        """Query the semantic cache for a similar query within the match threshold."""
        try:
            query_vector = await self.embedding_provider.embed_query(query)
            matches = await self.vector_store.similarity_search(
                collection_name=self.collection_name,
                query_embedding=query_vector,
                top_k=1,
            )
            
            if matches and len(matches) > 0:
                best_match = matches[0]
                # High score indicates high semantic match
                if best_match["score"] >= self.threshold:
                    logger.info(f"Semantic cache HIT for query: '{query}'")
                    return best_match["document"]
            logger.info(f"Semantic cache MISS for query: '{query}'")
            return None
        except Exception as e:
            logger.warning(f"Semantic cache lookup failed: {e}")
            return None

    async def set(self, query: str, answer: str) -> None:
        """Cache an answer for a user query."""
        try:
            query_vector = await self.embedding_provider.embed_query(query)
            import uuid
            cache_id = str(uuid.uuid4())
            await self.vector_store.add_embeddings(
                collection_name=self.collection_name,
                ids=[cache_id],
                embeddings=[query_vector],
                metadatas=[{"query": query}],
                documents=[answer],
            )
            logger.info(f"Cached semantic answer under key {cache_id}")
        except Exception as e:
            logger.warning(f"Failed to cache semantic answer: {e}")
