"""
RAGLens - Cross-Encoder Reranker

Wraps sentence-transformers CrossEncoder for reranking retrieved chunks.

Design:
- Model is lazy-loaded on first call and cached for the process lifetime (singleton).
- CPU inference runs in asyncio.to_thread to avoid blocking the event loop.
- If the model fails to load (network issues, disk problems), the reranker logs a
  warning and returns the input list sorted by cosine similarity — no crash.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)

# Module-level singleton — loaded once per worker process.
_model: object | None = None
_model_name: str | None = None
_load_error: str | None = None

# CrossEncoderReranker singleton — one instance per process
_reranker_instance: "CrossEncoderReranker | None" = None
_reranker_model_name: str | None = None


def _get_or_load_model(model_name: str):
    """Load (or return cached) CrossEncoder model synchronously.

    Called inside asyncio.to_thread so it is safe to block here.
    """
    global _model, _model_name, _load_error

    # Return cached instance if same model name requested.
    if _model is not None and _model_name == model_name:
        return _model

    # If previous load already failed, don't retry on every request.
    if _load_error and _model_name == model_name:
        raise RuntimeError(_load_error)

    try:
        from sentence_transformers import CrossEncoder  # type: ignore[import-untyped]

        logger.info("Loading cross-encoder reranker model: %s", model_name)
        _model = CrossEncoder(model_name)
        _model_name = model_name
        _load_error = None
        logger.info("Cross-encoder model loaded successfully.")
        return _model
    except Exception as exc:
        _load_error = str(exc)
        _model_name = model_name
        logger.error("Failed to load cross-encoder model '%s': %s", model_name, exc)
        raise


def _sync_rerank(
    model_name: str,
    query: str,
    chunks: list[dict],
    top_n: int,
) -> list[dict]:
    """Synchronous rerank — runs in a thread pool.

    Each chunk must have at least a 'content' key.
    Returns a copy of chunks with 'rerank_score' added, truncated to top_n.
    """
    model = _get_or_load_model(model_name)

    # Build (query, passage) pairs expected by CrossEncoder.
    pairs = [(query, c["content"]) for c in chunks]

    # predict() returns a list of float32 scores.
    scores = model.predict(pairs, show_progress_bar=False)

    # Attach rerank scores and sort descending.
    scored: list[dict] = []
    for chunk, score in zip(chunks, scores, strict=False):
        enriched = dict(chunk)  # shallow copy — don't mutate caller's list
        enriched["rerank_score"] = round(float(score), 4)
        scored.append(enriched)

    scored.sort(key=lambda c: c["rerank_score"], reverse=True)
    return scored[:top_n]


class CrossEncoderReranker:
    """Async-friendly wrapper around a sentence-transformers CrossEncoder.

    Usage::

        reranker = CrossEncoderReranker("cross-encoder/ms-marco-MiniLM-L-6-v2")
        reranked = await reranker.rerank(query, chunks, top_n=5)
    """

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name

    async def rerank(
        self,
        query: str,
        chunks: list[dict],
        top_n: int = 5,
    ) -> tuple[list[dict], bool]:
        """Rerank chunks using cross-encoder scores.

        Returns:
            (reranked_chunks, used_reranker):
                reranked_chunks — list of chunk dicts with 'rerank_score' added
                used_reranker   — False when fallback to cosine-sort was triggered
        """
        if not chunks:
            return [], True

        try:
            reranked = await asyncio.to_thread(
                _sync_rerank,
                self.model_name,
                query,
                chunks,
                top_n,
            )
            return reranked, True

        except Exception as exc:
            logger.warning(
                "Cross-encoder reranking failed (%s), falling back to cosine-sort: %s",
                self.model_name,
                exc,
            )
            # Fallback: sort by existing cosine score, add a sentinel rerank_score.
            fallback = sorted(
                [dict(c, rerank_score=None) for c in chunks],
                key=lambda c: c.get("score", 0.0),
                reverse=True,
            )
            return fallback[:top_n], False


def get_reranker(model_name: str | None = None) -> "CrossEncoderReranker":
    """Return a process-lifetime CrossEncoderReranker singleton.

    The underlying CrossEncoder model is already module-level cached inside
    _get_or_load_model(). This factory additionally avoids re-instantiating
    the Python wrapper class on every request.
    """
    global _reranker_instance, _reranker_model_name
    from app.core.config import get_settings

    effective_name = model_name or get_settings().RERANKER_MODEL
    if _reranker_instance is None or _reranker_model_name != effective_name:
        _reranker_instance = CrossEncoderReranker(effective_name)
        _reranker_model_name = effective_name
    return _reranker_instance
