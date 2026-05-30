"""Controlled offloading for unavoidable synchronous IO.

Use this helper for third-party SDK calls and filesystem work that do not have
native async APIs. It keeps those calls off the FastAPI event loop and avoids
unbounded growth of the default executor.
"""

from __future__ import annotations

import asyncio
import functools
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_DEFAULT_MAX_WORKERS = max(4, min(32, (os.cpu_count() or 1) * 4))
_BLOCKING_IO_EXECUTOR = ThreadPoolExecutor(
    max_workers=int(os.getenv("BLOCKING_IO_MAX_WORKERS", _DEFAULT_MAX_WORKERS)),
    thread_name_prefix="blocking-io",
)
_POLL_INTERVAL_SECONDS = 0.01


async def run_blocking_io(
    func: Callable[..., T],
    *args: Any,
    timeout: float | None = None,
    **kwargs: Any,
) -> T:
    """Run a synchronous IO callable without blocking the current event loop."""
    call = functools.partial(func, *args, **kwargs)
    future = _BLOCKING_IO_EXECUTOR.submit(call)

    async def _poll_result() -> T:
        while True:
            if future.done():
                return future.result()
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

    if timeout is not None:
        try:
            return await asyncio.wait_for(_poll_result(), timeout=timeout)
        except asyncio.TimeoutError:
            future.cancel()
            raise
    return await _poll_result()


def shutdown_blocking_io_executor() -> None:
    """Release worker threads during process shutdown.

    Do not wait here: shutdown runs on the application stop path and must not
    hang behind a third-party SDK or filesystem call that failed to return.
    """
    _BLOCKING_IO_EXECUTOR.shutdown(wait=False, cancel_futures=True)
