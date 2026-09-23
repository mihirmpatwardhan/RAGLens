"""
RAGLens - Fallback LLM Provider (Phase 2)

Uses litellm as a unified abstraction layer to route chat completions through
a configurable provider chain: OpenAI → Anthropic → Gemini (or any order set
in LLM_FALLBACK_CHAIN).

Design principles:
- litellm handles provider-specific SDK calls under the hood.
- Each provider in the chain is retried LLM_MAX_RETRIES times with exponential
  backoff before moving to the next.
- All failures are logged with provider name, attempt count, and error message.
- Returns a plain string (full response) — SSE simulation stays in chat.py.
- Never raises; returns a descriptive error message string on total failure so
  the frontend always gets something renderable.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)

# Map our internal provider names to litellm model string prefixes.
# litellm model format: "<provider>/<model-name>" or just "<model-name>" for OpenAI.
_PROVIDER_MODEL_MAP = {
    "openai": None,        # litellm uses model name directly for OpenAI
    "anthropic": "anthropic",
    "google": "gemini",
    "deepseek": "deepseek",
    "mistral": "mistral",
    "groq": "groq",
    "openrouter": "openrouter",
}

_DEFAULT_FALLBACK_MODELS = {
    "openai": "gpt-4o",
    "anthropic": "claude-3-5-haiku-20241022",
    "google": "gemini/gemini-2.0-flash",
    "deepseek": "deepseek/deepseek-chat",
    "mistral": "mistral/mistral-small-latest",
    "groq": "groq/llama-3.1-8b-instant",
    "openrouter": "openrouter/meta-llama/llama-3.1-8b-instruct",
}


def _build_model_string(provider: str, primary_model: str) -> str:
    """Convert internal provider + model name to litellm model string."""
    # If primary_model already has the provider prefix, use it as-is.
    if primary_model.startswith(f"{provider}/"):
        return primary_model
    if provider == "openai":
        return primary_model  # OpenAI models used as-is
    if provider == "anthropic":
        # Use the best available Haiku as a cost-effective fallback.
        return _DEFAULT_FALLBACK_MODELS.get(provider, f"anthropic/{primary_model}")
    if provider == "google":
        return _DEFAULT_FALLBACK_MODELS.get(provider, f"gemini/{primary_model}")
    return _DEFAULT_FALLBACK_MODELS.get(provider, f"{provider}/{primary_model}")


def _get_api_key_for_provider(provider: str, settings) -> str | None:
    """Retrieve the configured API key for a given provider."""
    key_map = {
        "openai": settings.OPENAI_API_KEY,
        "anthropic": settings.ANTHROPIC_API_KEY,
        "google": settings.GOOGLE_API_KEY,
        "deepseek": settings.DEEPSEEK_API_KEY,
        "mistral": settings.MISTRAL_API_KEY,
        "groq": settings.GROQ_API_KEY,
        # litellm reads OPENROUTER_API_KEY env var; also check our numbered keys as fallback
        "openrouter": (
            getattr(settings, "OPENROUTER_API_KEY", None)
            or settings.OPENROUTER_API_KEY_1
            or settings.OPENROUTER_API_KEY_2
        ),
    }
    return key_map.get(provider) or None


async def _call_provider_with_retry(
    provider: str,
    model_string: str,
    api_key: str | None,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    max_retries: int,
    retry_delay: float,
) -> str:
    """Attempt a completion from one provider with exponential backoff retries.

    Returns the response text on success, raises on final failure.
    """
    import litellm  # type: ignore[import-untyped]

    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            kwargs: dict = {
                "model": model_string,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "num_retries": 0,  # We manage retries ourselves
            }
            if api_key:
                kwargs["api_key"] = api_key

            response = await litellm.acompletion(**kwargs)
            text = response.choices[0].message.content or ""
            logger.info(
                "LiteLLM completion via %s (model=%s, attempt=%d): %d tokens",
                provider,
                model_string,
                attempt,
                response.usage.total_tokens if response.usage else 0,
            )
            return text

        except Exception as exc:
            last_error = exc
            wait = retry_delay * (2 ** (attempt - 1))
            logger.warning(
                "LiteLLM %s attempt %d/%d failed: %s. Retrying in %.1fs...",
                provider,
                attempt,
                max_retries,
                exc,
                wait,
            )
            if attempt < max_retries:
                await asyncio.sleep(wait)

    raise last_error  # type: ignore[misc]


class FallbackLLMProvider:
    """LLM provider that walks a fallback chain until a response is obtained.

    Usage::

        provider = FallbackLLMProvider()
        answer = await provider.complete(system_prompt, user_prompt)
    """

    def __init__(self) -> None:
        from app.core.config import get_settings
        self._settings = get_settings()

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        model_override: str | None = None,
        temperature_override: float | None = None,
        max_tokens_override: int | None = None,
    ) -> str:
        """Run the fallback chain and return the first successful response.

        Tries each provider in LLM_FALLBACK_CHAIN order. Within each provider
        it retries LLM_MAX_RETRIES times with exponential backoff.

        Optional overrides allow per-call model/temperature/max_tokens without
        mutating the global settings (used by the Playground /run endpoint).

        Returns a descriptive error string (never raises) so the chat UI
        always receives renderable content.
        """
        settings = self._settings
        errors: list[str] = []

        effective_temperature = temperature_override if temperature_override is not None else settings.DEFAULT_TEMPERATURE
        effective_max_tokens = max_tokens_override if max_tokens_override is not None else settings.DEFAULT_MAX_TOKENS
        effective_model = model_override if model_override else settings.DEFAULT_LLM_MODEL

        for provider in settings.LLM_FALLBACK_CHAIN:
            api_key = _get_api_key_for_provider(provider, settings)
            if not api_key:
                logger.debug("Skipping provider '%s': no API key configured.", provider)
                errors.append(f"{provider}: no API key")
                continue

            # Use the override model directly for OpenAI-compatible models;
            # fall back to the provider default for other providers.
            if model_override and (provider == "openai" or "/" in model_override):
                model_string = model_override
            else:
                model_string = _build_model_string(provider, effective_model)

            try:
                return await _call_provider_with_retry(
                    provider=provider,
                    model_string=model_string,
                    api_key=api_key,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=effective_temperature,
                    max_tokens=effective_max_tokens,
                    max_retries=settings.LLM_MAX_RETRIES,
                    retry_delay=settings.LLM_RETRY_DELAY,
                )
            except Exception as exc:
                err_msg = f"{provider}: {exc}"
                errors.append(err_msg)
                logger.error(
                    "All retries exhausted for provider '%s', moving to next. Error: %s",
                    provider,
                    exc,
                )

        # All providers failed — return a helpful error message.
        error_summary = " | ".join(errors)
        logger.error("LLM fallback chain exhausted. Errors: %s", error_summary)
        return (
            "⚠️ **All LLM providers failed to generate a response.**\n\n"
            f"Errors: {error_summary}\n\n"
            "**What to check:**\n"
            "1. Ensure at least one provider key is set in `.env` "
            f"(`LLM_FALLBACK_CHAIN={settings.LLM_FALLBACK_CHAIN}`)\n"
            "2. Check network connectivity to the provider APIs\n"
            "3. Verify you haven't exceeded API quotas\n\n"
            "Retrieved context is still available in the Trace Inspector."
        )


# ──────────────────────────────────────────────
# Process-lifetime singleton
# ──────────────────────────────────────────────

_llm_provider_instance: FallbackLLMProvider | None = None


def get_llm_provider() -> FallbackLLMProvider:
    """Return a process-lifetime FallbackLLMProvider singleton.

    Avoids creating a new Settings lookup on every request.
    """
    global _llm_provider_instance
    if _llm_provider_instance is None:
        _llm_provider_instance = FallbackLLMProvider()
    return _llm_provider_instance
