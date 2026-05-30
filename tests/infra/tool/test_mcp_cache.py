from __future__ import annotations

import pytest

from src.infra.tool import mcp_cache


class _FakeClient:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1


@pytest.fixture(autouse=True)
async def _reset_mcp_cache_state() -> None:
    await mcp_cache.invalidate_all_cache()
    mcp_cache._cache_locks.clear()
    yield
    await mcp_cache.invalidate_all_cache()
    mcp_cache._cache_locks.clear()


@pytest.mark.asyncio
async def test_cleanup_expired_cache_drains_scheduled_client_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _FakeClient()
    mcp_cache._tools_cache["user-1"] = mcp_cache.CachedMCPEntry(
        tools=[],
        client=client,
        config_hash="hash",
    )
    monkeypatch.setattr(mcp_cache.settings, "MCP_USER_CACHE_TTL_SECONDS", 1, raising=False)
    mcp_cache._tools_cache["user-1"].created_at -= 2

    removed = mcp_cache._cleanup_expired_cache()
    await mcp_cache.drain_background_tasks()

    assert removed == 1
    assert client.close_calls == 1
    assert not mcp_cache._background_tasks
