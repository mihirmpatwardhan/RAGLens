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
      "options": ["...", "...", "...", "..."],
      "correct_option": 0,
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
from app.infrastructure.embeddings.fallback_embeddings import get_embedding_provider
from app.infrastructure.llm import get_llm_provider

logger = logging.getLogger(__name__)
settings = get_settings()


# ──────────────────────────────────────────────
# Quiz State Schema
# ──────────────────────────────────────────────

class QuizState(TypedDict):
    """State dictionary for the quiz generation workflow."""
    kb_ids: list[str]              # All Knowledge base UUID strings for this user
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
    """Broad retrieval across ALL user knowledge bases for quiz generation.

    Loops over each kb_id in state['kb_ids'], retrieves top chunks from each,
    then merges and deduplicates. This ensures the quiz covers all the user's
    uploaded documents without requiring manual KB selection.
    """
    from app.infrastructure.vector_stores import get_vector_store

    logs = list(state.get("agent_logs", []))
    logs.append("QuizRetriever: Performing broad retrieval across all user knowledge bases...")

    # Use process-lifetime singletons for speed
    embedding_provider = get_embedding_provider()
    vector_store = get_vector_store()
    topic = state.get("topic") or "general knowledge"
    kb_ids = state.get("kb_ids", [])
    active_dim = embedding_provider.active_dim

    if not kb_ids:
        logs.append("QuizRetriever: No knowledge bases found for this user.")
        return {"retrieved_chunks": [], "agent_logs": logs}

    # Embed the topic query once, reuse across all KB collections
    query_vector = await embedding_provider.embed_query(
        f"Study material and key concepts about: {topic}"
    )

    # Per-KB retrieval — fetch proportional chunks from each KB
    per_kb_top_k = max(state.get("num_questions", 5) * 2, 10)
    all_chunks: list[dict] = []

    for kb_id in kb_ids:
        collection_name = f"kb_{kb_id}_dim{active_dim}"
        try:
            results = await vector_store.similarity_search(
                collection_name=collection_name,
                query_embedding=query_vector,
                top_k=per_kb_top_k,
            )
            kb_chunks = [
                {
                    "id": res["id"],
                    "content": res["document"],
                    "score": round(res["score"], 4),
                    "document_name": res["metadata"].get("filename", "document"),
                    "page_number": res["metadata"].get("page_number", 1),
                    "content_type": res["metadata"].get("content_type", "text"),
                    "kb_id": kb_id,
                }
                for res in results
            ]
            all_chunks.extend(kb_chunks)
            logs.append(f"QuizRetriever: KB '{kb_id}' → {len(kb_chunks)} chunks from '{collection_name}'.")
        except Exception as exc:
            logs.append(f"QuizRetriever: KB '{kb_id}' retrieval failed ({exc}) — skipping.")

    # Sort merged results by score descending, keep top N for LLM context
    all_chunks.sort(key=lambda c: c["score"], reverse=True)
    logs.append(f"QuizRetriever: Total merged chunks: {len(all_chunks)} across {len(kb_ids)} KB(s).")

    return {"retrieved_chunks": all_chunks, "agent_logs": logs}



async def generate_quiz_node(state: QuizState) -> dict:
    """Generate structured quiz Q&A pairs from the retrieved context."""
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
        "- Every question must have exactly 4 plausible multiple-choice options\n"
        "- Set correct_option to the zero-based index of the one correct option\n"
        "- Do not reveal the correct option in the question or option labels\n"
        "- The answer field must be a short explanation shown only after submission\n"
        "- Include the source document for each question\n"
        "- Vary question types (factual, conceptual, analytical)\n"
        "- Return ONLY a valid JSON array — no markdown, no explanations, no code fences\n\n"
        "JSON format:\n"
        '[\n'
        '  {\n'
        '    "question": "...",\n'
        '    "options": ["Option A", "Option B", "Option C", "Option D"],\n'
        '    "correct_option": 0,\n'
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

    llm = get_llm_provider()
    raw_response = await llm.complete(system_prompt=system_prompt, user_prompt=user_prompt)

    # Parse JSON response
    quiz_items = []
    try:
        # Robust JSON array extraction (handles markdown fences, leading/trailing chatter)
        clean = raw_response.strip()
        start_idx = clean.find('[')
        end_idx = clean.rfind(']')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            clean = clean[start_idx:end_idx + 1]
        elif clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1]) if len(lines) > 2 else clean
        quiz_items = json.loads(clean)
        if not isinstance(quiz_items, list):
            raise ValueError("Response is not a JSON array")

        # Validate structure and fill defaults
        validated = []
        for item in quiz_items:
            if isinstance(item, dict) and "question" in item and "answer" in item:
                options = item.get("options", [])
                if not isinstance(options, list):
                    options = []
                options = [str(option).strip() for option in options if str(option).strip()]

                correct_option = item.get("correct_option", -1)
                if isinstance(correct_option, str) and correct_option.strip().isdigit():
                    correct_option = int(correct_option.strip())
                if not isinstance(correct_option, int):
                    correct_option = -1
                if not 0 <= correct_option < len(options):
                    correct_option = -1

                validated.append({
                    "question": item.get("question", ""),
                    "options": options[:4],
                    "correct_option": correct_option,
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
            "options": [],
            "correct_option": -1,
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
    kb_ids: list[str],
    topic: str,
    num_questions: int = 5,
    difficulty: str = "mixed",
) -> dict:
    """Generate a quiz from all knowledge bases owned by a user.

    Args:
        kb_ids: List of knowledge base UUIDs belonging to the user.
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
        "kb_ids": kb_ids,
        "topic": topic,
        "num_questions": num_questions,
        "difficulty": difficulty,
        "retrieved_chunks": [],
        "quiz_items": [],
        "agent_logs": [f"QuizCoordinator: Starting quiz generation across {len(kb_ids)} KB(s)..."],
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
