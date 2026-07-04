"""
RAGLense - Document Router

Upload, list, and manage documents within knowledge bases.
Includes file type validation, size limits, and vector cleanup on delete.
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status, BackgroundTasks, Query
from sqlalchemy import func, select, delete as sql_delete

from app.api.v1.deps import CurrentUser, DbSession
from app.api.v1.schemas.knowledge import (
    DocumentListResponse,
    DocumentResponse,
    PipelineRunResponse,
)
from app.core.config import get_settings
from app.infrastructure.db.models.knowledge import Document, KnowledgeBase, Chunk
from app.application.ingestion.pipeline import run_ingestion_background

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()

MAX_PAGE_SIZE = 100
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB

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
):
    """Upload a document file and begin processing."""
    # Verify KB ownership
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.owner_id == current_user.id,
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
        f"Document uploaded: {file.filename} ({file_size} bytes) → KB {kb_id}"
    )
    return DocumentResponse.model_validate(document)


@router.get(
    "/kb/{kb_id}",
    response_model=DocumentListResponse,
    summary="List documents in a knowledge base",
)
async def list_documents(
    kb_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
):
    """List all documents in a specific knowledge base."""
    # Verify KB ownership
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.owner_id == current_user.id,
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
            KnowledgeBase.owner_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()

    if not doc:
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
            KnowledgeBase.owner_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 1. Delete file from storage
    storage_path = Path(doc.storage_path)
    if storage_path.exists():
        storage_path.unlink()
        logger.info(f"Deleted storage file: {storage_path}")

    # 2. Remove vectors from vector store
    try:
        from app.infrastructure.vector_stores.chroma_store import ChromaVectorStoreAdapter
        vector_store = ChromaVectorStoreAdapter()
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
    from app.infrastructure.db.models.knowledge import PipelineRun

    # Verify ownership
    result = await db.execute(
        select(Document)
        .join(KnowledgeBase)
        .where(
            Document.id == doc_id,
            KnowledgeBase.owner_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
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
