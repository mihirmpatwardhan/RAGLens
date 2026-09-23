"""
RAGLense - File Storage Service

Abstract storage interface with local filesystem implementation.
Supports writing, reading, and deleting documents with path traversal protection.
"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path
import shutil

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class FileStorage(ABC):
    """Abstract Base Class for file storage systems."""

    @abstractmethod
    async def upload_file(self, file_path: str, content: bytes) -> str:
        """Upload a file to the storage system and return its path/URI."""
        pass

    @abstractmethod
    async def download_file(self, file_path: str) -> bytes:
        """Download a file from the storage system."""
        pass

    @abstractmethod
    async def delete_file(self, file_path: str) -> bool:
        """Delete a file from the storage system."""
        pass

    @abstractmethod
    async def exists(self, file_path: str) -> bool:
        """Check if a file exists in the storage system."""
        pass


class LocalFileStorage(FileStorage):
    """Local filesystem implementation of FileStorage with path traversal protection."""

    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or settings.STORAGE_LOCAL_PATH).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_safe_path(self, relative_path: str) -> Path:
        """Resolve path and validate it stays within base_path to prevent traversal attacks."""
        # Always treat input as relative, strip any leading slashes
        cleaned = relative_path.lstrip("/").lstrip("\\")
        resolved = (self.base_path / cleaned).resolve()

        # Security check: ensure the resolved path is under base_path. Use
        # pathlib's component-aware check; string-prefix checks incorrectly
        # treat sibling paths such as ``storage_backup`` as children of
        # ``storage``.
        try:
            resolved.relative_to(self.base_path)
        except ValueError:
            raise ValueError(
                f"Path traversal detected: '{relative_path}' resolves outside storage directory."
            )
        return resolved

    async def upload_file(self, file_path: str, content: bytes) -> str:
        target_path = self._get_safe_path(file_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        with open(target_path, "wb") as f:
            f.write(content)

        logger.info(f"Uploaded file to local storage: {target_path}")
        return str(target_path)

    async def download_file(self, file_path: str) -> bytes:
        target_path = self._get_safe_path(file_path)
        if not target_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(target_path, "rb") as f:
            return f.read()

    async def delete_file(self, file_path: str) -> bool:
        target_path = self._get_safe_path(file_path)
        if target_path.exists():
            if target_path.is_dir():
                shutil.rmtree(target_path)
            else:
                target_path.unlink()
            logger.info(f"Deleted from local storage: {target_path}")
            return True
        return False

    async def exists(self, file_path: str) -> bool:
        target_path = self._get_safe_path(file_path)
        return target_path.exists()


# Helper factory function
def get_file_storage() -> FileStorage:
    """Return configured file storage backend."""
    if settings.STORAGE_BACKEND == "supabase":
        from app.infrastructure.storage.supabase_storage import SupabaseStorage
        return SupabaseStorage()
    # Default to local storage (also covers "local", "s3", "minio" for now)
    return LocalFileStorage()
