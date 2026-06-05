"""Persistent external channel conversation mapping storage."""

import asyncio
from typing import Any

from src.infra.logging import get_logger
from src.infra.storage.mongodb import get_mongo_client
from src.infra.utils.datetime import utc_now_iso
from src.kernel.config import settings
from src.kernel.schemas.channel import ChannelType

logger = get_logger(__name__)


class ChannelConversationStorage:
    """Store the current LambChat session for an external channel conversation scope."""

    _indexes_done = False
    _indexes_task: asyncio.Task | None = None
    _indexes_lock: asyncio.Lock | None = None

    def __init__(self) -> None:
        self._client: Any | None = None
        self._collection: Any | None = None

    def _get_collection(self) -> Any:
        if self._collection is None:
            self._client = get_mongo_client()
            db = self._client[settings.MONGODB_DB]
            self._collection = db["channel_conversations"]
        return self._collection

    async def ensure_indexes_if_needed(self) -> None:
        """Ensure channel conversation indexes exist once per process."""
        cls = type(self)
        if cls._indexes_done:
            return

        if cls._indexes_lock is None:
            cls._indexes_lock = asyncio.Lock()

        async with cls._indexes_lock:
            if cls._indexes_done:
                return
            if cls._indexes_task is None or cls._indexes_task.cancelled():
                cls._indexes_task = asyncio.create_task(self._ensure_indexes())
            task = cls._indexes_task

        succeeded = await task
        if succeeded:
            cls._indexes_done = True
            return

        async with cls._indexes_lock:
            if cls._indexes_task is task:
                cls._indexes_task = None

    async def _ensure_indexes(self) -> bool:
        try:
            collection = self._get_collection()
            await collection.create_index(
                [
                    ("user_id", 1),
                    ("channel_type", 1),
                    ("channel_instance_id", 1),
                    ("external_scope_type", 1),
                    ("external_scope_key", 1),
                ],
                name="channel_conversation_scope_idx",
                unique=True,
                background=True,
            )
            await collection.create_index(
                [("user_id", 1), ("channel_type", 1), ("updated_at", -1)],
                name="channel_conversation_user_updated_idx",
                background=True,
            )
            await collection.create_index(
                [("current_session_id", 1)],
                name="channel_conversation_session_idx",
                background=True,
                sparse=True,
            )
            return True
        except Exception as e:
            logger.warning("Failed to create channel conversation indexes: %s", e)
            return False

    async def get_or_create_current_session_id(
        self,
        *,
        user_id: str,
        channel_type: ChannelType,
        channel_instance_id: str | None,
        external_scope_type: str,
        external_scope_key: str,
        create_session_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Return the current session id, creating the mapping if absent."""
        await self.ensure_indexes_if_needed()
        now = utc_now_iso()
        query = self._scope_query(
            user_id=user_id,
            channel_type=channel_type,
            channel_instance_id=channel_instance_id,
            external_scope_type=external_scope_type,
            external_scope_key=external_scope_key,
        )
        doc = await self._get_collection().find_one_and_update(
            query,
            {
                "$set": {
                    "metadata": dict(metadata or {}),
                    "updated_at": now,
                },
                "$setOnInsert": {
                    **query,
                    "current_session_id": create_session_id,
                    "created_at": now,
                },
            },
            upsert=True,
            return_document=True,
        )
        session_id = (doc or {}).get("current_session_id")
        return str(session_id or create_session_id)

    async def set_current_session_id(
        self,
        *,
        user_id: str,
        channel_type: ChannelType,
        channel_instance_id: str | None,
        external_scope_type: str,
        external_scope_key: str,
        session_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Set the current session id for an external conversation scope."""
        await self.ensure_indexes_if_needed()
        now = utc_now_iso()
        query = self._scope_query(
            user_id=user_id,
            channel_type=channel_type,
            channel_instance_id=channel_instance_id,
            external_scope_type=external_scope_type,
            external_scope_key=external_scope_key,
        )
        await self._get_collection().find_one_and_update(
            query,
            {
                "$set": {
                    "current_session_id": session_id,
                    "metadata": dict(metadata or {}),
                    "updated_at": now,
                },
                "$setOnInsert": {
                    **query,
                    "created_at": now,
                },
            },
            upsert=True,
            return_document=True,
        )
        return session_id

    @staticmethod
    def _scope_query(
        *,
        user_id: str,
        channel_type: ChannelType,
        channel_instance_id: str | None,
        external_scope_type: str,
        external_scope_key: str,
    ) -> dict[str, str]:
        return {
            "user_id": user_id,
            "channel_type": channel_type.value,
            "channel_instance_id": channel_instance_id or "default",
            "external_scope_type": external_scope_type,
            "external_scope_key": external_scope_key,
        }
