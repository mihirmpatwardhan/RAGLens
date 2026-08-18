"""
RAGLense - FastAPI Application

Enterprise-Grade Multimodal Knowledge Intelligence Platform.
Main application factory with middleware, CORS, logging, and router registration.
"""

import logging
import sys
import time
import uuid as uuid_mod
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1.routers import (
    agents,
    analytics,
    auth,
    chat,
    documents,
    health,
    knowledge_bases,
    members,
    playground,
    prompts,
)
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers

settings = get_settings()


def _setup_logging() -> None:
    """Configure structured logging based on settings."""
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )

    # Quiet down noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DATABASE_ECHO else logging.WARNING
    )


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — startup and shutdown events."""
    # ── Startup ──
    _setup_logging()
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"  Environment: {settings.APP_ENV}")
    logger.info(f"  API Prefix:  {settings.API_PREFIX}")
    logger.info(f"  Debug:       {settings.DEBUG}")
    logger.info(f"  Log Level:   {settings.LOG_LEVEL}")

    # Initialize database tables in dev mode
    if settings.is_development:
        from app.infrastructure.db.base import init_db
        try:
            await init_db()
            logger.info("  Database:    [OK] Tables created/verified")
        except Exception as e:
            logger.warning(f"  Database:    [WARN] {e}")

    # Validate critical settings
    if not settings.OPENAI_API_KEY:
        logger.warning(
            "  OpenAI Key:  [MISSING] Set OPENAI_API_KEY for real embeddings and LLM calls. "
            "Pipeline will operate in degraded mode."
        )

    # Pre-warm local embedding model in a background thread to prevent GIL freeze on first request
    def _warm_embedding():
        from app.infrastructure.embeddings.fallback_embeddings import _load_local_model
        from app.core.config import get_settings
        try:
            _load_local_model(get_settings().LOCAL_EMBEDDING_MODEL)
            logger.info("  Embeddings:  [OK] Local model pre-warmed")
        except Exception as e:
            logger.warning(f"  Embeddings:  [WARN] Failed to pre-warm local model: {e}")
            
    import threading
    threading.Thread(target=_warm_embedding, daemon=True).start()

    logger.info("  Status:      [OK] Ready to serve requests")

    yield

    # ── Shutdown ──
    logger.info(f"Shutting down {settings.APP_NAME}...")

    # Close database connections
    from app.infrastructure.db.base import engine
    await engine.dispose()
    logger.info("  Database connections closed.")


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""
    app = FastAPI(
        title=settings.APP_NAME,
        description=(
            "Enterprise-Grade Multimodal Knowledge Intelligence Platform. "
            "Ingest any data, process through visual AI pipelines, and chat "
            "with complete transparency into every stage of the RAG pipeline."
        ),
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    # ──────────────────────────────────────────────
    # Middleware
    # ──────────────────────────────────────────────

    # Request logging middleware
    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        request_id = str(uuid_mod.uuid4())[:8]
        start_time = time.time()

        # Attach request_id to state for downstream use
        request.state.request_id = request_id

        response = await call_next(request)

        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"-> {response.status_code} ({duration_ms}ms)"
        )

        response.headers["X-Request-ID"] = request_id
        return response

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    # ── Large file upload support (configurable) ──
    # Starlette's default multipart limit is 1 MB — override here so large files
    # are forwarded to the upload endpoint instead of being silently dropped.
    import starlette.formparsers as _fp
    from starlette.datastructures import UploadFile as StarletteUploadFile  # noqa: F401
    from starlette.middleware.exceptions import ExceptionMiddleware  # noqa: F401
    _fp.MAX_UPLOAD_SIZE = settings.MAX_UPLOAD_SIZE_BYTES  # use configured limit

    # ──────────────────────────────────────────────
    # Exception Handlers
    # ──────────────────────────────────────────────
    register_exception_handlers(app)

    # ──────────────────────────────────────────────
    # Routers
    # ──────────────────────────────────────────────
    # Health (no prefix — at root)
    app.include_router(health.router)

    # API v1 routes
    api_prefix = settings.API_PREFIX
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(knowledge_bases.router, prefix=api_prefix)
    app.include_router(documents.router, prefix=api_prefix)
    app.include_router(chat.router, prefix=api_prefix)
    app.include_router(playground.router, prefix=api_prefix)
    app.include_router(prompts.router, prefix=api_prefix)
    app.include_router(analytics.router, prefix=api_prefix)
    app.include_router(agents.router, prefix=api_prefix)
    app.include_router(members.router, prefix=api_prefix)

    return app


# Create the app instance
app = create_app()
