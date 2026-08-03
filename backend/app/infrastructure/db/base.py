"""
RAGLense - Database Configuration

Async SQLAlchemy engine, session factory, and base model.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# Async engine
engine_kwargs: dict = {
    "echo": settings.DATABASE_ECHO,
}

_is_sqlite = "sqlite" in settings.DATABASE_URL

if _is_sqlite:
    # WAL mode allows concurrent readers alongside a writer —
    # this prevents "database is locked" errors when the background
    # ingestion thread writes while the API event loop also writes.
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
    engine_kwargs["pool_pre_ping"] = True

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs
)

if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_wal(dbapi_conn, connection_record):
        """Enable WAL and a 10-second busy timeout on every new connection."""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=10000")  # 10 s before giving up
        cursor.execute("PRAGMA synchronous=NORMAL")   # faster, still safe with WAL
        cursor.close()

# Session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""

    pass


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables (development only — use Alembic in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

