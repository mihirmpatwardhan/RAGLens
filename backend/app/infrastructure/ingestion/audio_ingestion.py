"""
RAGLens - Audio/Video Ingestion via faster-whisper (Phase 7)

Transcribes audio and video files to text using faster-whisper (local, free).
Transcripts flow through the same chunk-embed-store pipeline as text documents,
tagged with content_type=audio or content_type=video.

Each chunk stores the source timestamp offset (start_time_s, end_time_s) in
metadata_json so citations can reference "at 12:34 in the recording".

Supported MIME types (add to documents.py SUPPORTED_TYPES):
  - audio/mpeg, audio/mp3, audio/wav, audio/ogg, audio/flac, audio/m4a
  - video/mp4, video/webm, video/mpeg, video/quicktime

Install: pip install faster-whisper
Model sizes: tiny, base, small, medium, large-v2, large-v3
Default: base (~145MB, good accuracy/speed tradeoff)
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class TranscriptSegment:
    """A single timed segment from audio/video transcription."""
    text: str
    start_time_s: float     # seconds from beginning of recording
    end_time_s: float
    language: str | None = None

    def format_timestamp(self) -> str:
        """Format as MM:SS – MM:SS for display in citations."""
        def _fmt(s: float) -> str:
            mins = int(s) // 60
            secs = int(s) % 60
            return f"{mins:02d}:{secs:02d}"
        return f"{_fmt(self.start_time_s)}–{_fmt(self.end_time_s)}"


# Module-level singleton — model loaded once per process
_whisper_model: object | None = None
_whisper_model_size: str | None = None


def _load_whisper_model(model_size: str = "base"):
    """Load (or return cached) faster-whisper model — blocking call."""
    global _whisper_model, _whisper_model_size

    if _whisper_model is not None and _whisper_model_size == model_size:
        return _whisper_model

    try:
        from faster_whisper import WhisperModel  # type: ignore[import-untyped]
        logger.info("Loading faster-whisper model: %s (this may take a moment)...", model_size)
        # device="cpu", compute_type="int8" for portable CPU inference
        _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
        _whisper_model_size = model_size
        logger.info("faster-whisper model '%s' loaded.", model_size)
        return _whisper_model
    except ImportError:
        raise ImportError(
            "faster-whisper is not installed. "
            "Install it with: pip install faster-whisper"
        )


def _sync_transcribe(file_path: Path, model_size: str = "base") -> list[TranscriptSegment]:
    """Synchronous transcription — must run in a thread pool."""
    model = _load_whisper_model(model_size)

    segments_iter, info = model.transcribe(
        str(file_path),
        beam_size=5,
        word_timestamps=False,
    )

    language = info.language if hasattr(info, "language") else None
    result: list[TranscriptSegment] = []

    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        result.append(TranscriptSegment(
            text=text,
            start_time_s=seg.start,
            end_time_s=seg.end,
            language=language,
        ))

    return result


async def transcribe_audio(
    file_path: Path,
    model_size: str = "base",
) -> list[TranscriptSegment]:
    """Async entry point: transcribe an audio/video file with faster-whisper.

    Returns a list of TranscriptSegment objects with timestamps.
    Runs in asyncio.to_thread to avoid blocking the event loop.
    """
    return await asyncio.to_thread(_sync_transcribe, file_path, model_size)


def segments_to_chunks(
    segments: list[TranscriptSegment],
    content_type: str = "audio",
    chunk_window_s: float = 60.0,  # group segments into ~60s chunks
) -> list[dict]:
    """Group transcript segments into chunks for embedding.

    Strategy: accumulate segments until the chunk spans chunk_window_s seconds,
    then start a new chunk. This keeps related speech together while staying
    within embedding token limits.
    """
    import uuid as uuid_mod

    if not segments:
        return []

    result: list[dict] = []
    current_texts: list[str] = []
    current_start: float = segments[0].start_time_s
    current_end: float = segments[0].start_time_s
    chunk_index = 0

    def _flush(start: float, end: float, texts: list[str]) -> dict:
        text = " ".join(texts).strip()
        start_mm = int(start) // 60
        start_ss = int(start) % 60
        end_mm = int(end) // 60
        end_ss = int(end) % 60
        timestamp_label = f"[{start_mm:02d}:{start_ss:02d}–{end_mm:02d}:{end_ss:02d}]"

        return {
            "id": str(uuid_mod.uuid4()),
            "index": chunk_index,
            "text": f"{timestamp_label} {text}",
            "content_type": content_type,
            "page_number": 1,
            "section_title": None,
            "parent_chunk_id": None,
            "token_count": len(text.split()),
            "char_count": len(text),
            "metadata": {
                "start_time_s": start,
                "end_time_s": end,
                "timestamp_label": timestamp_label,
            },
        }

    for seg in segments:
        span = seg.end_time_s - current_start

        if current_texts and span > chunk_window_s:
            result.append(_flush(current_start, current_end, current_texts))
            chunk_index += 1
            current_texts = []
            current_start = seg.start_time_s

        current_texts.append(seg.text)
        current_end = seg.end_time_s

    if current_texts:
        result.append(_flush(current_start, current_end, current_texts))

    return result
