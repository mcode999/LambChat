from __future__ import annotations

import sys
import types


def test_code_interpreter_middleware_disabled_when_global_setting_off(monkeypatch):
    from src.infra.agent.middleware.code_interpreter import create_code_interpreter_middleware
    from src.kernel.config import settings

    monkeypatch.setattr(settings, "ENABLE_CODE_INTERPRETER", False, raising=False)

    middleware = create_code_interpreter_middleware({"enable_code_interpreter": True})

    assert middleware == []


def test_code_interpreter_middleware_disabled_when_agent_option_off(monkeypatch):
    from src.infra.agent.middleware.code_interpreter import create_code_interpreter_middleware
    from src.kernel.config import settings

    monkeypatch.setattr(settings, "ENABLE_CODE_INTERPRETER", True, raising=False)

    middleware = create_code_interpreter_middleware({"enable_code_interpreter": False})

    assert middleware == []


def test_code_interpreter_middleware_created_when_both_switches_enabled(monkeypatch):
    from src.infra.agent.middleware.code_interpreter import create_code_interpreter_middleware
    from src.kernel.config import settings

    class FakeCodeInterpreterMiddleware:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    fake_module = types.SimpleNamespace(CodeInterpreterMiddleware=FakeCodeInterpreterMiddleware)
    monkeypatch.setitem(sys.modules, "langchain_quickjs", fake_module)
    monkeypatch.setattr(settings, "ENABLE_CODE_INTERPRETER", True, raising=False)

    middleware = create_code_interpreter_middleware({"enable_code_interpreter": True})

    assert len(middleware) == 1
    assert isinstance(middleware[0], FakeCodeInterpreterMiddleware)
    assert middleware[0].kwargs == {}
