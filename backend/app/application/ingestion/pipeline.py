"""
RAGLense - Ingestion Pipeline Orchestrator

Manages the multi-stage document processing pipeline:
- File validation and deduplication
- Text extraction:
    - PDF: layout-aware via `unstructured` (ENABLE_LAYOUT_PARSER=True, default)
           fallback to flat pymupdf/pdfplumber extraction
    - DOCX, TXT, MD, HTML, CSV, JSON: plain text extraction
    - Audio/Video: transcription via faster-whisper (Phase 7)
- Hierarchical chunking (parent/child) for layout-parsed elements
- Recursive character chunking for flat text
- Real embedding generation via FallbackEmbeddingProvider (OpenAI → local bge)
- Real vector storage via Qdrant (configurable via VECTOR_DB_PROVIDER)
"""

import hashlib
import logging
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infrastructure.db.models.knowledge import Chunk, Document, PipelineRun
from app.infrastructure.embeddings.fallback_embeddings import FallbackEmbeddingProvider
from app.infrastructure.storage.file_storage import get_file_storage
from app.infrastructure.vector_stores import get_vector_store

logger = logging.getLogger(__name__)
settings = get_settings()


class IngestionPipeline:
    """Manages the execution and observability of the document ingestion pipeline."""

    def __init__(self, db: AsyncSession, document_id: uuid.UUID):
        self.db = db
        self.document_id = document_id
        self.storage = get_file_storage()
        # FallbackEmbeddingProvider: OpenAI primary, local bge-small-en-v1.5 fallback.
        self.embedding_provider = FallbackEmbeddingProvider()
        # get_vector_store() reads VECTOR_DB_PROVIDER from config — qdrant by default.
        self.vector_store = get_vector_store()
        self.run_id = uuid.uuid4()
        self._extracted_text: str = ""
        # Layout-parsed elements (populated when ENABLE_LAYOUT_PARSER=True for PDFs)
        self._layout_elements: list = []
        # Audio/video transcript segments (populated for audio/video MIME types)
        self._audio_segments: list = []
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
            started_at=datetime.now(UTC),
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

            # Stage 3: Chunking — route by extracted content type
            if self._layout_elements:
                chunks = await self._run_stage(
                    run, "chunking", self._layout_chunking_stage
                )
            elif self._audio_segments:
                chunks = await self._run_stage(
                    run, "chunking", self._audio_chunking_stage
                )
            else:
                chunks = await self._run_stage(run, "chunking", self._chunking_stage)


            # Stage 4: Embedding Generation
            embeddings = await self._run_stage(run, "embedding", lambda: self._embedding_stage(chunks))

            # Stage 5: Vector Store Storage
            await self._run_stage(run, "vector_store", lambda: self._vector_store_stage(doc, chunks, embeddings))

            # Finalize pipeline run
            run.status = "completed"
            run.progress = 100.0
            run.completed_at = datetime.now(UTC)
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
            run.completed_at = datetime.now(UTC)
            run.duration_ms = int((time.time() - start_time) * 1000)

            doc.status = "error"
            doc.error_message = str(e)
            await self.db.flush()

    async def _run_stage(self, run: PipelineRun, stage_id: str, stage_func) -> any:
        """Execute a single pipeline stage, updates status/timing, handles errors."""
        run.current_stage = stage_id
        run.stages[stage_id]["status"] = "running"
        run.stages[stage_id]["started_at"] = datetime.now(UTC).isoformat()
        await self.db.flush()

        stage_start = time.time()
        try:
            result = await stage_func()

            duration_ms = int((time.time() - stage_start) * 1000)
            run.stages[stage_id]["status"] = "completed"
            run.stages[stage_id]["completed_at"] = datetime.now(UTC).isoformat()
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
            run.stages[stage_id]["completed_at"] = datetime.now(UTC).isoformat()
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
        """Extract text content from the document based on its MIME type.

        For PDFs with ENABLE_LAYOUT_PARSER=True, populates self._layout_elements
        instead of returning flat text. Falls back to flat extraction on failure.
        """
        storage_path = Path(doc.storage_path)
        mime = doc.mime_type

        try:
            if mime == "application/pdf" and settings.ENABLE_LAYOUT_PARSER:
                text = await self._extract_pdf_layout(storage_path)
            elif mime == "application/pdf":
                text = await self._extract_pdf(storage_path)
            elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                text = await self._extract_docx(storage_path)
            elif mime in ("text/plain", "text/markdown", "text/csv", "text/tab-separated-values",
                          "text/html", "text/xml", "application/json", "application/x-yaml"):
                text = await self._extract_text(storage_path)
            elif mime.startswith(("audio/", "video/")):
                # Phase 7: route to faster-whisper transcription
                text = await self._extract_audio_video(storage_path, mime)
            else:
                # Fallback: try reading as text
                text = await self._extract_text(storage_path)


            if not text or not text.strip():
                if not self._layout_elements:
                    raise ValueError(f"No text could be extracted from {doc.original_filename}")
                # Layout elements were populated — return placeholder text
                text = f"[Layout-parsed document: {len(self._layout_elements)} elements]"

            self._extracted_text = text
            logger.info(f"Extracted {len(text)} characters from {doc.original_filename}")
            return text

        except Exception as e:
            logger.error(f"Extraction failed for {doc.original_filename}: {e}")
            raise

    async def _extract_audio_video(self, path: Path, mime: str) -> str:
        """Extract transcript from audio/video using faster-whisper.

        Populates self._audio_segments for timestamp-aware chunking.
        Returns joined transcript text for stage tracking.
        """
        "video" if mime.startswith("video/") else "audio"
        try:
            from app.infrastructure.ingestion.audio_ingestion import transcribe_audio
            self._audio_segments = await transcribe_audio(path)
            if self._audio_segments:
                text = " ".join(seg.text for seg in self._audio_segments)
                logger.info(
                    "Transcribed %d segments (%d chars) from '%s'",
                    len(self._audio_segments),
                    len(text),
                    path.name,
                )
                return text
        except Exception as exc:
            logger.warning("Audio transcription failed (%s): %s", path.name, exc)
            self._audio_segments = []

        raise ValueError(
            f"Could not transcribe audio/video file '{path.name}'. "
            "Ensure faster-whisper is installed: pip install faster-whisper"
        )

    async def _extract_pdf_layout(self, path: Path) -> str:
        """Extract PDF using layout-aware unstructured parser.

        Populates self._layout_elements for use by _layout_chunking_stage.
        Returns flat text as fallback for the stage result value.
        """
        try:
            from app.infrastructure.ingestion.unstructured_parser import parse_pdf_layout
            self._layout_elements = await parse_pdf_layout(path)
            if self._layout_elements:
                # Return joined text so stage tracking shows character count
                return " ".join(el.text for el in self._layout_elements if el.text)
        except Exception as exc:
            logger.warning("Layout parser failed (%s), falling back to flat PDF extraction.", exc)
            self._layout_elements = []

        # Fallback to flat pymupdf extraction
        return await self._extract_pdf(path)

    async def _extract_pdf(self, path: Path) -> str:
        """Extract text from PDF using pymupdf (fitz)."""
        import fitz  # pymupdf
        text_parts = []
        doc = fitz.open(str(path))
        for _page_num, page in enumerate(doc):
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

    async def _layout_chunking_stage(self) -> list[dict]:
        """Produce chunks from layout-parsed elements with parent-child hierarchy.

        Uses pre-assigned chunk IDs from unstructured_parser.elements_to_chunks
        so parent_chunk_id references are consistent across the batch.
        """
        from app.infrastructure.ingestion.unstructured_parser import elements_to_chunks

        chunks = elements_to_chunks(
            self._layout_elements,
            chunk_size=settings.DEFAULT_CHUNK_SIZE,
            chunk_overlap=settings.DEFAULT_CHUNK_OVERLAP,
        )
        logger.info(
            "Layout chunking produced %d chunks (%d source elements)",
            len(chunks),
            len(self._layout_elements),
        )
        return chunks

    async def _audio_chunking_stage(self) -> list[dict]:
        """Group audio/video transcript segments into ~60s timed chunks."""
        from app.infrastructure.ingestion.audio_ingestion import segments_to_chunks

        # Infer content_type from MIME stored on segments
        content_type = "audio"
        if self._audio_segments and hasattr(self._audio_segments[0], "language"):
            pass  # keep "audio" as default

        chunks = segments_to_chunks(
            self._audio_segments,
            content_type=content_type,
        )
        logger.info(
            "Audio chunking produced %d chunks from %d transcript segments",
            len(chunks),
            len(self._audio_segments),
        )
        return chunks

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
                "id": str(uuid.uuid4()),  # pre-assign ID (matches layout chunker convention)
                "index": idx,
                "text": chunk_text,
                "content_type": "text",
                "start_char": start_char,
                "end_char": end_char,
                "token_count": len(chunk_text.split()),
                "char_count": len(chunk_text),
                "page_number": 1,
                "section_title": None,
                "parent_chunk_id": None,
            })

        logger.info(f"Chunking produced {len(chunks)} chunks (size={settings.DEFAULT_CHUNK_SIZE}, overlap={settings.DEFAULT_CHUNK_OVERLAP})")
        return chunks

    async def _embedding_stage(self, chunks: list[dict]) -> list[list[float]]:
        """Generate embeddings for all chunks with OpenAI primary, local fallback."""
        texts = [c["text"] for c in chunks]

        if not texts:
            return []

        try:
            embeddings = await self.embedding_provider.embed_documents(texts)
            active_model = (
                settings.DEFAULT_EMBEDDING_MODEL
                if self.embedding_provider.active_dim == settings.DEFAULT_EMBEDDING_DIMENSION
                else settings.LOCAL_EMBEDDING_MODEL
            )
            logger.info(
                "Generated %d embeddings (%s, dim=%d)",
                len(embeddings),
                active_model,
                self.embedding_provider.active_dim,
            )
            return embeddings
        except Exception as exc:
            logger.error("Embedding stage failed: %s", exc)
            raise

    async def _vector_store_stage(
        self, doc: Document, chunks: list[dict], embeddings: list[list[float]]
    ) -> None:
        """Store chunks and embeddings in both the DB and the vector store."""
        collection_name = f"kb_{doc.knowledge_base_id}"

        # ── Dimension safety guard ──────────────────────────────────────────────
        # Determine which model and dimension are active from the embedding provider.
        active_dim: int = self.embedding_provider.active_dim
        active_model: str = (
            settings.DEFAULT_EMBEDDING_MODEL
            if active_dim == settings.DEFAULT_EMBEDDING_DIMENSION
            else settings.LOCAL_EMBEDDING_MODEL
        )
        from app.application.ingestion.dimension_guard import check_and_set_kb_embedding
        await check_and_set_kb_embedding(
            db=self.db,
            kb_id=doc.knowledge_base_id,
            active_model=active_model,
            active_dim=active_dim,
        )
        # ───────────────────────────────────────────────────────────────────────

        # Build a lookup: pre-assigned chunk id → position (for layout chunks)
        # For flat chunks the id was just assigned in _chunking_stage.
        chunk_ids = []
        metadatas = []
        documents_text = []
        db_chunks = []

        for idx, chunk in enumerate(chunks):
            # Use pre-assigned id when available (layout chunks), otherwise generate one
            chunk_id_str = chunk.get("id") or str(uuid.uuid4())
            chunk_id = uuid.UUID(chunk_id_str) if isinstance(chunk_id_str, str) else chunk_id_str

            chunk_ids.append(str(chunk_id))
            metadatas.append({
                "document_id": str(doc.id),
                "filename": doc.original_filename,
                "chunk_index": chunk.get("index", idx),
                "page_number": chunk.get("page_number", 1),
                "content_type": chunk.get("content_type", "text"),
                "section_title": chunk.get("section_title") or "",
            })
            documents_text.append(chunk["text"])

            # Resolve parent_chunk_id (string UUID or None)
            parent_id_str = chunk.get("parent_chunk_id")
            parent_chunk_id = uuid.UUID(parent_id_str) if parent_id_str else None

            # Create DB chunk record
            db_chunk = Chunk(
                id=chunk_id,
                document_id=self.document_id,
                content=chunk["text"],
                content_hash=hashlib.md5(chunk["text"].encode()).hexdigest(),
                chunk_index=chunk.get("index", idx),
                page_number=chunk.get("page_number", 1),
                section_title=chunk.get("section_title"),
                start_char=chunk.get("start_char"),
                end_char=chunk.get("end_char"),
                embedding_model=settings.DEFAULT_EMBEDDING_MODEL,
                embedding_dimension=settings.DEFAULT_EMBEDDING_DIMENSION,
                vector_id=str(chunk_id),
                token_count=chunk.get("token_count", 0),
                char_count=chunk.get("char_count", 0),
                metadata_json={},
                content_type=chunk.get("content_type", "text"),
                parent_chunk_id=parent_chunk_id,
            )
            db_chunks.append(db_chunk)
            self.db.add(db_chunk)

        await self.db.flush()

        # Store in vector store (skip image-only chunks if they have no useful text)
        text_chunk_ids = []
        text_embeddings = []
        text_metadatas = []
        text_documents = []
        for i, chunk in enumerate(chunks):
            if chunk.get("content_type") == "image" and chunk["text"].startswith("[Image"):
                continue  # Skip placeholder image text from vector store
            if i < len(embeddings):
                text_chunk_ids.append(chunk_ids[i])
                text_embeddings.append(embeddings[i])
                text_metadatas.append(metadatas[i])
                text_documents.append(documents_text[i])

        if text_embeddings and text_chunk_ids:
            await self.vector_store.add_embeddings(
                collection_name=collection_name,
                ids=text_chunk_ids,
                embeddings=text_embeddings,
                metadatas=text_metadatas,
                documents=text_documents,
            )

        logger.info(
            f"Stored {len(db_chunks)} DB chunks, {len(text_chunk_ids)} vector chunks "
            f"in collection '{collection_name}'"
        )

def run_ingestion_background(doc_id: uuid.UUID):
    """Background task handler for document ingestion.

    FastAPI BackgroundTasks run in the same event loop as the request handler.
    We must NOT call asyncio.run() here — it would raise
    'RuntimeError: This event loop is already running'.

    Instead, we spawn a brand-new OS thread that owns its own event loop so
    ingestion I/O never blocks the ASGI event loop.
    """
    import threading

    async def _run():
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

    def _thread_entry():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run())
        except Exception as exc:
            logger.error(f"Ingestion thread for doc {doc_id} raised: {exc}")
        finally:
            loop.close()

    t = threading.Thread(target=_thread_entry, name=f"ingest-{doc_id}", daemon=True)
    t.start()
