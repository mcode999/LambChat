from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.infra.task import arq_worker


class _FakePayloadStore:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.deleted: list[str] = []

    async def load(self, run_id: str):
        return self.payload if run_id == self.payload["run_id"] else None

    async def delete(self, run_id: str) -> bool:
        self.deleted.append(run_id)
        return True


class _FakeTaskExecutor:
    def __init__(self) -> None:
        self.run_calls: list[dict] = []

    async def run_task(self, **kwargs) -> None:
        self.run_calls.append(kwargs)


@pytest.mark.asyncio
async def test_run_agent_task_loads_payload_and_invokes_executor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "session_id": "session-1",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "agent_id": "search",
        "message": "hello",
        "display_message": "hello display",
        "user_id": "user-1",
        "executor_key": "agent_stream",
        "user_message_written": True,
        "agent_options": {"model": "test"},
    }
    payload_store = _FakePayloadStore(payload)
    task_executor = _FakeTaskExecutor()
    task_manager = SimpleNamespace(
        _run_info={},
        _ensure_executor=lambda: task_executor,
    )

    async def _executor_fn(*args, **kwargs):
        if False:
            yield None

    monkeypatch.setattr(arq_worker, "get_task_manager", lambda: task_manager)
    monkeypatch.setattr(arq_worker, "get_registered_executor", lambda key: _executor_fn)

    await arq_worker.run_agent_task({"payload_store": payload_store}, "run-1")

    assert task_executor.run_calls
    assert task_executor.run_calls[0]["session_id"] == "session-1"
    assert task_executor.run_calls[0]["existing_trace_id"] == "trace-1"
    assert task_executor.run_calls[0]["executor"] is _executor_fn
    assert task_manager._run_info["run-1"]["trace_id"] == "trace-1"
    assert payload_store.deleted == ["run-1"]
