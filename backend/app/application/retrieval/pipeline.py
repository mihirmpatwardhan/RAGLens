"""
Retrieval pipeline for grounded chat with temporal query understanding.

Handles parsing temporal constraints and orchestrates semantic retrieval, reranking, and generation.
"""

import asyncio
import logging
import math
import re
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infrastructure.embeddings.fallback_embeddings import get_embedding_provider
from app.infrastructure.llm import get_llm_provider
from app.infrastructure.reranking import get_reranker
from app.infrastructure.vector_stores import get_vector_store
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper

logger = logging.getLogger(__name__)
settings = get_settings()

# Relevance thresholds used to filter out low-quality retrieved chunks.
# Sourced from config so they can be tuned per deployment without code changes.
_MIN_RERANK_SCORE: float = settings.MIN_RERANK_SCORE
_MIN_COSINE_SCORE: float = settings.MIN_COSINE_SCORE
# Number of web results to fetch for enhanced (fact-check) mode.
_WEB_SEARCH_MAX_RESULTS: int = settings.WEB_SEARCH_MAX_RESULTS
_IMAGE_REQUEST_PATTERN = re.compile(
    r"\b(image|images|photo|picture|figure|diagram|chart|graph|flowchart|screenshot|visual)\b",
    re.IGNORECASE,
)
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp"}
_IMAGE_QUERY_STOPWORDS = {
    "a", "an", "and", "as", "at", "be", "for", "from", "give", "image",
    "images", "in", "is", "it", "me", "of", "on", "please", "show", "the", "this",
    "to", "want", "with", "you",
}


def _image_paths_from_metadata(metadata: dict) -> list[str]:
    """Normalize image metadata from vector stores into a safe list of paths."""
    raw_paths = metadata.get("image_paths", [])
    if isinstance(raw_paths, str):
        raw_paths = raw_paths.split(",")
    if not isinstance(raw_paths, list):
        return []
    return list(dict.fromkeys(
        path.strip()
        for path in raw_paths
        if isinstance(path, str) and path.strip()
    ))


def _image_query_terms(text: str) -> set[str]:
    """Return meaningful terms used to rank a document's image-bearing pages."""
    return {
        token
        for token in re.findall(r"[a-z0-9]{3,}", text.lower())
        if token not in _IMAGE_QUERY_STOPWORDS
    }


def _asset_page_number(path: str) -> int | None:
    match = re.search(r"page(\d+)", Path(path).name, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _image_asset_size(path: Path) -> int:
    """Return a visual-size fallback without making image libraries mandatory."""
    try:
        from PIL import Image

        with Image.open(path) as image:
            return image.width * image.height
    except Exception:
        try:
            return path.stat().st_size
        except OSError:
            return 0

_RAG_SYSTEM_PROMPT_STRICT = """You are RAGLens, a precise AI assistant that answers questions **strictly based on retrieved documents** from the user's knowledge base.

## Core Rules
1. **Only use provided context.** Never invent facts, names, numbers, or dates not in the context.
2. **Always cite your sources.** Mention the document name for each key claim (e.g., "According to [filename]...").
3. **Be direct and structured.** Use markdown headers, bullets, and bold text to organize complex answers.
4. **Acknowledge gaps honestly.** If the context does not fully answer the question, say exactly what is missing — do not guess.
5. **Maintain conversation continuity.** Use prior messages to resolve follow-up questions and pronouns.
6. **Never pad your response.** Skip filler phrases like "Great question!" or "Certainly!".
7. **Prioritize accuracy.** For numbers, dates, and names — quote directly from the document chunk.
8. **Handling Images.** The UI automatically displays any images associated with the retrieved context below your response. If the user asks for an image, diagram, or chart, NEVER say you cannot provide it. Instead, describe it based on the text and state that the image is shown below."""


_RAG_SYSTEM_PROMPT_ENHANCED = """You are RAGLens, an AI assistant with document fact-checking capability.

## Core Rules
1. Use retrieved documents as your PRIMARY source for answers.
2. Cite sources for every key fact (document name + page number).
3. FACT CHECK: If any retrieved document content is contradicted by the
   provided Web Search Context:
   - Add a "⚠️ Fact Check Alert" section
   - State: which document + page has the error
   - State: what the document says (quote it)
   - State: what the correct information is, citing the Web URL if it came from the web
4. If no web evidence contradicts the document, do not invent a Fact Check Alert.
   If web evidence is unavailable or inconclusive, say that the claim could not
   be verified instead of declaring it correct or incorrect.
5. Never invent citations — only cite chunks actually retrieved or web URLs provided.
6. For every important factual claim from the retrieved document, compare it
   against the Web Search Context when available. Clearly separate what the
   document says from what the verification source supports. Do not label a
   claim wrong without evidence from the retrieved web sources.
7. HANDLING IMAGES: The UI automatically displays any images associated with the retrieved context below your response. If the user asks for an image, diagram, or chart, NEVER say you cannot provide it. Instead, describe it based on the text and state that the image is shown below."""


# Bug fix: removed {history} placeholder — conversation history is already injected as
# multi-turn LLM messages in chat.py. Including it here caused double-context and token waste.
_RAG_USER_TEMPLATE = """## Retrieved Document Context
{context}

---
{web_context}
## Current Question
{question}

## Your Task
Answer the current question using the rules defined in your system prompt."""


class RetrievalPipeline:
    """Orchestrates retrieval, prompt building, and answer generation."""

    def __init__(self, db: AsyncSession, kb_id: uuid.UUID | None = None):
        self.db = db
        self.kb_id = kb_id
        # Use process-lifetime singletons — avoids re-creating clients/models per request.
        self.embedding_provider = get_embedding_provider()
        # get_vector_store() reads VECTOR_DB_PROVIDER — qdrant by default.
        self.vector_store = get_vector_store()

    async def _rank_document_image_assets(
        self,
        document,
        image_search_text: str,
        preferred_pages: set[int],
    ) -> list[str]:
        """Choose image assets using page content, with a visual-size fallback.

        The association is intentionally based on the source document's page text and
        extracted page number, rather than document-specific names or keywords. This
        also keeps older indexes useful while new ingestions store assets per document.
        """
        storage_path = Path(document.storage_path)
        image_root = storage_path.parent / "images"
        document_image_root = image_root / storage_path.stem
        asset_roots = [document_image_root]
        if image_root != document_image_root:
            asset_roots.append(image_root)
        assets: list[Path] = []
        for asset_root in asset_roots:
            if not asset_root.is_dir():
                continue
            assets = sorted(
                (
                    asset
                    for asset in asset_root.rglob("*")
                    if asset.is_file() and asset.suffix.lower() in _IMAGE_SUFFIXES
                ),
                key=lambda asset: str(asset).lower(),
            )
            if assets:
                break
        if not assets:
            return []

        page_texts: dict[int, str] = {}
        if storage_path.suffix.lower() == ".pdf" and storage_path.is_file():
            try:
                import fitz

                with fitz.open(storage_path) as pdf:
                    page_texts = {
                        page_number: page.get_text("text")
                        for page_number, page in enumerate(pdf, start=1)
                    }
            except Exception as error:
                logger.debug("Could not read PDF pages for image ranking: %s", error)

        query_terms = _image_query_terms(image_search_text)
        page_scores: dict[int, float] = {}
        if query_terms and page_texts:
            page_terms = {
                page_number: _image_query_terms(text)
                for page_number, text in page_texts.items()
            }
            document_frequency = {
                term: sum(term in terms for terms in page_terms.values())
                for term in query_terms
            }
            page_count = max(len(page_terms), 1)
            for page_number, terms in page_terms.items():
                overlap = query_terms & terms
                if overlap:
                    page_scores[page_number] = sum(
                        math.log((1 + page_count) / (1 + document_frequency[term])) + 1
                        for term in overlap
                    )

        if page_scores:
            best_score = max(page_scores.values())
            relevant_pages = {
                page_number
                for page_number, score in page_scores.items()
                if score >= max(1.0, best_score * 0.5)
            }
            ranked_assets = [
                asset
                for asset in assets
                if _asset_page_number(str(asset)) in relevant_pages
            ]
            if ranked_assets:
                return [str(asset) for asset in ranked_assets[:8]]

        # Queries such as “show the image” have no useful terms. In that case, use
        # the largest extracted asset as a neutral visual fallback; do not guess
        # based on filenames, logos, or a particular document's terminology.
        fallback_assets = sorted(assets, key=_image_asset_size, reverse=True)
        if preferred_pages:
            preferred_assets = [
                asset
                for asset in fallback_assets
                if _asset_page_number(str(asset)) in preferred_pages
            ]
            if preferred_assets:
                fallback_assets = preferred_assets + [
                    asset for asset in fallback_assets if asset not in preferred_assets
                ]
        return [str(asset) for asset in fallback_assets[:3]]

    async def retrieve_and_generate_context(
        self, query: str, conversation_history: list[dict] | None = None, answer_mode: str = "strict"
    ) -> dict:
        """Run retrieval + reranking + prompt building without calling the LLM.

        Args:
            query: The user's current question.
            conversation_history: List of prior messages as
                [{"role": "user"|"assistant", "content": "..."}], most recent last.
                These are passed back to the caller (chat.py) for multi-turn LLM injection —
                they are NOT injected into the RAG user prompt to avoid double-context.

        Returns a dict with:
          - trace: full pipeline trace for the Trace Inspector
          - user_prompt: the fully formatted RAG prompt ready for the LLM
          - history_messages: prior messages formatted for litellm (role/content dicts)
          - citations: list of source chunk citations
        Used by the SSE streaming chat router which calls the LLM itself
        to enable true token-by-token streaming.
        """
        conversation_history = conversation_history or []

        # ── CASUAL GREETING BYPASS ──
        # Robustly detects greetings like "hi", "hiii", "heyy", "hellooo", "good morning", "namaste", "hi!"
        cleaned_query = re.sub(r"[^\w\s]", "", query.strip().lower()).strip()
        collapsed_query = re.sub(r"(.)\1{2,}", r"\1", cleaned_query)
        greeting_pattern = r"^(hi+|hey+|hello+|namaste|greetings?|hola|good\s+(morning|afternoon|evening|day)|hi\s+there|hello\s+there|whats\s+up|sup)$"
        is_greeting = bool(re.match(greeting_pattern, cleaned_query)) or bool(re.match(greeting_pattern, collapsed_query))

        if is_greeting:
            trace = {
                "query_original": query,
                "query_rewritten": query,
                "intent": "greeting",
                "search_type": "none",
                "retrieved_chunks": [],
                "reranked_chunks": [],
                "prompt_tokens": 0,
                "total_latency_ms": 0,
                "stages": {},
                "answer_mode": answer_mode,
            }

            user_prompt = (
                f"The user just said a casual greeting: '{query}'. "
                "Respond warmly as RAGLens, briefly explain you can help them search their documents, "
                "and ask what they would like to know. DO NOT mention any document context."
            )
            return {
                "trace": trace,
                "user_prompt": user_prompt,
                "history_messages": conversation_history,
                "citations": [],
                "answer_mode": answer_mode,
            }

        image_search_text = " ".join(
            [query]
            + [
                str(message.get("content", ""))
                for message in conversation_history[-6:]
                if message.get("role") == "user"
            ]
        )
        # Include prior user turns so “show it” can still resolve to an image after
        # the previous turn established that the subject was a diagram or figure.
        is_image_request = bool(_IMAGE_REQUEST_PATTERN.search(image_search_text))

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
            "answer_mode": answer_mode,
            "web_sources": [],
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
        active_dim = self.embedding_provider.active_dim
        # Never fall back to a process-wide collection: that collection can
        # contain another user's documents. A chat without a workspace gets an
        # intentionally empty, non-persistent collection name and therefore
        # remains general-chat only.
        collection_name = (
            f"kb_{self.kb_id}_dim{active_dim}"
            if self.kb_id
            else "__workspace_required__"
        )

        if self.kb_id and self.db:
            from app.application.ingestion.dimension_guard import verify_query_dimension
            try:
                await verify_query_dimension(
                    db=self.db,
                    kb_id=self.kb_id,
                    query_dim=len(query_vector),
                )
            except Exception as dim_err:
                logger.warning("Dimension mismatch on retrieval — skipping vector search: %s", dim_err)
                trace["stages"]["dense_search"] = {
                    "name": "Dense Search",
                    "duration_ms": 0,
                    "details": {"error": str(dim_err), "matches": 0},
                }
                trace["retrieved_chunks"] = []
                user_prompt = (
                    f"## User Question\n{query}\n\n"
                    f"## Context\nNo documents could be retrieved (embedding dimension mismatch). "
                    f"The knowledge base needs to be re-indexed.\n\n"
                    f"## Instructions\n"
                    f"Tell the user there is an embedding dimension mismatch and that they should "
                    f"re-ingest their documents. Do NOT answer with general knowledge."
                )
                trace["prompt_tokens"] = len(user_prompt.split())
                trace["total_latency_ms"] = int((time.time() - start_time) * 1000)
                return {
                    "trace": trace,
                    "user_prompt": user_prompt,
                    "history_messages": conversation_history,
                    "citations": [],
                }

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
                "document_id": result["metadata"].get("document_id"),
                "document_name": result["metadata"].get("filename", "document"),
                "page_number": result["metadata"].get("page_number", 1),
                "image_paths": _image_paths_from_metadata(result.get("metadata", {})),
            }
            for result in search_results
        ]

        # For image requests, rank source assets against the current question and
        # earlier user turns. This keeps follow-ups such as “show that diagram”
        # grounded in the document instead of returning every extracted picture.
        if is_image_request and self.db and retrieved:
            from sqlalchemy import select

            from app.infrastructure.db.models.knowledge import Document

            document_ids = {
                uuid.UUID(item["document_id"])
                for item in retrieved
                if item.get("document_id")
            }
            if document_ids:
                documents_result = await self.db.execute(
                    select(Document).where(Document.id.in_(document_ids))
                )
                documents_by_id = {str(document.id): document for document in documents_result.scalars()}
                pages_by_document: dict[str, set[int]] = {}
                for item in retrieved:
                    page_number = item.get("page_number")
                    if isinstance(page_number, int):
                        pages_by_document.setdefault(str(item.get("document_id")), set()).add(page_number)

                assets_by_document = {
                    document_id: await self._rank_document_image_assets(
                        document,
                        image_search_text,
                        pages_by_document.get(document_id, set()),
                    )
                    for document_id, document in documents_by_id.items()
                }

                for item in retrieved:
                    document_assets = assets_by_document.get(str(item.get("document_id")), [])
                    item["image_paths"] = document_assets
        trace["retrieved_chunks"] = retrieved

        rerank_start = time.time()
        if settings.ENABLE_RERANKING:
            reranker = get_reranker(settings.RERANKER_MODEL)
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

        # Filter out chunks that do not meet minimum relevance criteria.
        # Thresholds are set via MIN_RERANK_SCORE / MIN_COSINE_SCORE in config.
        relevant_chunks = []
        for item in reranked:
            r_score = item.get("rerank_score")
            c_score = item.get("score", 0.0)
            if r_score is not None:
                if r_score >= _MIN_RERANK_SCORE:
                    relevant_chunks.append(item)
            elif c_score >= _MIN_COSINE_SCORE:
                relevant_chunks.append(item)

        # ── WEB SEARCH VERIFICATION (Only for matched document claims) ──
        # Searching without document evidence creates a misleading "fact check"
        # of the user's query and can turn unrelated web snippets into a false
        # correction. Document-only mode never performs this external search.
        web_context_str = ""
        web_sources: list[dict[str, str]] = []
        if answer_mode == "enhanced" and relevant_chunks:
            web_start = time.time()
            web_context_str = "No web results found."
            web_snippets = []
            try:
                ddg = DuckDuckGoSearchAPIWrapper(max_results=_WEB_SEARCH_MAX_RESULTS)
                # DuckDuckGo is synchronous — run it off the event loop.
                ddg_results = await asyncio.to_thread(ddg.results, rewritten_query, _WEB_SEARCH_MAX_RESULTS)
                if ddg_results:
                    web_snippets = ddg_results
                    web_sources = [
                        {
                            "title": str(res.get("title") or "Web source"),
                            "url": str(res.get("link") or ""),
                            "snippet": str(res.get("snippet") or ""),
                        }
                        for res in ddg_results
                        if res.get("link")
                    ]
                    web_context_str = "\n\n---\n\n".join(
                        [
                            f"**[Web Source: {res.get('title', 'Untitled')}]**\nURL: {res.get('link', 'No URL')}\nSnippet: {res.get('snippet', '')}"
                            for res in web_snippets
                        ]
                    )
            except Exception as web_err:
                logger.warning("Web search verification failed: %s", web_err)
                web_context_str = "Web verification is temporarily unavailable."

            trace["stages"]["web_search"] = {
                "name": "Web Verification Search",
                "duration_ms": int((time.time() - web_start) * 1000),
                "details": {
                    "query": rewritten_query,
                    "results_found": len(web_snippets),
                },
            }
            web_context_str = f"## Web Search Context\n{web_context_str}\n\n"
            trace["web_sources"] = web_sources

        prompt_start = time.time()
        if relevant_chunks:
            context = "\n\n---\n\n".join(
                [
                    f"**[Source: {item['document_name']}, Page {item['page_number']}]** (relevance: {item['score']:.2f})\n{item['content']}"
                    for item in relevant_chunks
                ]
            )
            user_prompt = _RAG_USER_TEMPLATE.format(
                context=context,
                web_context=web_context_str,
                question=query,
            )
            if is_image_request:
                user_prompt += (
                    "\n\n## Image Display\n"
                    "This is an image/diagram request. The UI will display the actual source "
                    "images attached to the retrieved document below your answer. Do not say "
                    "you cannot provide images or that the image is unavailable, and do not "
                    "replace the image with a fabricated description."
                )
        else:
            user_prompt = (
                f"## Current Question\n{query}\n\n"
                f"## Context\nNo matching documents were found in the user's workspace for this question.\n\n"
                "## Instructions\n"
                "1. Say that no matching workspace document was found.\n"
                "2. Do not answer from general knowledge or invent a likely answer.\n"
                "3. Do not issue a Fact Check Alert because there is no matched document claim.\n"
                "4. Ask the user to select the relevant workspace or upload the document.\n"
                "Maintain a professional, clear, and honest tone."
            )
        trace["prompt_tokens"] = len(user_prompt.split())
        trace["stages"]["prompt_builder"] = {
            "name": "Prompt Builder",
            "duration_ms": int((time.time() - prompt_start) * 1000),
            "details": {
                "prompt_characters": len(user_prompt),
                "context_chunks": len(relevant_chunks),
                "history_messages": len(conversation_history),
            },
        }

        trace["total_latency_ms"] = int((time.time() - start_time) * 1000)

        return {
            "trace": trace,
            "user_prompt": user_prompt,
            "history_messages": conversation_history,
            "citations": [
                {
                    "chunk_id": item["chunk_id"],
                    "document_id": item.get("document_id"),
                    "document_name": item["document_name"],
                    "page_number": item["page_number"],
                    "content": item["content"],
                    "score": item["score"],
                    # rerank_score is None when cross-encoder is disabled or fell back.
                    "rerank_score": item.get("rerank_score"),
                    "image_paths": item.get("image_paths", []),
                }
                for item in reranked
            ],
            "answer_mode": answer_mode,
        }

    async def _call_llm(self, user_prompt: str) -> str:
        """Call the LLM fallback chain (OpenAI → Anthropic → Gemini).

        Delegates to FallbackLLMProvider which handles per-provider retries,
        exponential backoff, and provider skipping when API keys are absent.
        All failures are caught internally — a descriptive string is returned
        rather than raising so the SSE generator always receives content.
        """
        llm = get_llm_provider()
        # Bug fix: was calling undefined `_RAG_SYSTEM_PROMPT` (NameError crash)
        return await llm.complete(
            system_prompt=_RAG_SYSTEM_PROMPT_STRICT,
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
