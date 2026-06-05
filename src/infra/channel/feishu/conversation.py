"""Feishu external conversation scope and LambChat session resolution."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from hashlib import sha1
from typing import Any

from src.infra.channel.conversation_storage import ChannelConversationStorage
from src.infra.channel.feishu.handler_helpers import FEISHU_SESSION_KEY_PREFIX
from src.infra.logging import get_logger
from src.kernel.schemas.channel import ChannelType

logger = get_logger(__name__)


@dataclass(frozen=True)
class FeishuConversationScope:
    """Stable Feishu-side conversation scope."""

    scope_type: str
    scope_key: str
    legacy_chat_key: str
    display_name: str
    lock_key: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class FeishuResolvedConversation:
    """Resolved LambChat session for one Feishu-side conversation scope."""

    session_id: str
    scope: FeishuConversationScope


def build_feishu_conversation_scope(
    *,
    chat_id: str,
    sender_id: str | None,
    metadata: dict[str, Any] | None,
    instance_id: str | None,
) -> FeishuConversationScope:
    """Build a stable external scope from a Feishu message handler payload."""
    metadata = dict(metadata or {})
    chat_type = _text(metadata.get("chat_type"))
    if chat_type not in {"p2p", "group"}:
        chat_type = "p2p" if chat_id.startswith(("ou_", "on_", "user_")) else "group"

    sender_open_id = _text(metadata.get("sender_id")) or _text(sender_id)
    local_chat_id, local_thread_id = _split_local_thread_chat_id(chat_id)
    reply_chat_id = _text(metadata.get("reply_chat_id")) or local_chat_id
    thread_id = _text(metadata.get("thread_id"))
    root_id = _text(metadata.get("root_id")) or local_thread_id

    if chat_type == "p2p":
        scope_type = "p2p"
        scope_key = sender_open_id or chat_id
        legacy_chat_key = chat_id
        display_name = f"飞书私聊 · {_scope_label(scope_key)}"
    elif thread_id or root_id or local_thread_id:
        scope_type = "thread"
        thread_key = thread_id or root_id or local_thread_id or ""
        scope_key = f"{reply_chat_id}#{thread_key}"
        legacy_chat_key = chat_id if "#" in chat_id else scope_key
        display_name = f"飞书话题 · {_scope_label(scope_key)}"
    else:
        scope_type = "group"
        scope_key = reply_chat_id or chat_id
        legacy_chat_key = chat_id
        display_name = f"飞书群聊 · {_scope_label(scope_key)}"

    normalized_instance_id = instance_id or "default"
    scope_metadata = _compact_metadata(
        {
            "source": "feishu",
            "channel_type": ChannelType.FEISHU.value,
            "channel_instance_id": normalized_instance_id,
            "external_scope_type": scope_type,
            "external_scope_key": scope_key,
            "feishu_chat_type": chat_type,
            "feishu_chat_id": reply_chat_id,
            "feishu_sender_open_id": sender_open_id,
            "feishu_thread_id": thread_id,
            "feishu_root_id": root_id,
        }
    )

    return FeishuConversationScope(
        scope_type=scope_type,
        scope_key=scope_key,
        legacy_chat_key=legacy_chat_key,
        display_name=display_name,
        lock_key=f"feishu:{normalized_instance_id}:{scope_type}:{scope_key}",
        metadata=scope_metadata,
    )


async def resolve_feishu_conversation(
    *,
    user_id: str,
    chat_id: str,
    sender_id: str | None,
    metadata: dict[str, Any] | None,
    instance_id: str | None,
    scope: FeishuConversationScope | None = None,
    storage: ChannelConversationStorage | None = None,
    session_storage: Any | None = None,
) -> FeishuResolvedConversation:
    """Resolve or create the current LambChat session for a Feishu scope."""
    scope = scope or build_feishu_conversation_scope(
        chat_id=chat_id,
        sender_id=sender_id,
        metadata=metadata,
        instance_id=instance_id,
    )
    storage = storage or ChannelConversationStorage()
    legacy_session_id = await _find_legacy_session_id(scope, session_storage=session_storage)
    session_id = await storage.get_or_create_current_session_id(
        user_id=user_id,
        channel_type=ChannelType.FEISHU,
        channel_instance_id=instance_id,
        external_scope_type=scope.scope_type,
        external_scope_key=scope.scope_key,
        create_session_id=legacy_session_id or generate_feishu_session_id(instance_id),
        metadata=scope.metadata,
    )
    await _cache_legacy_session_id(scope.legacy_chat_key, session_id)
    return FeishuResolvedConversation(session_id=session_id, scope=scope)


async def create_new_feishu_conversation(
    *,
    user_id: str,
    chat_id: str,
    sender_id: str | None,
    metadata: dict[str, Any] | None,
    instance_id: str | None,
    scope: FeishuConversationScope | None = None,
    storage: ChannelConversationStorage | None = None,
) -> FeishuResolvedConversation:
    """Create a new current session mapping for a Feishu scope."""
    scope = scope or build_feishu_conversation_scope(
        chat_id=chat_id,
        sender_id=sender_id,
        metadata=metadata,
        instance_id=instance_id,
    )
    storage = storage or ChannelConversationStorage()
    session_id = await storage.set_current_session_id(
        user_id=user_id,
        channel_type=ChannelType.FEISHU,
        channel_instance_id=instance_id,
        external_scope_type=scope.scope_type,
        external_scope_key=scope.scope_key,
        session_id=generate_feishu_session_id(instance_id),
        metadata=scope.metadata,
    )
    await _cache_legacy_session_id(scope.legacy_chat_key, session_id)
    return FeishuResolvedConversation(session_id=session_id, scope=scope)


def generate_feishu_session_id(instance_id: str | None) -> str:
    """Generate an opaque session id that does not expose Feishu external ids."""
    del instance_id
    return f"feishu_{uuid.uuid4().hex[:20]}"


async def _find_legacy_session_id(
    scope: FeishuConversationScope,
    *,
    session_storage: Any | None = None,
) -> str | None:
    cached = await _get_cached_legacy_session_id(scope.legacy_chat_key)
    if cached:
        return cached

    default_session_id = f"feishu_{scope.legacy_chat_key}"
    if await _session_exists(default_session_id, session_storage=session_storage):
        return default_session_id
    return None


async def _get_cached_legacy_session_id(legacy_chat_key: str) -> str | None:
    try:
        from src.infra.storage.redis import RedisStorage

        storage = RedisStorage()
        value = await storage.get(f"{FEISHU_SESSION_KEY_PREFIX}{legacy_chat_key}")
        return str(value) if value else None
    except Exception as e:
        logger.debug("[Feishu] legacy session cache read failed: %s", e)
        return None


async def _cache_legacy_session_id(legacy_chat_key: str, session_id: str) -> None:
    try:
        from src.infra.storage.redis import RedisStorage

        storage = RedisStorage()
        await storage.set(f"{FEISHU_SESSION_KEY_PREFIX}{legacy_chat_key}", session_id)
    except Exception as e:
        logger.debug("[Feishu] legacy session cache write failed: %s", e)


async def _session_exists(session_id: str, *, session_storage: Any | None = None) -> bool:
    try:
        if session_storage is None:
            from src.infra.session.storage import SessionStorage

            session_storage = SessionStorage()
        return await session_storage.get_by_session_id(session_id) is not None
    except Exception as e:
        logger.debug("[Feishu] legacy session existence check failed: %s", e)
        return False


def _split_local_thread_chat_id(chat_id: str) -> tuple[str, str | None]:
    if "#" not in chat_id:
        return chat_id, None
    chat_part, thread_part = chat_id.split("#", 1)
    return chat_part, thread_part or None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _scope_label(value: str | None, length: int = 8) -> str:
    if not value:
        return "unknown"
    return sha1(value.encode("utf-8")).hexdigest()[:length]


def _compact_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in metadata.items() if value is not None}
