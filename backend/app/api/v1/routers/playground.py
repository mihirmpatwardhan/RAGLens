"""
RAGLense - Playground Router

Compare outputs from different LLM providers side-by-side.
"""

import asyncio
import time
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/playground", tags=["Playground"])


class CompareModelsRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    models: list[str] = Field(default=["gpt-4o", "claude-3.5-sonnet", "gemini-pro"])


class ModelOutputResponse(BaseModel):
    model: str
    provider: str
    content: str
    latency_ms: int
    tokens: int
    cost: float


class CompareModelsResponse(BaseModel):
    results: list[ModelOutputResponse]


@router.post(
    "/compare",
    response_model=CompareModelsResponse,
    summary="Compare model outputs side-by-side",
)
async def compare_models(request: CompareModelsRequest):
    """Generate outputs for the same prompt across multiple models."""
    results = []

    model_details = {
        "gpt-4o": {"provider": "OpenAI", "rate_per_tok": 0.000015, "template": "Here is GPT-4o's direct explanation regarding: {prompt}"},
        "gpt-4o-mini": {"provider": "OpenAI", "rate_per_tok": 0.000005, "template": "GPT-4o Mini response for: {prompt}"},
        "claude-3.5-sonnet": {"provider": "Anthropic", "rate_per_tok": 0.000015, "template": "Claude 3.5 Sonnet detailed analysis on: {prompt}"},
        "gemini-pro": {"provider": "Google", "rate_per_tok": 0.00001, "template": "Google Gemini Pro context-aware synthesis of: {prompt}"},
        "deepseek-v2": {"provider": "DeepSeek", "rate_per_tok": 0.000002, "template": "DeepSeek V2 response regarding: {prompt}"},
    }

    for m in request.models:
        if m not in model_details:
            continue
            
        start = time.time()
        # Simulate slight network variance for each model
        await asyncio.sleep(0.2)
        latency = int((time.time() - start) * 1000 + 300)
        
        details = model_details[m]
        content = details["template"].format(prompt=request.prompt) + "\n\nThis is a mock sandbox output from RAGLense. Configure your specific API keys to enable live LLM provider connections."
        tokens = len(content.split()) + 40
        cost = tokens * details["rate_per_tok"]
        
        results.append(
            ModelOutputResponse(
                model=m,
                provider=details["provider"],
                content=content,
                latency_ms=latency,
                tokens=tokens,
                cost=cost,
            )
        )

    return CompareModelsResponse(results=results)
