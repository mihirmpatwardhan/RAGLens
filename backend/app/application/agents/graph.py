"""
RAGLense - LangGraph Multi-Agent System

Defines the state graph and nodes for coordinate, retriever, critic, and response agents.
Uses real vector search and LLM generation when API keys are configured.
"""

import logging
from typing import TypedDict, List

from app.core.config import get_settings
from app.infrastructure.embeddings.openai_embeddings import OpenAIEmbeddingProvider
from app.infrastructure.vector_stores.chroma_store import ChromaVectorStoreAdapter

logger = logging.getLogger(__name__)
settings = get_settings()


class AgentState(TypedDict):
    """State dictionary passed between agent nodes."""
    query: str
    query_rewritten: str
    retrieved_chunks: List[dict]
    critic_feedback: str
    is_grounded: bool
    response: str
    agent_logs: List[str]


# ──────────────────────────────────────────────
# Agent Node Functions
# ──────────────────────────────────────────────

async def rewrite_query_node(state: AgentState) -> dict:
    """Agent that rewrites the user query for better semantic vector search."""
    original = state["query"]
    logs = list(state.get("agent_logs", []))
    logs.append("RewriteAgent: Analyzing query intent and formatting keywords...")

    # Use LLM for rewrite if available, otherwise simple enhancement
    if settings.OPENAI_API_KEY:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=15.0)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Rewrite the user query to be more specific for semantic search. Return ONLY the rewritten query, nothing else."},
                    {"role": "user", "content": original},
                ],
                temperature=0.0,
                max_tokens=200,
            )
            rewritten = response.choices[0].message.content.strip()
            logs.append(f"RewriteAgent: Query rewritten to: '{rewritten}'")
        except Exception as e:
            rewritten = original
            logs.append(f"RewriteAgent: LLM rewrite failed ({e}), using original query.")
    else:
        rewritten = original
        logs.append("RewriteAgent: No LLM key, using original query.")

    return {
        "query_rewritten": rewritten,
        "agent_logs": logs,
    }


async def retrieve_chunks_node(state: AgentState) -> dict:
    """Agent that performs real vector search from ChromaDB."""
    logs = list(state.get("agent_logs", []))
    logs.append("RetrieverAgent: Searching vector database...")

    embedding_provider = OpenAIEmbeddingProvider()
    vector_store = ChromaVectorStoreAdapter()

    query = state.get("query_rewritten") or state["query"]

    try:
        query_vector = await embedding_provider.embed_query(query)
        results = await vector_store.similarity_search(
            collection_name=settings.CHROMA_COLLECTION_NAME,
            query_embedding=query_vector,
            top_k=settings.DEFAULT_TOP_K,
        )

        chunks = []
        for res in results:
            chunks.append({
                "id": res["id"],
                "content": res["document"],
                "score": round(res["score"], 4),
                "document_name": res["metadata"].get("filename", "document"),
            })

        logs.append(f"RetrieverAgent: Found {len(chunks)} relevant chunks.")
    except Exception as e:
        chunks = []
        logs.append(f"RetrieverAgent: Search failed: {e}")

    return {
        "retrieved_chunks": chunks,
        "agent_logs": logs,
    }


async def critic_node(state: AgentState) -> dict:
    """Critic agent that checks for groundedness based on retrieved context."""
    logs = list(state.get("agent_logs", []))
    logs.append("CriticAgent: Verifying context-groundedness and relevance...")

    chunks = state.get("retrieved_chunks", [])

    if len(chunks) == 0:
        logs.append("CriticAgent: Warning - no source context found!")
        return {
            "critic_feedback": "insufficient_context",
            "is_grounded": False,
            "agent_logs": logs,
        }

    # Check if any chunk has a reasonable relevance score
    max_score = max(c.get("score", 0) for c in chunks)
    if max_score < 0.3:
        logs.append(f"CriticAgent: Low relevance scores (max={max_score:.2f}). Context may not be relevant.")
        return {
            "critic_feedback": "low_relevance",
            "is_grounded": False,
            "agent_logs": logs,
        }

    logs.append(f"CriticAgent: Verification PASSED. {len(chunks)} chunks with max score {max_score:.2f}.")
    return {
        "critic_feedback": "approved",
        "is_grounded": True,
        "agent_logs": logs,
    }


async def generate_response_node(state: AgentState) -> dict:
    """Agent that synthesizes the final response using an LLM."""
    logs = list(state.get("agent_logs", []))
    logs.append("GeneratorAgent: Synthesizing response from approved context...")

    chunks = state.get("retrieved_chunks", [])
    query = state["query"]

    context = "\n\n".join(
        [f"[{c.get('document_name', 'source')}]: {c['content']}" for c in chunks]
    )

    if settings.OPENAI_API_KEY:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=60.0)
            response = await client.chat.completions.create(
                model=settings.DEFAULT_LLM_MODEL,
                messages=[
                    {"role": "system", "content": "Answer the question based on the provided context. Cite sources when possible. Use markdown formatting."},
                    {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"},
                ],
                temperature=settings.DEFAULT_TEMPERATURE,
                max_tokens=settings.DEFAULT_MAX_TOKENS,
            )
            answer = response.choices[0].message.content or ""
            logs.append(f"GeneratorAgent: Response generated ({response.usage.total_tokens} tokens).")
        except Exception as e:
            answer = f"Generation failed: {e}"
            logs.append(f"GeneratorAgent: LLM call failed: {e}")
    else:
        # Construct a response from the chunks without LLM
        answer = f"**Relevant information found for:** {query}\n\n"
        for i, c in enumerate(chunks[:3], 1):
            answer += f"{i}. {c['content'][:200]}...\n\n"
        answer += "\n*Configure OPENAI_API_KEY for AI-synthesized answers.*"
        logs.append("GeneratorAgent: No LLM key, returning raw context.")

    return {
        "response": answer,
        "agent_logs": logs,
    }


# ──────────────────────────────────────────────
# Agent Orchestrator
# ──────────────────────────────────────────────

class LangGraphAgentSystem:
    """Orchestrates the multi-agent workflow chain."""

    def __init__(self):
        pass

    async def run(self, query: str) -> dict:
        """Execute the agent workflow: rewrite → retrieve → critic → generate."""
        state: AgentState = {
            "query": query,
            "query_rewritten": "",
            "retrieved_chunks": [],
            "critic_feedback": "",
            "is_grounded": False,
            "response": "",
            "agent_logs": ["Coordinator: Initiating multi-agent graph..."],
        }

        # Step 1: Rewrite
        res = await rewrite_query_node(state)
        state.update(res)

        # Step 2: Retrieve
        res = await retrieve_chunks_node(state)
        state.update(res)

        # Step 3: Critic
        res = await critic_node(state)
        state.update(res)

        # Step 4: Generate (conditional on critic approval)
        if state["is_grounded"]:
            res = await generate_response_node(state)
            state.update(res)
        else:
            state["response"] = (
                "I could not find sufficient grounded information in your documents to answer this question. "
                "Try uploading more relevant documents or rephrasing your query."
            )
            state["agent_logs"].append("Coordinator: Halted — insufficient grounding.")

        return {
            "response": state["response"],
            "logs": state["agent_logs"],
            "chunks": state["retrieved_chunks"],
        }
