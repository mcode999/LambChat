from __future__ import annotations

import pytest

from src.infra.session.manager import SessionManager


class _FileRecordStorage:
    def __init__(self) -> None:
        self.deleted_keys: list[str] = []

    async def find_by_key(self, key: str) -> dict:
        return {"key": key, "reference_count": 0}

    async def delete_by_key(self, key: str) -> bool:
        self.deleted_keys.append(key)
        return True


@pytest.mark.asyncio
async def test_cleanup_unreferenced_files_skips_storage_when_s3_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = SessionManager()
    file_records = _FileRecordStorage()
    manager._file_record_storage = file_records

    monkeypatch.setattr("src.infra.session.manager.get_s3_enabled", lambda: False)

    def fail_get_storage_service():
        raise AssertionError("S3 storage should not be used when S3 is disabled")

    monkeypatch.setattr("src.infra.session.manager.get_storage_service", fail_get_storage_service)

    cleaned = await manager._cleanup_unreferenced_files(["attachments/u1/missing.png"])

    assert cleaned == 1
    assert file_records.deleted_keys == ["attachments/u1/missing.png"]
