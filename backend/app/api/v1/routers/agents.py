"""
RAGLense - Agents Router

Triggers multi-agent workflows (LangGraph chains) and logs reasoning.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from app.application.agents.graph import LangGraphAgentSystem

router = APIRouter(prefix="/agents", tags=["Agents"])


class AgentRunRequest(BaseModel):
    query: str = Field(..., min_length=1)


class AgentRunResponse(BaseModel):
    response: str
    logs: list[str]
    chunks: list[dict]


@router.post(
    "/run",
    response_model=AgentRunResponse,
    summary="Run LangGraph multi-agent flow",
)
async def run_agent_workflow(request: AgentRunRequest):
    """Trigger the multi-agent graph chain and stream execution reasoning logs."""
    system = LangGraphAgentSystem()
    result = await system.run(request.query)
    return AgentRunResponse(
        response=result["response"],
        logs=result["logs"],
        chunks=result["chunks"],
    )
