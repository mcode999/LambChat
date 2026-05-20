from __future__ import annotations

from types import SimpleNamespace

import pytest


class _FakeDeepAgent:
    def __init__(self) -> None:
        self.captured_create_kwargs = None
        self.captured_inner_config = None

    def with_config(self, _config):
        return self

    async def astream_events(self, _initial_state, config, version="v2"):
        self.captured_inner_config = config
        if False:
            yield version

    async def aget_state(self, _config):
        return SimpleNamespace(values={"messages": []})


class _FakeEventProcessor:
    next_output_text = ""

    def __init__(self, *_args, **_kwargs) -> None:
        self.output_text = self.next_output_text

    async def process_event(self, _event) -> None:
        return None

    async def flush(self) -> None:
        return None

    async def finalize(self) -> None:
        self.output_text = ""
        return None

    def clear(self) -> None:
        return None


class _FakeDeferredManager:
    def __init__(self) -> None:
        self.fork_calls: list[str] = []
        self.forked = SimpleNamespace(label="subagent-deferred-manager")
        self.discovered_count = 0
        self.discovered_names: list[str] = []

    def fork_for_scope(self, scope: str):
        self.fork_calls.append(scope)
        return self.forked


def _patch_common(monkeypatch: pytest.MonkeyPatch, module, fake_graph: _FakeDeepAgent) -> None:
    async def fake_get_model(**_kwargs):
        return object()

    async def fake_resolve_fallback_model(*_args, **_kwargs):
        return None

    async def fake_checkpointer(**_kwargs):
        return object()

    async def fake_store():
        return object()

    async def fake_emit_token_usage(*_args, **_kwargs):
        return None

    monkeypatch.setattr(module.LLMClient, "get_model", fake_get_model)
    monkeypatch.setattr(module, "resolve_fallback_model", fake_resolve_fallback_model)
    monkeypatch.setattr(module, "get_async_checkpointer", fake_checkpointer)
    monkeypatch.setattr(module, "acreate_store", fake_store)
    monkeypatch.setattr(module, "emit_token_usage", fake_emit_token_usage)
    monkeypatch.setattr(module, "AgentEventProcessor", _FakeEventProcessor)

    def fake_create_deep_agent(**kwargs):
        fake_graph.captured_create_kwargs = kwargs
        return fake_graph

    monkeypatch.setattr(module, "create_deep_agent", fake_create_deep_agent)
    monkeypatch.setattr(module, "create_retry_middleware", lambda **_kwargs: [])
    monkeypatch.setattr(module, "ToolResultBinaryMiddleware", lambda **_kwargs: object())
    monkeypatch.setattr(module, "SubagentActivityMiddleware", lambda **_kwargs: object())
    monkeypatch.setattr(module, "PromptCachingMiddleware", lambda: object())
    monkeypatch.setattr(module.settings, "ENABLE_MCP", False)
    monkeypatch.setattr(module.settings, "ENABLE_MEMORY", False)
    monkeypatch.setattr(module.settings, "ENABLE_SKILLS", False)


def _reset_fake_event_processor() -> None:
    _FakeEventProcessor.next_output_text = ""


def _patch_tool_search_middleware(monkeypatch: pytest.MonkeyPatch) -> list[object]:
    from src.infra.agent import middleware as middleware_pkg

    captured_managers: list[object] = []

    class _FakeToolSearchMiddleware:
        def __init__(self, *, deferred_manager, search_limit) -> None:
            captured_managers.append(deferred_manager)
            self.search_limit = search_limit

    monkeypatch.setattr(middleware_pkg, "ToolSearchMiddleware", _FakeToolSearchMiddleware)
    return captured_managers


@pytest.mark.asyncio
async def test_fast_agent_node_propagates_disabled_skills_to_inner_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.fast_agent import nodes as fast_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, fast_nodes, fake_graph)
    monkeypatch.setattr(fast_nodes, "create_persistent_backend_factory", lambda **_kwargs: object())

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    presenter = object()
    config = {
        "configurable": {
            "context": context,
            "presenter": presenter,
            "disabled_skills": ["hidden-skill"],
            "base_url": "",
            "agent_options": {},
        }
    }

    await fast_nodes.fast_agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert fake_graph.captured_inner_config is not None
    assert fake_graph.captured_inner_config["configurable"]["disabled_skills"] == ["hidden-skill"]


@pytest.mark.asyncio
async def test_fast_agent_node_passes_backend_instance_to_deepagents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.fast_agent import nodes as fast_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, fast_nodes, fake_graph)

    backend_instance = object()

    def backend_factory(_runtime):
        return backend_instance

    monkeypatch.setattr(
        fast_nodes,
        "create_persistent_backend_factory",
        lambda **_kwargs: backend_factory,
    )

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    await fast_nodes.fast_agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert fake_graph.captured_create_kwargs is not None
    assert fake_graph.captured_create_kwargs["backend"] is backend_instance
    assert fake_graph.captured_inner_config is not None
    assert fake_graph.captured_inner_config["configurable"]["backend"] is backend_instance


@pytest.mark.asyncio
async def test_fast_agent_subagent_middleware_retags_prompt_cache_last(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.fast_agent import nodes as fast_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, fast_nodes, fake_graph)
    monkeypatch.setattr(fast_nodes, "create_persistent_backend_factory", lambda **_kwargs: object())
    monkeypatch.setattr(fast_nodes, "PromptCachingMiddleware", lambda: "prompt-cache")

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    await fast_nodes.fast_agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert fake_graph.captured_create_kwargs is not None
    subagent_middleware = fake_graph.captured_create_kwargs["subagents"][0]["middleware"]
    assert subagent_middleware[-1] == "prompt-cache"


@pytest.mark.asyncio
async def test_fast_agent_subagent_tool_search_uses_isolated_manager(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.fast_agent import nodes as fast_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, fast_nodes, fake_graph)
    monkeypatch.setattr(fast_nodes, "create_persistent_backend_factory", lambda **_kwargs: object())
    captured_managers = _patch_tool_search_middleware(monkeypatch)

    deferred_manager = _FakeDeferredManager()
    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=deferred_manager)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    await fast_nodes.fast_agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert deferred_manager.fork_calls == ["subagent:general-purpose"]
    assert captured_managers[0] is deferred_manager.forked
    assert captured_managers[1] is deferred_manager


@pytest.mark.asyncio
async def test_fast_agent_node_returns_output_text_before_final_processor_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.fast_agent import nodes as fast_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, fast_nodes, fake_graph)
    monkeypatch.setattr(fast_nodes, "create_persistent_backend_factory", lambda **_kwargs: object())
    _FakeEventProcessor.next_output_text = "vision answer"

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    result = await fast_nodes.fast_agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert result["output"] == "vision answer"


@pytest.mark.asyncio
async def test_search_agent_node_propagates_disabled_skills_to_inner_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.search_agent import nodes as search_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, search_nodes, fake_graph)

    async def fake_create_backend_and_prompt(**_kwargs):
        return object(), "system prompt", object(), None, None

    monkeypatch.setattr(search_nodes, "_create_backend_and_prompt", fake_create_backend_and_prompt)

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    presenter = object()
    config = {
        "configurable": {
            "context": context,
            "presenter": presenter,
            "disabled_skills": ["hidden-skill"],
            "base_url": "",
            "agent_options": {},
        }
    }

    await search_nodes.agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert fake_graph.captured_inner_config is not None
    assert fake_graph.captured_inner_config["configurable"]["disabled_skills"] == ["hidden-skill"]


@pytest.mark.asyncio
async def test_search_agent_node_passes_backend_instance_to_deepagents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.search_agent import nodes as search_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, search_nodes, fake_graph)

    backend_instance = object()

    def backend_factory(_runtime):
        return backend_instance

    async def fake_create_backend_and_prompt(**_kwargs):
        return backend_factory, "system prompt", object(), None, None

    monkeypatch.setattr(search_nodes, "_create_backend_and_prompt", fake_create_backend_and_prompt)

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    await search_nodes.agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert fake_graph.captured_create_kwargs is not None
    assert fake_graph.captured_create_kwargs["backend"] is backend_instance
    assert fake_graph.captured_inner_config is not None
    assert fake_graph.captured_inner_config["configurable"]["backend"] is backend_instance


@pytest.mark.asyncio
async def test_search_agent_subagent_middleware_retags_prompt_cache_last(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.search_agent import nodes as search_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, search_nodes, fake_graph)
    monkeypatch.setattr(search_nodes, "PromptCachingMiddleware", lambda: "prompt-cache")

    async def fake_create_backend_and_prompt(**_kwargs):
        return object(), "system prompt", object(), None, None

    monkeypatch.setattr(search_nodes, "_create_backend_and_prompt", fake_create_backend_and_prompt)

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    await search_nodes.agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert fake_graph.captured_create_kwargs is not None
    subagent_middleware = fake_graph.captured_create_kwargs["subagents"][0]["middleware"]
    assert subagent_middleware[-1] == "prompt-cache"


@pytest.mark.asyncio
async def test_search_agent_subagent_tool_search_uses_isolated_manager(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.search_agent import nodes as search_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, search_nodes, fake_graph)
    captured_managers = _patch_tool_search_middleware(monkeypatch)

    async def fake_create_backend_and_prompt(**_kwargs):
        return object(), "system prompt", object(), None, None

    monkeypatch.setattr(search_nodes, "_create_backend_and_prompt", fake_create_backend_and_prompt)

    deferred_manager = _FakeDeferredManager()
    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=deferred_manager)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    await search_nodes.agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert deferred_manager.fork_calls == ["subagent:general-purpose"]
    assert captured_managers[0] is deferred_manager.forked
    assert captured_managers[1] is deferred_manager


@pytest.mark.asyncio
async def test_search_agent_node_returns_output_text_before_final_processor_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fake_event_processor()
    from src.agents.search_agent import nodes as search_nodes

    fake_graph = _FakeDeepAgent()
    _patch_common(monkeypatch, search_nodes, fake_graph)
    _FakeEventProcessor.next_output_text = "vision answer"

    async def fake_create_backend_and_prompt(**_kwargs):
        return object(), "system prompt", object(), None, None

    monkeypatch.setattr(search_nodes, "_create_backend_and_prompt", fake_create_backend_and_prompt)

    context = SimpleNamespace(user_id="user-1", skills=[], deferred_manager=None)
    config = {
        "configurable": {
            "context": context,
            "presenter": object(),
            "base_url": "",
            "agent_options": {},
        }
    }

    result = await search_nodes.agent_node(
        {"input": "hello", "session_id": "session-1", "attachments": []},
        config,
    )

    assert result["output"] == "vision answer"
