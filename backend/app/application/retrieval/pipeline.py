"""
RAGLense - Retrieval Pipeline

Orchestrates real RAG stages: query embedding, vector search,
reranking, prompt building, and LLM generation via OpenAI/LangChain.
"""

import logging
import time
import uuid
from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infrastructure.embeddings.openai_embeddings import OpenAIEmbeddingProvider
from app.infrastructure.vector_stores.chroma_store import ChromaVectorStoreAdapter

logger = logging.getLogger(__name__)
settings = get_settings()

# Default system prompt for RAG
_RAG_SYSTEM_PROMPT = """You are a helpful AI assistant answering questions based on the provided context from the user's knowledge base.

Instructions:
- Answer the question using ONLY the provided context. Do not use external knowledge.
- If the context doesn't contain enough information, say so clearly.
- Cite your sources by referencing the document name when possible.
- Use markdown formatting for structured responses.
- Be concise but thorough."""

_RAG_USER_TEMPLATE = """Context:
{context}

Question: {question}

Answer based on the context above:"""


class RetrievalPipeline:
    """Orchestrates query processing, vector search, and LLM generation."""

    def __init__(self, db: AsyncSession, kb_id: uuid.UUID | None = None):
        self.db = db
        self.kb_id = kb_id
        self.embedding_provider = OpenAIEmbeddingProvider()
        self.vector_store = ChromaVectorStoreAdapter()

    async def retrieve_and_generate(self, query: str) -> dict:
        """Execute the full retrieval pipeline and return the response with trace logs."""
        trace = {
            "query_original": query,
            "query_rewritten": query,
            "intent": "informational",
            "search_type": settings.DEFAULT_SEARCH_TYPE,
            "retrieved_chunks": [],
            "reranked_chunks": [],
            "prompt_tokens": 0,
            "total_latency_ms": 0,
            "stages": {},
        }

        start_time = time.time()

        # ── Stage 1: Query Rewrite (lightweight enhancement) ──
        s_start = time.time()
        rewritten_query = query  # Keep original for now; LLM rewrite is optional
        trace["query_rewritten"] = rewritten_query
        trace["stages"]["query_rewrite"] = {
            "name": "Query Rewrite",
            "duration_ms": int((time.time() - s_start) * 1000),
            "details": {"original": query, "rewritten": rewritten_query},
        }

        # ── Stage 2: Vector Search (Dense Retrieval) ──
        s_start = time.time()
        query_vector = await self.embedding_provider.embed_query(rewritten_query)
        collection_name = f"kb_{self.kb_id}" if self.kb_id else settings.CHROMA_COLLECTION_NAME

        search_results = await self.vector_store.similarity_search(
            collection_name=collection_name,
            query_embedding=query_vector,
            top_k=settings.DEFAULT_TOP_K,
        )

        dense_duration = int((time.time() - s_start) * 1000)
        trace["stages"]["dense_search"] = {
            "name": "Dense Search",
            "duration_ms": dense_duration,
            "details": {
                "collection": collection_name,
                "vector_dimensions": len(query_vector),
                "matches": len(search_results),
            },
        }

        # Format retrieved chunks
        retrieved = []
        for res in search_results:
            retrieved.append({
                "chunk_id": res["id"],
                "content": res["document"],
                "score": round(res["score"], 4),
                "document_name": res["metadata"].get("filename", "document"),
                "page_number": res["metadata"].get("page_number", 1),
            })
        trace["retrieved_chunks"] = retrieved

        # ── Stage 3: Reranking (score-based for now, cross-encoder optional) ──
        s_start = time.time()
        reranked = sorted(retrieved, key=lambda x: x["score"], reverse=True)
        trace["stages"]["reranking"] = {
            "name": "Reranking",
            "duration_ms": int((time.time() - s_start) * 1000),
            "details": {"model": "score_sort", "input_count": len(retrieved)},
        }
        trace["reranked_chunks"] = reranked

        # ── Stage 4: Prompt Building ──
        s_start = time.time()
        context = "\n\n---\n\n".join(
            [f"[Source: {item['document_name']}, Page {item['page_number']}]\n{item['content']}"
             for item in reranked]
        )
        user_prompt = _RAG_USER_TEMPLATE.format(context=context, question=query)
        trace["prompt_tokens"] = len(user_prompt.split())
        trace["stages"]["prompt_builder"] = {
            "name": "Prompt Builder",
            "duration_ms": int((time.time() - s_start) * 1000),
            "details": {"prompt_characters": len(user_prompt), "context_chunks": len(reranked)},
        }

        # ── Stage 5: LLM Generation ──
        s_start = time.time()
        answer = await self._call_llm(user_prompt)
        llm_duration = int((time.time() - s_start) * 1000)
        trace["stages"]["llm_generation"] = {
            "name": "LLM Generation",
            "duration_ms": llm_duration,
            "details": {
                "model": settings.DEFAULT_LLM_MODEL,
                "provider": settings.DEFAULT_LLM_PROVIDER,
            },
        }

        trace["total_latency_ms"] = int((time.time() - start_time) * 1000)

        return {
            "answer": answer,
            "trace": trace,
            "citations": [
                {
                    "chunk_id": item["chunk_id"],
                    "document_name": item["document_name"],
                    "page_number": item["page_number"],
                    "content": item["content"],
                    "score": item["score"],
                }
                for item in reranked
            ],
        }

    async def _call_llm(self, user_prompt: str) -> str:
        """Call the configured LLM provider for response generation."""
        api_key = settings.OPENAI_API_KEY

        if not api_key:
            logger.warning(
                "No LLM API key configured. Returning context-only response. "
                "Set OPENAI_API_KEY (or ANTHROPIC_API_KEY, GOOGLE_API_KEY) to enable generation."
            )
            return (
                "⚠️ **LLM not configured** — API key is missing.\n\n"
                "The retrieval pipeline found relevant documents in your knowledge base, "
                "but cannot generate a synthesized answer without an LLM connection.\n\n"
                "**To enable real AI responses:**\n"
                "1. Set `OPENAI_API_KEY` in your `.env` file\n"
                "2. Restart the backend server\n\n"
                "The retrieved context chunks are shown in the citations panel."
            )

        provider = settings.DEFAULT_LLM_PROVIDER

        try:
            if provider == "openai":
                return await self._call_openai(api_key, user_prompt)
            elif provider == "anthropic":
                return await self._call_anthropic(user_prompt)
            elif provider == "google":
                return await self._call_google(user_prompt)
            else:
                return await self._call_openai(api_key, user_prompt)
        except Exception as e:
            logger.error(f"LLM generation failed ({provider}): {e}")
            return f"⚠️ LLM generation error: {e}\n\nPlease check your API key and try again."

    async def _call_openai(self, api_key: str, user_prompt: str) -> str:
        """Call OpenAI chat completion API."""
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key, max_retries=2, timeout=60.0)
        response = await client.chat.completions.create(
            model=settings.DEFAULT_LLM_MODEL,
            messages=[
                {"role": "system", "content": _RAG_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=settings.DEFAULT_TEMPERATURE,
            max_tokens=settings.DEFAULT_MAX_TOKENS,
        )

        answer = response.choices[0].message.content or ""
        logger.info(
            f"OpenAI generation: {response.usage.total_tokens} tokens "
            f"(model={settings.DEFAULT_LLM_MODEL})"
        )
        return answer

    async def _call_anthropic(self, user_prompt: str) -> str:
        """Call Anthropic Claude API."""
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=settings.DEFAULT_LLM_MODEL,
            max_tokens=settings.DEFAULT_MAX_TOKENS,
            system=_RAG_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        answer = response.content[0].text if response.content else ""
        logger.info(f"Anthropic generation complete (model={settings.DEFAULT_LLM_MODEL})")
        return answer

    async def _call_google(self, user_prompt: str) -> str:
        """Call Google Gemini API."""
        import google.generativeai as genai

        genai.configure(api_key=settings.GOOGLE_API_KEY)
        model = genai.GenerativeModel(settings.DEFAULT_LLM_MODEL)
        response = await model.generate_content_async(
            f"{_RAG_SYSTEM_PROMPT}\n\n{user_prompt}"
        )

        answer = response.text if response.text else ""
        logger.info(f"Google generation complete (model={settings.DEFAULT_LLM_MODEL})")
        return answer
