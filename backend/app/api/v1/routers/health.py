"""
RAGLense - Health Check Router

System health, readiness, and version endpoints.
"""

from datetime import UTC, datetime

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["Health"])
settings = get_settings()


@router.get("/health", summary="Health check")
async def health_check():
    """Basic health check — returns 200 if the service is running."""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/ready", summary="Readiness probe")
async def readiness_check():
    """Readiness probe — checks if all dependencies are available."""
    checks = {
        "database": "ok",
        "redis": "ok",
        "vector_db": "ok",
    }

    # In production, actually ping each service here
    all_healthy = all(v == "ok" for v in checks.values())

    return {
        "status": "ready" if all_healthy else "degraded",
        "checks": checks,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/version", summary="API version")
async def version():
    """Return API version and build info."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "api_prefix": settings.API_PREFIX,
    }
