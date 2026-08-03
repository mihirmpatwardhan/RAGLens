"""
RAGLens - ChromaDB to Qdrant Migration Script (Phase 3)

Exports all ChromaDB collections into Qdrant, preserving:
  - Chunk IDs (converted to UUIDs for Qdrant point IDs)
  - Metadata payloads (document_id, filename, chunk_index, etc.)
  - Embedding vectors
  - Document text

Multi-tenant isolation is preserved: each ChromaDB collection maps 1:1 to
a Qdrant collection with the same name (e.g. "kb_<uuid>").

Usage:
    cd backend
    python migrations/chroma_to_qdrant.py

    # Dry run (no writes to Qdrant):
    python migrations/chroma_to_qdrant.py --dry-run

    # Migrate a specific collection only:
    python migrations/chroma_to_qdrant.py --collection kb_<uuid>

Prerequisites:
    - ChromaDB persist dir accessible (CHROMA_PERSIST_DIR env var or default ./chroma_data)
    - Qdrant running and accessible (QDRANT_URL env var or default http://localhost:6333)
    - pip install chromadb qdrant-client

Safe to re-run: existing Qdrant points are upserted (not duplicated).
"""

import argparse
import asyncio
import logging
import sys
import uuid as uuid_mod
from pathlib import Path

# Allow running as standalone script
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _get_chroma_collections(chroma_dir: str) -> list[object]:
    """Return all collections from a ChromaDB PersistentClient."""
    try:
        import chromadb  # type: ignore[import-untyped]
    except ImportError as e:
        raise ImportError("chromadb is not installed. Run: pip install chromadb") from e

    client = chromadb.PersistentClient(path=chroma_dir)
    collections = client.list_collections()
    logger.info("Found %d ChromaDB collections in '%s'", len(collections), chroma_dir)
    return client, collections


async def _ensure_qdrant_collection(
    qdrant_client, collection_name: str, vector_size: int
) -> None:
    """Create Qdrant collection if it doesn't exist."""
    from qdrant_client.models import Distance, VectorParams  # type: ignore[import-untyped]

    try:
        existing = await qdrant_client.get_collection(collection_name)
        existing_size = existing.config.params.vectors.size
        if existing_size != vector_size:
            logger.warning(
                "Collection '%s' exists with vector_size=%d but migration data is %d-dim. "
                "Skipping this collection — dimensions must match.",
                collection_name,
                existing_size,
                vector_size,
            )
            return False
        logger.info("Collection '%s' already exists — will upsert into it.", collection_name)
        return True
    except Exception:
        pass

    await qdrant_client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
    )
    logger.info(
        "Created Qdrant collection '%s' (vector_size=%d, distance=COSINE)",
        collection_name,
        vector_size,
    )
    return True


def _to_qdrant_id(chroma_id: str) -> str:
    """Convert a ChromaDB string ID to a Qdrant-compatible UUID string.

    Qdrant supports both UUID and unsigned integer point IDs.
    ChromaDB uses string IDs — we pass them through directly if they are
    valid UUIDs, otherwise generate a deterministic UUID5 from the string.
    """
    try:
        uuid_mod.UUID(chroma_id)
        return chroma_id
    except ValueError:
        return str(uuid_mod.uuid5(uuid_mod.NAMESPACE_DNS, chroma_id))


async def migrate_collection(
    chroma_client,
    qdrant_client,
    collection_name: str,
    batch_size: int = 100,
    dry_run: bool = False,
) -> dict:
    """Migrate a single ChromaDB collection to Qdrant.

    Returns a summary dict with counts.
    """
    from qdrant_client.models import PointStruct  # type: ignore[import-untyped]

    summary = {
        "collection": collection_name,
        "total": 0,
        "migrated": 0,
        "skipped": 0,
        "errors": 0,
    }

    try:
        collection = chroma_client.get_collection(collection_name)
    except Exception as exc:
        logger.error("Could not open ChromaDB collection '%s': %s", collection_name, exc)
        summary["errors"] += 1
        return summary

    # Fetch all items (ChromaDB in-process, so we can grab all at once)
    try:
        result = collection.get(include=["embeddings", "documents", "metadatas"])
    except Exception as exc:
        logger.error("Failed to fetch data from '%s': %s", collection_name, exc)
        summary["errors"] += 1
        return summary

    ids = result.get("ids", [])
    embeddings = result.get("embeddings", [])
    documents = result.get("documents", [])
    metadatas = result.get("metadatas", [])

    if not ids:
        logger.info("Collection '%s' is empty — nothing to migrate.", collection_name)
        return summary

    if not embeddings or len(embeddings[0]) == 0:
        logger.warning(
            "Collection '%s' has no embeddings stored. ChromaDB may not persist embeddings "
            "by default. Re-run ingestion on the source documents.",
            collection_name,
        )
        summary["skipped"] = len(ids)
        return summary

    vector_size = len(embeddings[0])
    summary["total"] = len(ids)

    if dry_run:
        logger.info(
            "[DRY RUN] Would migrate %d vectors (dim=%d) into Qdrant collection '%s'",
            len(ids),
            vector_size,
            collection_name,
        )
        summary["migrated"] = len(ids)
        return summary

    # Ensure collection exists in Qdrant
    ok = await _ensure_qdrant_collection(qdrant_client, collection_name, vector_size)
    if not ok:
        summary["skipped"] = len(ids)
        return summary

    # Batch upsert
    for start in range(0, len(ids), batch_size):
        end = min(start + batch_size, len(ids))
        batch_ids = ids[start:end]
        batch_embeddings = embeddings[start:end]
        batch_documents = documents[start:end] if documents else [""] * (end - start)
        batch_metadatas = metadatas[start:end] if metadatas else [{}] * (end - start)

        points = [
            PointStruct(
                id=_to_qdrant_id(batch_ids[i]),
                vector=batch_embeddings[i],
                payload={
                    **batch_metadatas[i],
                    "document": batch_documents[i],
                    # Preserve original ChromaDB ID in payload for traceability
                    "_chroma_id": batch_ids[i],
                },
            )
            for i in range(len(batch_ids))
        ]

        try:
            await qdrant_client.upsert(collection_name=collection_name, points=points)
            summary["migrated"] += len(points)
            logger.info(
                "  Upserted batch %d-%d / %d into '%s'",
                start + 1,
                end,
                len(ids),
                collection_name,
            )
        except Exception as exc:
            logger.error(
                "Batch upsert failed for '%s' (batch %d-%d): %s", collection_name, start, end, exc
            )
            summary["errors"] += len(points)

    return summary


async def main(args: argparse.Namespace) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    chroma_dir = args.chroma_dir or settings.CHROMA_PERSIST_DIR
    qdrant_url = args.qdrant_url or settings.QDRANT_URL
    qdrant_api_key = args.qdrant_api_key or settings.QDRANT_API_KEY or None

    logger.info("=== ChromaDB → Qdrant Migration ===")
    logger.info("ChromaDB source : %s", chroma_dir)
    logger.info("Qdrant target   : %s", qdrant_url)
    logger.info("Dry run         : %s", args.dry_run)

    # Connect to ChromaDB
    chroma_client, collections = _get_chroma_collections(chroma_dir)
    if not collections:
        logger.info("No ChromaDB collections found. Nothing to migrate.")
        return

    # Connect to Qdrant
    try:
        from qdrant_client import AsyncQdrantClient  # type: ignore[import-untyped]
    except ImportError as e:
        raise ImportError("qdrant-client not installed. Run: pip install qdrant-client") from e

    qdrant_kwargs: dict = {"url": qdrant_url}
    if qdrant_api_key:
        qdrant_kwargs["api_key"] = qdrant_api_key

    qdrant_client = AsyncQdrantClient(**qdrant_kwargs)

    # Filter to specific collection if requested
    if args.collection:
        collections = [c for c in collections if c.name == args.collection]
        if not collections:
            logger.error("Collection '%s' not found in ChromaDB.", args.collection)
            return

    # Migrate
    total_summary = {"total": 0, "migrated": 0, "skipped": 0, "errors": 0}
    for collection in collections:
        logger.info("--- Migrating collection: %s ---", collection.name)
        result = await migrate_collection(
            chroma_client=chroma_client,
            qdrant_client=qdrant_client,
            collection_name=collection.name,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
        for key in total_summary:
            total_summary[key] += result.get(key, 0)

    await qdrant_client.close()

    logger.info("=== Migration Complete ===")
    logger.info("Total vectors  : %d", total_summary["total"])
    logger.info("Migrated       : %d", total_summary["migrated"])
    logger.info("Skipped        : %d", total_summary["skipped"])
    logger.info("Errors         : %d", total_summary["errors"])

    if total_summary["errors"] > 0:
        logger.warning("Some vectors failed to migrate. Check logs above for details.")
        sys.exit(1)
    elif args.dry_run:
        logger.info("[DRY RUN] No data was written to Qdrant.")
    else:
        logger.info("✅ Migration completed successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Migrate ChromaDB collections to Qdrant vector database"
    )
    parser.add_argument(
        "--chroma-dir",
        default=None,
        help="Path to ChromaDB persist directory (default: CHROMA_PERSIST_DIR from .env)",
    )
    parser.add_argument(
        "--qdrant-url",
        default=None,
        help="Qdrant server URL (default: QDRANT_URL from .env)",
    )
    parser.add_argument(
        "--qdrant-api-key",
        default=None,
        help="Qdrant API key (default: QDRANT_API_KEY from .env)",
    )
    parser.add_argument(
        "--collection",
        default=None,
        help="Migrate only this specific collection name (default: all collections)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of vectors to upsert per Qdrant batch (default: 100)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be migrated without writing to Qdrant",
    )

    args = parser.parse_args()
    asyncio.run(main(args))
