"""
Retrieval pipeline for grounded chat with temporal query understanding.

Handles parsing temporal constraints and orchestrates semantic retrieval, reranking, and generation.
"""

import logging
import re
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infrastructure.embeddings.fallback_embeddings import FallbackEmbeddingProvider
from app.infrastructure.llm import FallbackLLMProvider
from app.infrastructure.reranking import CrossEncoderReranker
from app.infrastructure.vector_stores import get_vector_store

logger = logging.getLogger(__name__)
settings = get_settings()

_RAG_SYSTEM_PROMPT = """You are a helpful AI assistant answering questions based on the provided context from the user's knowledge base.

Instructions:
- Answer the question using only the provided context.
- If the context is insufficient, say so clearly.
- Cite the document name when possible.
- Use markdown for structure when it helps.
- Be concise but complete."""

_RAG_USER_TEMPLATE = """Context:
{context}

Question: {question}

Answer based on the context above:"""


class RetrievalPipeline:
    """Orchestrates retrieval, prompt building, and answer generation."""

    def __init__(self, db: AsyncSession, kb_id: uuid.UUID | None = None):
        self.db = db
        self.kb_id = kb_id
        # Use FallbackEmbeddingProvider (consistent with ingestion pipeline)
        self.embedding_provider = FallbackEmbeddingProvider()
        # get_vector_store() reads VECTOR_DB_PROVIDER — qdrant by default.
        self.vector_store = get_vector_store()

    async def retrieve_and_generate(self, query: str) -> dict:
        """Run the full retrieval pipeline and return answer plus trace."""
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

        rewrite_start = time.time()
        rewritten_query = query

        # Extract temporal constraints before rewriting
        temporal_filter = _parse_temporal_constraints(query)
        # Strip date expressions from query so they don't confuse semantic search
        if temporal_filter:
            rewritten_query = temporal_filter.get("query_stripped", query)

        trace["query_rewritten"] = rewritten_query
        trace["temporal_filter"] = temporal_filter
        trace["stages"]["query_rewrite"] = {
            "name": "Query Rewrite",
            "duration_ms": int((time.time() - rewrite_start) * 1000),
            "details": {
                "original": query,
                "rewritten": rewritten_query,
                "temporal_filter": temporal_filter,
            },
        }

        search_start = time.time()
        query_vector = await self.embedding_provider.embed_query(rewritten_query)
        collection_name = f"kb_{self.kb_id}" if self.kb_id else settings.CHROMA_COLLECTION_NAME

        # ── Dimension safety guard ──────────────────────────────────────────────
        # Only enforce when searching a specific KB (self.kb_id is set).
        # Global / fallback collections bypass this check.
        if self.kb_id and self.db:
            from app.application.ingestion.dimension_guard import verify_query_dimension
            try:
                await verify_query_dimension(
                    db=self.db,
                    kb_id=self.kb_id,
                    query_dim=len(query_vector),
                )
            except Exception as dim_err:
                logger.error("Retrieval dimension guard: %s", dim_err)
                raise
        # ───────────────────────────────────────────────────────────────────────

        search_results = await self.vector_store.similarity_search(
            collection_name=collection_name,
            query_embedding=query_vector,
            # Fetch more candidates so the cross-encoder has enough to rerank from.
            # Falls back to DEFAULT_TOP_K when reranking is disabled.
            top_k=settings.RERANK_CANDIDATES if settings.ENABLE_RERANKING else settings.DEFAULT_TOP_K,
            filters=_build_qdrant_date_filter(temporal_filter) if temporal_filter else None,
        )

        trace["stages"]["dense_search"] = {
            "name": "Dense Search",
            "duration_ms": int((time.time() - search_start) * 1000),
            "details": {
                "collection": collection_name,
                "vector_dimensions": len(query_vector),
                "matches": len(search_results),
            },
        }

        retrieved = [
            {
                "chunk_id": result["id"],
                "content": result["document"],
                "score": round(result["score"], 4),
                "document_name": result["metadata"].get("filename", "document"),
                "page_number": result["metadata"].get("page_number", 1),
            }
            for result in search_results
        ]
        trace["retrieved_chunks"] = retrieved

        rerank_start = time.time()

        if settings.ENABLE_RERANKING:
            reranker = CrossEncoderReranker(settings.RERANKER_MODEL)
            reranked, used_reranker = await reranker.rerank(
                query=rewritten_query,
                chunks=retrieved,
                top_n=settings.RERANK_TOP_N,
            )
        else:
            # Reranking disabled: cosine-score sort, mark rerank_score as None.
            used_reranker = False
            reranked = sorted(
                [dict(c, rerank_score=None) for c in retrieved],
                key=lambda item: item["score"],
                reverse=True,
            )[:settings.RERANK_TOP_N]

        trace["reranked_chunks"] = reranked
        trace["stages"]["reranking"] = {
            "name": "Reranking",
            "duration_ms": int((time.time() - rerank_start) * 1000),
            "details": {
                "model": settings.RERANKER_MODEL if used_reranker else "cosine_sort_fallback",
                "enabled": settings.ENABLE_RERANKING,
                "used_cross_encoder": used_reranker,
                "candidates_in": len(retrieved),
                "results_out": len(reranked),
            },
        }

        prompt_start = time.time()
        context = "\n\n---\n\n".join(
            [
                f"[Source: {item['document_name']}, Page {item['page_number']}]\n{item['content']}"
                for item in reranked
            ]
        )
        user_prompt = _RAG_USER_TEMPLATE.format(context=context, question=query)
        trace["prompt_tokens"] = len(user_prompt.split())
        trace["stages"]["prompt_builder"] = {
            "name": "Prompt Builder",
            "duration_ms": int((time.time() - prompt_start) * 1000),
            "details": {
                "prompt_characters": len(user_prompt),
                "context_chunks": len(reranked),
            },
        }

        llm_start = time.time()
        answer = await self._call_llm(user_prompt)
        trace["stages"]["llm_generation"] = {
            "name": "LLM Generation",
            "duration_ms": int((time.time() - llm_start) * 1000),
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
                    # rerank_score is None when cross-encoder is disabled or fell back.
                    "rerank_score": item.get("rerank_score"),
                }
                for item in reranked
            ],
        }

    async def retrieve_and_generate_context(self, query: str) -> dict:
        """Run retrieval + reranking + prompt building without calling the LLM.

        Returns a dict with:
          - trace: full pipeline trace for the Trace Inspector
          - user_prompt: the fully formatted RAG prompt ready for the LLM
          - citations: list of source chunk citations
        Used by the SSE streaming chat router which calls the LLM itself
        to enable true token-by-token streaming.
        """
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

        rewrite_start = time.time()
        rewritten_query = query
        temporal_filter = _parse_temporal_constraints(query)
        if temporal_filter:
            rewritten_query = temporal_filter.get("query_stripped", query)

        trace["query_rewritten"] = rewritten_query
        trace["temporal_filter"] = temporal_filter
        trace["stages"]["query_rewrite"] = {
            "name": "Query Rewrite",
            "duration_ms": int((time.time() - rewrite_start) * 1000),
            "details": {
                "original": query,
                "rewritten": rewritten_query,
                "temporal_filter": temporal_filter,
            },
        }

        search_start = time.time()
        query_vector = await self.embedding_provider.embed_query(rewritten_query)
        collection_name = f"kb_{self.kb_id}" if self.kb_id else settings.CHROMA_COLLECTION_NAME

        if self.kb_id and self.db:
            from app.application.ingestion.dimension_guard import verify_query_dimension
            try:
                await verify_query_dimension(
                    db=self.db,
                    kb_id=self.kb_id,
                    query_dim=len(query_vector),
                )
            except Exception as dim_err:
                logger.error("Retrieval dimension guard: %s", dim_err)
                raise

        try:
            search_results = await self.vector_store.similarity_search(
                collection_name=collection_name,
                query_embedding=query_vector,
                top_k=settings.RERANK_CANDIDATES if settings.ENABLE_RERANKING else settings.DEFAULT_TOP_K,
                filters=_build_qdrant_date_filter(temporal_filter) if temporal_filter else None,
            )
        except Exception as search_err:
            logger.warning("Vector search failed (empty KB or no collection): %s", search_err)
            search_results = []

        trace["stages"]["dense_search"] = {
            "name": "Dense Search",
            "duration_ms": int((time.time() - search_start) * 1000),
            "details": {
                "collection": collection_name,
                "vector_dimensions": len(query_vector),
                "matches": len(search_results),
            },
        }

        retrieved = [
            {
                "chunk_id": result["id"],
                "content": result["document"],
                "score": round(result["score"], 4),
                "document_name": result["metadata"].get("filename", "document"),
                "page_number": result["metadata"].get("page_number", 1),
            }
            for result in search_results
        ]
        trace["retrieved_chunks"] = retrieved

        rerank_start = time.time()
        if settings.ENABLE_RERANKING:
            reranker = CrossEncoderReranker(settings.RERANKER_MODEL)
            reranked, used_reranker = await reranker.rerank(
                query=rewritten_query,
                chunks=retrieved,
                top_n=settings.RERANK_TOP_N,
            )
        else:
            used_reranker = False
            reranked = sorted(
                [dict(c, rerank_score=None) for c in retrieved],
                key=lambda item: item["score"],
                reverse=True,
            )[:settings.RERANK_TOP_N]

        trace["reranked_chunks"] = reranked
        trace["stages"]["reranking"] = {
            "name": "Reranking",
            "duration_ms": int((time.time() - rerank_start) * 1000),
            "details": {
                "model": settings.RERANKER_MODEL if used_reranker else "cosine_sort_fallback",
                "enabled": settings.ENABLE_RERANKING,
                "used_cross_encoder": used_reranker,
                "candidates_in": len(retrieved),
                "results_out": len(reranked),
            },
        }

        prompt_start = time.time()
        context = "\n\n---\n\n".join(
            [
                f"[Source: {item['document_name']}, Page {item['page_number']}]\n{item['content']}"
                for item in reranked
            ]
        )
        if not context:
            context = "No relevant documents found in the knowledge base."

        user_prompt = _RAG_USER_TEMPLATE.format(context=context, question=query)
        trace["prompt_tokens"] = len(user_prompt.split())
        trace["stages"]["prompt_builder"] = {
            "name": "Prompt Builder",
            "duration_ms": int((time.time() - prompt_start) * 1000),
            "details": {
                "prompt_characters": len(user_prompt),
                "context_chunks": len(reranked),
            },
        }

        trace["total_latency_ms"] = int((time.time() - start_time) * 1000)

        return {
            "trace": trace,
            "user_prompt": user_prompt,
            "citations": [
                {
                    "chunk_id": item["chunk_id"],
                    "document_name": item["document_name"],
                    "page_number": item["page_number"],
                    "content": item["content"],
                    "score": item["score"],
                    "rerank_score": item.get("rerank_score"),
                }
                for item in reranked
            ],
        }

    async def _call_llm(self, user_prompt: str) -> str:
        """Call the LLM fallback chain (OpenAI → Anthropic → Gemini).

        Delegates to FallbackLLMProvider which handles per-provider retries,
        exponential backoff, and provider skipping when API keys are absent.
        All failures are caught internally — a descriptive string is returned
        rather than raising so the SSE generator always receives content.
        """
        llm = FallbackLLMProvider()
        return await llm.complete(
            system_prompt=_RAG_SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )


# ──────────────────────────────────────────────
# Temporal Query Helpers
# ──────────────────────────────────────────────

# Regex patterns for common temporal expressions
_TEMPORAL_PATTERNS = [
    # "last N days/weeks/months/years"
    (r"\blast\s+(\d+)\s+(day|week|month|year)s?\b", "relative_past"),
    # "past N days/weeks/months"
    (r"\bpast\s+(\d+)\s+(day|week|month|year)s?\b", "relative_past"),
    # "N days/weeks/months/years ago"
    (r"\b(\d+)\s+(day|week|month|year)s?\s+ago\b", "relative_past"),
    # "last week / last month / last year"
    (r"\blast\s+(week|month|year)\b", "named_relative"),
    # "this week / this month / this year"
    (r"\bthis\s+(week|month|year)\b", "named_this"),
    # "in January / in March 2024"
    (r"\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b", "named_month"),
    # "yesterday"
    (r"\byesterday\b", "yesterday"),
    # "today"
    (r"\btoday\b", "today"),
]

_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

_UNIT_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}


def _parse_temporal_constraints(query: str) -> dict | None:
    """Extract temporal date range from a natural language query.

    Returns a dict with:
      - start_date: ISO8601 string (inclusive)
      - end_date: ISO8601 string (inclusive, defaults to now)
      - matched_text: the substring that was matched
      - query_stripped: original query with temporal expression removed

    Returns None if no temporal expression is found.
    """
    from datetime import timedelta

    now = datetime.now(UTC)
    query_lower = query.lower()

    for pattern, kind in _TEMPORAL_PATTERNS:
        m = re.search(pattern, query_lower)
        if not m:
            continue

        matched_text = m.group(0)
        start_date: datetime | None = None
        end_date: datetime = now

        if kind == "relative_past":
            count = int(m.group(1))
            unit = m.group(2)
            days = _UNIT_DAYS.get(unit, 1) * count
            start_date = now - timedelta(days=days)

        elif kind == "named_relative":
            unit = m.group(1)
            if unit == "week":
                start_date = now - timedelta(days=7)
            elif unit == "month":
                start_date = now - timedelta(days=30)
            elif unit == "year":
                start_date = now - timedelta(days=365)

        elif kind == "named_this":
            unit = m.group(1)
            if unit == "week":
                start_date = now - timedelta(days=now.weekday())
            elif unit == "month":
                start_date = now.replace(day=1)
            elif unit == "year":
                start_date = now.replace(month=1, day=1)

        elif kind == "named_month":
            month_name = m.group(1)
            month_num = _MONTH_MAP.get(month_name, 1)
            year_str = m.group(2) if len(m.groups()) > 1 and m.group(2) else None
            year = int(year_str) if year_str else now.year
            # If the named month is in the future, assume last year
            if month_num > now.month and year == now.year:
                year -= 1
            import calendar
            _, last_day = calendar.monthrange(year, month_num)
            start_date = datetime(year, month_num, 1, tzinfo=UTC)
            end_date = datetime(year, month_num, last_day, 23, 59, 59, tzinfo=UTC)

        elif kind == "yesterday":
            yesterday = now - timedelta(days=1)
            start_date = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = yesterday.replace(hour=23, minute=59, second=59, microsecond=0)

        elif kind == "today":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)

        if start_date:
            query_stripped = re.sub(pattern, "", query_lower, count=1).strip()
            # Clean up double spaces
            query_stripped = re.sub(r"\s+", " ", query_stripped)
            return {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "matched_text": matched_text,
                "query_stripped": query_stripped or query,
            }

    # Try dateparser as a last resort (if installed)
    try:
        import dateparser  # type: ignore[import-untyped]
        parsed = dateparser.search.search_dates(query, languages=["en"])
        if parsed:
            text, dt = parsed[0]
            if dt:
                dt_aware = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt
                return {
                    "start_date": (dt_aware).isoformat(),
                    "end_date": now.isoformat(),
                    "matched_text": text,
                    "query_stripped": query.replace(text, "").strip(),
                }
    except Exception:
        pass

    return None


def _build_qdrant_date_filter(temporal_filter: dict | None) -> dict | None:
    """Build a Qdrant filter dict for source_date range filtering.

    Qdrant filter format (passed to similarity_search as `filters` kwarg):
      {
        "must": [
          {"key": "source_date", "range": {"gte": "2024-01-01T...", "lte": "2024-01-31T..."}}
        ]
      }
    """
    if not temporal_filter:
        return None

    range_filter: dict = {}
    if temporal_filter.get("start_date"):
        range_filter["gte"] = temporal_filter["start_date"]
    if temporal_filter.get("end_date"):
        range_filter["lte"] = temporal_filter["end_date"]

    if not range_filter:
        return None

    return {
        "must": [
            {"key": "source_date", "range": range_filter}
        ]
    }
