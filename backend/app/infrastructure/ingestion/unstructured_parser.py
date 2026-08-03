"""
RAGLens - Unstructured PDF Parser (Phase 5)

Uses the `unstructured[pdf]` library to perform layout-aware extraction of:
  - NarrativeText  → content_type: text
  - Title/Header   → parent chunks (used as hierarchy anchors)
  - Table          → content_type: table (preserved as markdown)
  - Image/Figure   → content_type: image (binary asset extracted separately)

Falls back to the existing pymupdf extraction if unstructured is not installed.

Usage::
    from app.infrastructure.ingestion.unstructured_parser import parse_pdf_layout
    elements = await parse_pdf_layout(path)
    # elements: list of ParsedElement dicts
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ParsedElement:
    """A structured element extracted from a document."""
    content_type: str          # text | table | image | title
    text: str                  # Textual content (markdown for tables)
    page_number: int
    section_title: str | None = None
    image_bytes: bytes | None = None  # Non-None for image elements
    metadata: dict = field(default_factory=dict)


def _sync_parse_pdf(path: Path) -> list[ParsedElement]:
    """Synchronous unstructured PDF partition — runs in thread pool."""
    try:
        from unstructured.documents.elements import (  # type: ignore[import-untyped]
            Image,
            ListItem,
            NarrativeText,
            Table,
            Text,
            Title,
        )
        from unstructured.partition.pdf import partition_pdf  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "unstructured[pdf] not installed. "
            "Falling back to flat text extraction. "
            "Install with: pip install 'unstructured[pdf]'"
        )
        return _fallback_parse_pdf(path)

    try:
        raw_elements = partition_pdf(
            filename=str(path),
            strategy="hi_res",          # layout detection
            infer_table_structure=True, # extract tables as HTML/markdown
            extract_images_in_pdf=True, # extract embedded images
            extract_image_block_types=["Image", "Table"],
        )
    except Exception as exc:
        logger.warning("unstructured partition_pdf failed (%s), using fallback.", exc)
        return _fallback_parse_pdf(path)

    elements: list[ParsedElement] = []
    current_title: str | None = None

    for el in raw_elements:
        page_num = (
            el.metadata.page_number
            if hasattr(el, "metadata") and el.metadata
            else 1
        )
        el_text = str(el).strip()
        if not el_text:
            continue

        if isinstance(el, Title):
            current_title = el_text
            elements.append(ParsedElement(
                content_type="title",
                text=el_text,
                page_number=page_num,
                section_title=el_text,
            ))

        elif isinstance(el, Table):
            # unstructured can provide HTML table structure
            table_text = (
                el.metadata.text_as_html
                if hasattr(el.metadata, "text_as_html") and el.metadata.text_as_html
                else el_text
            )
            elements.append(ParsedElement(
                content_type="table",
                text=table_text,
                page_number=page_num,
                section_title=current_title,
            ))

        elif isinstance(el, Image):
            # Extract image bytes if available
            img_bytes: bytes | None = None
            if hasattr(el.metadata, "image_base64") and el.metadata.image_base64:
                import base64
                with contextlib.suppress(Exception):
                    img_bytes = base64.b64decode(el.metadata.image_base64)

            elements.append(ParsedElement(
                content_type="image",
                text=f"[Image on page {page_num}]",
                page_number=page_num,
                section_title=current_title,
                image_bytes=img_bytes,
            ))

        elif isinstance(el, (NarrativeText, ListItem, Text)):
            elements.append(ParsedElement(
                content_type="text",
                text=el_text,
                page_number=page_num,
                section_title=current_title,
            ))

    logger.info(
        "unstructured parsed %d elements from '%s'",
        len(elements),
        path.name,
    )
    return elements


def _fallback_parse_pdf(path: Path) -> list[ParsedElement]:
    """Flat extraction via pymupdf as a fallback."""
    try:
        import fitz  # pymupdf
    except ImportError:
        logger.error("pymupdf not installed — cannot extract PDF text.")
        return []

    elements: list[ParsedElement] = []
    doc = fitz.open(str(path))
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        if text:
            elements.append(ParsedElement(
                content_type="text",
                text=text,
                page_number=page_num,
            ))
    doc.close()
    return elements


async def parse_pdf_layout(path: Path) -> list[ParsedElement]:
    """Async entry point: parse a PDF with layout-aware unstructured extraction.

    Returns a list of ParsedElement objects. The caller (ingestion pipeline)
    is responsible for chunking and persisting these elements.
    """
    return await asyncio.to_thread(_sync_parse_pdf, path)


def elements_to_chunks(
    elements: list[ParsedElement],
    chunk_size: int = 512,
    chunk_overlap: int = 50,
) -> list[dict]:
    """Convert ParsedElements into chunk dicts ready for embedding/storage.

    Strategy:
      - title elements → parent chunks (chunk_index = -idx, used as anchors)
      - text elements → may be split further by RecursiveCharacterTextSplitter
      - table/image  → kept as single chunks (no sub-splitting)

    Parent-child hierarchy:
      - title elements become parent chunks (parent_chunk_id = None)
      - text chunks under a title get parent_chunk_id = that title's chunk id
    """
    import uuid as uuid_mod

    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    result_chunks: list[dict] = []
    current_parent_id: str | None = None
    chunk_index = 0

    for el in elements:
        if el.content_type == "title":
            # Title becomes a lightweight parent chunk
            parent_id = str(uuid_mod.uuid4())
            current_parent_id = parent_id
            result_chunks.append({
                "id": parent_id,
                "index": chunk_index,
                "text": el.text,
                "content_type": "title",
                "page_number": el.page_number,
                "section_title": el.section_title,
                "parent_chunk_id": None,
                "token_count": len(el.text.split()),
                "char_count": len(el.text),
                "image_bytes": None,
            })
            chunk_index += 1

        elif el.content_type in ("table", "image"):
            # Keep as a single atomic chunk
            result_chunks.append({
                "id": str(uuid_mod.uuid4()),
                "index": chunk_index,
                "text": el.text,
                "content_type": el.content_type,
                "page_number": el.page_number,
                "section_title": el.section_title,
                "parent_chunk_id": current_parent_id,
                "token_count": len(el.text.split()),
                "char_count": len(el.text),
                "image_bytes": el.image_bytes,
            })
            chunk_index += 1

        else:
            # text / narrative — split further if large
            sub_texts = splitter.split_text(el.text) if len(el.text) > chunk_size else [el.text]

            for sub_text in sub_texts:
                if not sub_text.strip():
                    continue
                result_chunks.append({
                    "id": str(uuid_mod.uuid4()),
                    "index": chunk_index,
                    "text": sub_text,
                    "content_type": "text",
                    "page_number": el.page_number,
                    "section_title": el.section_title,
                    "parent_chunk_id": current_parent_id,
                    "token_count": len(sub_text.split()),
                    "char_count": len(sub_text),
                    "image_bytes": None,
                })
                chunk_index += 1

    return result_chunks
