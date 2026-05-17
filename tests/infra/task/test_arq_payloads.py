from __future__ import annotations

import json

import pytest

from src.infra.task.arq_payloads import TaskArqPayloadStore


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expirations: dict[str, int] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.values[key] = value
        if ex is not None:
            self.expirations[key] = ex
        return True

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def delete(self, key: str) -> int:
        existed = key in self.values
        self.values.pop(key, None)
        self.expirations.pop(key, None)
        return int(existed)


@pytest.mark.asyncio
async def test_task_arq_payload_store_round_trips_context() -> None:
    redis = _FakeRedis()
    store = TaskArqPayloadStore(redis=redis, ttl_seconds=60)
    payload = {
        "session_id": "session-1",
        "run_id": "run-1",
        "agent_id": "search",
        "user_id": "user-1",
        "executor_key": "agent_stream",
        "message": "hello",
        "agent_options": {"model": "test"},
    }

    await store.save("run-1", payload)
    loaded = await store.load("run-1")

    assert loaded == payload
    assert redis.expirations["task:arq:payload:run-1"] == 60
    assert json.loads(redis.values["task:arq:payload:run-1"]) == payload


@pytest.mark.asyncio
async def test_task_arq_payload_store_deletes_context() -> None:
    redis = _FakeRedis()
    store = TaskArqPayloadStore(redis=redis, ttl_seconds=60)

    await store.save("run-1", {"run_id": "run-1"})
    deleted = await store.delete("run-1")

    assert deleted is True
    assert await store.load("run-1") is None
