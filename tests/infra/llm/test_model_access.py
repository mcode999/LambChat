from __future__ import annotations

import pytest

from src.infra.llm.client import LLMClient
from src.infra.llm.models_service import clear_api_key_cache, set_cached_api_key
from src.kernel.exceptions import AuthorizationError
from src.kernel.schemas.model import ModelConfig


class _ModelStorage:
    def __init__(self, model: ModelConfig | None) -> None:
        self.model = model

    async def get(self, model_id: str) -> ModelConfig | None:
        return self.model if self.model and self.model.id == model_id else None


@pytest.mark.asyncio
async def test_get_model_rejects_disabled_model_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    disabled_model = ModelConfig(
        id="disabled-model",
        value="openai/gpt-disabled",
        label="Disabled",
        enabled=False,
    )
    storage = _ModelStorage(disabled_model)

    monkeypatch.setattr(
        "src.infra.agent.model_storage.get_model_storage",
        lambda: storage,
    )

    with pytest.raises(AuthorizationError, match="model_disabled"):
        await LLMClient.get_model(model_id="disabled-model")


@pytest.mark.asyncio
async def test_get_model_rejects_unknown_model_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _ModelStorage(None)

    monkeypatch.setattr(
        "src.infra.agent.model_storage.get_model_storage",
        lambda: storage,
    )

    with pytest.raises(AuthorizationError, match="model_not_found"):
        await LLMClient.get_model(model_id="missing-model")


@pytest.mark.asyncio
async def test_get_model_uses_cached_key_for_sanitized_google_model_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clear_api_key_cache()
    LLMClient.clear_cache_by_model()
    set_cached_api_key("gemini-3.1-pro-preview", "gemini-secret")

    captured: dict = {}

    class FakeChatGoogleGenerativeAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(
        "src.infra.llm.client.ChatGoogleGenerativeAI",
        FakeChatGoogleGenerativeAI,
    )

    await LLMClient.get_model(
        model_config={
            "id": "google-model",
            "value": "gemini-3.1-pro-preview",
            "provider": "gemini",
            "label": "Gemini",
            "api_key": None,
            "api_base": "https://example.test",
            "enabled": True,
        },
    )

    assert captured["google_api_key"].get_secret_value() == "gemini-secret"
    assert captured["base_url"] == "https://example.test"

    clear_api_key_cache()
    LLMClient.clear_cache_by_model()
