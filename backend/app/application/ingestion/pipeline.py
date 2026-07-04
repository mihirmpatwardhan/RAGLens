"""
RAGLense - Ingestion Pipeline Orchestrator

Manages the multi-stage document processing pipeline with REAL implementations:
- File validation and deduplication
- Text extraction (PDF, DOCX, TXT, MD, HTML, CSV, JSON)
- Recursive text chunking via LangChain
- Real embedding generation via OpenAI
- Real vector storage via ChromaDB
"""

import asyncio
import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infrastructure.db.models.knowledge import Document, PipelineRun, Chunk
from app.infrastructure.storage.file_storage import get_file_storage
from app.infrastructure.embeddings.openai_embeddings import OpenAIEmbeddingProvider
from app.infrastructure.vector_stores.chroma_store import ChromaVectorStoreAdapter

logger = logging.getLogger(__name__)
settings = get_settings()


class IngestionPipeline:
    """Manages the execution and observability of the document ingestion pipeline."""

    def __init__(self, db: AsyncSession, document_id: uuid.UUID):
        self.db = db
        self.document_id = document_id
        self.storage = get_file_storage()
        self.embedding_provider = OpenAIEmbeddingProvider()
        self.vector_store = ChromaVectorStoreAdapter()
        self.run_id = uuid.uuid4()
        self._extracted_text: str = ""

    async def execute(self) -> None:
        """Run the ingestion pipeline stages sequentially."""
        # 1. Fetch document
        result = await self.db.execute(select(Document).where(Document.id == self.document_id))
        doc = result.scalar_one_or_none()
        if not doc:
            logger.error(f"Document {self.document_id} not found for ingestion.")
            return

        # Update document status to processing
        doc.status = "processing"
        await self.db.flush()

        # 2. Initialize pipeline run log
        stages_config = {
            "validation": {"name": "Validation", "status": "pending", "progress": 0.0, "logs": []},
            "extraction": {"name": "Text Extraction", "status": "pending", "progress": 0.0, "logs": []},
            "chunking": {"name": "Chunking", "status": "pending", "progress": 0.0, "logs": []},
            "embedding": {"name": "Embedding Generation", "status": "pending", "progress": 0.0, "logs": []},
            "vector_store": {"name": "Vector DB Storage", "status": "pending", "progress": 0.0, "logs": []},
        }

        run = PipelineRun(
            id=self.run_id,
            document_id=self.document_id,
            status="running",
            started_at=datetime.now(timezone.utc),
            stages=stages_config,
            current_stage="validation",
            progress=0.0,
        )
        self.db.add(run)
        await self.db.flush()

        start_time = time.time()

        try:
            # Stage 1: Validation
            await self._run_stage(run, "validation", lambda: self._validation_stage(doc))

            # Stage 2: Text Extraction
            await self._run_stage(run, "extraction", lambda: self._extraction_stage(doc))

            # Stage 3: Chunking
            chunks = await self._run_stage(run, "chunking", self._chunking_stage)

            # Stage 4: Embedding Generation
            embeddings = await self._run_stage(run, "embedding", lambda: self._embedding_stage(chunks))

            # Stage 5: Vector Store Storage
            await self._run_stage(run, "vector_store", lambda: self._vector_store_stage(doc, chunks, embeddings))

            # Finalize pipeline run
            run.status = "completed"
            run.progress = 100.0
            run.completed_at = datetime.now(timezone.utc)
            run.duration_ms = int((time.time() - start_time) * 1000)
            run.total_chunks = len(chunks)
            run.total_embeddings = len(embeddings)

            doc.status = "ready"
            doc.chunk_count = len(chunks)
            doc.token_count = sum(len(c["text"].split()) for c in chunks)
            await self.db.flush()

            logger.info(
                f"Pipeline completed for document {self.document_id}: "
                f"{len(chunks)} chunks, {run.duration_ms}ms"
            )

        except Exception as e:
            logger.exception(f"Pipeline run {self.run_id} failed.")
            run.status = "failed"
            run.error_message = str(e)
            run.completed_at = datetime.now(timezone.utc)
            run.duration_ms = int((time.time() - start_time) * 1000)

            doc.status = "error"
            doc.error_message = str(e)
            await self.db.flush()

    async def _run_stage(self, run: PipelineRun, stage_id: str, stage_func) -> any:
        """Execute a single pipeline stage, updates status/timing, handles errors."""
        run.current_stage = stage_id
        run.stages[stage_id]["status"] = "running"
        run.stages[stage_id]["started_at"] = datetime.now(timezone.utc).isoformat()
        await self.db.flush()

        stage_start = time.time()
        try:
            result = await stage_func()

            duration_ms = int((time.time() - stage_start) * 1000)
            run.stages[stage_id]["status"] = "completed"
            run.stages[stage_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
            run.stages[stage_id]["duration_ms"] = duration_ms
            run.stages[stage_id]["progress"] = 100.0
            run.stages[stage_id]["logs"].append(f"Completed in {duration_ms}ms")

            completed_stages = sum(1 for s in run.stages.values() if s["status"] == "completed")
            run.progress = (completed_stages / len(run.stages)) * 100.0
            await self.db.flush()

            return result
        except Exception as e:
            duration_ms = int((time.time() - stage_start) * 1000)
            run.stages[stage_id]["status"] = "failed"
            run.stages[stage_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
            run.stages[stage_id]["duration_ms"] = duration_ms
            run.stages[stage_id]["error"] = str(e)
            run.stages[stage_id]["logs"].append(f"Failed: {e}")
            run.error_stage = stage_id
            await self.db.flush()
            raise

    # ──────────────────────────────────────────────
    # REAL Pipeline Stages
    # ──────────────────────────────────────────────

    async def _validation_stage(self, doc: Document) -> None:
        """Validate the document file exists and is accessible."""
        storage_path = Path(doc.storage_path)
        if not storage_path.exists():
            raise FileNotFoundError(f"Document file not found at: {doc.storage_path}")

        file_size = storage_path.stat().st_size
        if file_size == 0:
            raise ValueError("Document file is empty (0 bytes).")

        logger.info(f"Validation passed: {doc.original_filename} ({file_size} bytes)")

    async def _extraction_stage(self, doc: Document) -> str:
        """Extract text content from the document based on its MIME type."""
        storage_path = Path(doc.storage_path)
        mime = doc.mime_type

        try:
            if mime == "application/pdf":
                text = await self._extract_pdf(storage_path)
            elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                text = await self._extract_docx(storage_path)
            elif mime in ("text/plain", "text/markdown", "text/csv", "text/tab-separated-values",
                          "text/html", "text/xml", "application/json", "application/x-yaml"):
                text = await self._extract_text(storage_path)
            else:
                # Fallback: try reading as text
                text = await self._extract_text(storage_path)

            if not text or not text.strip():
                raise ValueError(f"No text could be extracted from {doc.original_filename}")

            self._extracted_text = text
            logger.info(f"Extracted {len(text)} characters from {doc.original_filename}")
            return text

        except Exception as e:
            logger.error(f"Extraction failed for {doc.original_filename}: {e}")
            raise

    async def _extract_pdf(self, path: Path) -> str:
        """Extract text from PDF using pymupdf (fitz)."""
        import fitz  # pymupdf
        text_parts = []
        doc = fitz.open(str(path))
        for page_num, page in enumerate(doc):
            page_text = page.get_text("text")
            if page_text.strip():
                text_parts.append(page_text)
        doc.close()

        if not text_parts:
            # Fallback to pdfplumber for scanned PDFs
            try:
                import pdfplumber
                with pdfplumber.open(str(path)) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text() or ""
                        if page_text.strip():
                            text_parts.append(page_text)
            except Exception as e:
                logger.warning(f"pdfplumber fallback also failed: {e}")

        return "\n\n".join(text_parts)

    async def _extract_docx(self, path: Path) -> str:
        """Extract text from DOCX files."""
        from docx import Document as DocxDocument
        doc = DocxDocument(str(path))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)

    async def _extract_text(self, path: Path) -> str:
        """Extract text from plain text files."""
        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
        for encoding in encodings:
            try:
                return path.read_text(encoding=encoding)
            except (UnicodeDecodeError, UnicodeError):
                continue
        # Last resort: read as binary and decode with errors='replace'
        return path.read_bytes().decode("utf-8", errors="replace")

    async def _chunking_stage(self) -> list[dict]:
        """Split extracted text into chunks using LangChain's recursive splitter."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.DEFAULT_CHUNK_SIZE,
            chunk_overlap=settings.DEFAULT_CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        text_chunks = splitter.split_text(self._extracted_text)

        chunks = []
        char_offset = 0
        for idx, chunk_text in enumerate(text_chunks):
            start_char = self._extracted_text.find(chunk_text, char_offset)
            if start_char == -1:
                start_char = char_offset
            end_char = start_char + len(chunk_text)
            char_offset = start_char + 1

            chunks.append({
                "index": idx,
                "text": chunk_text,
                "start_char": start_char,
                "end_char": end_char,
                "token_count": len(chunk_text.split()),
                "char_count": len(chunk_text),
            })

        logger.info(f"Chunking produced {len(chunks)} chunks (size={settings.DEFAULT_CHUNK_SIZE}, overlap={settings.DEFAULT_CHUNK_OVERLAP})")
        return chunks

    async def _embedding_stage(self, chunks: list[dict]) -> list[list[float]]:
        """Generate real embeddings for all chunks via OpenAI."""
        texts = [c["text"] for c in chunks]

        if not texts:
            return []

        embeddings = await self.embedding_provider.embed_documents(texts)
        logger.info(f"Generated {len(embeddings)} embeddings ({settings.DEFAULT_EMBEDDING_MODEL})")
        return embeddings

    async def _vector_store_stage(
        self, doc: Document, chunks: list[dict], embeddings: list[list[float]]
    ) -> None:
        """Store chunks and embeddings in both the DB and ChromaDB."""
        collection_name = f"kb_{doc.knowledge_base_id}"

        # Prepare IDs and metadata for vector store
        chunk_ids = []
        metadatas = []
        documents_text = []
        db_chunks = []

        for idx, chunk in enumerate(chunks):
            chunk_id = uuid.uuid4()
            chunk_ids.append(str(chunk_id))
            metadatas.append({
                "document_id": str(doc.id),
                "filename": doc.original_filename,
                "chunk_index": chunk["index"],
                "page_number": 1,  # Enhanced with real page tracking in future
            })
            documents_text.append(chunk["text"])

            # Create DB chunk record
            db_chunk = Chunk(
                id=chunk_id,
                document_id=self.document_id,
                content=chunk["text"],
                content_hash=hashlib.md5(chunk["text"].encode()).hexdigest(),
                chunk_index=chunk["index"],
                page_number=1,
                start_char=chunk.get("start_char"),
                end_char=chunk.get("end_char"),
                embedding_model=settings.DEFAULT_EMBEDDING_MODEL,
                embedding_dimension=settings.DEFAULT_EMBEDDING_DIMENSION,
                vector_id=str(chunk_id),
                token_count=chunk.get("token_count", 0),
                char_count=chunk.get("char_count", 0),
                metadata_json={},
            )
            db_chunks.append(db_chunk)
            self.db.add(db_chunk)

        await self.db.flush()

        # Store in ChromaDB
        if embeddings and chunk_ids:
            await self.vector_store.add_embeddings(
                collection_name=collection_name,
                ids=chunk_ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=documents_text,
            )

        logger.info(f"Stored {len(chunk_ids)} chunks in DB and ChromaDB collection '{collection_name}'")


async def run_ingestion_background(doc_id: uuid.UUID):
    """Background task handler for document ingestion."""
    from app.infrastructure.db.base import async_session_factory
    async with async_session_factory() as db:
        try:
            pipeline = IngestionPipeline(db, doc_id)
            await pipeline.execute()
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Background ingestion failed for {doc_id}: {e}")
            raise
