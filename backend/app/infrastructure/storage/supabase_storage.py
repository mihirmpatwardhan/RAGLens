"""
RAGLense - Supabase Storage Provider

Uploads, downloads, and manages files using Supabase Storage buckets.
Compatible with the FileStorage base interface.
Uses a shared httpx client with timeouts and retry logic.
"""

import logging
from app.core.config import get_settings
from app.infrastructure.storage.file_storage import FileStorage

logger = logging.getLogger(__name__)
settings = get_settings()

# Shared httpx client (created lazily)
_shared_client = None


def _get_shared_client():
    """Get or create a shared httpx.AsyncClient for Supabase requests."""
    global _shared_client
    if _shared_client is None:
        import httpx
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
        )
    return _shared_client


class SupabaseStorage(FileStorage):
    """File storage implementation using Supabase Storage buckets."""

    def __init__(self):
        self.url = settings.SUPABASE_URL
        self.key = settings.SUPABASE_KEY
        self.bucket = settings.SUPABASE_BUCKET_NAME
        self.headers = {
            "Authorization": f"Bearer {self.key}",
            "apikey": self.key,
        }

    def _check_config(self) -> bool:
        """Verify Supabase credentials are configured."""
        if not self.url or not self.key:
            logger.warning("Supabase URL or Key not configured.")
            return False
        return True

    async def upload_file(self, file_path: str, content: bytes) -> str:
        """Upload content to a Supabase storage bucket."""
        if not self._check_config():
            return file_path

        upload_url = f"{self.url}/storage/v1/object/{self.bucket}/{file_path.lstrip('/')}"
        client = _get_shared_client()

        response = await client.post(
            upload_url,
            content=content,
            headers={**self.headers, "Content-Type": "application/octet-stream"},
        )

        # If it already exists, try upserting
        if response.status_code == 400 and "already exists" in response.text:
            response = await client.post(
                upload_url,
                content=content,
                headers={
                    **self.headers,
                    "Content-Type": "application/octet-stream",
                    "x-upsert": "true",
                },
            )

        response.raise_for_status()
        logger.info(f"Uploaded to Supabase bucket '{self.bucket}': {file_path}")
        return f"supabase://{self.bucket}/{file_path}"

    async def download_file(self, file_path: str) -> bytes:
        """Download content from a Supabase storage bucket."""
        if not self._check_config():
            raise ValueError("Supabase storage is not configured (missing URL/Key).")

        download_url = f"{self.url}/storage/v1/object/authenticated/{self.bucket}/{file_path.lstrip('/')}"
        client = _get_shared_client()

        response = await client.get(download_url, headers=self.headers)
        response.raise_for_status()
        return response.content

    async def delete_file(self, file_path: str) -> bool:
        """Delete a file from a Supabase storage bucket."""
        if not self._check_config():
            return False

        delete_url = f"{self.url}/storage/v1/object/{self.bucket}/{file_path.lstrip('/')}"
        client = _get_shared_client()

        response = await client.delete(delete_url, headers=self.headers)
        if response.status_code == 200:
            logger.info(f"Deleted from Supabase storage: {file_path}")
            return True
        return False

    async def exists(self, file_path: str) -> bool:
        """Check if a file exists in a Supabase storage bucket."""
        if not self._check_config():
            return False

        info_url = f"{self.url}/storage/v1/object/info/public/{self.bucket}/{file_path.lstrip('/')}"
        client = _get_shared_client()

        response = await client.get(info_url, headers=self.headers)
        return response.status_code == 200
