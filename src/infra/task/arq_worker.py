from __future__ import annotations

from typing import Any

from src.infra.logging import get_logger

from .arq_payloads import TaskArqPayloadStore
from .concurrency import get_registered_executor
from .manager import get_task_manager

logger = get_logger(__name__)


async def run_agent_task(ctx: dict[str, Any], run_id: str) -> None:
    """Run a previously persisted LambChat task from an arq worker."""
    payload_store: TaskArqPayloadStore = ctx.get("payload_store") or TaskArqPayloadStore()
    payload = await payload_store.load(run_id)
    if payload is None:
        logger.warning("Missing arq task payload for run_id=%s", run_id)
        return

    executor_fn = get_registered_executor(str(payload["executor_key"]))
    if executor_fn is None:
        logger.error("No executor registered for arq task run_id=%s", run_id)
        return

    task_manager = get_task_manager()
    task_executor = task_manager._ensure_executor()
    task_manager._run_info[run_id] = {
        "session_id": payload["session_id"],
        "trace_id": payload.get("trace_id"),
        "agent_id": payload["agent_id"],
        "user_id": payload["user_id"],
        "user_message_written": payload.get("user_message_written", False),
    }

    try:
        await task_executor.run_task(
            session_id=payload["session_id"],
            run_id=run_id,
            agent_id=payload["agent_id"],
            message=payload["message"],
            user_id=payload["user_id"],
            executor=executor_fn,
            disabled_tools=payload.get("disabled_tools"),
            agent_options=payload.get("agent_options"),
            attachments=payload.get("attachments"),
            existing_trace_id=payload.get("trace_id"),
            user_message_written=payload.get("user_message_written", False),
            disabled_skills=payload.get("disabled_skills"),
            enabled_skills=payload.get("enabled_skills"),
            persona_system_prompt=payload.get("persona_system_prompt"),
            disabled_mcp_tools=payload.get("disabled_mcp_tools"),
            display_message=payload.get("display_message"),
        )
    finally:
        await payload_store.delete(run_id)


class WorkerSettings:
    functions = [run_agent_task]
