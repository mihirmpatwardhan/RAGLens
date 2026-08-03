"""
RAGLens - GitHub Repository Ingestion

Clones or pulls a GitHub repository and chunks code by function/class boundaries
using tree-sitter AST-aware splitting. Files are ingested as chunks with:
  - content_type: code
  - metadata: file_path, repo_name, language, function/class name
  - section_title: file path relative to repo root

Supported languages: Python, JavaScript, TypeScript
(Extend by adding tree-sitter grammar packages)

Install: pip install gitpython tree-sitter tree-sitter-python tree-sitter-javascript

Usage::
    from app.infrastructure.ingestion.github_ingestion import ingest_github_repo
    chunks = await ingest_github_repo("https://github.com/owner/repo", clone_dir="/tmp/repos")
"""

from __future__ import annotations

import asyncio
import logging
import uuid as uuid_mod
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Language → file extensions mapping
_LANG_EXTENSIONS: dict[str, list[str]] = {
    "python": [".py"],
    "javascript": [".js", ".jsx"],
    "typescript": [".ts", ".tsx"],
}

# Files/dirs to always skip
_SKIP_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv",
    "dist", "build", ".next", "coverage", ".pytest_cache",
}
_SKIP_EXTENSIONS = {
    ".pyc", ".pyo", ".pyd", ".so", ".dll", ".exe", ".bin",
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico", ".woff",
    ".min.js", ".min.css", ".lock",
}


@dataclass
class CodeChunk:
    """A chunk of code extracted from a repository file."""
    text: str
    content_type: str = "code"
    file_path: str = ""
    repo_name: str = ""
    language: str = ""
    symbol_name: str | None = None   # function/class name if AST-extracted
    start_line: int = 1
    end_line: int = 1
    chunk_index: int = 0


def _clone_or_pull(repo_url: str, clone_dir: Path) -> Path:
    """Clone the repo if not present, or pull latest changes. Blocking."""
    try:
        import git  # type: ignore[import-untyped]
    except ImportError:
        raise ImportError("gitpython is not installed. Run: pip install gitpython")

    repo_name = repo_url.rstrip("/").split("/")[-1].removesuffix(".git")
    target = clone_dir / repo_name

    if target.exists():
        logger.info("Pulling latest from %s...", repo_url)
        repo = git.Repo(target)
        repo.remotes.origin.pull()
    else:
        logger.info("Cloning %s → %s...", repo_url, target)
        clone_dir.mkdir(parents=True, exist_ok=True)
        git.Repo.clone_from(repo_url, target, depth=1)

    return target


def _detect_language(file_path: Path) -> str | None:
    """Return the language name for a file path based on extension."""
    ext = file_path.suffix.lower()
    for lang, exts in _LANG_EXTENSIONS.items():
        if ext in exts:
            return lang
    return None


def _try_ast_split_python(source: str, file_path: str, repo_name: str) -> list[dict]:
    """Split Python source by function/class definitions using tree-sitter."""
    try:
        import tree_sitter_python as tspython  # type: ignore[import-untyped]
        from tree_sitter import Language, Parser  # type: ignore[import-untyped]
    except ImportError:
        return []

    PY_LANGUAGE = Language(tspython.language())
    parser = Parser(PY_LANGUAGE)
    tree = parser.parse(source.encode())

    chunks: list[dict] = []
    lines = source.splitlines(keepends=True)

    def _extract_node(node, symbol_name: str | None = None):
        if node.type in ("function_definition", "class_definition"):
            name_node = node.child_by_field_name("name")
            name = name_node.text.decode() if name_node else "unknown"
            start = node.start_point[0]
            end = node.end_point[0]
            text = "".join(lines[start:end + 1])
            chunks.append({
                "id": str(uuid_mod.uuid4()),
                "text": text,
                "content_type": "code",
                "file_path": file_path,
                "repo_name": repo_name,
                "language": "python",
                "symbol_name": name,
                "start_line": start + 1,
                "end_line": end + 1,
            })
        for child in node.children:
            _extract_node(child)

    _extract_node(tree.root_node)
    return chunks


def _try_ast_split_js_ts(source: str, file_path: str, repo_name: str, language: str) -> list[dict]:
    """Split JS/TS source by function/class definitions using tree-sitter."""
    try:
        if language == "javascript":
            import tree_sitter_javascript as tsjs  # type: ignore[import-untyped]
            lang_obj = tsjs.language()
        else:
            import tree_sitter_typescript as tsts  # type: ignore[import-untyped]
            lang_obj = tsts.language_typescript()

        from tree_sitter import Language, Parser  # type: ignore[import-untyped]
    except ImportError:
        return []

    JS_LANGUAGE = Language(lang_obj)
    parser = Parser(JS_LANGUAGE)
    tree = parser.parse(source.encode())
    lines = source.splitlines(keepends=True)

    chunks: list[dict] = []
    _FUNCTION_TYPES = {
        "function_declaration", "method_definition", "class_declaration",
        "arrow_function", "function_expression",
    }

    def _extract_node(node):
        if node.type in _FUNCTION_TYPES:
            name_node = node.child_by_field_name("name")
            name = name_node.text.decode() if name_node else node.type
            start = node.start_point[0]
            end = node.end_point[0]
            text = "".join(lines[start:end + 1])
            if len(text.strip()) > 20:  # Skip trivial stubs
                chunks.append({
                    "id": str(uuid_mod.uuid4()),
                    "text": text,
                    "content_type": "code",
                    "file_path": file_path,
                    "repo_name": repo_name,
                    "language": language,
                    "symbol_name": name,
                    "start_line": start + 1,
                    "end_line": end + 1,
                })
        for child in node.children:
            _extract_node(child)

    _extract_node(tree.root_node)
    return chunks


def _chunk_file(
    file_path: Path,
    repo_root: Path,
    repo_name: str,
    language: str,
    max_chunk_chars: int = 2000,
) -> list[dict]:
    """Chunk a single source file into code chunks.

    Strategy:
      1. Try AST-aware splitting (tree-sitter) by function/class
      2. Fall back to sliding window on raw text if AST fails or produces nothing
    """
    try:
        source = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        logger.warning("Failed to read %s: %s", file_path, exc)
        return []

    if not source.strip():
        return []

    relative_path = str(file_path.relative_to(repo_root))

    # Try AST splitting
    if language == "python":
        chunks = _try_ast_split_python(source, relative_path, repo_name)
    elif language in ("javascript", "typescript"):
        chunks = _try_ast_split_js_ts(source, relative_path, repo_name, language)
    else:
        chunks = []

    if chunks:
        return chunks

    # Fallback: naive sliding window chunking by lines
    lines = source.splitlines(keepends=True)
    result: list[dict] = []
    chunk_lines: list[str] = []
    char_count = 0
    chunk_idx = 0
    start_line = 1

    for i, line in enumerate(lines, start=1):
        chunk_lines.append(line)
        char_count += len(line)
        if char_count >= max_chunk_chars:
            text = "".join(chunk_lines)
            result.append({
                "id": str(uuid_mod.uuid4()),
                "text": text,
                "content_type": "code",
                "file_path": relative_path,
                "repo_name": repo_name,
                "language": language,
                "symbol_name": None,
                "start_line": start_line,
                "end_line": i,
                "index": chunk_idx,
            })
            chunk_idx += 1
            chunk_lines = []
            char_count = 0
            start_line = i + 1

    if chunk_lines:
        result.append({
            "id": str(uuid_mod.uuid4()),
            "text": "".join(chunk_lines),
            "content_type": "code",
            "file_path": relative_path,
            "repo_name": repo_name,
            "language": language,
            "symbol_name": None,
            "start_line": start_line,
            "end_line": len(lines),
            "index": chunk_idx,
        })

    return result


def _sync_ingest_repo(
    repo_url: str,
    clone_dir: Path,
    max_file_bytes: int = 500_000,  # skip files > 500KB
) -> list[dict]:
    """Synchronous: clone repo and produce all code chunks."""
    repo_root = _clone_or_pull(repo_url, clone_dir)
    repo_name = repo_root.name

    all_chunks: list[dict] = []
    chunk_index = 0

    for file_path in repo_root.rglob("*"):
        # Skip non-files, hidden dirs, build artifacts
        if not file_path.is_file():
            continue
        if any(part.startswith(".") or part in _SKIP_DIRS for part in file_path.parts):
            continue
        if file_path.suffix.lower() in _SKIP_EXTENSIONS:
            continue
        try:
            if file_path.stat().st_size > max_file_bytes:
                logger.debug("Skipping large file: %s", file_path)
                continue
        except Exception:
            continue

        language = _detect_language(file_path)
        if language is None:
            continue

        file_chunks = _chunk_file(file_path, repo_root, repo_name, language)
        for _i, chunk in enumerate(file_chunks):
            chunk["index"] = chunk_index
            chunk["page_number"] = 1
            chunk["section_title"] = chunk["file_path"]
            chunk["parent_chunk_id"] = None
            chunk["token_count"] = len(chunk["text"].split())
            chunk["char_count"] = len(chunk["text"])
            chunk.setdefault("id", str(uuid_mod.uuid4()))
            chunk_index += 1
            all_chunks.append(chunk)

    logger.info(
        "GitHub ingestion: %d code chunks from repo '%s'",
        len(all_chunks),
        repo_name,
    )
    return all_chunks


async def ingest_github_repo(
    repo_url: str,
    clone_dir: str = "./storage/repos",
) -> list[dict]:
    """Async entry point: clone/pull a GitHub repo and produce code chunks.

    Returns a list of chunk dicts ready for embedding and vector store storage.
    Each chunk has content_type='code' and metadata including file_path and language.
    """
    clone_path = Path(clone_dir)
    return await asyncio.to_thread(_sync_ingest_repo, repo_url, clone_path)
