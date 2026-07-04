"""
RAGLense - Celery Task Configuration

Defines Celery app and background worker tasks for document processing.
Uses proper async-to-sync bridging for running async pipelines in Celery workers.
"""

import asyncio
import logging
import uuid
from celery import Celery

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Initialize Celery app
celery_app = Celery(
    "raglense_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Config default Celery settings
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,           # Re-queue on worker crash
    worker_prefetch_multiplier=1,  # Don't prefetch multiple tasks
    task_soft_time_limit=600,      # 10 min soft limit
    task_time_limit=660,           # 11 min hard limit
    task_default_retry_delay=30,   # Retry after 30s
    task_max_retries=3,
)


def _run_async(coro):
    """Safely run an async coroutine from a sync Celery task.
    
    Creates a new event loop if one doesn't exist (standard Celery worker),
    or uses the existing loop if available.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If there's already a running loop (e.g., gevent worker), create a new one in a thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


@celery_app.task(
    name="tasks.trigger_ingestion",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
)
def trigger_ingestion(self, document_id_str: str) -> str:
    """Celery background task wrapper for starting document ingestion."""
    logger.info(f"[Celery] Ingestion task started for document {document_id_str} (attempt {self.request.retries + 1})")

    from app.application.ingestion.pipeline import run_ingestion_background
    doc_id = uuid.UUID(document_id_str)

    try:
        _run_async(run_ingestion_background(doc_id))
        logger.info(f"[Celery] Ingestion task completed for document {document_id_str}")
        return f"Ingestion complete for {document_id_str}"
    except Exception as e:
        logger.error(f"[Celery] Ingestion task failed for document {document_id_str}: {e}")
        raise
