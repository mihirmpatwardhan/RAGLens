"""
RAGLense - Core Configuration

Centralized configuration management using Pydantic Settings.
All values sourced from environment variables with sensible defaults.
"""

import logging
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_INSECURE_DEFAULT_SECRET = "CHANGE-THIS-IN-PRODUCTION-USE-A-STRONG-SECRET-KEY"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ──────────────────────────────────────────────
    # Application
    # ──────────────────────────────────────────────
    APP_NAME: str = "RAGLense"
    APP_VERSION: str = "0.1.0"
    APP_ENV: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ──────────────────────────────────────────────
    # Database (SQLite default, can be overridden by env DATABASE_URL)
    # ──────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./raglense.db"
    DATABASE_ECHO: bool = False
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 0

    # ──────────────────────────────────────────────
    # Redis
    # ──────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600  # seconds

    # ──────────────────────────────────────────────
    # Authentication (JWT & Clerk)
    # ──────────────────────────────────────────────
    JWT_SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CLERK_JWKS_URL: str = ""

    # ──────────────────────────────────────────────
    # File Storage
    # ──────────────────────────────────────────────
    STORAGE_BACKEND: Literal["local", "s3", "minio", "supabase"] = "local"
    STORAGE_LOCAL_PATH: str = "./storage"
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "raglense"
    S3_REGION: str = "us-east-1"

    # Supabase Settings
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET_NAME: str = "raglense"

    # ──────────────────────────────────────────────
    # LLM Providers
    # ──────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    DEFAULT_LLM_PROVIDER: str = "openai"
    DEFAULT_LLM_MODEL: str = "gpt-4o"
    DEFAULT_TEMPERATURE: float = 0.1
    DEFAULT_MAX_TOKENS: int = 4096

    # ──────────────────────────────────────────────
    # Embedding Models
    # ──────────────────────────────────────────────
    DEFAULT_EMBEDDING_PROVIDER: str = "openai"
    DEFAULT_EMBEDDING_MODEL: str = "text-embedding-3-small"
    DEFAULT_EMBEDDING_DIMENSION: int = 1536

    # ──────────────────────────────────────────────
    # Vector Database
    # ──────────────────────────────────────────────
    VECTOR_DB_PROVIDER: Literal["chroma", "faiss", "pinecone", "qdrant", "weaviate", "milvus"] = (
        "chroma"
    )
    CHROMA_PERSIST_DIR: str = "./chroma_data"
    CHROMA_COLLECTION_NAME: str = "raglense_default"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = ""
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""

    # ──────────────────────────────────────────────
    # Chunking
    # ──────────────────────────────────────────────
    DEFAULT_CHUNK_SIZE: int = 512
    DEFAULT_CHUNK_OVERLAP: int = 50
    DEFAULT_CHUNKING_STRATEGY: str = "recursive"

    # ──────────────────────────────────────────────
    # Retrieval
    # ──────────────────────────────────────────────
    DEFAULT_TOP_K: int = 5
    DEFAULT_SEARCH_TYPE: str = "hybrid"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # ──────────────────────────────────────────────
    # Celery
    # ──────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ──────────────────────────────────────────────
    # Logging & Monitoring
    # ──────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    SENTRY_DSN: str = ""

    # ──────────────────────────────────────────────
    # Rate Limiting
    # ──────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @model_validator(mode="after")
    def _validate_security(self) -> "Settings":
        """Refuse to start with insecure defaults in production/staging."""
        if self.APP_ENV in ("production", "staging"):
            if self.JWT_SECRET_KEY == _INSECURE_DEFAULT_SECRET:
                raise ValueError(
                    "FATAL: JWT_SECRET_KEY must be set to a strong, unique secret "
                    "in production/staging. Generate one with: openssl rand -hex 32"
                )
            if self.DEBUG:
                raise ValueError(
                    "FATAL: DEBUG must be False in production/staging."
                )
        if self.JWT_SECRET_KEY == _INSECURE_DEFAULT_SECRET:
            logger.warning(
                "⚠️  JWT_SECRET_KEY is using the insecure default. "
                "Set a strong secret via environment variable before deploying."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
