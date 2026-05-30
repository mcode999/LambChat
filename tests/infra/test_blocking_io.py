from __future__ import annotations

import asyncio
import threading

import pytest

from src.infra.async_utils.blocking import run_blocking_io


@pytest.mark.asyncio
async def test_run_blocking_io_runs_callable_away_from_event_loop_thread() -> None:
    loop_thread = threading.get_ident()

    def blocking_call(value: str, *, suffix: str) -> tuple[str, int]:
        return f"{value}{suffix}", threading.get_ident()

    result, worker_thread = await run_blocking_io(blocking_call, "ok", suffix="-done")

    assert result == "ok-done"
    assert worker_thread != loop_thread


@pytest.mark.asyncio
async def test_run_blocking_io_applies_timeout() -> None:
    def slow_call() -> None:
        import time

        time.sleep(0.2)

    with pytest.raises(asyncio.TimeoutError):
        await run_blocking_io(slow_call, timeout=0.01)


@pytest.mark.asyncio
async def test_run_blocking_io_keeps_slot_until_timed_out_call_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from concurrent.futures import ThreadPoolExecutor

    import src.infra.async_utils.blocking as blocking

    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="test-blocking-io")
    monkeypatch.setattr(blocking, "_BLOCKING_IO_EXECUTOR", executor)

    def slow_call() -> None:
        import time

        time.sleep(0.1)

    with pytest.raises(asyncio.TimeoutError):
        await blocking.run_blocking_io(slow_call, timeout=0.01)

    with pytest.raises(asyncio.TimeoutError):
        await blocking.run_blocking_io(lambda: "second", timeout=0.02)

    await asyncio.sleep(0.12)

    assert await blocking.run_blocking_io(lambda: "released", timeout=0.05) == "released"
    executor.shutdown(wait=True, cancel_futures=True)


@pytest.mark.asyncio
async def test_run_blocking_io_still_completes_after_settings_import() -> None:
    from src.kernel.config import settings

    assert settings is not None

    result = await run_blocking_io(lambda: "ok", timeout=1.0)

    assert result == "ok"
