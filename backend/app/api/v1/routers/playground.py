"""
RAGLens - Playground Router (Phase 7)

Exposes the Quiz/Study-Aid generator as the first real Playground use case.
The model-compare endpoint is kept as NOT_IMPLEMENTED (honest placeholder).

Endpoints:
  POST /playground/quiz    — generate quiz Q&A pairs from a knowledge base
  POST /playground/compare — NOT_IMPLEMENTED (placeholder for future multi-model compare)
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/playground", tags=["Playground"])


# ──────────────────────────────────────────────
# Quiz Generation
# ──────────────────────────────────────────────

class QuizGenerateRequest(BaseModel):
    kb_id: str | None = Field(
        None,
        description="Knowledge base UUID to generate quiz from. Omit for global search.",
    )
    topic: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Topic or subject area for the quiz (e.g. 'machine learning', 'chapter 3')",
    )
    num_questions: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of quiz questions to generate (1-20)",
    )
    difficulty: Literal["easy", "medium", "hard", "mixed"] = Field(
        default="mixed",
        description="Question difficulty: easy | medium | hard | mixed",
    )


class QuizItem(BaseModel):
    question: str
    answer: str
    source: str
    difficulty: str


class QuizGenerateResponse(BaseModel):
    quiz_items: list[QuizItem]
    chunks_used: int
    logs: list[str]
    topic: str
    kb_id: str | None


@router.post(
    "/quiz",
    response_model=QuizGenerateResponse,
    summary="Generate quiz questions from a knowledge base",
)
async def generate_quiz_endpoint(request: QuizGenerateRequest) -> QuizGenerateResponse:
    """
    Generate a structured quiz (Q&A pairs) from documents in a knowledge base.

    The agent retrieves broadly across the KB (more chunks than normal RAG) and
    uses the configured LLM fallback chain to produce quiz questions.

    **Use cases**: Study aids, knowledge testing, flashcard generation.
    """
    from app.application.agents.quiz_agent import generate_quiz

    try:
        result = await generate_quiz(
            kb_id=request.kb_id,
            topic=request.topic,
            num_questions=request.num_questions,
            difficulty=request.difficulty,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Quiz generation failed: {exc}",
        )

    return QuizGenerateResponse(
        quiz_items=[
            QuizItem(
                question=item.get("question", ""),
                answer=item.get("answer", ""),
                source=item.get("source", "knowledge base"),
                difficulty=item.get("difficulty", "medium"),
            )
            for item in result.get("quiz_items", [])
        ],
        chunks_used=result.get("chunks_used", 0),
        logs=result.get("logs", []),
        topic=request.topic,
        kb_id=request.kb_id,
    )


# ──────────────────────────────────────────────
# Prompt Run — execute a raw prompt against a configurable model
# ──────────────────────────────────────────────

class PlaygroundRunRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=32000,
        description="The user prompt to send to the model.",
    )
    system_prompt: str = Field(
        default="You are a helpful AI assistant.",
        max_length=8000,
        description="Optional system prompt / persona.",
    )
    model: str = Field(
        default="gpt-4o",
        description="Model identifier (e.g. gpt-4o, claude-3-5-sonnet-20241022).",
    )
    temperature: float = Field(
        default=0.1,
        ge=0.0,
        le=2.0,
        description="Sampling temperature (0.0–2.0).",
    )
    max_tokens: int = Field(
        default=2048,
        ge=1,
        le=16384,
        description="Maximum completion tokens.",
    )


class PlaygroundRunResponse(BaseModel):
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int
    estimated_cost_usd: float


# Very rough USD cost estimates per 1K tokens (input + output blended)
_COST_PER_1K: dict[str, float] = {
    "gpt-4o": 0.005,
    "gpt-4o-mini": 0.00015,
    "gpt-4-turbo": 0.01,
    "claude-3-5-sonnet-20241022": 0.009,
    "claude-3-haiku-20240307": 0.00025,
    "gemini-1.5-pro": 0.007,
    "gemini-1.5-flash": 0.00015,
}


def _estimate_cost(model: str, total_tokens: int) -> float:
    rate = _COST_PER_1K.get(model, 0.005)
    return round(rate * total_tokens / 1000, 6)


@router.post(
    "/run",
    response_model=PlaygroundRunResponse,
    summary="Execute a prompt against a configurable model",
)
async def run_prompt(request: PlaygroundRunRequest) -> PlaygroundRunResponse:
    """
    Execute a raw prompt through the LLM fallback chain.

    Supports any model available via the configured provider keys
    (OpenAI, Anthropic, Google). Returns the full response with
    token counts, latency, and an estimated cost figure.

    **Use cases**: Prompt engineering, A/B testing system prompts,
    validating template output before saving to the Template Library.
    """
    import time

    from app.infrastructure.llm import FallbackLLMProvider

    llm = FallbackLLMProvider()

    t0 = time.perf_counter()
    try:
        content = await llm.complete(
            system_prompt=request.system_prompt,
            user_prompt=request.prompt,
            model_override=request.model,
            temperature_override=request.temperature,
            max_tokens_override=request.max_tokens,
        )
    except Exception as exc:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM provider error: {exc}",
        )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    # Rough token count (word-split approximation when real counts are unavailable)
    prompt_tokens = len((request.system_prompt + " " + request.prompt).split())
    completion_tokens = len(content.split())
    total_tokens = prompt_tokens + completion_tokens

    return PlaygroundRunResponse(
        content=content,
        model=request.model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        latency_ms=latency_ms,
        estimated_cost_usd=_estimate_cost(request.model, total_tokens),
    )
