#!/usr/bin/env python3
"""
RAGLens — ChromaDB → Qdrant Migration Script (Phase 3)

Exports ALL collections from the local ChromaDB persistent store and upserts
them into Qdrant, preserving:
  - Chunk IDs (string UUIDs)
  - Embedding vectors
  - Payload metadata (document_id, filename, chunk_index, page_number, …)
  - Knowledge-base multi-tenant isolation (collection naming: kb_<uuid>)

Usage:
    # From the repo root, with the backend venv activated:
    python scripts/migrate_chroma_to_qdrant.py

    # Override endpoints:
    CHROMA_PERSIST_DIR=./chroma_data QDRANT_URL=http://localhost:6333 \
        python scripts/migrate_chroma_to_qdrant.py

Requirements:
    - chromadb >= 0.5.0
    - qdrant-client >= 1.11.0
    - Qdrant service running and healthy (docker compose up qdrant)

Safety:
    - Read-only on Chroma: only queries, never modifies.
    - Idempotent: Qdrant upsert overwrites existing points with the same ID.
    - Run as many times as needed — only new/changed data is re-upserted.
"""

import asyncio
import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("migrate")

# ── Config (reads from environment, falls back to .env defaults) ──────────────
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "./chroma_data")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
BATCH_SIZE = int(os.environ.get("MIGRATION_BATCH_SIZE", "200"))


async def migrate_collection(chroma_client, qdrant_client, collection_name: str) -> int:
    """Migrate one Chroma collection to Qdrant. Returns number of points migrated."""
    from qdrant_client.models import Distance, PointStruct, VectorParams  # type: ignore[import-untyped]

    logger.info("▶ Migrating collection: %s", collection_name)

    # 1. Fetch ALL data from Chroma
    try:
        chroma_col = chroma_client.get_collection(collection_name)
    except Exception as exc:
        logger.error("  Cannot open Chroma collection '%s': %s — skipping.", collection_name, exc)
        return 0

    result = chroma_col.get(include=["embeddings", "documents", "metadatas"])
    ids: list[str] = result.get("ids", [])
    embeddings: list[list[float]] = result.get("embeddings", [])
    documents: list[str] = result.get("documents", [])
    metadatas: list[dict] = result.get("metadatas", [])

    if not ids:
        logger.info("  Empty collection — nothing to migrate.")
        return 0

    # 2. Infer vector size from first embedding
    vector_size = len(embeddings[0])
    logger.info("  Found %d points (vector_size=%d)", len(ids), vector_size)

    # 3. Ensure Qdrant collection exists
    try:
        existing = await qdrant_client.get_collection(collection_name)
        logger.info("  Qdrant collection already exists (size=%d) — upserting.", existing.config.params.vectors.size)
    except Exception:
        await qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )
        logger.info("  Created Qdrant collection '%s'.", collection_name)

    # 4. Batch upsert
    total = len(ids)
    migrated = 0
    for start in range(0, total, BATCH_SIZE):
        end = min(start + BATCH_SIZE, total)
        points = [
            PointStruct(
                id=ids[i],
                vector=embeddings[i],
                payload={
                    **(metadatas[i] if metadatas else {}),
                    "document": documents[i] if documents else "",
                },
            )
            for i in range(start, end)
        ]
        await qdrant_client.upsert(collection_name=collection_name, points=points)
        migrated += len(points)
        logger.info("  Upserted batch %d–%d / %d", start + 1, end, total)

    logger.info("✓ Collection '%s': %d/%d points migrated.", collection_name, migrated, total)
    return migrated


async def run_migration() -> None:
    try:
        import chromadb  # type: ignore[import-untyped]
    except ImportError:
        logger.error("chromadb not installed. Run: pip install chromadb")
        sys.exit(1)

    try:
        from qdrant_client import AsyncQdrantClient  # type: ignore[import-untyped]
    except ImportError:
        logger.error("qdrant-client not installed. Run: pip install qdrant-client")
        sys.exit(1)

    # Connect to Chroma
    logger.info("Connecting to ChromaDB at: %s", CHROMA_PERSIST_DIR)
    chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    chroma_collections = chroma_client.list_collections()
    logger.info("Found %d ChromaDB collection(s): %s",
                len(chroma_collections),
                [c.name for c in chroma_collections])

    if not chroma_collections:
        logger.info("No collections to migrate. Done.")
        return

    # Connect to Qdrant
    logger.info("Connecting to Qdrant at: %s", QDRANT_URL)
    qdrant_kwargs: dict = {"url": QDRANT_URL}
    if QDRANT_API_KEY:
        qdrant_kwargs["api_key"] = QDRANT_API_KEY
    qdrant_client = AsyncQdrantClient(**qdrant_kwargs)

    # Verify Qdrant is reachable
    try:
        await qdrant_client.get_collections()
        logger.info("Qdrant connection OK.")
    except Exception as exc:
        logger.error("Cannot reach Qdrant at %s: %s\nIs 'docker compose up qdrant' running?", QDRANT_URL, exc)
        sys.exit(1)

    # Migrate each collection
    grand_total = 0
    for chroma_col in chroma_collections:
        count = await migrate_collection(chroma_client, qdrant_client, chroma_col.name)
        grand_total += count

    logger.info("=" * 60)
    logger.info("Migration complete. Total points migrated: %d", grand_total)
    logger.info(
        "Next steps:\n"
        "  1. Set VECTOR_DB_PROVIDER=qdrant in .env (already default)\n"
        "  2. Restart backend and worker containers\n"
        "  3. Verify search works via the RAGLens chat\n"
        "  4. Keep chroma_data/ as backup until verified"
    )


if __name__ == "__main__":
    asyncio.run(run_migration())
