from __future__ import annotations

from src.agents.fast_agent.graph import FastAgent
from src.agents.search_agent.graph import SearchAgent


def test_fast_and_search_agents_expose_code_interpreter_option() -> None:
    for agent_cls in (FastAgent, SearchAgent):
        option = agent_cls._options["enable_code_interpreter"]

        assert option["type"] == "boolean"
        assert option["default"] is False
