"""Debug logger for LangChain astream_events.

Dumps every raw event from ``astream_events(version="v2")`` to a JSONL file
so developers can inspect the full event stream without a debugger.

Enable via::

    DEBUG_STREAM_EVENTS=true  python -m src.main

Logs are written to ``logs/stream_events_YYYYMMDD_HHMMSS.jsonl``.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from src.infra.async_utils import run_blocking_io

_ENABLED: bool | None = None
_LOG_FILE: Any = None  # TextIO | None


def _is_enabled() -> bool:
    global _ENABLED
    if _ENABLED is None:
        try:
            from src.kernel.config import settings

            _ENABLED = bool(settings.DEBUG_STREAM_EVENTS)
        except Exception:
            _ENABLED = os.getenv("DEBUG_STREAM_EVENTS", "false").lower() in (
                "true",
                "1",
                "yes",
            )
    return _ENABLED


def _get_log_file() -> Any:
    global _LOG_FILE
    if _LOG_FILE is None:
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        path = log_dir / f"stream_events_{time.strftime('%Y%m%d_%H%M%S')}.jsonl"
        _LOG_FILE = open(path, "a", encoding="utf-8")
    return _LOG_FILE


def shutdown() -> None:
    """Close the log file handle. Call during application shutdown."""
    global _LOG_FILE
    if _LOG_FILE is not None:
        try:
            _LOG_FILE.flush()
            _LOG_FILE.close()
        except Exception:
            pass
        _LOG_FILE = None


_SANITIZE_MAX_DEPTH = 10


def _sanitize(obj: Any, _depth: int = 0) -> Any:
    """Make *obj* JSON-serialisable (Pydantic models, AIMessage, etc.)."""
    if _depth > _SANITIZE_MAX_DEPTH:
        return "<truncated>"
    if obj is None or isinstance(obj, (bool, int, float)):
        return obj
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v, _depth + 1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v, _depth + 1) for v in obj]
    # Pydantic BaseModel → dict then recurse
    if hasattr(obj, "model_dump"):
        return _sanitize(obj.model_dump(), _depth + 1)
    # Avoid infinite recursion on Mock / unittest objects
    type_name = type(obj).__name__
    if "Mock" in type_name:
        return f"<{type_name}>"
    if hasattr(obj, "__dict__"):
        try:
            return _sanitize(vars(obj), _depth + 1)
        except Exception:
            return str(obj)
    return str(obj)


async def debug_log_event(event: Any) -> None:
    """Dump the complete raw *event* to the debug JSONL log.

    Every field of the LangChain stream event is preserved so nothing is
    lost.  Non-serialisable objects (Pydantic models, ``AIMessage``, etc.)
    are converted via ``model_dump()`` / ``vars()`` fallback.

    File writes are offloaded to a thread to avoid blocking the event loop.
    """
    if not _is_enabled():
        return

    record: dict[str, Any] = {
        "_ts": time.strftime("%H:%M:%S.") + f"{time.time() % 1:.3f}"[2:],
    }
    record.update(_sanitize(event))

    line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
    log_file = _get_log_file()

    await run_blocking_io(_write_line, log_file, line, timeout=1.0)


def _write_line(log_file: Any, line: str) -> None:
    """Synchronous file write."""
    try:
        log_file.write(line)
        log_file.flush()
    except (ValueError, OSError):
        pass  # File closed or invalid — silently skip
