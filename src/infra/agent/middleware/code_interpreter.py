"""Optional QuickJS code interpreter middleware for Deep Agents."""

from __future__ import annotations

from typing import Any

from src.infra.logging import get_logger
from src.kernel.config import settings

logger = get_logger(__name__)


def _is_enabled_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "enabled", "enable"}
    return False


def create_code_interpreter_middleware(agent_options: dict[str, Any] | None) -> list[Any]:
    """Create CodeInterpreterMiddleware only when globally and per-run enabled."""
    if not getattr(settings, "ENABLE_CODE_INTERPRETER", False):
        return []

    if not _is_enabled_value((agent_options or {}).get("enable_code_interpreter")):
        return []

    try:
        from langchain_quickjs import CodeInterpreterMiddleware
    except ImportError:
        logger.warning(
            "Code interpreter requested but langchain_quickjs is not installed; skipping"
        )
        return []

    return [CodeInterpreterMiddleware()]
