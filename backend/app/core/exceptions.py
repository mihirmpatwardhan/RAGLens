"""
RAGLense - Exception Hierarchy

Custom exceptions and global exception handlers for consistent API error responses.
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import ORJSONResponse

# ──────────────────────────────────────────────
# Base Exceptions
# ──────────────────────────────────────────────


class RAGLenseError(Exception):
    """Base exception for all RAGLense errors."""

    def __init__(
        self,
        message: str = "An unexpected error occurred",
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(RAGLenseError):
    """Authentication failure."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message=message, status_code=401, error_code="AUTHENTICATION_ERROR")


class AuthorizationError(RAGLenseError):
    """Authorization failure."""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message=message, status_code=403, error_code="AUTHORIZATION_ERROR")


class NotFoundError(RAGLenseError):
    """Resource not found."""

    def __init__(self, resource: str = "Resource", resource_id: str | None = None):
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} with id '{resource_id}' not found"
        super().__init__(message=message, status_code=404, error_code="NOT_FOUND")


class ConflictError(RAGLenseError):
    """Resource conflict (e.g., duplicate)."""

    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message=message, status_code=409, error_code="CONFLICT")


class ValidationError(RAGLenseError):
    """Business validation error."""

    def __init__(self, message: str = "Validation failed", details: dict[str, Any] | None = None):
        super().__init__(
            message=message,
            status_code=422,
            error_code="VALIDATION_ERROR",
            details=details,
        )


class RateLimitError(RAGLenseError):
    """Rate limit exceeded."""

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message=message, status_code=429, error_code="RATE_LIMIT_EXCEEDED")


class ExternalServiceError(RAGLenseError):
    """External service (LLM, vector DB, etc.) error."""

    def __init__(self, service: str, message: str = "External service error"):
        super().__init__(
            message=f"{service}: {message}",
            status_code=502,
            error_code="EXTERNAL_SERVICE_ERROR",
            details={"service": service},
        )


class PipelineError(RAGLenseError):
    """Error during pipeline execution."""

    def __init__(self, stage: str, message: str = "Pipeline stage failed"):
        super().__init__(
            message=f"Pipeline error at stage '{stage}': {message}",
            status_code=500,
            error_code="PIPELINE_ERROR",
            details={"stage": stage},
        )


# ──────────────────────────────────────────────
# Exception Handlers
# ──────────────────────────────────────────────


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers for the FastAPI app."""

    @app.exception_handler(RAGLenseError)
    async def raglense_exception_handler(request: Request, exc: RAGLenseError):
        return ORJSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.error_code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        import traceback
        traceback.print_exc()
        return ORJSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected internal error occurred",
                    "details": {"type": type(exc).__name__, "msg": str(exc)},
                }
            },
        )
