from __future__ import annotations

from typing import Any

import pytest

from src.infra.channel.feishu import conversation as feishu_conversation
from src.kernel.schemas.channel import ChannelType


class _FakeConversationStorage:
    def __init__(self) -> None:
        self.sessions: dict[tuple[str, str, str, str, str], str] = {}
        self.create_calls: list[dict[str, Any]] = []
        self.set_calls: list[dict[str, Any]] = []

    async def get_or_create_current_session_id(self, **kwargs: Any) -> str:
        assert kwargs["channel_type"] == ChannelType.FEISHU
        key = self._key(kwargs)
        self.create_calls.append(kwargs)
        if key not in self.sessions:
            self.sessions[key] = kwargs["create_session_id"]
        return self.sessions[key]

    async def set_current_session_id(self, **kwargs: Any) -> str:
        assert kwargs["channel_type"] == ChannelType.FEISHU
        key = self._key(kwargs)
        self.set_calls.append(kwargs)
        self.sessions[key] = kwargs["session_id"]
        return kwargs["session_id"]

    @staticmethod
    def _key(kwargs: dict[str, Any]) -> tuple[str, str, str, str, str]:
        return (
            kwargs["user_id"],
            kwargs["channel_type"].value,
            kwargs.get("channel_instance_id") or "default",
            kwargs["external_scope_type"],
            kwargs["external_scope_key"],
        )


class _FakeSessionStorage:
    def __init__(self, existing: set[str] | None = None) -> None:
        self.existing = existing or set()

    async def get_by_session_id(self, session_id: str):
        return object() if session_id in self.existing else None


@pytest.fixture(autouse=True)
def _disable_redis_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _no_cached_session(_legacy_chat_key: str) -> str | None:
        return None

    async def _ignore_cache_write(_legacy_chat_key: str, _session_id: str) -> None:
        return None

    monkeypatch.setattr(feishu_conversation, "_get_cached_legacy_session_id", _no_cached_session)
    monkeypatch.setattr(feishu_conversation, "_cache_legacy_session_id", _ignore_cache_write)


@pytest.mark.asyncio
async def test_p2p_users_resolve_to_separate_opaque_sessions() -> None:
    storage = _FakeConversationStorage()

    first = await feishu_conversation.resolve_feishu_conversation(
        user_id="owner-1",
        chat_id="ou_user_a",
        sender_id="ou_user_a",
        metadata={"chat_type": "p2p", "reply_chat_id": "oc_p2p_a"},
        instance_id="instance-1",
        storage=storage,
        session_storage=_FakeSessionStorage(),
    )
    second = await feishu_conversation.resolve_feishu_conversation(
        user_id="owner-1",
        chat_id="ou_user_b",
        sender_id="ou_user_b",
        metadata={"chat_type": "p2p", "reply_chat_id": "oc_p2p_b"},
        instance_id="instance-1",
        storage=storage,
        session_storage=_FakeSessionStorage(),
    )

    assert first.scope.scope_type == "p2p"
    assert first.scope.scope_key == "ou_user_a"
    assert second.scope.scope_key == "ou_user_b"
    assert first.session_id != second.session_id
    assert "ou_user_a" not in first.session_id
    assert "ou_user_b" not in second.session_id
    assert "ou_user_a" not in first.scope.display_name


@pytest.mark.asyncio
async def test_resolver_adopts_existing_legacy_session_id() -> None:
    storage = _FakeConversationStorage()

    resolved = await feishu_conversation.resolve_feishu_conversation(
        user_id="owner-1",
        chat_id="ou_legacy",
        sender_id="ou_legacy",
        metadata={"chat_type": "p2p", "reply_chat_id": "oc_p2p"},
        instance_id="instance-1",
        storage=storage,
        session_storage=_FakeSessionStorage(existing={"feishu_ou_legacy"}),
    )

    assert resolved.session_id == "feishu_ou_legacy"
    assert storage.create_calls[0]["create_session_id"] == "feishu_ou_legacy"


@pytest.mark.asyncio
async def test_new_command_switches_current_session_for_same_scope() -> None:
    storage = _FakeConversationStorage()
    kwargs = {
        "user_id": "owner-1",
        "chat_id": "ou_user_a",
        "sender_id": "ou_user_a",
        "metadata": {"chat_type": "p2p", "reply_chat_id": "oc_p2p_a"},
        "instance_id": "instance-1",
        "storage": storage,
    }

    initial = await feishu_conversation.resolve_feishu_conversation(
        **kwargs,
        session_storage=_FakeSessionStorage(),
    )
    created = await feishu_conversation.create_new_feishu_conversation(**kwargs)
    resolved_again = await feishu_conversation.resolve_feishu_conversation(
        **kwargs,
        session_storage=_FakeSessionStorage(),
    )

    assert created.session_id != initial.session_id
    assert resolved_again.session_id == created.session_id
    assert "ou_user_a" not in created.session_id


def test_thread_scope_prefers_thread_id_and_keeps_root_legacy_key() -> None:
    scope = feishu_conversation.build_feishu_conversation_scope(
        chat_id="oc_group#om_root",
        sender_id="ou_sender",
        metadata={
            "chat_type": "group",
            "reply_chat_id": "oc_group",
            "thread_id": "omt_thread",
            "root_id": "om_root",
        },
        instance_id="instance-1",
    )

    assert scope.scope_type == "thread"
    assert scope.scope_key == "oc_group#omt_thread"
    assert scope.legacy_chat_key == "oc_group#om_root"
    assert scope.metadata["feishu_thread_id"] == "omt_thread"
    assert scope.metadata["feishu_root_id"] == "om_root"
