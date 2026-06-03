from __future__ import annotations

from datetime import datetime, timezone

import pytest
from bson import ObjectId

from src.infra.share.storage import ShareStorage
from src.kernel.schemas.share import ShareType, ShareVisibility


class _FakeShareCollection:
    def __init__(self, doc: dict) -> None:
        self.doc = doc

    async def find_one(self, query: dict):
        assert query == {"share_id": "legacy-share"}
        return dict(self.doc)


@pytest.mark.asyncio
async def test_get_by_share_id_defaults_legacy_share_fields() -> None:
    created_at = datetime(2026, 4, 25, tzinfo=timezone.utc)
    storage = ShareStorage()
    storage._collection = _FakeShareCollection(
        {
            "_id": ObjectId(),
            "share_id": "legacy-share",
            "session_id": "session-1",
            "owner_id": "owner-1",
            "created_at": created_at,
        }
    )

    share = await storage.get_by_share_id("legacy-share")

    assert share is not None
    assert share.share_type == ShareType.FULL
    assert share.visibility == ShareVisibility.PUBLIC
    assert share.run_ids is None
    assert share.updated_at == created_at
