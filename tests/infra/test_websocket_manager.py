from __future__ import annotations

import json

import pytest

from src.infra.websocket import ConnectionManager


class _FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = 0
        self.sent_texts: list[str] = []

    async def accept(self) -> None:
        self.accepted += 1

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


class _FailingWebSocket(_FakeWebSocket):
    async def send_text(self, text: str) -> None:
        raise RuntimeError("socket closed")


class _FakeRedisClient:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expirations: dict[str, int] = {}
        self.published: list[tuple[str, str]] = []
        self.publish_subscriber_count = 1

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.values[key] = value
        if ex is not None:
            self.expirations[key] = ex
        return True

    async def delete(self, key: str) -> int:
        existed = key in self.values
        self.values.pop(key, None)
        self.expirations.pop(key, None)
        return 1 if existed else 0

    async def keys(self, pattern: str) -> list[str]:
        if pattern.endswith("*"):
            prefix = pattern[:-1]
            return sorted(key for key in self.values if key.startswith(prefix))
        return [pattern] if pattern in self.values else []

    async def scan(
        self,
        cursor: int = 0,
        match: str | None = None,
        count: int | None = None,
    ) -> tuple[int, list[str]]:
        del count
        if not match:
            return 0, []
        keys = await self.keys(match)
        if cursor == 0:
            midpoint = max(1, len(keys) // 2)
            return (1 if len(keys) > midpoint else 0), keys[:midpoint]
        return 0, keys[max(1, len(keys) // 2) :]

    async def publish(self, channel: str, message: str) -> int:
        self.published.append((channel, message))
        return self.publish_subscriber_count


class _ScanOnlyRedisClient(_FakeRedisClient):
    async def keys(self, pattern: str) -> list[str]:
        raise AssertionError(f"Redis KEYS must not be used for pattern {pattern}")

    async def scan(
        self,
        cursor: int = 0,
        match: str | None = None,
        count: int | None = None,
    ) -> tuple[int, list[str]]:
        del count
        if not match:
            return 0, []
        if match.endswith("*"):
            prefix = match[:-1]
            keys = sorted(key for key in self.values if key.startswith(prefix))
        else:
            keys = [match] if match in self.values else []
        if cursor == 0:
            midpoint = max(1, len(keys) // 2)
            return (1 if len(keys) > midpoint else 0), keys[:midpoint]
        return 0, keys[max(1, len(keys) // 2) :]


class _FakeHub:
    def __init__(self) -> None:
        self.subscriptions: list[tuple[str, object]] = []
        self.unsubscribed: list[str] = []
        self.start_calls = 0
        self.stop_if_idle_calls = 0

    def subscribe(self, channel: str, handler) -> str:
        token = f"token-{len(self.subscriptions) + 1}"
        self.subscriptions.append((channel, handler))
        return token

    def unsubscribe(self, token: str) -> None:
        self.unsubscribed.append(token)

    async def start(self) -> None:
        self.start_calls += 1

    async def stop_if_idle(self) -> None:
        self.stop_if_idle_calls += 1


@pytest.mark.asyncio
async def test_connect_registers_user_route_in_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_redis = _FakeRedisClient()
    isolated_pool_flags: list[bool] = []
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: isolated_pool_flags.append(isolated_pool) or fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"
    websocket = _FakeWebSocket()

    await manager.connect(websocket, "user-1")

    assert fake_redis.values["ws:route:user-1:instance-a"] == "1"
    assert fake_redis.expirations["ws:route:user-1:instance-a"] > 0
    assert isolated_pool_flags == [True]


@pytest.mark.asyncio
async def test_disconnect_removes_route_when_last_local_connection_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"
    websocket = _FakeWebSocket()

    await manager.connect(websocket, "user-1")
    await manager.disconnect(websocket, "user-1")

    assert "ws:route:user-1:instance-a" not in fake_redis.values


@pytest.mark.asyncio
async def test_send_to_user_uses_instance_targeted_channels(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    fake_redis.values["ws:route:user-1:instance-a"] = "1"
    fake_redis.values["ws:route:user-1:instance-b"] = "2"
    isolated_pool_flags: list[bool] = []
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: isolated_pool_flags.append(isolated_pool) or fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"

    sent = await manager.send_to_user_with_broadcast(
        "user-1",
        {"type": "task:complete", "data": {"run_id": "run-1"}},
    )

    assert sent == 2
    assert fake_redis.published == [
        (
            "ws:deliver:instance-a",
            json.dumps(
                {
                    "user_id": "user-1",
                    "message": {"type": "task:complete", "data": {"run_id": "run-1"}},
                    "source_instance_id": "instance-a",
                }
            ),
        ),
        (
            "ws:deliver:instance-b",
            json.dumps(
                {
                    "user_id": "user-1",
                    "message": {"type": "task:complete", "data": {"run_id": "run-1"}},
                    "source_instance_id": "instance-a",
                }
            ),
        ),
    ]
    assert isolated_pool_flags == [True]


@pytest.mark.asyncio
async def test_send_to_user_scans_routes_without_blocking_redis_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _ScanOnlyRedisClient()
    fake_redis.values["ws:route:user-1:instance-a"] = "1"
    fake_redis.values["ws:route:user-1:instance-b"] = "2"
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"

    sent = await manager.send_to_user_with_broadcast(
        "user-1",
        {"type": "task:complete", "data": {"run_id": "run-1"}},
    )

    assert sent == 2
    assert [channel for channel, _ in fake_redis.published] == [
        "ws:deliver:instance-a",
        "ws:deliver:instance-b",
    ]


@pytest.mark.asyncio
async def test_send_to_user_reports_zero_when_route_channel_has_no_subscribers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    fake_redis.values["ws:route:user-1:instance-a"] = "1"
    fake_redis.publish_subscriber_count = 0
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"

    sent = await manager.send_to_user_with_broadcast(
        "user-1",
        {"type": "task:complete", "data": {"run_id": "run-1"}},
    )

    assert sent == 0


@pytest.mark.asyncio
async def test_listener_subscribes_to_instance_delivery_channel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_hub = _FakeHub()
    monkeypatch.setattr("src.infra.websocket.get_pubsub_hub", lambda: fake_hub)

    manager = ConnectionManager()
    manager._instance_id = "instance-a"

    await manager.start_pubsub_listener()

    assert fake_hub.start_calls == 1
    assert fake_hub.subscriptions[0][0] == "ws:deliver:instance-a"

    await manager.stop_pubsub_listener()


@pytest.mark.asyncio
async def test_delivery_message_for_local_instance_reaches_connected_websocket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"
    websocket = _FakeWebSocket()
    await manager.connect(websocket, "user-1", accept=False)

    await manager._handle_pubsub_message(
        {
            "data": json.dumps(
                {
                    "user_id": "user-1",
                    "message": {"type": "task:complete", "data": {"run_id": "run-1"}},
                    "source_instance_id": "instance-b",
                }
            )
        }
    )

    assert websocket.sent_texts == [
        json.dumps(
            {"type": "task:complete", "data": {"run_id": "run-1"}},
            ensure_ascii=False,
        )
    ]


@pytest.mark.asyncio
async def test_failed_send_cleans_up_empty_connection_bucket_and_refresh_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: fake_redis,
    )

    manager = ConnectionManager()
    manager._instance_id = "instance-a"
    websocket = _FailingWebSocket()

    await manager.connect(websocket, "user-1", accept=False)

    assert "user-1" in manager._connections
    assert "user-1" in manager._route_refresh_tasks

    sent = await manager._send_to_user_local(
        "user-1",
        {"type": "task:complete", "data": {"run_id": "run-1"}},
    )

    assert sent == 0
    assert "user-1" not in manager._connections
    assert "user-1" not in manager._route_refresh_tasks


@pytest.mark.asyncio
async def test_route_refresh_task_cleans_itself_up_when_it_exits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    monkeypatch.setattr(
        "src.infra.websocket.create_redis_client",
        lambda isolated_pool=False: fake_redis,
    )

    async def _sleep(_: float) -> None:
        return None

    monkeypatch.setattr("src.infra.websocket.asyncio.sleep", _sleep)

    manager = ConnectionManager()
    manager._instance_id = "instance-a"
    websocket = _FakeWebSocket()

    await manager.connect(websocket, "user-1", accept=False)
    manager._connections["user-1"].clear()

    task = manager._route_refresh_tasks["user-1"]
    await task

    assert "user-1" not in manager._route_refresh_tasks
