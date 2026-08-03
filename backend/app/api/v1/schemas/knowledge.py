"""API schemas for knowledge bases, documents, pipelines, and chat."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.config import get_settings

settings = get_settings()


# ──────────────────────────────────────────────
# Knowledge Base Schemas
# ──────────────────────────────────────────────


class KBSettingsSchema(BaseModel):
    """Knowledge base processing settings."""

    chunking_strategy: str = settings.DEFAULT_CHUNKING_STRATEGY
    chunk_size: int = settings.DEFAULT_CHUNK_SIZE
    chunk_overlap: int = settings.DEFAULT_CHUNK_OVERLAP
    embedding_model: str = settings.DEFAULT_EMBEDDING_MODEL
    embedding_provider: str = settings.DEFAULT_EMBEDDING_PROVIDER
    vector_db: str = settings.VECTOR_DB_PROVIDER
    llm_model: str = settings.DEFAULT_LLM_MODEL
    llm_provider: str = settings.DEFAULT_LLM_PROVIDER
    search_type: str = settings.DEFAULT_SEARCH_TYPE
    top_k: int = settings.DEFAULT_TOP_K
    temperature: float = settings.DEFAULT_TEMPERATURE


class CreateKBRequest(BaseModel):
    """Create a new knowledge base."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    icon: str = "📚"
    color: str = "#6366f1"
    settings: KBSettingsSchema = Field(default_factory=KBSettingsSchema)


class UpdateKBRequest(BaseModel):
    """Update a knowledge base."""

    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    settings: KBSettingsSchema | None = None


class KBResponse(BaseModel):
    """Knowledge base response."""

    id: uuid.UUID
    name: str
    description: str | None
    icon: str
    color: str
    settings: dict
    document_count: int
    chunk_count: int
    total_tokens: int
    storage_bytes: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KBListResponse(BaseModel):
    """Paginated list of knowledge bases."""

    items: list[KBResponse]
    total: int
    page: int
    page_size: int


# ──────────────────────────────────────────────
# Document Schemas
# ──────────────────────────────────────────────


class DocumentResponse(BaseModel):
    """Document response."""

    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    filename: str
    original_filename: str
    mime_type: str
    file_size: int
    status: str
    error_message: str | None
    page_count: int | None
    language: str | None
    title: str | None
    author: str | None
    summary: str | None
    chunk_count: int
    token_count: int
    image_count: int
    table_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    """Paginated list of documents."""

    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int


# ──────────────────────────────────────────────
# Chunk Schemas
# ──────────────────────────────────────────────


class ChunkResponse(BaseModel):
    """Chunk detail response."""

    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    content_hash: str
    chunk_index: int
    page_number: int | None
    section_title: str | None
    embedding_model: str | None
    embedding_dimension: int | None
    token_count: int
    char_count: int
    metadata_json: dict
    keywords: list
    entities: list
    summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Pipeline Schemas
# ──────────────────────────────────────────────


class PipelineStageStatus(BaseModel):
    """Status of a single pipeline stage."""

    name: str
    status: str  # pending, running, completed, failed, skipped
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    progress: float = 0.0
    logs: list[str] = []
    error: str | None = None
    metrics: dict = {}


class PipelineRunResponse(BaseModel):
    """Full pipeline run status."""

    id: uuid.UUID
    document_id: uuid.UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    current_stage: str | None
    progress: float
    stages: dict
    total_chunks: int
    total_embeddings: int
    total_tokens: int
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RecentPipelineRunResponse(BaseModel):
    """Recent pipeline run summary for dashboard views."""

    id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    document_status: str
    knowledge_base_id: uuid.UUID
    knowledge_base_name: str
    status: str
    current_stage: str | None
    progress: float
    stages: dict
    total_chunks: int
    total_embeddings: int
    total_tokens: int
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class RecentPipelineRunListResponse(BaseModel):
    """Paginated list of recent pipeline runs."""

    items: list[RecentPipelineRunResponse]
    total: int


# ──────────────────────────────────────────────
# Chat Schemas
# ──────────────────────────────────────────────


class CreateConversationRequest(BaseModel):
    """Create a new conversation."""

    title: str = "New Conversation"
    knowledge_base_id: uuid.UUID | None = None
    model: str | None = None
    temperature: float | None = None
    system_prompt: str | None = None


class SendMessageRequest(BaseModel):
    """Send a message in a conversation."""

    content: str = Field(..., min_length=1)
    knowledge_base_id: uuid.UUID | None = None


class ConversationResponse(BaseModel):
    """Conversation summary."""

    id: uuid.UUID
    title: str
    knowledge_base_id: uuid.UUID | None
    model: str
    message_count: int
    total_tokens: int
    total_cost: float
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    """Chat message response."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    model: str | None
    tokens_prompt: int
    tokens_completion: int
    cost: float
    latency_ms: int | None
    pipeline_trace: dict
    citations: list
    retrieved_chunks: list
    rating: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Analytics Schemas
# ──────────────────────────────────────────────


class AnalyticsOverview(BaseModel):
    """System analytics overview."""

    total_knowledge_bases: int
    total_documents: int
    total_chunks: int
    total_vectors: int
    total_conversations: int
    total_messages: int
    storage_used_bytes: int
    total_tokens_used: int
    total_cost: float
    avg_query_latency_ms: float
    success_rate: float
    queries_today: int
    queries_this_week: int


# ──────────────────────────────────────────────
# Settings Schemas
# ──────────────────────────────────────────────


class LLMProviderConfig(BaseModel):
    """LLM provider configuration."""

    provider: str
    model: str
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.1
    max_tokens: int = 4096
    top_p: float = 1.0


class EmbeddingProviderConfig(BaseModel):
    """Embedding model configuration."""

    provider: str
    model: str
    dimension: int = 1536
    api_key: str | None = None


class VectorDBConfig(BaseModel):
    """Vector database configuration."""

    provider: str
    collection_name: str = "default"
    connection_url: str | None = None
    api_key: str | None = None


class GlobalSettings(BaseModel):
    """Application-wide settings."""

    llm: LLMProviderConfig = LLMProviderConfig(provider="openai", model="gpt-4o")
    embedding: EmbeddingProviderConfig = EmbeddingProviderConfig(
        provider="openai", model="text-embedding-3-small"
    )
    vector_db: VectorDBConfig = VectorDBConfig(provider="chroma")
    chunking_strategy: str = "recursive"
    chunk_size: int = 512
    chunk_overlap: int = 50
    search_type: str = "hybrid"
    top_k: int = 5
    ocr_engine: str = "easyocr"
    language: str = "en"
