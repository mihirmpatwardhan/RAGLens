"""
RAGLens - LangGraph Multi-Agent System (Phase 4)

Persistent, resumable multi-agent workflow with human-in-the-loop (HITL).

Architecture:
  rewrite_query → retrieve_chunks → critic → [INTERRUPT?] → generate_response
                                       ↓
                           If critic flags low confidence:
                             - Graph pauses (interrupt_before=["generate_response_node"])
                             - API exposes /agents/{thread_id}/status → pending_approval
                             - Human calls /agents/{thread_id}/approve or /reject
                             - Graph resumes or returns early fallback

Checkpointing:
  - Uses langgraph-checkpoint-postgres AsyncPostgresSaver.
  - Each workflow run is keyed by thread_id (UUID string).
  - State persists after each node so execution can be inspected or resumed.
  - Falls back to MemorySaver when Postgres checkpointer is unavailable (dev mode).
"""

from __future__ import annotations

import logging
import uuid
from typing import Literal, TypedDict

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ──────────────────────────────────────────────
# State Schema
# ──────────────────────────────────────────────

class AgentState(TypedDict):
    """State dictionary passed between agent nodes."""
    query: str
    query_rewritten: str
    kb_id: str | None           # Knowledge base UUID string (scopes vector search)
    retrieved_chunks: list[dict]
    critic_feedback: str           # "approved" | "low_relevance" | "insufficient_context"
    critic_confidence: float       # 0.0-1.0
    is_grounded: bool
    human_decision: str | None  # None | "approved" | "rejected" (set by HITL endpoint)
    response: str
    agent_logs: list[str]


# ──────────────────────────────────────────────
# Agent Node Functions
# ──────────────────────────────────────────────

async def rewrite_query_node(state: AgentState) -> dict:
    """Rewrite the user query for better semantic vector search."""
    original = state["query"]
    logs = list(state.get("agent_logs", []))
    logs.append("RewriteAgent: Analyzing query intent...")

    if settings.OPENAI_API_KEY:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=15.0)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Rewrite the user query to be more specific for semantic search. "
                            "Return ONLY the rewritten query, nothing else."
                        ),
                    },
                    {"role": "user", "content": original},
                ],
                temperature=0.0,
                max_tokens=200,
            )
            rewritten = response.choices[0].message.content.strip()
            logs.append(f"RewriteAgent: Rewritten → '{rewritten}'")
        except Exception as exc:
            rewritten = original
            logs.append(f"RewriteAgent: LLM rewrite failed ({exc}), using original.")
    else:
        rewritten = original
        logs.append("RewriteAgent: No LLM key, using original query.")

    return {"query_rewritten": rewritten, "agent_logs": logs}


async def retrieve_chunks_node(state: AgentState) -> dict:
    """Perform vector search scoped to the knowledge base."""
    from app.infrastructure.embeddings.fallback_embeddings import FallbackEmbeddingProvider
    from app.infrastructure.vector_stores import get_vector_store

    logs = list(state.get("agent_logs", []))
    logs.append("RetrieverAgent: Searching vector database...")

    embedding_provider = FallbackEmbeddingProvider()
    vector_store = get_vector_store()
    query = state.get("query_rewritten") or state["query"]
    kb_id = state.get("kb_id")
    collection_name = f"kb_{kb_id}" if kb_id else settings.CHROMA_COLLECTION_NAME

    try:
        query_vector = await embedding_provider.embed_query(query)
        results = await vector_store.similarity_search(
            collection_name=collection_name,
            query_embedding=query_vector,
            top_k=settings.RERANK_CANDIDATES if settings.ENABLE_RERANKING else settings.DEFAULT_TOP_K,
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
        logs.append(f"RetrieverAgent: Found {len(chunks)} chunks in '{collection_name}'.")
    except Exception as exc:
        chunks = []
        logs.append(f"RetrieverAgent: Search failed: {exc}")

    return {"retrieved_chunks": chunks, "agent_logs": logs}


async def critic_node(state: AgentState) -> dict:
    """Check groundedness and confidence of retrieved context.

    Sets is_grounded=False with feedback when:
      - No chunks retrieved
      - Max similarity score < CRITIC_MIN_SCORE threshold

    The graph will interrupt before generate_response_node when is_grounded is False,
    allowing a human to approve or reject continuing.
    """
    logs = list(state.get("agent_logs", []))
    logs.append("CriticAgent: Verifying context groundedness...")

    chunks = state.get("retrieved_chunks", [])

    if not chunks:
        logs.append("CriticAgent: ⚠️  No source context found.")
        return {
            "critic_feedback": "insufficient_context",
            "critic_confidence": 0.0,
            "is_grounded": False,
            "agent_logs": logs,
        }

    max_score = max((c.get("score", 0.0) for c in chunks), default=0.0)
    # Confidence = max_score (cosine similarity already in [0,1] from Qdrant)
    confidence = round(max_score, 4)

    # Configurable threshold — default 0.3
    threshold = getattr(settings, "CRITIC_MIN_SCORE", 0.3)

    if max_score < threshold:
        logs.append(
            f"CriticAgent: Low confidence (max_score={max_score:.3f} < {threshold}). "
            "Flagging for human review."
        )
        return {
            "critic_feedback": "low_relevance",
            "critic_confidence": confidence,
            "is_grounded": False,
            "agent_logs": logs,
        }

    logs.append(
        f"CriticAgent: ✅ Approved. {len(chunks)} chunks, max_score={max_score:.3f}."
    )
    return {
        "critic_feedback": "approved",
        "critic_confidence": confidence,
        "is_grounded": True,
        "agent_logs": logs,
    }


async def generate_response_node(state: AgentState) -> dict:
    """Synthesize the final response using the LLM fallback chain."""
    from app.infrastructure.llm import FallbackLLMProvider

    logs = list(state.get("agent_logs", []))

    # If human explicitly rejected after critic flagged, short-circuit
    if state.get("human_decision") == "rejected":
        logs.append("GeneratorAgent: Human rejected — returning fallback response.")
        return {
            "response": (
                "The retrieved context was flagged as potentially low-relevance. "
                "A human reviewer determined it was not sufficient to answer this question. "
                "Please try rephrasing your query or uploading more relevant documents."
            ),
            "agent_logs": logs,
        }

    logs.append("GeneratorAgent: Synthesizing response from context...")
    chunks = state.get("retrieved_chunks", [])
    query = state["query"]

    context = "\n\n---\n\n".join(
        f"[Source: {c.get('document_name', 'document')}, Page {c.get('page_number', 1)}]\n{c['content']}"
        for c in chunks
    )

    system_prompt = (
        "You are a helpful AI assistant answering questions based on the provided context.\n"
        "Instructions:\n"
        "- Answer using ONLY the provided context.\n"
        "- If context is insufficient, say so clearly.\n"
        "- Cite document names when possible.\n"
        "- Use markdown for structure when helpful."
    )
    user_prompt = f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer based on the context above:"

    llm = FallbackLLMProvider()
    answer = await llm.complete(system_prompt=system_prompt, user_prompt=user_prompt)
    logs.append(f"GeneratorAgent: Response generated ({len(answer)} chars).")

    return {"response": answer, "agent_logs": logs}


# ──────────────────────────────────────────────
# Routing Logic
# ──────────────────────────────────────────────

def _route_after_critic(state: AgentState) -> Literal["generate_response_node", "__end__"]:
    """Determine next node after critic.

    When is_grounded=True (or human approved), proceed to generation.
    When is_grounded=False AND no human decision yet, the interrupt will have
    already paused execution — this router is only called on resume.
    """
    human_decision = state.get("human_decision")

    # Human explicitly rejected after flagging
    if human_decision == "rejected":
        return "generate_response_node"  # generate_response_node handles rejected state

    # Human approved despite low confidence, or critic was satisfied
    if state.get("is_grounded") or human_decision == "approved":
        return "generate_response_node"

    # No human decision and not grounded → interrupted (shouldn't reach here)
    return "__end__"


# ──────────────────────────────────────────────
# Graph Builder
# ──────────────────────────────────────────────

def _build_graph(checkpointer=None):
    """Build the LangGraph StateGraph with optional checkpointer."""
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        logger.error("langgraph not installed. Agent workflow unavailable.")
        return None

    graph = StateGraph(AgentState)

    graph.add_node("rewrite_query_node", rewrite_query_node)
    graph.add_node("retrieve_chunks_node", retrieve_chunks_node)
    graph.add_node("critic_node", critic_node)
    graph.add_node("generate_response_node", generate_response_node)

    graph.set_entry_point("rewrite_query_node")
    graph.add_edge("rewrite_query_node", "retrieve_chunks_node")
    graph.add_edge("retrieve_chunks_node", "critic_node")

    # Conditional: route based on critic result, interrupt before generation when needed
    graph.add_conditional_edges(
        "critic_node",
        _route_after_critic,
        {
            "generate_response_node": "generate_response_node",
            "__end__": END,
        },
    )
    graph.add_edge("generate_response_node", END)

    compile_kwargs: dict = {}
    if checkpointer:
        compile_kwargs["checkpointer"] = checkpointer
        # Interrupt BEFORE generate_response_node when critic flags low confidence.
        # The graph will pause here and require a human_decision update to resume.
        compile_kwargs["interrupt_before"] = ["generate_response_node"]

    return graph.compile(**compile_kwargs)


# ──────────────────────────────────────────────
# Checkpointer Factory
# ──────────────────────────────────────────────

async def _get_checkpointer():
    """Return an async Postgres checkpointer, falling back to MemorySaver."""
    # Try Postgres-backed persistent checkpointer first
    try:
        from langgraph.checkpoint.postgres.aio import (
            AsyncPostgresSaver,  # type: ignore[import-untyped]
        )

        # AsyncPostgresSaver accepts the raw DB connection string.
        # SQLite is not supported by AsyncPostgresSaver — only PostgreSQL.
        db_url = settings.DATABASE_URL
        if "postgresql" in db_url or "postgres" in db_url:
            # Strip async prefix so psycopg3/psycopg2 can connect
            sync_url = (
                db_url
                .replace("postgresql+asyncpg://", "postgresql://")
                .replace("postgresql+psycopg2://", "postgresql://")
            )
            checkpointer = AsyncPostgresSaver.from_conn_string(sync_url)
            await checkpointer.setup()
            logger.info("LangGraph using AsyncPostgresSaver checkpointer.")
            return checkpointer
    except Exception as exc:
        logger.warning("AsyncPostgresSaver not available (%s), falling back to MemorySaver.", exc)

    # In-memory fallback (suitable for development / SQLite setups)
    try:
        from langgraph.checkpoint.memory import MemorySaver  # type: ignore[import-untyped]
        logger.info("LangGraph using MemorySaver (in-process, non-persistent).")
        return MemorySaver()
    except Exception as exc:
        logger.error("MemorySaver also unavailable: %s", exc)
        return None


# ──────────────────────────────────────────────
# Public Agent System
# ──────────────────────────────────────────────

class LangGraphAgentSystem:
    """Orchestrates the persistent multi-agent workflow.

    Each run is identified by a thread_id (UUID string). The same thread_id can
    be used to resume a paused workflow after human review.
    """

    def __init__(self) -> None:
        self._checkpointer = None
        self._graph = None

    async def _ensure_graph(self):
        """Lazy-initialize the compiled graph with checkpointer."""
        if self._graph is None:
            self._checkpointer = await _get_checkpointer()
            self._graph = _build_graph(self._checkpointer)

    async def run(
        self,
        query: str,
        thread_id: str | None = None,
        kb_id: str | None = None,
    ) -> dict:
        """Start a new agent workflow run.

        Returns immediately if critic flags low confidence (graph interrupted).
        The caller must then call approve() or reject() to resume.
        """
        await self._ensure_graph()

        if thread_id is None:
            thread_id = str(uuid.uuid4())

        config = {"configurable": {"thread_id": thread_id}}

        initial_state: AgentState = {
            "query": query,
            "query_rewritten": "",
            "kb_id": kb_id,
            "retrieved_chunks": [],
            "critic_feedback": "",
            "critic_confidence": 0.0,
            "is_grounded": False,
            "human_decision": None,
            "response": "",
            "agent_logs": ["Coordinator: Initiating multi-agent graph..."],
        }

        if self._graph is None:
            # No LangGraph available — run nodes manually without persistence
            return await self._run_fallback(initial_state)

        try:
            final_state = await self._graph.ainvoke(initial_state, config=config)
        except Exception as exc:
            logger.error("LangGraph invocation failed: %s", exc)
            return {
                "thread_id": thread_id,
                "status": "error",
                "response": f"Agent workflow error: {exc}",
                "logs": initial_state["agent_logs"],
                "chunks": [],
                "critic_feedback": "",
                "critic_confidence": 0.0,
                "pending_approval": False,
            }

        # Check if graph was interrupted (pending human review)
        pending = self._is_pending_approval(final_state)

        response = final_state.get("response", "")
        if pending and not response:
            response = (
                "The agent retrieved context but confidence is low. "
                "A human reviewer must approve or reject before the answer is generated."
            )

        return {
            "thread_id": thread_id,
            "status": "pending_approval" if pending else "completed",
            "response": response,
            "logs": final_state.get("agent_logs", []),
            "chunks": final_state.get("retrieved_chunks", []),
            "critic_feedback": final_state.get("critic_feedback", ""),
            "critic_confidence": final_state.get("critic_confidence", 0.0),
            "pending_approval": pending,
        }

    async def approve(self, thread_id: str) -> dict:
        """Resume the paused workflow after human approval."""
        return await self._resume(thread_id, human_decision="approved")

    async def reject(self, thread_id: str) -> dict:
        """Resume the paused workflow with human rejection."""
        return await self._resume(thread_id, human_decision="rejected")

    async def get_status(self, thread_id: str) -> dict:
        """Inspect the current state of a workflow run."""
        await self._ensure_graph()

        if self._graph is None or self._checkpointer is None:
            return {"thread_id": thread_id, "status": "unknown", "error": "No checkpointer available"}

        config = {"configurable": {"thread_id": thread_id}}
        try:
            snapshot = await self._graph.aget_state(config)
            if snapshot is None:
                return {"thread_id": thread_id, "status": "not_found"}

            state = snapshot.values
            pending = self._is_pending_approval(state)
            return {
                "thread_id": thread_id,
                "status": "pending_approval" if pending else "completed",
                "critic_feedback": state.get("critic_feedback", ""),
                "critic_confidence": state.get("critic_confidence", 0.0),
                "pending_approval": pending,
                "response": state.get("response", ""),
                "logs": state.get("agent_logs", []),
                "chunks": state.get("retrieved_chunks", []),
            }
        except Exception as exc:
            logger.error("Failed to get state for thread %s: %s", thread_id, exc)
            return {"thread_id": thread_id, "status": "error", "error": str(exc)}

    async def _resume(self, thread_id: str, human_decision: str) -> dict:
        """Resume an interrupted graph with a human decision update."""
        await self._ensure_graph()

        if self._graph is None:
            return {"thread_id": thread_id, "status": "error", "error": "No graph available"}

        config = {"configurable": {"thread_id": thread_id}}
        try:
            # Update the human_decision field in persisted state then resume
            await self._graph.aupdate_state(
                config,
                {"human_decision": human_decision},
                as_node="critic_node",
            )
            final_state = await self._graph.ainvoke(None, config=config)
        except Exception as exc:
            logger.error("Failed to resume thread %s: %s", thread_id, exc)
            return {"thread_id": thread_id, "status": "error", "error": str(exc)}

        return {
            "thread_id": thread_id,
            "status": "completed",
            "response": final_state.get("response", ""),
            "logs": final_state.get("agent_logs", []),
            "chunks": final_state.get("retrieved_chunks", []),
            "critic_feedback": final_state.get("critic_feedback", ""),
            "critic_confidence": final_state.get("critic_confidence", 0.0),
            "pending_approval": False,
        }

    @staticmethod
    def _is_pending_approval(state: dict) -> bool:
        """Return True when the graph is paused waiting for a human decision."""
        return (
            not state.get("is_grounded", False)
            and state.get("human_decision") is None
            and state.get("critic_feedback", "") in ("low_relevance", "insufficient_context")
            and not state.get("response", "")
        )

    async def _run_fallback(self, state: AgentState) -> dict:
        """Sequential node execution without LangGraph (emergency fallback)."""
        state.update(await rewrite_query_node(state))
        state.update(await retrieve_chunks_node(state))
        state.update(await critic_node(state))
        if state.get("is_grounded"):
            state.update(await generate_response_node(state))
        else:
            state["response"] = (
                "I could not find sufficient grounded information in your documents. "
                "Try uploading more relevant documents or rephrasing your query."
            )
        thread_id = str(uuid.uuid4())
        return {
            "thread_id": thread_id,
            "status": "completed",
            "response": state["response"],
            "logs": state["agent_logs"],
            "chunks": state["retrieved_chunks"],
            "critic_feedback": state.get("critic_feedback", ""),
            "critic_confidence": state.get("critic_confidence", 0.0),
            "pending_approval": False,
        }
