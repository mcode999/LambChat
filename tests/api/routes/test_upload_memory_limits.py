from __future__ import annotations

import pytest
from fastapi import HTTPException

from src.api.routes.upload import _read_upload_file_limited


class ChunkedUpload:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = list(chunks)
        self.read_calls = 0

    async def read(self, size: int = -1) -> bytes:
        del size
        self.read_calls += 1
        if not self._chunks:
            return b""
        return self._chunks.pop(0)


@pytest.mark.asyncio
async def test_read_upload_file_limited_rejects_oversize_without_reading_rest() -> None:
    upload = ChunkedUpload([b"abcd", b"efgh", b"this-should-not-be-read"])

    with pytest.raises(HTTPException) as exc_info:
        await _read_upload_file_limited(upload, max_size_bytes=5, max_size_mb=1, purpose="File")

    assert exc_info.value.status_code == 400
    assert "File size exceeds maximum" in exc_info.value.detail
    assert upload.read_calls == 2


@pytest.mark.asyncio
async def test_read_upload_file_limited_returns_bytes_within_limit() -> None:
    upload = ChunkedUpload([b"abc", b"def", b""])

    data = await _read_upload_file_limited(upload, max_size_bytes=6, max_size_mb=1)

    assert data == b"abcdef"
