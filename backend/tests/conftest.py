"""
RAGLens Test Suite — Shared Fixtures (conftest.py)

Provides:
  - async_db:     in-memory SQLite async session (all tables auto-created)
  - mock_user:    a User row pre-seeded into async_db
  - mock_kb:      a KnowledgeBase row owned by mock_user
  - mock_document: a Document row inside mock_kb
  - mock_clerk_token: a fake Clerk JWT payload dict
  - mock_vector_store: lightweight stub that records calls without real I/O
  - mock_embedding_provider: returns deterministic zero vectors of the configured dim
"""

import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── DB Setup ────────────────────────────────────────────────────────────────────

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def async_db() -> AsyncGenerator[AsyncSession, None]:
    """In-memory SQLite async session with all ORM tables created fresh."""
    # Import all models so metadata is populated before create_all
    from app.infrastructure.db.base import Base  # noqa: F401
    import app.infrastructure.db.models  # noqa: F401  (registers models)

    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()

    await engine.dispose()


# ── Seeded Fixtures ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def mock_user(async_db: AsyncSession):
    """Pre-seeded User row in the test database."""
    from app.infrastructure.db.models.user import User

    user = User(
        id=uuid.uuid4(),
        email="test@raglens.io",
        hashed_password="hashed_test_pw",
        full_name="Test User",
        is_active=True,
        is_verified=True,
    )
    async_db.add(user)
    await async_db.flush()
    return user


@pytest_asyncio.fixture
async def mock_kb(async_db: AsyncSession, mock_user):
    """Pre-seeded KnowledgeBase owned by mock_user."""
    from app.infrastructure.db.models.knowledge import KnowledgeBase

    kb = KnowledgeBase(
        id=uuid.uuid4(),
        name="Test KB",
        description="Test knowledge base",
        owner_id=mock_user.id,
        embedding_model="text-embedding-3-small",
        vector_dimension=1536,
    )
    async_db.add(kb)
    await async_db.flush()
    return kb


@pytest_asyncio.fixture
async def mock_document(async_db: AsyncSession, mock_kb, tmp_path):
    """Pre-seeded Document row in mock_kb with a real temp file on disk."""
    from app.infrastructure.db.models.knowledge import Document

    # Write a real temp file so the pipeline validation stage passes
    doc_file = tmp_path / "test.txt"
    doc_file.write_text("Hello world. This is a test document for RAGLens chunking tests.")

    doc = Document(
        id=uuid.uuid4(),
        knowledge_base_id=mock_kb.id,
        filename="test.txt",
        original_filename="test.txt",
        mime_type="text/plain",
        file_size=doc_file.stat().st_size,
        storage_path=str(doc_file),
        status="uploaded",
        content_type="text",
    )
    async_db.add(doc)
    await async_db.flush()
    return doc


# ── Auth / Token Fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def mock_clerk_payload(mock_user):
    """Fake decoded Clerk JWT payload matching mock_user."""
    return {
        "sub": f"user_clerk_{mock_user.id.hex[:16]}",
        "email": mock_user.email,
        "primary_email_address": mock_user.email,
        "iss": "https://clerk.example.com",
        "aud": "raglens",
        "exp": 9999999999,
    }


# ── Vector Store Stub ───────────────────────────────────────────────────────────

@pytest.fixture
def mock_vector_store():
    """AsyncMock vector store that records calls without any real I/O."""
    store = MagicMock()
    store.add_embeddings = AsyncMock(return_value=None)
    store.similarity_search = AsyncMock(return_value=[
        {
            "id": str(uuid.uuid4()),
            "document": "Relevant chunk text from test document.",
            "score": 0.87,
            "metadata": {
                "filename": "test.txt",
                "page_number": 1,
                "chunk_index": 0,
                "content_type": "text",
                "section_title": "",
            },
        }
    ])
    store.delete_embeddings = AsyncMock(return_value=None)
    return store


# ── Embedding Provider Stub ─────────────────────────────────────────────────────

@pytest.fixture
def mock_embedding_provider_1536():
    """Returns deterministic 1536-dim zero vectors (OpenAI dimensions)."""
    provider = MagicMock()
    provider.active_dim = 1536

    async def _embed_documents(texts):
        return [[0.0] * 1536 for _ in texts]

    async def _embed_query(text):
        return [0.0] * 1536

    provider.embed_documents = _embed_documents
    provider.embed_query = _embed_query
    return provider


@pytest.fixture
def mock_embedding_provider_384():
    """Returns deterministic 384-dim zero vectors (local BGE dimensions)."""
    provider = MagicMock()
    provider.active_dim = 384

    async def _embed_documents(texts):
        return [[0.0] * 384 for _ in texts]

    async def _embed_query(text):
        return [0.0] * 384

    provider.embed_documents = _embed_documents
    provider.embed_query = _embed_query
    return provider
