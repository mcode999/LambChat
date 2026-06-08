import asyncio
import base64
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest


class _Runtime:
    def __init__(self, user_id: str | None, base_url: str = "https://app.example.com") -> None:
        context = SimpleNamespace(user_id=user_id) if user_id is not None else None
        self.config = {"configurable": {"context": context, "base_url": base_url}}


@pytest.fixture(autouse=True)
def _clear_image_generation_model_id(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.infra.tool import image_generation_tool

    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL_ID", "")


class _BlockingOnlySpooledFile:
    def __init__(self, *args, **kwargs) -> None:
        self.data = bytearray()
        self.position = 0
        self.closed = False

    def write(self, chunk: bytes) -> int:
        from src.infra.tool import image_generation_tool

        if not getattr(image_generation_tool, "_inside_fake_blocking_io", False):
            raise AssertionError("image download spool writes must run in blocking IO executor")
        self.data.extend(chunk)
        self.position += len(chunk)
        return len(chunk)

    def seek(self, position: int, whence: int = 0) -> int:
        from src.infra.tool import image_generation_tool

        if not getattr(image_generation_tool, "_inside_fake_blocking_io", False):
            raise AssertionError("image download spool seek must run in blocking IO executor")
        if whence == 2:
            self.position = len(self.data) + position
        else:
            self.position = position
        return self.position

    def tell(self) -> int:
        return self.position

    def read(self) -> bytes:
        return bytes(self.data)

    def close(self) -> None:
        self.closed = True


def _load_module_from_path(module_name: str, relative_path: str):
    path = Path(__file__).parents[3] / relative_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _stub_context_tool_imports(monkeypatch: pytest.MonkeyPatch) -> None:
    def tool(name: str):
        return SimpleNamespace(name=name)

    monkeypatch.setitem(
        sys.modules,
        "src.infra.tool.human_tool",
        SimpleNamespace(get_human_tool=lambda session_id=None: tool("ask_human")),
    )
    monkeypatch.setitem(
        sys.modules,
        "src.infra.tool.reveal_file_tool",
        SimpleNamespace(get_reveal_file_tool=lambda: tool("reveal_file")),
    )
    monkeypatch.setitem(
        sys.modules,
        "src.infra.tool.reveal_project_tool",
        SimpleNamespace(get_reveal_project_tool=lambda: tool("reveal_project")),
    )
    monkeypatch.setitem(
        sys.modules,
        "src.infra.tool.transfer_file_tool",
        SimpleNamespace(
            get_transfer_file_tool=lambda: tool("transfer_file"),
            get_transfer_path_tool=lambda: tool("transfer_path"),
        ),
    )


def _patch_successful_generation(
    monkeypatch: pytest.MonkeyPatch,
    image_generation_tool,
    captured: dict[str, object],
    *,
    payload_key: str = "data",
) -> None:
    b64_image = base64.b64encode(b"fake-png").decode("ascii")

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {payload_key: [{"b64_json": b64_image}]}

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            captured["request_url"] = request_url
            captured["kwargs"] = kwargs
            return _FakeResponse()

    class _FakeStorage:
        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            captured["upload"] = {
                "data": file.read(),
                "folder": folder,
                "filename": filename,
                "content_type": content_type,
            }
            return SimpleNamespace(
                key=f"{folder}/{filename}",
                url="https://oss.example.com/generated.png",
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(
        image_generation_tool.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeHttpClient(),
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")
    monkeypatch.setattr(
        image_generation_tool.settings, "IMAGE_GENERATION_PROVIDER", "openai_images"
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_CAPABILITIES_JSON", {})


def test_get_image_generation_tool_returns_expected_tool() -> None:
    from src.infra.tool.image_generation_tool import get_image_generation_tool

    tool = get_image_generation_tool()

    assert tool.name == "image_generate"


@pytest.mark.asyncio
async def test_image_generate_calls_images_api_and_uploads_base64_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    image_bytes = b"fake-png"
    b64_image = base64.b64encode(image_bytes).decode("ascii")

    class _FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            captured["request_url"] = request_url
            captured["kwargs"] = kwargs
            return _FakeResponse({"data": [{"b64_json": b64_image, "revised_prompt": "a cat"}]})

    class _FakeStorage:
        is_local = False

        async def upload_bytes(self, data: bytes, folder: str, filename: str, content_type: str):
            raise AssertionError("generated images should use upload_file")

        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            captured["upload"] = {
                "data": file.read(),
                "folder": folder,
                "filename": filename,
                "content_type": content_type,
            }
            return SimpleNamespace(
                key=f"{folder}/{filename}",
                url="https://oss.example.com/generated-images%2Fuser-1%2Fcat.png?Signature=secret",
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool,
        "utc_now",
        lambda: datetime(2026, 5, 23, 12, 34, 56, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_TIMEOUT", 123)

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            size="1024x1024",
            quality="high",
            output_format="png",
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert set(result.keys()) == {"success", "images"}
    assert result["images"][0] == {
        "url": "https://app.example.com/api/upload/file/generated-images/user-1/generated-20260523_123456-1.png",
        "key": "generated-images/user-1/generated-20260523_123456-1.png",
        "content_type": "image/png",
        "revised_prompt": "a cat",
    }
    assert result["images"][0]["revised_prompt"] == "a cat"
    assert captured["request_url"] == "https://api.example.com/v1/images/generations"
    assert captured["kwargs"]["headers"]["Authorization"] == "Bearer sk-test"
    assert captured["kwargs"]["json"] == {
        "model": "gpt-image-2",
        "prompt": "draw a cat",
        "background": "auto",
        "size": "1024x1024",
        "quality": "high",
        "n": 1,
        "output_format": "png",
    }
    assert captured["upload"]["data"] == image_bytes
    assert captured["upload"]["folder"] == "generated-images/user-1"
    assert captured["upload"]["filename"] == "generated-20260523_123456-1.png"
    assert captured["upload"]["content_type"] == "image/png"


@pytest.mark.asyncio
async def test_image_generate_accepts_model_override_and_extra_options(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    _patch_successful_generation(monkeypatch, image_generation_tool, captured)

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            model="custom-image-model",
            extra_options={"response_format": "b64_json", "quality": None},
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert captured["kwargs"]["json"]["model"] == "custom-image-model"
    assert captured["kwargs"]["json"]["response_format"] == "b64_json"
    assert "quality" not in captured["kwargs"]["json"]


@pytest.mark.asyncio
async def test_image_generate_filters_unsupported_parameters_for_generic_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    _patch_successful_generation(monkeypatch, image_generation_tool, captured)
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_PROVIDER",
        "generic_openai_images",
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            negative_prompt="text",
            seed=123,
            runtime=_Runtime("user-1"),
        )
    )

    payload = captured["kwargs"]["json"]
    assert payload == {
        "model": "gpt-image-2",
        "prompt": "draw a cat",
        "size": "1024x1024",
        "n": 1,
    }
    assert result["metadata"]["provider"] == "generic_openai_images"
    assert set(result["metadata"]["dropped_parameters"]) == {
        "background",
        "negative_prompt",
        "output_format",
        "quality",
        "seed",
    }


@pytest.mark.asyncio
async def test_image_generate_maps_siliconflow_parameters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    _patch_successful_generation(monkeypatch, image_generation_tool, captured)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_PROVIDER", "siliconflow")
    monkeypatch.setattr(
        image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "black-forest-labs/FLUX.1"
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            size="768x1024",
            n=8,
            negative_prompt="text",
            seed=7,
            steps=24,
            guidance_scale=3.5,
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert captured["kwargs"]["json"] == {
        "model": "black-forest-labs/FLUX.1",
        "prompt": "draw a cat",
        "image_size": "1024x1536",
        "batch_size": 4,
        "negative_prompt": "text",
        "seed": 7,
        "num_inference_steps": 24,
        "guidance_scale": 3.5,
    }


@pytest.mark.asyncio
async def test_image_generate_uses_capability_json_provider_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    _patch_successful_generation(monkeypatch, image_generation_tool, captured, payload_key="images")
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_PROVIDER", "custom")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_CAPABILITIES_JSON",
        {
            "providers": {
                "custom": {
                    "generation_endpoint": "/v1/render",
                    "supported_parameters": ["model", "prompt", "n", "size", "negative_prompt"],
                    "parameter_map": {"n": "batch_size", "size": "image_size"},
                    "max_n": 2,
                    "defaults": {"response_format": "url"},
                }
            }
        },
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            n=9,
            negative_prompt="text",
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert captured["request_url"] == "https://api.example.com/v1/v1/render"
    assert captured["kwargs"]["json"] == {
        "response_format": "url",
        "model": "gpt-image-2",
        "prompt": "draw a cat",
        "image_size": "1024x1024",
        "batch_size": 2,
        "negative_prompt": "text",
    }


@pytest.mark.asyncio
async def test_image_generate_uses_configured_image_model_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool
    from src.kernel.schemas.model import ImageGenerationProfile, ModelConfig, ModelProfile

    captured: dict[str, object] = {}
    _patch_successful_generation(monkeypatch, image_generation_tool, captured)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL_ID", "image-model")

    model = ModelConfig(
        id="image-model",
        value="provider/image-model-value",
        label="Image Model",
        api_key="sk-model",
        api_base="https://model-images.example/v1",
        enabled=True,
        profile=ModelProfile(
            image_generation=ImageGenerationProfile(
                supports_generation=True,
                supports_edit=True,
                provider="openai_images",
                supported_generation_parameters=["model", "prompt", "n"],
                max_n=2,
            )
        ),
    )

    async def fake_load_model_config(model_id: str):
        assert model_id == "image-model"
        return model

    monkeypatch.setattr(
        image_generation_tool,
        "_load_image_generation_model_config",
        fake_load_model_config,
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            n=8,
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert captured["request_url"] == "https://model-images.example/v1/images/generations"
    assert captured["kwargs"]["headers"]["Authorization"] == "Bearer sk-model"
    assert captured["kwargs"]["json"] == {
        "model": "provider/image-model-value",
        "prompt": "draw a cat",
        "n": 2,
    }
    assert result["metadata"]["provider"] == "openai_images"
    assert set(result["metadata"]["dropped_parameters"]) == {
        "background",
        "output_format",
        "quality",
        "size",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("model_config", "expected_error"),
    [
        (None, "Image generation model 'image-model' was not found"),
        (
            SimpleNamespace(enabled=False),
            "Image generation model 'image-model' is disabled",
        ),
        (
            SimpleNamespace(enabled=True, profile=None),
            "Image generation model 'image-model' is not configured for images",
        ),
        (
            SimpleNamespace(
                enabled=True,
                api_key="sk-model",
                value="image-model-value",
                api_base="https://model-images.example/v1",
                profile=SimpleNamespace(
                    image_generation=SimpleNamespace(supports_generation=False)
                ),
            ),
            "Image generation model 'image-model' does not support image generation",
        ),
        (
            SimpleNamespace(
                enabled=True,
                api_key="",
                value="image-model-value",
                api_base="https://model-images.example/v1",
                profile=SimpleNamespace(image_generation=SimpleNamespace(supports_generation=True)),
            ),
            "Image generation model 'image-model' API key is not configured",
        ),
    ],
)
async def test_image_generate_returns_clear_errors_for_invalid_configured_image_model(
    monkeypatch: pytest.MonkeyPatch,
    model_config: object | None,
    expected_error: str,
) -> None:
    from src.infra.tool import image_generation_tool

    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL_ID", "image-model")

    async def fake_load_model_config(model_id: str):
        assert model_id == "image-model"
        return model_config

    monkeypatch.setattr(
        image_generation_tool,
        "_load_image_generation_model_config",
        fake_load_model_config,
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert result == {"error": expected_error}


@pytest.mark.asyncio
async def test_image_generate_returns_clear_error_when_configured_model_does_not_support_edit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL_ID", "image-model")
    model_config = SimpleNamespace(
        enabled=True,
        api_key="sk-model",
        value="image-model-value",
        api_base="https://model-images.example/v1",
        profile=SimpleNamespace(
            image_generation=SimpleNamespace(
                supports_generation=True,
                supports_edit=False,
            )
        ),
    )

    async def fake_load_model_config(model_id: str):
        assert model_id == "image-model"
        return model_config

    monkeypatch.setattr(
        image_generation_tool,
        "_load_image_generation_model_config",
        fake_load_model_config,
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="make it brighter",
            input_images=["https://files.example.com/source.png"],
            runtime=_Runtime("user-1"),
        )
    )

    assert result == {"error": "Image generation model 'image-model' does not support image edits"}


@pytest.mark.asyncio
async def test_image_generate_returns_error_when_provider_does_not_support_edits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_PROVIDER", "siliconflow")
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_CAPABILITIES_JSON", {})

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="make it brighter",
            input_images=["https://files.example.com/source.png"],
            runtime=_Runtime("user-1"),
        )
    )

    assert result == {"error": "Image provider 'siliconflow' does not support image edits"}


def test_image_generate_schema_describes_supported_parameters() -> None:
    from src.infra.tool.image_generation_tool import get_image_generation_tool

    tool = get_image_generation_tool()
    fields = set(tool.args_schema.model_fields)

    supported_fields = {
        "prompt",
        "input_images",
        "mode",
        "model",
        "provider",
        "background",
        "input_fidelity",
        "size",
        "quality",
        "n",
        "output_format",
        "negative_prompt",
        "seed",
        "steps",
        "guidance_scale",
        "strength",
        "extra_options",
    }
    assert supported_fields.issubset(fields)
    assert "mask_url" not in fields
    for field_name in supported_fields:
        assert tool.args_schema.model_fields[field_name].description


def test_decode_base64_to_spooled_file_rejects_oversized_payload_before_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    monkeypatch.setattr(image_generation_tool, "_IMAGE_DOWNLOAD_MAX_BYTES", 4)

    def fail_b64decode(*args, **kwargs):
        raise AssertionError("oversized image payload should be rejected before decoding")

    monkeypatch.setattr(image_generation_tool.base64, "b64decode", fail_b64decode)

    oversized = base64.b64encode(b"image-data").decode("ascii")
    with pytest.raises(ValueError, match="Image download too large"):
        image_generation_tool._decode_base64_to_spooled_file(oversized)


@pytest.mark.asyncio
async def test_download_image_source_rejects_oversized_remote_image(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    monkeypatch.setattr(image_generation_tool, "_IMAGE_DOWNLOAD_MAX_BYTES", 5)

    class _FakeStreamResponse:
        headers = {"content-type": "image/png"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def raise_for_status(self) -> None:
            return None

        async def aiter_bytes(self):
            yield b"abc"
            yield b"def"

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, method: str, url: str):
            assert method == "GET"
            assert url == "https://example.com/image.png"
            return _FakeStreamResponse()

    monkeypatch.setattr(image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeClient())

    with pytest.raises(ValueError, match="Image download too large"):
        await image_generation_tool._download_image_source("https://example.com/image.png", None)


@pytest.mark.asyncio
async def test_download_image_source_offloads_spooled_file_io(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    calls: list[str] = []

    class _FakeStreamResponse:
        headers = {"content-type": "image/png"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def raise_for_status(self) -> None:
            return None

        async def aiter_bytes(self):
            yield b"abc"
            yield b"def"

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, method: str, url: str):
            return _FakeStreamResponse()

    async def fake_run_blocking_io(func, *args, **kwargs):
        calls.append(func.__name__)
        monkeypatch.setattr(image_generation_tool, "_inside_fake_blocking_io", True, raising=False)
        try:
            return func(*args, **kwargs)
        finally:
            monkeypatch.setattr(
                image_generation_tool,
                "_inside_fake_blocking_io",
                False,
                raising=False,
            )

    monkeypatch.setattr(image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeClient())
    monkeypatch.setattr(image_generation_tool, "SpooledTemporaryFile", _BlockingOnlySpooledFile)
    monkeypatch.setattr(image_generation_tool, "run_blocking_io", fake_run_blocking_io)
    monkeypatch.setattr(image_generation_tool, "_inside_fake_blocking_io", False, raising=False)

    image_file, content_type, filename = await image_generation_tool._download_image_source(
        "https://example.com/image.png",
        None,
    )

    try:
        assert bytes(image_file.data) == b"abcdef"
        assert content_type == "image/png"
        assert filename == "image.png"
        assert calls == ["write", "write", "seek"]
    finally:
        image_file.close()


@pytest.mark.asyncio
async def test_image_generate_returns_error_when_api_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    calls: list[object] = []

    async def fake_run_blocking_io(func, *args, **kwargs):
        calls.append(func)
        return func(*args, **kwargs)

    monkeypatch.setattr(image_generation_tool, "run_blocking_io", fake_run_blocking_io)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "")

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert result == {"error": "IMAGE_GENERATION_API_KEY is not configured"}
    assert json.dumps in calls


@pytest.mark.asyncio
async def test_image_generate_offloads_exception_result_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    calls: list[object] = []

    async def fake_run_blocking_io(func, *args, **kwargs):
        calls.append(func)
        return func(*args, **kwargs)

    async def fake_call_generation_api(**kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(image_generation_tool, "run_blocking_io", fake_run_blocking_io)
    monkeypatch.setattr(image_generation_tool, "_call_generation_api", fake_call_generation_api)

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert result == {"error": "Image generation failed: boom"}
    assert json.dumps in calls


@pytest.mark.asyncio
async def test_image_generate_normalizes_unsupported_portrait_size_for_generations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    b64_image = base64.b64encode(b"fake-png").decode("ascii")

    class _FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            captured["kwargs"] = kwargs
            return _FakeResponse({"data": [{"b64_json": b64_image}]})

    class _FakeStorage:
        is_local = False

        async def upload_bytes(self, data: bytes, folder: str, filename: str, content_type: str):
            raise AssertionError("generated images should use upload_file")

        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            return SimpleNamespace(
                key=f"{folder}/{filename}", url="https://oss.example.com/gen.png"
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    await image_generation_tool.image_generate.coroutine(
        prompt="draw a cat",
        size="768x1024",
        runtime=_Runtime("user-1"),
    )

    assert captured["kwargs"]["json"]["size"] == "1024x1536"


@pytest.mark.asyncio
async def test_image_generate_normalizes_unsupported_portrait_size_for_edits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    image_bytes = b"edit-source"
    b64_image = base64.b64encode(image_bytes).decode("ascii")

    class _FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self._payload = payload
            self.headers = {"content-type": "image/png"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def raise_for_status(self) -> None:
            return None

        async def aiter_bytes(self):
            yield image_bytes

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, method: str, request_url: str):
            assert method == "GET"
            return _FakeResponse({})

        async def post(self, request_url: str, **kwargs):
            captured["kwargs"] = kwargs
            return _FakeResponse({"data": [{"b64_json": b64_image}]})

    class _FakeStorage:
        is_local = False

        async def upload_bytes(self, data: bytes, folder: str, filename: str, content_type: str):
            raise AssertionError("generated images should use upload_file")

        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            return SimpleNamespace(
                key=f"{folder}/{filename}", url="https://oss.example.com/edit.png"
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    await image_generation_tool.image_generate.coroutine(
        prompt="make it brighter",
        input_images=["/api/upload/file/generated-images/user-1/source.png"],
        size="768x1024",
        runtime=_Runtime("user-1"),
    )

    assert captured["kwargs"]["data"]["size"] == "1024x1536"


async def test_image_generate_with_input_images_uses_edits_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    image_bytes = b"edit-source"
    b64_image = base64.b64encode(image_bytes).decode("ascii")

    class _FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self._payload = payload
            self.headers = {"content-type": "image/png"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def raise_for_status(self) -> None:
            return None

        async def aiter_bytes(self):
            yield image_bytes

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, method: str, request_url: str):
            assert method == "GET"
            captured.setdefault("download_urls", []).append(request_url)
            return _FakeResponse({})

        async def post(self, request_url: str, **kwargs):
            captured["request_url"] = request_url
            captured["kwargs"] = kwargs
            return _FakeResponse({"data": [{"b64_json": b64_image}]})

    class _FakeStorage:
        is_local = False

        async def upload_bytes(self, data: bytes, folder: str, filename: str, content_type: str):
            raise AssertionError("generated images should use upload_file")

        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            captured["upload"] = {
                "data": file.read(),
                "folder": folder,
                "filename": filename,
                "content_type": content_type,
            }
            return SimpleNamespace(
                key=f"{folder}/{filename}",
                url="https://oss.example.com/edit.png",
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool,
        "utc_now",
        lambda: datetime(2026, 5, 23, 12, 34, 56, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="make it brighter",
            input_images=["/api/upload/file/generated-images/user-1/source.png"],
            runtime=_Runtime("user-1"),
        )
    )

    assert captured["request_url"] == "https://api.example.com/v1/images/edits"
    assert captured["download_urls"] == [
        "https://app.example.com/api/upload/file/generated-images/user-1/source.png"
    ]
    assert captured["kwargs"]["data"]["prompt"] == "make it brighter"
    assert captured["kwargs"]["data"]["background"] == "auto"
    assert captured["kwargs"]["data"]["input_fidelity"] == "low"
    assert captured["kwargs"]["files"][0][0] == "image"
    assert (
        result["images"][0]["url"]
        == "https://app.example.com/api/upload/file/generated-images/user-1/generated-20260523_123456-1.png"
    )
    assert captured["upload"]["filename"] == "generated-20260523_123456-1.png"
    assert "mask_url" not in result


@pytest.mark.asyncio
async def test_image_generate_streams_input_image_downloads_for_edits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    image_bytes = b"streamed-edit-source"
    b64_image = base64.b64encode(b"fake-png").decode("ascii")

    class _FakeResponse:
        def __init__(self, payload: dict[str, object] | None = None) -> None:
            self._payload = payload or {}
            self.headers = {"content-type": "image/png"}

        @property
        def content(self):
            raise AssertionError("image downloads should stream into a file")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def raise_for_status(self) -> None:
            return None

        async def aiter_bytes(self):
            yield image_bytes[:8]
            yield image_bytes[8:]

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, method: str, request_url: str):
            assert method == "GET"
            captured["download_url"] = request_url
            return _FakeResponse()

        async def post(self, request_url: str, **kwargs):
            captured["request_url"] = request_url
            captured["uploaded_source"] = kwargs["files"][0][1][1].read()
            return _FakeResponse({"data": [{"b64_json": b64_image}]})

    class _FakeStorage:
        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            captured["result_upload"] = file.read()
            return SimpleNamespace(
                key=f"{folder}/{filename}", url="https://oss.example.com/edit.png"
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="make it brighter",
            input_images=["https://files.example.com/source.png"],
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert captured["download_url"] == "https://files.example.com/source.png"
    assert captured["request_url"] == "https://api.example.com/v1/images/edits"
    assert captured["uploaded_source"] == image_bytes


@pytest.mark.asyncio
async def test_image_generate_decodes_base64_result_in_chunks_before_upload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    captured: dict[str, object] = {}
    image_bytes = b"x" * (1024 * 1024)
    b64_image = base64.b64encode(image_bytes).decode("ascii")
    real_b64decode = image_generation_tool.base64.b64decode

    def guarded_b64decode(data, *args, **kwargs):
        if isinstance(data, str) and len(data) == len(b64_image):
            raise AssertionError("generated image payload should not be decoded in one block")
        return real_b64decode(data, *args, **kwargs)

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"data": [{"b64_json": b64_image}]}

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            return _FakeResponse()

    class _FakeStorage:
        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            captured["upload"] = file.read()
            return SimpleNamespace(
                key=f"{folder}/{filename}", url="https://oss.example.com/generated.png"
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    monkeypatch.setattr(image_generation_tool.base64, "b64decode", guarded_b64decode)
    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert captured["upload"] == image_bytes


@pytest.mark.asyncio
async def test_image_generate_offloads_base64_result_spooled_file_io(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    calls: list[str] = []
    b64_image = base64.b64encode(b"fake-png").decode("ascii")

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"data": [{"b64_json": b64_image}]}

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            return _FakeResponse()

    class _FakeStorage:
        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            assert bytes(file.data) == b"fake-png"
            return SimpleNamespace(
                key=f"{folder}/{filename}", url="https://oss.example.com/generated.png"
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    async def fake_run_blocking_io(func, *args, **kwargs):
        calls.append(func.__name__)
        monkeypatch.setattr(image_generation_tool, "_inside_fake_blocking_io", True, raising=False)
        try:
            return func(*args, **kwargs)
        finally:
            monkeypatch.setattr(
                image_generation_tool,
                "_inside_fake_blocking_io",
                False,
                raising=False,
            )

    monkeypatch.setattr(
        image_generation_tool.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeHttpClient(),
    )
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool, "SpooledTemporaryFile", _BlockingOnlySpooledFile)
    monkeypatch.setattr(image_generation_tool, "run_blocking_io", fake_run_blocking_io)
    monkeypatch.setattr(image_generation_tool, "_inside_fake_blocking_io", False, raising=False)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert "_extract_image_payload" in calls
    assert "_file_size" in calls
    assert "seek" in calls
    assert "dumps" in calls


@pytest.mark.asyncio
async def test_image_generate_retries_retryable_api_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    attempts: list[str] = []
    image_bytes = b"fake-png"
    b64_image = base64.b64encode(image_bytes).decode("ascii")

    class _FakeResponse:
        def __init__(self, status_code: int, payload: dict[str, object]) -> None:
            self.status_code = status_code
            self._payload = payload
            self.request = image_generation_tool.httpx.Request(
                "POST",
                "https://api.example.com/v1/images/generations",
            )

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise image_generation_tool.httpx.HTTPStatusError(
                    f"status {self.status_code}",
                    request=self.request,
                    response=self,
                )

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            attempts.append(request_url)
            if len(attempts) == 1:
                return _FakeResponse(429, {"error": {"message": "rate limit"}})
            return _FakeResponse(200, {"data": [{"b64_json": b64_image}]})

    class _FakeStorage:
        async def upload_bytes(self, data: bytes, folder: str, filename: str, content_type: str):
            raise AssertionError("generated images should use upload_file")

        async def upload_file(self, file, folder: str, filename: str, content_type: str):
            return SimpleNamespace(
                key=f"{folder}/{filename}", url="https://oss.example.com/gen.png"
            )

    async def fake_get_or_init_storage():
        return _FakeStorage()

    sleep_delays: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleep_delays.append(delay)

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(image_generation_tool, "get_or_init_storage", fake_get_or_init_storage)
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_MODEL", "gpt-image-2")

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert result["success"] is True
    assert len(attempts) == 2
    assert sleep_delays == [1.0]


@pytest.mark.asyncio
async def test_image_generate_does_not_retry_non_retryable_api_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.infra.tool import image_generation_tool

    attempts: list[str] = []

    class _FakeResponse:
        status_code = 400

        def __init__(self) -> None:
            self.request = image_generation_tool.httpx.Request(
                "POST",
                "https://api.example.com/v1/images/generations",
            )

        def raise_for_status(self) -> None:
            raise image_generation_tool.httpx.HTTPStatusError(
                "bad request",
                request=self.request,
                response=self,
            )

        def json(self) -> dict[str, object]:
            return {"error": {"message": "bad request"}}

    class _FakeHttpClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, request_url: str, **kwargs):
            attempts.append(request_url)
            return _FakeResponse()

    monkeypatch.setattr(
        image_generation_tool.httpx, "AsyncClient", lambda **kwargs: _FakeHttpClient()
    )
    monkeypatch.setattr(image_generation_tool.settings, "IMAGE_GENERATION_API_KEY", "sk-test")
    monkeypatch.setattr(
        image_generation_tool.settings,
        "IMAGE_GENERATION_BASE_URL",
        "https://api.example.com/v1",
    )

    result = json.loads(
        await image_generation_tool.image_generate.coroutine(
            prompt="draw a cat",
            runtime=_Runtime("user-1"),
        )
    )

    assert len(attempts) == 1
    assert "400" in result["error"] or "bad request" in result["error"]


@pytest.mark.asyncio
async def test_search_agent_context_includes_image_generation_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_context_tool_imports(monkeypatch)
    search_context = _load_module_from_path(
        "search_context_with_image_tool_under_test",
        "src/agents/search_agent/context.py",
    )

    monkeypatch.setattr(search_context.settings, "ENABLE_IMAGE_GENERATION", True)
    monkeypatch.setattr(search_context.settings, "ENABLE_AUDIO_TRANSCRIPTION", False)
    monkeypatch.setattr(search_context.settings, "ENABLE_MEMORY", False)
    monkeypatch.setattr(search_context.settings, "ENABLE_SANDBOX", False)
    monkeypatch.setattr(search_context.settings, "ENABLE_SKILLS", False)

    ctx = search_context.SearchAgentContext(user_id="user-1")
    await ctx.setup()

    names = {tool.name for tool in ctx.tools}
    assert "image_generate" in names


@pytest.mark.asyncio
async def test_fast_agent_context_includes_image_generation_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_context_tool_imports(monkeypatch)
    fast_context = _load_module_from_path(
        "fast_context_with_image_tool_under_test",
        "src/agents/fast_agent/context.py",
    )

    monkeypatch.setattr(fast_context.settings, "ENABLE_IMAGE_GENERATION", True)
    monkeypatch.setattr(fast_context.settings, "ENABLE_AUDIO_TRANSCRIPTION", False)
    monkeypatch.setattr(fast_context.settings, "ENABLE_MEMORY", False)
    monkeypatch.setattr(fast_context.settings, "ENABLE_SANDBOX", False)
    monkeypatch.setattr(fast_context.settings, "ENABLE_SKILLS", False)

    ctx = fast_context.FastAgentContext(user_id="user-1")
    await ctx.setup()

    names = {tool.name for tool in ctx.tools}
    assert "image_generate" in names
