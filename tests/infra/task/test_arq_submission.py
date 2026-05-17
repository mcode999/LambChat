from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.infra.task.manager import BackgroundTaskManager
from src.infra.task.status import TaskStatus


class _FakePayloadStore:
    def __init__(self) -> None:
        self.saved: list[tuple[str, dict]] = []

    async def save(self, run_id: str, payload: dict) -> None:
        self.saved.append((run_id, payload))


class _FakeArqPool:
    def __init__(self) -> None:
        self.enqueued: list[tuple[str, tuple, dict]] = []

    async def enqueue_job(self, function: str, *args, **kwargs) -> SimpleNamespace:
        self.enqueued.append((function, args, kwargs))
        return SimpleNamespace(job_id="job-1")


class _FakeExecutor:
    def __init__(self) -> None:
        self.ensure_calls: list[tuple] = []
        self.status_calls: list[tuple] = []

    async def ensure_session(self, *args, **kwargs) -> None:
        self.ensure_calls.append((args, kwargs))

    async def _update_session_status(self, *args, **kwargs) -> None:
        self.status_calls.append((args, kwargs))


@pytest.mark.asyncio
async def test_submit_arq_persists_payload_and_enqueues_job() -> None:
    manager = BackgroundTaskManager()
    fake_executor = _FakeExecutor()
    payload_store = _FakePayloadStore()
    arq_pool = _FakeArqPool()
    manager._executor = fake_executor  # type: ignore[assignment]

    run_id, trace_id = await manager.submit_arq(
        session_id="session-1",
        agent_id="search",
        message="hello",
        user_id="user-1",
        executor_key="agent_stream",
        payload_store=payload_store,
        arq_pool=arq_pool,
        run_id="run-1",
        trace_id="trace-1",
        agent_options={"model": "test"},
        display_message="hello display",
    )

    assert (run_id, trace_id) == ("run-1", "trace-1")
    assert fake_executor.ensure_calls
    assert fake_executor.status_calls[0][0][1] == TaskStatus.QUEUED
    assert payload_store.saved[0][0] == "run-1"
    assert payload_store.saved[0][1]["executor_key"] == "agent_stream"
    assert payload_store.saved[0][1]["trace_id"] == "trace-1"
    assert payload_store.saved[0][1]["display_message"] == "hello display"
    assert arq_pool.enqueued == [("run_agent_task", ("run-1",), {"_job_id": "run-1"})]
