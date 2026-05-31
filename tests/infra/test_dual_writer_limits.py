from __future__ import annotations

import pytest

from src.infra.session import dual_writer


def test_dual_writer_limits_follow_runtime_settings(monkeypatch) -> None:
    monkeypatch.setattr(
        dual_writer.settings,
        "SESSION_EVENT_MONGO_BUFFER_MAX",
        123,
        raising=False,
    )
    monkeypatch.setattr(
        dual_writer.settings,
        "SESSION_EVENT_TTL_CACHE_MAX",
        456,
        raising=False,
    )

    assert dual_writer._get_mongo_buffer_max() == 123
    assert dual_writer._get_ttl_set_keys_max() == 456


def test_dual_writer_live_stream_read_timeout_is_24_hours() -> None:
    assert dual_writer._LIVE_STREAM_READ_TIMEOUT_SECONDS == 24 * 60 * 60


def test_dual_writer_idle_xread_block_matches_heartbeat_interval() -> None:
    assert dual_writer._SSE_HEARTBEAT_INTERVAL_SECONDS == 15
    assert dual_writer._REDIS_XREAD_BLOCK_MS == 5_000


class _FakeRedis:
    def __init__(self) -> None:
        self.xadd_calls: list[tuple[str, dict]] = []
        self.ttl_calls: list[str] = []
        self.expire_calls: list[tuple[str, int]] = []

    async def xadd(self, stream_key: str, fields: dict) -> None:
        self.xadd_calls.append((stream_key, fields))

    async def ttl(self, stream_key: str) -> int:
        self.ttl_calls.append(stream_key)
        return -1

    async def expire(self, stream_key: str, ttl: int) -> None:
        self.expire_calls.append((stream_key, ttl))

    async def xrange(self, stream_key: str, min: str = "-", max: str = "+") -> list:
        return []

    async def xread(self, streams: dict[str, str], block: int | None = None) -> list:
        return []


@pytest.mark.asyncio
async def test_dual_writer_refreshes_ttl_for_long_running_streams(monkeypatch) -> None:
    fake_redis = _FakeRedis()
    writer = dual_writer.DualEventWriter()
    writer._redis = fake_redis

    now = 1000.0
    monkeypatch.setattr(dual_writer.time, "monotonic", lambda: now)
    monkeypatch.setattr(dual_writer.settings, "SSE_CACHE_TTL", 86400, raising=False)

    await writer._write_to_redis_direct("session:s1:run:r1:events", {"event_type": "chunk"})
    await writer._write_to_redis_direct("session:s1:run:r1:events", {"event_type": "chunk"})

    assert fake_redis.expire_calls == [("session:s1:run:r1:events", 86400)]

    now += 301
    await writer._write_to_redis_direct("session:s1:run:r1:events", {"event_type": "chunk"})

    assert fake_redis.expire_calls == [
        ("session:s1:run:r1:events", 86400),
        ("session:s1:run:r1:events", 86400),
    ]


@pytest.mark.asyncio
async def test_dual_writer_shortens_terminal_stream_ttl() -> None:
    fake_redis = _FakeRedis()
    writer = dual_writer.DualEventWriter()
    writer._redis = fake_redis
    writer._ttl_set_keys["session:s1:run:r1:events"] = 1234.0

    await writer.expire_stream("s1", run_id="r1", ttl_seconds=60)

    assert fake_redis.expire_calls == [("session:s1:run:r1:events", 60)]
    assert "session:s1:run:r1:events" not in writer._ttl_set_keys
