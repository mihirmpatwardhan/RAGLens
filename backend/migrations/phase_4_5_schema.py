"""
RAGLens - Migration: Phase 4+5+7 Schema Changes

Adds the following columns to support multimodal content and temporal memory:
  - documents.content_type   VARCHAR(20) DEFAULT 'text' NOT NULL
  - documents.source_date    TIMESTAMP WITH TIME ZONE NULL
  - chunks.content_type      VARCHAR(20) DEFAULT 'text' NOT NULL

Also creates the knowledge_base_members table for RBAC (Phase 6).

Usage:
    cd backend
    python migrations/phase_4_5_schema.py

Safe to run multiple times (checks column existence before adding).
"""

import asyncio
import logging
import sys
from pathlib import Path

# Allow running as a standalone script
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


MIGRATIONS = [
    # documents.content_type
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='documents' AND column_name='content_type'
        ) THEN
            ALTER TABLE documents ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'text';
        END IF;
    END $$;
    """,
    # documents.source_date
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='documents' AND column_name='source_date'
        ) THEN
            ALTER TABLE documents ADD COLUMN source_date TIMESTAMPTZ NULL;
        END IF;
    END $$;
    """,
    # chunks.content_type
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='chunks' AND column_name='content_type'
        ) THEN
            ALTER TABLE chunks ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'text';
        END IF;
    END $$;
    """,
    # knowledge_base_members for RBAC
    """
    CREATE TABLE IF NOT EXISTS knowledge_base_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer',  -- owner | editor | viewer
        invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (knowledge_base_id, user_id)
    );
    """,
    # Index for fast member lookups
    """
    CREATE INDEX IF NOT EXISTS ix_kb_members_kb_id ON knowledge_base_members(knowledge_base_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_kb_members_user_id ON knowledge_base_members(user_id);
    """,
]

# SQLite equivalents (no DO $$ blocks, no gen_random_uuid())
SQLITE_MIGRATIONS = [
    "ALTER TABLE documents ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'text'",
    "ALTER TABLE documents ADD COLUMN source_date DATETIME NULL",
    "ALTER TABLE chunks ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'text'",
    """
    CREATE TABLE IF NOT EXISTS knowledge_base_members (
        id TEXT PRIMARY KEY,
        knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (knowledge_base_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_kb_members_kb_id ON knowledge_base_members(knowledge_base_id)",
    "CREATE INDEX IF NOT EXISTS ix_kb_members_user_id ON knowledge_base_members(user_id)",
]


async def run_postgres_migrations(db_url: str) -> None:
    """Apply Postgres migrations using asyncpg."""
    import asyncpg  # type: ignore[import-untyped]

    conn_str = (
        db_url
        .replace("postgresql+asyncpg://", "postgresql://")
        .replace("postgresql+psycopg2://", "postgresql://")
    )
    conn = await asyncpg.connect(conn_str)
    try:
        for sql in MIGRATIONS:
            try:
                await conn.execute(sql.strip())
                logger.info("Migration applied: %s...", sql.strip()[:60])
            except Exception as exc:
                logger.warning("Migration skipped/failed: %s — %s", sql.strip()[:60], exc)
    finally:
        await conn.close()


async def run_sqlite_migrations(db_url: str) -> None:
    """Apply SQLite migrations — ALTER TABLE fails gracefully if column exists."""
    import aiosqlite  # type: ignore[import-untyped]

    db_path = db_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
    async with aiosqlite.connect(db_path) as db:
        for sql in SQLITE_MIGRATIONS:
            try:
                await db.execute(sql.strip())
                await db.commit()
                logger.info("SQLite migration applied: %s...", sql.strip()[:60])
            except Exception as exc:
                if "duplicate column" in str(exc).lower() or "already exists" in str(exc).lower():
                    logger.info("Already applied (skipping): %s...", sql.strip()[:60])
                else:
                    logger.warning("SQLite migration warning: %s — %s", sql.strip()[:60], exc)


async def main() -> None:
    from app.core.config import get_settings
    settings = get_settings()
    db_url = settings.DATABASE_URL

    logger.info("Running schema migrations against: %s", db_url[:60])

    if "sqlite" in db_url:
        await run_sqlite_migrations(db_url)
    else:
        await run_postgres_migrations(db_url)

    logger.info("✅ All migrations completed.")


if __name__ == "__main__":
    asyncio.run(main())
