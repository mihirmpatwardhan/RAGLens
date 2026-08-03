"""
RAGLense - Document Router

Upload, list, and manage documents within knowledge bases.
Includes file type validation, size limits, and vector cleanup on delete.
"""

import hashlib
import logging
import os
import uuid
from datetime import UTC
from pathlib import Path

from pydantic import BaseModel, Field
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select

from app.api.v1.deps import CurrentUser, DbSession, RequireKBEditor, RequireKBViewer, get_kb_role
from app.api.v1.schemas.knowledge import (
    DocumentListResponse,
    DocumentResponse,
    PipelineRunResponse,
    RecentPipelineRunListResponse,
    RecentPipelineRunResponse,
)
from app.application.ingestion.pipeline import run_ingestion_background
from app.core.config import get_settings
from app.infrastructure.db.models.knowledge import Chunk, Document, KnowledgeBase, PipelineRun
from app.infrastructure.db.models.rbac import KnowledgeBaseMember

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()

MAX_PAGE_SIZE = 100
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500MB

# Supported MIME types
SUPPORTED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/plain",
    "text/csv",
    "text/tab-separated-values",
    "text/markdown",
    "text/html",
    "text/xml",
    "application/json",
    "application/x-yaml",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "image/bmp",
    "image/svg+xml",
    "application/zip",
    "message/rfc822",
    "application/vnd.ms-outlook",
    # Audio formats — transcribed via faster-whisper (Phase 7)
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "audio/m4a",
    "audio/aac",
    "audio/x-m4a",
    # Video formats — audio track extracted then transcribed (Phase 7)
    "video/mp4",
    "video/webm",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
}

# MIME types that should be routed to audio transcription
AUDIO_VIDEO_TYPES = {
    t for t in SUPPORTED_TYPES
    if t.startswith(("audio/", "video/"))
}


@router.post(
    "/upload/{kb_id}",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document to a knowledge base",
)
async def upload_document(
    kb_id: uuid.UUID,
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    _: RequireKBEditor,
    source_date: str | None = None,   # ISO8601 date string (Phase 7 temporal memory)
):
    """Upload a document file and begin processing."""
    # Verify KB exists
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Validate file type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in SUPPORTED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: '{content_type}'. Supported types: PDF, DOCX, PPTX, XLSX, TXT, CSV, MD, HTML, JSON, YAML, images (PNG/JPEG/TIFF/BMP/SVG), ZIP, and email formats.",
        )

    # Read file content
    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_SIZE_BYTES // (1024*1024)}MB limit",
        )

    # Generate content hash for deduplication
    content_hash = hashlib.sha256(content).hexdigest()

    # Check for duplicate content in same KB
    existing = await db.execute(
        select(Document).where(
            Document.knowledge_base_id == kb_id,
            Document.content_hash == content_hash,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A document with identical content already exists in this knowledge base.",
        )

    # Store file locally
    storage_dir = Path(settings.STORAGE_LOCAL_PATH) / str(kb_id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    file_ext = os.path.splitext(file.filename or "file")[1]
    stored_filename = f"{uuid.uuid4()}{file_ext}"
    storage_path = storage_dir / stored_filename

    with open(storage_path, "wb") as f:
        f.write(content)

    # Parse source_date if provided (ISO8601 format)
    parsed_source_date = None
    if source_date:
        try:
            from datetime import datetime
            parsed_source_date = datetime.fromisoformat(source_date.rstrip("Z"))
            if parsed_source_date.tzinfo is None:
                parsed_source_date = parsed_source_date.replace(tzinfo=UTC)
        except (ValueError, AttributeError):
            logger.warning(f"Invalid source_date format: {source_date}, ignoring.")

    # Determine content_type based on MIME
    doc_content_type = "text"
    if content_type.startswith("audio/"):
        doc_content_type = "audio"
    elif content_type.startswith("video/"):
        doc_content_type = "video"
    elif content_type.startswith("image/"):
        doc_content_type = "image"

    # Create document record
    document = Document(
        knowledge_base_id=kb_id,
        filename=stored_filename,
        original_filename=file.filename or "unknown",
        mime_type=content_type,
        file_size=file_size,
        storage_path=str(storage_path),
        content_hash=content_hash,
        status="uploaded",
        content_type=doc_content_type,
        source_date=parsed_source_date,
    )
    db.add(document)

    # Update KB stats
    kb.document_count = (kb.document_count or 0) + 1
    kb.storage_bytes = (kb.storage_bytes or 0) + file_size

    await db.flush()
    await db.refresh(document)

    # Trigger ingestion pipeline in background task
    background_tasks.add_task(run_ingestion_background, document.id)

    logger.info(
        f"Document uploaded: {file.filename} ({file_size} bytes) → KB {kb_id} "
        f"[content_type={doc_content_type}, source_date={parsed_source_date}]"
    )
    return DocumentResponse.model_validate(document)


# ──────────────────────────────────────────────
# GitHub Repository Ingestion Endpoint (Phase 3)
# ──────────────────────────────────────────────

class GitHubIngestRequest(BaseModel):
    repo_url: str = Field(
        ...,
        description="Full HTTPS GitHub repository URL (e.g. https://github.com/owner/repo)",
        examples=["https://github.com/openai/openai-python"],
    )
    branch: str = Field(
        default="main",
        description="Branch or tag to clone. Defaults to 'main'.",
    )
    max_file_size_kb: int = Field(
        default=500,
        ge=1,
        le=5000,
        description="Skip files larger than this (KB). Avoids ingesting minified bundles.",
    )


class GitHubIngestResponse(BaseModel):
    job_id: str
    status: str
    message: str
    repo_url: str
    kb_id: str


def _run_github_ingestion_background(
    repo_url: str,
    kb_id_str: str,
    clone_base: str,
) -> None:
    """
    Background thread entry-point for GitHub repository ingestion.

    Clones/pulls the repo using github_ingestion.py, then for every CodeChunk
    produced it creates a Document + Chunk DB record and indexes the vector.
    Runs in asyncio.run() so it is isolated from the FastAPI event loop.

    NEVER call this on the FastAPI main thread — always use BackgroundTasks or Celery.
    """
    import asyncio
    import uuid as _uuid

    async def _ingest():
        from pathlib import Path as _Path
        from app.infrastructure.db.base import async_session_factory
        from app.infrastructure.ingestion.github_ingestion import ingest_github_repo
        from app.infrastructure.embeddings.fallback_embeddings import FallbackEmbeddingProvider
        from app.infrastructure.vector_stores import get_vector_store
        from app.application.ingestion.dimension_guard import check_and_set_kb_embedding
        from app.infrastructure.db.models.knowledge import Document, Chunk, KnowledgeBase
        import hashlib

        clone_dir = _Path(clone_base) / "github_repos"
        embedding_provider = FallbackEmbeddingProvider()
        vector_store = get_vector_store()

        try:
            code_chunks = await ingest_github_repo(repo_url, clone_dir=clone_dir)
        except Exception as exc:
            logger.error("GitHub ingestion failed for %s: %s", repo_url, exc)
            return

        if not code_chunks:
            logger.warning("GitHub ingestion: no code chunks produced for %s", repo_url)
            return

        kb_id = _uuid.UUID(kb_id_str)
        texts = [c.text for c in code_chunks]

        try:
            embeddings = await embedding_provider.embed_documents(texts)
        except Exception as exc:
            logger.error("GitHub ingestion: embedding failed: %s", exc)
            return

        async with async_session_factory() as db:
            try:
                await check_and_set_kb_embedding(
                    db=db,
                    kb_id=kb_id,
                    active_model=(
                        settings.DEFAULT_EMBEDDING_MODEL
                        if embedding_provider.active_dim == settings.DEFAULT_EMBEDDING_DIMENSION
                        else settings.LOCAL_EMBEDDING_MODEL
                    ),
                    active_dim=embedding_provider.active_dim,
                )

                # Create one synthetic Document per repo URL
                from sqlalchemy import select as _select
                existing = (await db.execute(
                    _select(Document).where(
                        Document.knowledge_base_id == kb_id,
                        Document.original_filename == repo_url,
                    )
                )).scalar_one_or_none()

                if existing:
                    doc = existing
                else:
                    doc = Document(
                        knowledge_base_id=kb_id,
                        filename=f"github_{_uuid.uuid4().hex[:8]}.code",
                        original_filename=repo_url,
                        mime_type="text/x-python",
                        file_size=sum(len(c.text) for c in code_chunks),
                        storage_path=str(clone_dir / repo_url.rstrip("/").split("/")[-1].removesuffix(".git")),
                        status="ready",
                        content_type="code",
                    )
                    db.add(doc)
                    await db.flush()

                collection_name = f"kb_{kb_id}"
                chunk_ids, metas, docs_text = [], [], []

                for idx, (code_chunk, emb) in enumerate(zip(code_chunks, embeddings, strict=False)):
                    chunk_id = _uuid.uuid4()
                    chunk_ids.append(str(chunk_id))
                    metas.append({
                        "document_id": str(doc.id),
                        "filename": code_chunk.file_path,
                        "chunk_index": idx,
                        "page_number": code_chunk.start_line,
                        "content_type": "code",
                        "section_title": code_chunk.symbol_name or code_chunk.file_path,
                        "language": code_chunk.language,
                        "repo_name": code_chunk.repo_name,
                    })
                    docs_text.append(code_chunk.text)

                    db_chunk = Chunk(
                        id=chunk_id,
                        document_id=doc.id,
                        content=code_chunk.text,
                        content_hash=hashlib.md5(code_chunk.text.encode()).hexdigest(),
                        chunk_index=idx,
                        page_number=code_chunk.start_line,
                        section_title=code_chunk.symbol_name or code_chunk.file_path,
                        embedding_model=settings.DEFAULT_EMBEDDING_MODEL,
                        embedding_dimension=embedding_provider.active_dim,
                        vector_id=str(chunk_id),
                        token_count=len(code_chunk.text.split()),
                        char_count=len(code_chunk.text),
                        content_type="code",
                        metadata_json={"language": code_chunk.language, "repo_name": code_chunk.repo_name},
                    )
                    db.add(db_chunk)

                await db.flush()

                await vector_store.add_embeddings(
                    collection_name=collection_name,
                    ids=chunk_ids,
                    embeddings=embeddings,
                    metadatas=metas,
                    documents=docs_text,
                )

                # Update KB stats
                kb_result = await db.execute(_select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
                kb = kb_result.scalar_one_or_none()
                if kb:
                    kb.chunk_count = (kb.chunk_count or 0) + len(code_chunks)

                await db.commit()
                logger.info(
                    "GitHub ingestion complete: %d code chunks indexed for KB %s from %s",
                    len(code_chunks), kb_id, repo_url,
                )
            except Exception as exc:
                await db.rollback()
                logger.error("GitHub ingestion DB stage failed: %s", exc)

    asyncio.run(_ingest())


from pydantic import BaseModel, Field


@router.post(
    "/ingest-github/{kb_id}",
    response_model=GitHubIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest a GitHub repository into a knowledge base",
)
async def ingest_github_repository(
    kb_id: uuid.UUID,
    request: GitHubIngestRequest,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    _: RequireKBEditor,
):
    """Clone a GitHub repository and index all code files into the knowledge base.

    The cloning + AST-splitting runs in a background thread (never on the event
    loop) using ``github_ingestion.ingest_github_repo()``. Returns 202 immediately
    with a job identifier.

    Supports Python, JavaScript, and TypeScript via ``tree-sitter`` AST chunking.
    Install prerequisites: ``pip install gitpython tree-sitter tree-sitter-python``
    """
    # Verify the KB exists
    kb_result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if not request.repo_url.startswith(("https://github.com/", "http://github.com/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only GitHub HTTPS repository URLs are supported (https://github.com/owner/repo).",
        )

    import uuid as _uuid
    job_id = str(_uuid.uuid4())

    background_tasks.add_task(
        _run_github_ingestion_background,
        request.repo_url,
        str(kb_id),
        settings.STORAGE_LOCAL_PATH,
    )

    logger.info(
        "GitHub ingestion job %s queued for KB %s ← %s",
        job_id, kb_id, request.repo_url,
    )
    return GitHubIngestResponse(
        job_id=job_id,
        status="accepted",
        message=f"Repository '{request.repo_url}' ingestion queued. Chunks will appear in the KB once cloning and indexing complete.",
        repo_url=request.repo_url,
        kb_id=str(kb_id),
    )


@router.get(
    "/pipeline-runs/recent",
    response_model=RecentPipelineRunListResponse,
    summary="List recent pipeline runs",
)
async def list_recent_pipeline_runs(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100, description="Max recent runs"),
):
    """Return recent ingestion runs across the current user's knowledge bases."""
    subq = select(KnowledgeBaseMember.knowledge_base_id).where(KnowledgeBaseMember.user_id == current_user.id)
    where_clause = or_(
        KnowledgeBase.owner_id == current_user.id,
        KnowledgeBase.id.in_(subq)
    )

    total = (
        await db.execute(
            select(func.count(PipelineRun.id))
            .select_from(PipelineRun)
            .join(Document, PipelineRun.document_id == Document.id)
            .join(KnowledgeBase, Document.knowledge_base_id == KnowledgeBase.id)
            .where(where_clause)
        )
    ).scalar_one()

    result = await db.execute(
        select(PipelineRun, Document, KnowledgeBase)
        .join(Document, PipelineRun.document_id == Document.id)
        .join(KnowledgeBase, Document.knowledge_base_id == KnowledgeBase.id)
        .where(where_clause)
        .order_by(PipelineRun.created_at.desc())
        .limit(limit)
    )

    items = [
        RecentPipelineRunResponse(
            id=run.id,
            document_id=document.id,
            document_name=document.original_filename,
            document_status=document.status,
            knowledge_base_id=kb.id,
            knowledge_base_name=kb.name,
            status=run.status,
            current_stage=run.current_stage,
            progress=run.progress,
            stages=run.stages,
            total_chunks=run.total_chunks,
            total_embeddings=run.total_embeddings,
            total_tokens=run.total_tokens,
            error_message=run.error_message,
            created_at=run.created_at,
            started_at=run.started_at,
            completed_at=run.completed_at,
        )
        for run, document, kb in result.all()
    ]

    return RecentPipelineRunListResponse(items=items, total=int(total or 0))


@router.get(
    "/kb/{kb_id}",
    response_model=DocumentListResponse,
    summary="List documents in a knowledge base",
)
async def list_documents(
    kb_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    _: RequireKBViewer,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
):
    """List all documents in a specific knowledge base."""
    # Verify KB exists
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    offset = (page - 1) * page_size

    count_result = await db.execute(
        select(func.count()).where(Document.knowledge_base_id == kb_id)
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Document)
        .where(Document.knowledge_base_id == kb_id)
        .order_by(Document.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = [DocumentResponse.model_validate(doc) for doc in result.scalars().all()]

    return DocumentListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/{doc_id}",
    response_model=DocumentResponse,
    summary="Get a document",
)
async def get_document(
    doc_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get a single document by ID."""
    result = await db.execute(
        select(Document)
        .join(KnowledgeBase)
        .where(
            Document.id == doc_id,
        )
    )
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    role = await get_kb_role(doc.knowledge_base_id, current_user, db)
    if role is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentResponse.model_validate(doc)


@router.delete(
    "/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
)
async def delete_document(
    doc_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Delete a document and all its chunks/embeddings."""
    result = await db.execute(
        select(Document)
        .join(KnowledgeBase)
        .where(
            Document.id == doc_id,
        )
    )
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    role = await get_kb_role(doc.knowledge_base_id, current_user, db)
    if role not in ["owner", "editor"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete documents in this knowledge base")

    # 1. Delete file from storage
    storage_path = Path(doc.storage_path)
    if storage_path.exists():
        storage_path.unlink()
        logger.info(f"Deleted storage file: {storage_path}")

    # 2. Remove vectors from vector store
    try:
        from app.infrastructure.vector_stores import get_vector_store
        vector_store = get_vector_store()
        collection_name = f"kb_{doc.knowledge_base_id}"

        # Fetch chunk IDs to delete from vector store
        chunk_result = await db.execute(
            select(Chunk.id).where(Chunk.document_id == doc_id)
        )
        chunk_ids = [str(cid) for cid in chunk_result.scalars().all()]
        if chunk_ids:
            await vector_store.delete_embeddings(collection_name, chunk_ids)
            logger.info(f"Deleted {len(chunk_ids)} vectors for document {doc_id}")
    except Exception as e:
        logger.warning(f"Failed to delete vectors for document {doc_id}: {e}")


    # 3. Update KB stats
    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == doc.knowledge_base_id)
    )
    kb = kb_result.scalar_one_or_none()
    if kb:
        kb.document_count = max(0, (kb.document_count or 1) - 1)
        kb.storage_bytes = max(0, (kb.storage_bytes or doc.file_size) - doc.file_size)

    # 4. Delete document (cascades to chunks and pipeline runs via ORM)
    await db.delete(doc)
    logger.info(f"Deleted document {doc_id} and all associated data")


@router.get(
    "/{doc_id}/pipeline",
    response_model=PipelineRunResponse,
    summary="Get document pipeline status",
)
async def get_pipeline_status(
    doc_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    # Verify access
    result = await db.execute(
        select(Document)
        .join(KnowledgeBase)
        .where(
            Document.id == doc_id,
        )
    )
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    role = await get_kb_role(doc.knowledge_base_id, current_user, db)
    if role is None:
        raise HTTPException(status_code=404, detail="Document not found")

    pipeline_result = await db.execute(
        select(PipelineRun)
        .where(PipelineRun.document_id == doc_id)
        .order_by(PipelineRun.created_at.desc())
        .limit(1)
    )
    run = pipeline_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="No pipeline execution found for this document")

    return PipelineRunResponse.model_validate(run)
