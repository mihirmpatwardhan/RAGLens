"""
RAGLense - Agents Router (Phase 4)

Exposes LangGraph multi-agent workflow endpoints including HITL approve/reject.

Endpoints:
  POST /agents/run        — start a new agent workflow (or resume with thread_id)
  GET  /agents/{thread_id}/status  — poll state (pending_approval, completed, error)
  POST /agents/{thread_id}/approve — approve low-confidence context; resume generation
  POST /agents/{thread_id}/reject  — reject low-confidence context; return fallback
"""


from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.application.agents.graph import LangGraphAgentSystem

router = APIRouter(prefix="/agents", tags=["Agents"])


class AgentRunRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Question to run through the agent workflow")
    thread_id: str | None = Field(
        None,
        description="Reuse an existing thread ID to resume a paused workflow; omit to start fresh",
    )
    kb_id: str | None = Field(
        None,
        description="Knowledge base UUID to scope vector search; omit for global search",
    )


class AgentRunResponse(BaseModel):
    thread_id: str
    status: str                      # "completed" | "pending_approval" | "error"
    response: str
    logs: list[str]
    chunks: list[dict]
    critic_feedback: str
    critic_confidence: float
    pending_approval: bool


class AgentStatusResponse(BaseModel):
    thread_id: str
    status: str
    critic_feedback: str
    critic_confidence: float
    pending_approval: bool
    response: str
    logs: list[str]
    chunks: list[dict]


class ApproveRejectResponse(BaseModel):
    thread_id: str
    status: str
    response: str
    logs: list[str]
    chunks: list[dict]
    critic_feedback: str
    critic_confidence: float
    pending_approval: bool


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@router.post(
    "/run",
    response_model=AgentRunResponse,
    summary="Start or resume a LangGraph multi-agent workflow",
)
async def run_agent_workflow(request: AgentRunRequest) -> AgentRunResponse:
    """
    Trigger the multi-agent graph: rewrite → retrieve → critic → [HITL?] → generate.

    If the critic flags low confidence, the graph pauses and returns
    `pending_approval: true`. The frontend should then show approve/reject buttons.
    Poll `GET /agents/{thread_id}/status` or call approve/reject to resume.
    """
    system = LangGraphAgentSystem()
    result = await system.run(
        query=request.query,
        thread_id=request.thread_id,
        kb_id=request.kb_id,
    )
    return AgentRunResponse(**result)


@router.get(
    "/{thread_id}/status",
    response_model=AgentStatusResponse,
    summary="Poll the current state of an agent workflow run",
)
async def get_agent_status(thread_id: str) -> AgentStatusResponse:
    """
    Return the current persisted state for a thread.

    Use this to poll after starting a workflow and check if it is:
    - `pending_approval` — critic paused execution, human review needed
    - `completed`        — response is ready
    - `not_found`        — unknown thread_id
    - `error`            — workflow failed
    """
    system = LangGraphAgentSystem()
    result = await system.get_status(thread_id)
    if result.get("status") == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No workflow found for thread_id '{thread_id}'",
        )
    return AgentStatusResponse(
        thread_id=result["thread_id"],
        status=result["status"],
        critic_feedback=result.get("critic_feedback", ""),
        critic_confidence=result.get("critic_confidence", 0.0),
        pending_approval=result.get("pending_approval", False),
        response=result.get("response", ""),
        logs=result.get("logs", []),
        chunks=result.get("chunks", []),
    )


@router.post(
    "/{thread_id}/approve",
    response_model=ApproveRejectResponse,
    summary="Approve low-confidence context and resume answer generation",
)
async def approve_agent_run(thread_id: str) -> ApproveRejectResponse:
    """
    Human approves the retrieved context despite low confidence.

    The paused graph resumes from critic_node → generate_response_node.
    Returns the completed workflow result including the generated answer.
    """
    system = LangGraphAgentSystem()

    # Verify the thread is actually pending before resuming
    current = await system.get_status(thread_id)
    if current.get("status") == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No workflow found for thread_id '{thread_id}'",
        )
    if not current.get("pending_approval"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workflow is not in pending_approval state. Check /status first.",
        )

    result = await system.approve(thread_id)
    return ApproveRejectResponse(**result)


@router.post(
    "/{thread_id}/reject",
    response_model=ApproveRejectResponse,
    summary="Reject low-confidence context and return fallback response",
)
async def reject_agent_run(thread_id: str) -> ApproveRejectResponse:
    """
    Human rejects the retrieved context as insufficient.

    The paused graph resumes with human_decision='rejected'.
    generate_response_node returns a fallback message instead of calling the LLM.
    """
    system = LangGraphAgentSystem()

    current = await system.get_status(thread_id)
    if current.get("status") == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No workflow found for thread_id '{thread_id}'",
        )
    if not current.get("pending_approval"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workflow is not in pending_approval state. Check /status first.",
        )

    result = await system.reject(thread_id)
    return ApproveRejectResponse(**result)
