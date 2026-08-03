"""
RAGLens - Quiz/Study-Aid Generator Agent

Retrieves broadly across a knowledge base and produces structured Q&A output.
Wired into the Prompt Playground as its first real use case.

Architecture:
  - QuizState holds the KB scope and difficulty settings
  - retrieve_for_quiz_node: broad retrieval (higher top_k than normal RAG)
  - generate_quiz_node: structures content into Q&A pairs via LLM
  - Runs as a simple sequential graph (no HITL — quiz generation is always confident)

Output format (in `quiz_items` field):
  [
    {
      "question": "...",
      "answer": "...",
      "source": "document_name",
      "difficulty": "easy" | "medium" | "hard"
    },
    ...
  ]
"""

from __future__ import annotations

import json
import logging
from typing import TypedDict

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ──────────────────────────────────────────────
# Quiz State Schema
# ──────────────────────────────────────────────

class QuizState(TypedDict):
    """State dictionary for the quiz generation workflow."""
    kb_id: str | None           # Knowledge base UUID string (scopes vector search)
    topic: str                     # Broad topic/subject for the quiz
    num_questions: int             # How many Q&A pairs to generate
    difficulty: str                # "easy" | "medium" | "hard" | "mixed"
    retrieved_chunks: list[dict]   # Broadly retrieved context
    quiz_items: list[dict]         # Final structured Q&A items
    agent_logs: list[str]


# ──────────────────────────────────────────────
# Quiz Node Functions
# ──────────────────────────────────────────────

async def retrieve_for_quiz_node(state: QuizState) -> dict:
    """Broad retrieval across the knowledge base for quiz generation.

    Uses a higher top_k than normal RAG (default 30) to get wide coverage
    across the knowledge base rather than pinpointing one answer.
    """
    from app.infrastructure.embeddings.fallback_embeddings import FallbackEmbeddingProvider
    from app.infrastructure.vector_stores import get_vector_store

    logs = list(state.get("agent_logs", []))
    logs.append("QuizRetriever: Performing broad retrieval for quiz generation...")

    embedding_provider = FallbackEmbeddingProvider()
    vector_store = get_vector_store()
    topic = state.get("topic") or "general knowledge"
    kb_id = state.get("kb_id")
    collection_name = f"kb_{kb_id}" if kb_id else settings.CHROMA_COLLECTION_NAME

    # Broad retrieval — quiz benefits from more diversity than single-question RAG
    quiz_top_k = max(state.get("num_questions", 5) * 3, 20)

    try:
        query_vector = await embedding_provider.embed_query(
            f"Study material and key concepts about: {topic}"
        )
        results = await vector_store.similarity_search(
            collection_name=collection_name,
            query_embedding=query_vector,
            top_k=quiz_top_k,
        )

        chunks = [
            {
                "id": res["id"],
                "content": res["document"],
                "score": round(res["score"], 4),
                "document_name": res["metadata"].get("filename", "document"),
                "page_number": res["metadata"].get("page_number", 1),
                "content_type": res["metadata"].get("content_type", "text"),
            }
            for res in results
        ]
        logs.append(f"QuizRetriever: Retrieved {len(chunks)} chunks from '{collection_name}'.")
    except Exception as exc:
        chunks = []
        logs.append(f"QuizRetriever: Retrieval failed: {exc}")

    return {"retrieved_chunks": chunks, "agent_logs": logs}


async def generate_quiz_node(state: QuizState) -> dict:
    """Generate structured quiz Q&A pairs from the retrieved context."""
    from app.infrastructure.llm import FallbackLLMProvider

    logs = list(state.get("agent_logs", []))
    logs.append("QuizGenerator: Building quiz questions from context...")

    chunks = state.get("retrieved_chunks", [])
    topic = state.get("topic", "the provided material")
    num_questions = state.get("num_questions", 5)
    difficulty = state.get("difficulty", "mixed")

    if not chunks:
        logs.append("QuizGenerator: No context available — cannot generate quiz.")
        return {
            "quiz_items": [],
            "agent_logs": logs,
        }

    # Build context from retrieved chunks (limit to avoid token overflow)
    context_parts = []
    for chunk in chunks[:20]:  # Cap at 20 chunks to stay within token limits
        source = chunk.get("document_name", "document")
        context_parts.append(f"[Source: {source}]\n{chunk['content']}")
    context = "\n\n---\n\n".join(context_parts)

    system_prompt = (
        "You are an expert quiz generator. Create quiz questions based on the provided context.\n"
        "Requirements:\n"
        "- Generate exactly the requested number of questions\n"
        "- Each question must be answerable from the context\n"
        "- Include the source document for each question\n"
        "- Vary question types (factual, conceptual, analytical)\n"
        "- Return ONLY a valid JSON array — no markdown, no explanations\n\n"
        "JSON format:\n"
        '[\n'
        '  {\n'
        '    "question": "...",\n'
        '    "answer": "...",\n'
        '    "source": "document_name",\n'
        '    "difficulty": "easy" | "medium" | "hard"\n'
        '  }\n'
        ']'
    )

    difficulty_instruction = (
        f"All questions should be {difficulty} difficulty."
        if difficulty != "mixed"
        else "Mix easy, medium, and hard difficulty questions."
    )

    user_prompt = (
        f"Context:\n{context}\n\n"
        f"Topic: {topic}\n"
        f"Number of questions: {num_questions}\n"
        f"Difficulty: {difficulty_instruction}\n\n"
        f"Generate exactly {num_questions} quiz questions as a JSON array:"
    )

    llm = FallbackLLMProvider()
    raw_response = await llm.complete(system_prompt=system_prompt, user_prompt=user_prompt)

    # Parse JSON response
    quiz_items = []
    try:
        # Strip potential markdown code fences
        clean = raw_response.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1]) if len(lines) > 2 else clean
        quiz_items = json.loads(clean)
        if not isinstance(quiz_items, list):
            raise ValueError("Response is not a JSON array")

        # Validate structure and fill defaults
        validated = []
        for item in quiz_items:
            if isinstance(item, dict) and "question" in item and "answer" in item:
                validated.append({
                    "question": item.get("question", ""),
                    "answer": item.get("answer", ""),
                    "source": item.get("source", "knowledge base"),
                    "difficulty": item.get("difficulty", "medium"),
                })
        quiz_items = validated
        logs.append(f"QuizGenerator: Generated {len(quiz_items)} questions successfully.")

    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Quiz JSON parse failed (%s), attempting to extract manually.", exc)
        logs.append(f"QuizGenerator: JSON parse failed ({exc}), returning raw response.")
        # Return raw response as a single item for the user to see
        quiz_items = [{
            "question": "Quiz generation returned non-structured output",
            "answer": raw_response,
            "source": "system",
            "difficulty": "N/A",
        }]

    return {"quiz_items": quiz_items, "agent_logs": logs}


# ──────────────────────────────────────────────
# Quiz Graph Builder
# ──────────────────────────────────────────────

def _build_quiz_graph():
    """Build a simple sequential quiz generation graph."""
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        logger.error("langgraph not installed. Quiz workflow unavailable.")
        return None

    graph = StateGraph(QuizState)
    graph.add_node("retrieve_for_quiz_node", retrieve_for_quiz_node)
    graph.add_node("generate_quiz_node", generate_quiz_node)

    graph.set_entry_point("retrieve_for_quiz_node")
    graph.add_edge("retrieve_for_quiz_node", "generate_quiz_node")
    graph.add_edge("generate_quiz_node", END)

    return graph.compile()  # No checkpointer needed — quiz is stateless


# Module-level compiled graph (lazy-initialized)
_quiz_graph = None


def _get_quiz_graph():
    global _quiz_graph
    if _quiz_graph is None:
        _quiz_graph = _build_quiz_graph()
    return _quiz_graph


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────

async def generate_quiz(
    kb_id: str | None,
    topic: str,
    num_questions: int = 5,
    difficulty: str = "mixed",
) -> dict:
    """Generate a quiz from a knowledge base.

    Args:
        kb_id: Knowledge base UUID to search. None = global search.
        topic: Topic/subject area for the quiz.
        num_questions: Number of Q&A pairs to generate (1-20).
        difficulty: "easy" | "medium" | "hard" | "mixed"

    Returns:
        {
            "quiz_items": [...],
            "chunks_used": int,
            "logs": [...],
        }
    """
    num_questions = max(1, min(20, num_questions))  # Clamp to [1, 20]

    initial_state: QuizState = {
        "kb_id": kb_id,
        "topic": topic,
        "num_questions": num_questions,
        "difficulty": difficulty,
        "retrieved_chunks": [],
        "quiz_items": [],
        "agent_logs": ["QuizCoordinator: Starting quiz generation workflow..."],
    }

    graph = _get_quiz_graph()

    if graph is None:
        # Fallback: run nodes manually without LangGraph
        state = dict(initial_state)
        state.update(await retrieve_for_quiz_node(state))
        state.update(await generate_quiz_node(state))
        return {
            "quiz_items": state["quiz_items"],
            "chunks_used": len(state["retrieved_chunks"]),
            "logs": state["agent_logs"],
        }

    try:
        final_state = await graph.ainvoke(initial_state)
    except Exception as exc:
        logger.error("Quiz graph invocation failed: %s", exc)
        return {
            "quiz_items": [],
            "chunks_used": 0,
            "logs": [f"Quiz generation failed: {exc}"],
        }

    return {
        "quiz_items": final_state.get("quiz_items", []),
        "chunks_used": len(final_state.get("retrieved_chunks", [])),
        "logs": final_state.get("agent_logs", []),
    }
