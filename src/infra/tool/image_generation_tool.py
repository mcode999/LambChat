"""Provider-adapted image generation tool for LambChat agents."""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import mimetypes
import re
import sys
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from enum import Enum
from tempfile import SpooledTemporaryFile
from typing import Annotated, Any
from urllib.parse import urlparse

import httpx
from langchain_core.tools import BaseTool, InjectedToolArg

from src.infra.async_utils import run_blocking_io
from src.infra.logging import get_logger
from src.infra.storage.s3.service import get_or_init_storage
from src.infra.tool.backend_utils import (
    get_base_url_from_runtime,
    get_user_id_from_runtime,
)
from src.infra.utils.datetime import utc_now
from src.kernel.config import settings

try:
    from langchain.tools import ToolRuntime  # type: ignore[assignment]
except ImportError:  # pragma: no cover
    _mod = type(sys)("langchain.tools")
    _mod.ToolRuntime = Any  # type: ignore[attr-defined]
    sys.modules.setdefault("langchain.tools", _mod)
    from langchain.tools import ToolRuntime  # type: ignore[assignment]

from langchain.tools import tool  # noqa: E402

logger = get_logger(__name__)

DEFAULT_IMAGE_GENERATION_BASE_URL = "https://api.openai.com/v1"
DEFAULT_IMAGE_GENERATION_MODEL = "gpt-image-2"
DEFAULT_IMAGE_GENERATION_PROVIDER = "openai_images"
IMAGE_API_MAX_ATTEMPTS = 3
IMAGE_API_RETRY_BASE_DELAY_SECONDS = 1.0
_SPOOL_MAX_MEMORY_BYTES = 2 * 1024 * 1024
_BASE64_DECODE_CHUNK_CHARS = 256 * 1024
_IMAGE_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024


class ImageBackground(str, Enum):
    AUTO = "auto"
    OPAQUE = "opaque"
    TRANSPARENT = "transparent"


class ImageInputFidelity(str, Enum):
    LOW = "low"
    HIGH = "high"


class ImageMode(str, Enum):
    AUTO = "auto"
    GENERATE = "generate"
    EDIT = "edit"
    IMG2IMG = "img2img"


class ImageSize(str, Enum):
    SQUARE = "1024x1024"
    PORTRAIT = "1024x1536"
    LANDSCAPE = "1536x1024"


class ImageQuality(str, Enum):
    AUTO = "auto"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ImageOutputFormat(str, Enum):
    PNG = "png"
    JPEG = "jpeg"
    WEBP = "webp"


@dataclass(frozen=True)
class ImageProviderProfile:
    """Provider-specific request shape for image APIs."""

    name: str
    generation_endpoint: str = "/images/generations"
    edit_endpoint: str | None = "/images/edits"
    supports_edit: bool = True
    generation_parameters: frozenset[str] = field(default_factory=frozenset)
    edit_parameters: frozenset[str] = field(default_factory=frozenset)
    parameter_map: dict[str, str] = field(default_factory=dict)
    blocked_parameters: frozenset[str] = field(default_factory=frozenset)
    defaults: dict[str, Any] = field(default_factory=dict)
    generation_defaults: dict[str, Any] = field(default_factory=dict)
    edit_defaults: dict[str, Any] = field(default_factory=dict)
    max_n: int = 10
    max_input_images: int = 16
    file_field_name: str = "image"
    strict_parameters: bool = False
    allow_extra_options: bool = True


@dataclass(frozen=True)
class PreparedImagePayload:
    payload: dict[str, Any]
    dropped_parameters: tuple[str, ...] = ()


@dataclass(frozen=True)
class ImageRuntimeConfig:
    """Resolved image API connection and provider profile for one tool call."""

    api_key: str
    base_url: str
    model: str
    profile: ImageProviderProfile
    timeout: int


_OPENAI_GENERATION_PARAMETERS = frozenset(
    {
        "model",
        "prompt",
        "background",
        "size",
        "quality",
        "n",
        "output_format",
    }
)
_OPENAI_EDIT_PARAMETERS = _OPENAI_GENERATION_PARAMETERS | frozenset({"input_fidelity"})
_GENERIC_OPENAI_PARAMETERS = frozenset({"model", "prompt", "size", "n"})
_SILICONFLOW_GENERATION_PARAMETERS = frozenset(
    {
        "model",
        "prompt",
        "size",
        "n",
        "negative_prompt",
        "seed",
        "steps",
        "guidance_scale",
    }
)
_MANDATORY_IMAGE_PARAMETERS = frozenset({"model", "prompt"})
_PROFILE_OVERRIDE_KEYS = {
    "generation_endpoint",
    "edit_endpoint",
    "supports_edit",
    "supported_parameters",
    "generation_parameters",
    "supported_generation_parameters",
    "edit_parameters",
    "supported_edit_parameters",
    "parameter_map",
    "blocked_parameters",
    "blocked_params",
    "drop_parameters",
    "defaults",
    "generation_defaults",
    "edit_defaults",
    "max_n",
    "max_input_images",
    "file_field_name",
    "strict_parameters",
    "allow_extra_options",
}

DEFAULT_PROVIDER_PROFILES: dict[str, ImageProviderProfile] = {
    "openai_images": ImageProviderProfile(
        name="openai_images",
        generation_parameters=_OPENAI_GENERATION_PARAMETERS,
        edit_parameters=_OPENAI_EDIT_PARAMETERS,
    ),
    "generic_openai_images": ImageProviderProfile(
        name="generic_openai_images",
        generation_parameters=_GENERIC_OPENAI_PARAMETERS,
        edit_parameters=_GENERIC_OPENAI_PARAMETERS,
    ),
    "siliconflow": ImageProviderProfile(
        name="siliconflow",
        generation_parameters=_SILICONFLOW_GENERATION_PARAMETERS,
        edit_endpoint=None,
        supports_edit=False,
        max_n=4,
        parameter_map={
            "size": "image_size",
            "n": "batch_size",
            "steps": "num_inference_steps",
        },
    ),
}


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


async def _json_dumps_result(data: dict[str, Any]) -> str:
    return await run_blocking_io(json.dumps, data, ensure_ascii=False)


def _strip_data_url_prefix(value: str) -> tuple[str, str]:
    match = re.match(r"^data:([^;]+);base64,(.+)$", value, re.DOTALL)
    if not match:
        return "", value
    return match.group(1), match.group(2)


def _estimate_base64_decoded_size(value: str) -> int:
    normalized = "".join(value.split())
    stripped = normalized.rstrip("=")
    return (len(stripped) * 3) // 4


def _raise_image_too_large(size: int) -> None:
    raise ValueError(f"Image download too large: {size} bytes (max {_IMAGE_DOWNLOAD_MAX_BYTES})")


def _guess_mime(filename: str, fallback: str = "image/png") -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or fallback


def _generated_filename(mime: str, index: int) -> str:
    ext = (mimetypes.guess_extension(mime) or ".png").lstrip(".")
    timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
    return f"generated-{timestamp}-{index + 1}.{ext}"


def _filename_from_url(url: str, index: int) -> str:
    parsed = urlparse(url)
    name = parsed.path.rstrip("/").split("/")[-1]
    if name:
        return name
    return f"image-{index + 1}.png"


def _resolve_base_url() -> str:
    base_url = (
        getattr(settings, "IMAGE_GENERATION_BASE_URL", "") or DEFAULT_IMAGE_GENERATION_BASE_URL
    )
    return str(base_url).rstrip("/")


def _resolve_model() -> str:
    model = getattr(settings, "IMAGE_GENERATION_MODEL", "") or DEFAULT_IMAGE_GENERATION_MODEL
    return str(model).strip() or DEFAULT_IMAGE_GENERATION_MODEL


def _resolve_model_config_id() -> str:
    model_id = getattr(settings, "IMAGE_GENERATION_MODEL_ID", "") or ""
    return str(model_id).strip()


def _resolve_provider_name(provider: str | None = None) -> str:
    resolved = (
        provider
        or getattr(settings, "IMAGE_GENERATION_PROVIDER", "")
        or DEFAULT_IMAGE_GENERATION_PROVIDER
    )
    return str(resolved).strip() or DEFAULT_IMAGE_GENERATION_PROVIDER


def _resolve_model_override(model: str | None = None) -> str:
    if model and str(model).strip():
        return str(model).strip()
    return _resolve_model()


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def _normalize_image_size(size: Any) -> str:
    value = _enum_value(size).strip()
    if not value:
        return "1024x1024"
    if value in {item.value for item in ImageSize}:
        return value

    match = re.fullmatch(r"(\d+)x(\d+)", value)
    if not match:
        return value

    width = int(match.group(1))
    height = int(match.group(2))
    if width <= 0 or height <= 0:
        return "1024x1024"

    ratio = width / height
    supported = {
        "1024x1024": 1.0,
        "1024x1536": 1024 / 1536,
        "1536x1024": 1536 / 1024,
    }
    return min(supported, key=lambda candidate: abs(supported[candidate] - ratio))


def _is_retryable_image_api_status(status_code: int | None) -> bool:
    if status_code is None:
        return False
    return status_code == 429 or 500 <= status_code <= 599


def _image_api_retry_delay(attempt: int) -> float:
    return IMAGE_API_RETRY_BASE_DELAY_SECONDS * (2 ** max(0, attempt - 1))


def _coerce_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _coerce_string_set(value: Any, default: frozenset[str]) -> frozenset[str]:
    if value is None:
        return default
    if not isinstance(value, list | tuple | set):
        return default
    return frozenset(str(item).strip() for item in value if str(item).strip())


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return default


def _coerce_positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, parsed)


def _load_capabilities_config() -> dict[str, Any]:
    raw = getattr(settings, "IMAGE_GENERATION_CAPABILITIES_JSON", "") or ""
    if isinstance(raw, Mapping):
        return dict(raw)
    if not str(raw).strip():
        return {}
    try:
        parsed = json.loads(str(raw))
    except json.JSONDecodeError as exc:
        raise ValueError(f"IMAGE_GENERATION_CAPABILITIES_JSON is invalid JSON: {exc}") from exc
    if not isinstance(parsed, Mapping):
        raise ValueError("IMAGE_GENERATION_CAPABILITIES_JSON must be a JSON object")
    return dict(parsed)


def _merge_profile(
    profile: ImageProviderProfile, override: Mapping[str, Any]
) -> ImageProviderProfile:
    supported_parameters = override.get("supported_parameters")
    generation_parameters = _coerce_string_set(
        override.get("generation_parameters", override.get("supported_generation_parameters")),
        _coerce_string_set(supported_parameters, profile.generation_parameters),
    )
    edit_parameters = _coerce_string_set(
        override.get("edit_parameters", override.get("supported_edit_parameters")),
        _coerce_string_set(supported_parameters, profile.edit_parameters),
    )

    parameter_map = dict(profile.parameter_map)
    parameter_map.update(
        {
            str(key): str(value)
            for key, value in _coerce_mapping(override.get("parameter_map")).items()
        }
    )

    blocked_parameters = profile.blocked_parameters
    for key in ("blocked_parameters", "blocked_params", "drop_parameters"):
        blocked_parameters = _coerce_string_set(override.get(key), blocked_parameters)

    defaults = dict(profile.defaults)
    defaults.update(_coerce_mapping(override.get("defaults")))
    generation_defaults = dict(profile.generation_defaults)
    generation_defaults.update(_coerce_mapping(override.get("generation_defaults")))
    edit_defaults = dict(profile.edit_defaults)
    edit_defaults.update(_coerce_mapping(override.get("edit_defaults")))

    edit_endpoint = override.get("edit_endpoint", profile.edit_endpoint)
    if isinstance(edit_endpoint, str) and not edit_endpoint.strip():
        edit_endpoint = None

    return replace(
        profile,
        generation_endpoint=str(
            override.get("generation_endpoint", profile.generation_endpoint)
        ).strip()
        or profile.generation_endpoint,
        edit_endpoint=str(edit_endpoint).strip() if edit_endpoint is not None else None,
        supports_edit=_coerce_bool(override.get("supports_edit"), profile.supports_edit),
        generation_parameters=generation_parameters,
        edit_parameters=edit_parameters,
        parameter_map=parameter_map,
        blocked_parameters=blocked_parameters,
        defaults=defaults,
        generation_defaults=generation_defaults,
        edit_defaults=edit_defaults,
        max_n=_coerce_positive_int(override.get("max_n"), profile.max_n),
        max_input_images=_coerce_positive_int(
            override.get("max_input_images"),
            profile.max_input_images,
        ),
        file_field_name=str(override.get("file_field_name", profile.file_field_name)).strip()
        or profile.file_field_name,
        strict_parameters=_coerce_bool(
            override.get("strict_parameters"),
            profile.strict_parameters,
        ),
        allow_extra_options=_coerce_bool(
            override.get("allow_extra_options"),
            profile.allow_extra_options,
        ),
    )


def _default_provider_profile(provider_name: str) -> ImageProviderProfile:
    profile = DEFAULT_PROVIDER_PROFILES.get(provider_name)
    if profile is not None:
        return profile
    return replace(DEFAULT_PROVIDER_PROFILES["generic_openai_images"], name=provider_name)


def _select_model_override(overrides: Mapping[str, Any], model: str) -> dict[str, Any]:
    if not isinstance(overrides, Mapping):
        return {}
    candidates = [model]
    if "/" in model:
        candidates.append(model.split("/", 1)[1])
    for candidate in candidates:
        value = overrides.get(candidate)
        if isinstance(value, Mapping):
            return dict(value)
    return {}


def _resolve_provider_profile(provider_name: str, model: str) -> ImageProviderProfile:
    profile = _default_provider_profile(provider_name)
    capabilities = _load_capabilities_config()
    if not capabilities:
        return profile

    global_override = {
        key: value for key, value in capabilities.items() if key in _PROFILE_OVERRIDE_KEYS
    }
    if global_override:
        profile = _merge_profile(profile, global_override)

    direct_provider_override = capabilities.get(provider_name)
    if isinstance(direct_provider_override, Mapping):
        profile = _merge_profile(profile, direct_provider_override)

    providers = capabilities.get("providers")
    provider_override = providers.get(provider_name) if isinstance(providers, Mapping) else None
    if isinstance(provider_override, Mapping):
        profile = _merge_profile(profile, provider_override)
        profile = _merge_profile(
            profile,
            _select_model_override(_coerce_mapping(provider_override.get("models")), model),
        )

    profile = _merge_profile(
        profile,
        _select_model_override(_coerce_mapping(capabilities.get("models")), model),
    )
    return profile


async def _load_image_generation_model_config(model_id: str) -> Any:
    from src.infra.agent.model_storage import get_model_storage

    return await get_model_storage().get(model_id)


def _image_generation_profile_to_override(image_profile: Any) -> dict[str, Any]:
    if image_profile is None:
        return {}
    if hasattr(image_profile, "model_dump"):
        raw = image_profile.model_dump(exclude_none=True)
    elif isinstance(image_profile, Mapping):
        raw = dict(image_profile)
    else:
        raw = {
            key: getattr(image_profile, key)
            for key in (
                "supports_edit",
                "generation_endpoint",
                "edit_endpoint",
                "supported_generation_parameters",
                "supported_edit_parameters",
                "parameter_map",
                "max_n",
                "max_input_images",
            )
            if getattr(image_profile, key, None) is not None
        }
    raw.pop("supports_generation", None)
    raw.pop("provider", None)
    return raw


def _image_generation_profile_value(image_profile: Any, key: str, default: Any = None) -> Any:
    if image_profile is None:
        return default
    if isinstance(image_profile, Mapping):
        return image_profile.get(key, default)
    return getattr(image_profile, key, default)


def _legacy_runtime_config(
    *,
    model: str | None,
    provider: str | None,
) -> tuple[ImageRuntimeConfig | None, str | None]:
    api_key = getattr(settings, "IMAGE_GENERATION_API_KEY", "") or ""
    if not api_key:
        return None, "IMAGE_GENERATION_API_KEY is not configured"

    resolved_model = _resolve_model_override(model)
    provider_name = _resolve_provider_name(provider)
    profile = _resolve_provider_profile(provider_name, resolved_model)
    timeout = getattr(settings, "IMAGE_GENERATION_TIMEOUT", 120) or 120
    return (
        ImageRuntimeConfig(
            api_key=str(api_key),
            base_url=_resolve_base_url(),
            model=resolved_model,
            profile=profile,
            timeout=int(timeout),
        ),
        None,
    )


async def _model_config_runtime_config(
    *,
    model_config_id: str,
    operation: str,
    model: str | None,
    provider: str | None,
) -> tuple[ImageRuntimeConfig | None, str | None]:
    model_config = await _load_image_generation_model_config(model_config_id)
    if model_config is None:
        return None, f"Image generation model '{model_config_id}' was not found"
    if not getattr(model_config, "enabled", False):
        return None, f"Image generation model '{model_config_id}' is disabled"

    profile = getattr(model_config, "profile", None)
    image_profile = getattr(profile, "image_generation", None) if profile is not None else None
    if image_profile is None:
        return None, f"Image generation model '{model_config_id}' is not configured for images"

    supports_generation = _coerce_bool(
        _image_generation_profile_value(image_profile, "supports_generation"),
        False,
    )
    if not supports_generation:
        return None, f"Image generation model '{model_config_id}' does not support image generation"

    if operation == "edit":
        supports_edit = _coerce_bool(
            _image_generation_profile_value(image_profile, "supports_edit"),
            False,
        )
        if not supports_edit:
            return None, f"Image generation model '{model_config_id}' does not support image edits"

    api_key = getattr(model_config, "api_key", "") or ""
    if not api_key:
        return None, f"Image generation model '{model_config_id}' API key is not configured"

    resolved_model = (
        str(model).strip() if model and str(model).strip() else str(model_config.value).strip()
    )
    provider_name = _resolve_provider_name(
        provider or _image_generation_profile_value(image_profile, "provider")
    )
    provider_profile = _resolve_provider_profile(provider_name, resolved_model)
    provider_profile = _merge_profile(
        provider_profile,
        _image_generation_profile_to_override(image_profile),
    )
    timeout = getattr(settings, "IMAGE_GENERATION_TIMEOUT", 120) or 120
    base_url = str(getattr(model_config, "api_base", "") or _resolve_base_url()).rstrip("/")
    return (
        ImageRuntimeConfig(
            api_key=str(api_key),
            base_url=base_url,
            model=resolved_model or DEFAULT_IMAGE_GENERATION_MODEL,
            profile=provider_profile,
            timeout=int(timeout),
        ),
        None,
    )


async def _resolve_image_runtime_config(
    *,
    operation: str,
    model: str | None,
    provider: str | None,
) -> tuple[ImageRuntimeConfig | None, str | None]:
    model_config_id = _resolve_model_config_id()
    if model_config_id:
        return await _model_config_runtime_config(
            model_config_id=model_config_id,
            operation=operation,
            model=model,
            provider=provider,
        )
    return _legacy_runtime_config(model=model, provider=provider)


def _join_api_url(base_url: str, endpoint: str) -> str:
    if endpoint.startswith(("http://", "https://")):
        return endpoint
    return f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"


def _is_sendable_parameter_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str) and value == "":
        return False
    return True


def _build_prepared_payload(
    profile: ImageProviderProfile,
    *,
    operation: str,
    canonical: dict[str, Any],
    extra_options: Mapping[str, Any] | None,
) -> PreparedImagePayload:
    supported = (
        profile.edit_parameters if operation == "edit" else profile.generation_parameters
    ) | _MANDATORY_IMAGE_PARAMETERS
    provider_defaults = dict(profile.defaults)
    provider_defaults.update(
        profile.edit_defaults if operation == "edit" else profile.generation_defaults
    )
    payload = {
        key: value
        for key, value in provider_defaults.items()
        if key not in profile.blocked_parameters and value is not None
    }
    dropped: list[str] = []

    for name, value in canonical.items():
        if not _is_sendable_parameter_value(value):
            continue
        if name not in supported:
            dropped.append(name)
            continue
        provider_key = profile.parameter_map.get(name, name)
        if provider_key in profile.blocked_parameters or name in profile.blocked_parameters:
            dropped.append(name)
            continue
        payload[provider_key] = value

    if profile.strict_parameters and dropped:
        dropped_text = ", ".join(sorted(set(dropped)))
        raise ValueError(f"Image provider '{profile.name}' does not support: {dropped_text}")

    if extra_options:
        for key, value in extra_options.items():
            provider_key = str(key).strip()
            if not provider_key:
                continue
            if provider_key in profile.blocked_parameters:
                dropped.append(f"extra_options.{provider_key}")
                continue
            if value is None:
                payload.pop(provider_key, None)
                continue
            if profile.allow_extra_options:
                payload[provider_key] = value
            else:
                dropped.append(f"extra_options.{provider_key}")

    return PreparedImagePayload(payload=payload, dropped_parameters=tuple(sorted(set(dropped))))


def _response_with_metadata(
    result: dict[str, Any],
    *,
    profile: ImageProviderProfile,
    model: str,
    operation: str,
    dropped_parameters: tuple[str, ...],
) -> dict[str, Any]:
    if not dropped_parameters:
        return result
    result["metadata"] = {
        "provider": profile.name,
        "model": model,
        "operation": operation,
        "dropped_parameters": list(dropped_parameters),
    }
    return result


async def _post_image_api_with_retries(
    client: httpx.AsyncClient,
    url: str,
    *,
    operation: str,
    **kwargs: Any,
) -> dict[str, Any]:
    for attempt in range(1, IMAGE_API_MAX_ATTEMPTS + 1):
        try:
            response = await client.post(url, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            status_code = getattr(exc.response, "status_code", None)
            if attempt >= IMAGE_API_MAX_ATTEMPTS or not _is_retryable_image_api_status(status_code):
                raise
            delay = _image_api_retry_delay(attempt)
            logger.warning(
                "[image_generate] %s API returned retryable status %s "
                "(attempt %d/%d), retrying in %.1fs",
                operation,
                status_code,
                attempt,
                IMAGE_API_MAX_ATTEMPTS,
                delay,
            )
            await asyncio.sleep(delay)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if attempt >= IMAGE_API_MAX_ATTEMPTS:
                raise
            delay = _image_api_retry_delay(attempt)
            logger.warning(
                "[image_generate] %s API request failed with %s (attempt %d/%d), retrying in %.1fs",
                operation,
                type(exc).__name__,
                attempt,
                IMAGE_API_MAX_ATTEMPTS,
                delay,
            )
            await asyncio.sleep(delay)

    raise RuntimeError("Image API retry loop exhausted")


async def _download_image_source(
    url: str,
    runtime: ToolRuntime | None,
    *,
    index: int = 0,
) -> tuple[SpooledTemporaryFile, str, str]:
    resolved = url
    if resolved.startswith("/"):
        base_url = get_base_url_from_runtime(runtime)
        if base_url:
            resolved = f"{base_url}{resolved}"

    if resolved.startswith("data:"):
        mime, data = _strip_data_url_prefix(resolved)
        decoded = await run_blocking_io(_decode_base64_to_spooled_file, data)
        ext = (mimetypes.guess_extension(mime) or ".png").lstrip(".")
        return decoded, mime or "image/png", f"inline-image-{index + 1}.{ext}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        spooled = SpooledTemporaryFile(max_size=_SPOOL_MAX_MEMORY_BYTES, mode="w+b")
        try:
            total_size = 0
            async with client.stream("GET", resolved) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    total_size += len(chunk)
                    if total_size > _IMAGE_DOWNLOAD_MAX_BYTES:
                        raise ValueError(
                            f"Image download too large: {total_size} bytes "
                            f"(max {_IMAGE_DOWNLOAD_MAX_BYTES})"
                        )
                    await run_blocking_io(spooled.write, chunk)
                content_type = response.headers.get("content-type", "") or _guess_mime(resolved)
            await run_blocking_io(spooled.seek, 0)
            filename = _filename_from_url(resolved, index)
            return spooled, content_type, filename
        except Exception:
            spooled.close()
            raise


def _decode_base64_to_spooled_file(data: str) -> SpooledTemporaryFile:
    estimated_size = _estimate_base64_decoded_size(data)
    if estimated_size > _IMAGE_DOWNLOAD_MAX_BYTES:
        _raise_image_too_large(estimated_size)

    spooled = SpooledTemporaryFile(max_size=_SPOOL_MAX_MEMORY_BYTES, mode="w+b")
    carry = ""
    total_size = 0
    try:
        for offset in range(0, len(data), _BASE64_DECODE_CHUNK_CHARS):
            chunk = "".join(data[offset : offset + _BASE64_DECODE_CHUNK_CHARS].split())
            if not chunk:
                continue
            pending = carry + chunk
            decode_len = (len(pending) // 4) * 4
            if decode_len == 0:
                carry = pending
                continue
            decoded = base64.b64decode(pending[:decode_len])
            total_size += len(decoded)
            if total_size > _IMAGE_DOWNLOAD_MAX_BYTES:
                _raise_image_too_large(total_size)
            spooled.write(decoded)
            carry = pending[decode_len:]

        if carry:
            decoded = base64.b64decode(carry)
            total_size += len(decoded)
            if total_size > _IMAGE_DOWNLOAD_MAX_BYTES:
                _raise_image_too_large(total_size)
            spooled.write(decoded)
        spooled.seek(0)
        return spooled
    except (binascii.Error, ValueError):
        spooled.close()
        raise


def _file_size(file_obj: Any) -> int:
    current = file_obj.tell()
    file_obj.seek(0, 2)
    size = file_obj.tell()
    file_obj.seek(current)
    return size


async def _upload_image_file(
    file_obj: Any,
    *,
    user_id: str,
    filename: str,
    content_type: str,
) -> dict[str, Any]:
    storage = await get_or_init_storage()
    size = await run_blocking_io(_file_size, file_obj)
    await run_blocking_io(file_obj.seek, 0)
    result = await storage.upload_file(
        file_obj,
        folder=f"generated-images/{user_id}",
        filename=filename,
        content_type=content_type,
    )
    return {
        "key": result.key,
        "url": result.url,
        "size": getattr(result, "size", size),
        "content_type": getattr(result, "content_type", content_type),
    }


def _extract_image_payload(data: dict[str, Any]) -> tuple[SpooledTemporaryFile | None, str]:
    if isinstance(data.get("b64_json"), str) and data["b64_json"].strip():
        raw = _decode_base64_to_spooled_file(data["b64_json"])
        return raw, "image/png"

    if isinstance(data.get("url"), str) and data["url"].strip():
        parsed = urlparse(data["url"])
        filename = parsed.path.rstrip("/").split("/")[-1] or "image.png"
        mime = _guess_mime(filename)
        return None, mime

    if isinstance(data.get("base64"), str) and data["base64"].strip():
        raw = _decode_base64_to_spooled_file(data["base64"])
        return raw, "image/png"

    if isinstance(data.get("data"), str) and data["data"].strip():
        raw = _decode_base64_to_spooled_file(data["data"])
        return raw, "image/png"

    raise ValueError("Image API response did not include a readable image payload")


def _extract_response_items(body: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("data", "images", "output"):
        raw_items = body.get(key)
        if isinstance(raw_items, list):
            items: list[dict[str, Any]] = []
            for item in raw_items:
                if isinstance(item, dict):
                    items.append(item)
                elif isinstance(item, str) and item.strip():
                    items.append({"url": item})
            if items:
                return items
        if isinstance(raw_items, dict):
            return [raw_items]
        if isinstance(raw_items, str) and raw_items.strip():
            return [{"url": raw_items}]

    for key in ("b64_json", "url"):
        value = body.get(key)
        if isinstance(value, str) and value.strip():
            return [body]
    return []


async def _convert_result_item(
    item: dict[str, Any],
    *,
    user_id: str,
    runtime: ToolRuntime | None,
    index: int,
) -> dict[str, Any]:
    payload = item.get("result") if isinstance(item.get("result"), dict) else item
    if not isinstance(payload, dict):
        raise ValueError("Image API response item is not an object")

    image_file, mime = await run_blocking_io(_extract_image_payload, payload)
    if image_file is None and isinstance(payload.get("url"), str):
        image_file, source_mime, _ = await _download_image_source(payload["url"], runtime)
        mime = source_mime
    if image_file is None:
        raise ValueError("Image API response did not include image data")
    filename = _generated_filename(mime, index)

    try:
        uploaded = await _upload_image_file(
            image_file,
            user_id=user_id,
            filename=filename,
            content_type=mime,
        )
    finally:
        image_file.close()
    base_url = get_base_url_from_runtime(runtime)
    proxy_url = (
        f"{base_url}/api/upload/file/{uploaded['key']}"
        if base_url
        else f"/api/upload/file/{uploaded['key']}"
    )
    result: dict[str, Any] = {
        "url": proxy_url,
        "key": uploaded["key"],
        "content_type": uploaded["content_type"],
    }
    if payload.get("revised_prompt"):
        result["revised_prompt"] = payload.get("revised_prompt")
    return result


async def _call_generation_api(
    *,
    prompt: str,
    background: str,
    size: str,
    quality: str,
    n: int,
    output_format: str,
    model: str | None,
    provider: str | None,
    negative_prompt: str | None,
    seed: int | None,
    steps: int | None,
    guidance_scale: float | None,
    strength: float | None,
    extra_options: Mapping[str, Any] | None,
    runtime: ToolRuntime | None,
) -> dict[str, Any]:
    runtime_config, error = await _resolve_image_runtime_config(
        operation="generation",
        model=model,
        provider=provider,
    )
    if error:
        return {"error": error}
    if runtime_config is None:
        return {"error": "Image generation runtime configuration could not be resolved"}

    resolved_model = runtime_config.model
    profile = runtime_config.profile
    user_id = get_user_id_from_runtime(runtime) or "anonymous"

    headers = {
        "Authorization": f"Bearer {runtime_config.api_key}",
    }
    canonical: dict[str, Any] = {
        "model": resolved_model,
        "prompt": prompt,
        "background": _enum_value(background),
        "size": _normalize_image_size(size),
        "quality": _enum_value(quality),
        "n": max(1, min(int(n), profile.max_n)),
        "output_format": _enum_value(output_format),
        "negative_prompt": negative_prompt,
        "seed": seed,
        "steps": steps,
        "guidance_scale": guidance_scale,
        "strength": strength,
    }
    prepared = _build_prepared_payload(
        profile,
        operation="generation",
        canonical=canonical,
        extra_options=extra_options,
    )

    async with httpx.AsyncClient(timeout=runtime_config.timeout) as client:
        body = await _post_image_api_with_retries(
            client,
            _join_api_url(runtime_config.base_url, profile.generation_endpoint),
            operation="generation",
            headers=headers,
            json=prepared.payload,
        )

    items = _extract_response_items(body) if isinstance(body, dict) else []

    if not items:
        return {
            "error": "Image API did not return any image data",
            "raw_response": body,
        }

    images = []
    for index, item in enumerate(items):
        images.append(
            await _convert_result_item(
                item,
                user_id=user_id,
                runtime=runtime,
                index=index,
            )
        )

    return _response_with_metadata(
        {
            "success": True,
            "images": images,
        },
        profile=profile,
        model=resolved_model,
        operation="generation",
        dropped_parameters=prepared.dropped_parameters,
    )


async def _call_edit_api(
    *,
    prompt: str,
    input_images: list[str],
    background: str,
    input_fidelity: str,
    size: str,
    quality: str,
    n: int,
    output_format: str,
    model: str | None,
    provider: str | None,
    negative_prompt: str | None,
    seed: int | None,
    steps: int | None,
    guidance_scale: float | None,
    strength: float | None,
    extra_options: Mapping[str, Any] | None,
    runtime: ToolRuntime | None,
) -> dict[str, Any]:
    runtime_config, error = await _resolve_image_runtime_config(
        operation="edit",
        model=model,
        provider=provider,
    )
    if error:
        return {"error": error}
    if runtime_config is None:
        return {"error": "Image generation runtime configuration could not be resolved"}

    resolved_model = runtime_config.model
    profile = runtime_config.profile
    if not profile.supports_edit or not profile.edit_endpoint:
        return {"error": f"Image provider '{profile.name}' does not support image edits"}

    user_id = get_user_id_from_runtime(runtime) or "anonymous"

    source_files = []
    files: list[tuple[str, tuple[str, Any, str]]] = []
    try:
        for index, image_url in enumerate(input_images[: profile.max_input_images]):
            image_file, content_type, filename = await _download_image_source(
                image_url,
                runtime,
                index=index,
            )
            source_files.append(image_file)
            files.append((profile.file_field_name, (filename, image_file, content_type)))

        canonical: dict[str, Any] = {
            "model": resolved_model,
            "prompt": prompt,
            "background": _enum_value(background),
            "input_fidelity": _enum_value(input_fidelity),
            "size": _normalize_image_size(size),
            "quality": _enum_value(quality),
            "n": max(1, min(int(n), profile.max_n)),
            "output_format": _enum_value(output_format),
            "negative_prompt": negative_prompt,
            "seed": seed,
            "steps": steps,
            "guidance_scale": guidance_scale,
            "strength": strength,
        }
        prepared = _build_prepared_payload(
            profile,
            operation="edit",
            canonical=canonical,
            extra_options=extra_options,
        )

        async with httpx.AsyncClient(timeout=runtime_config.timeout) as client:
            body = await _post_image_api_with_retries(
                client,
                _join_api_url(runtime_config.base_url, profile.edit_endpoint),
                operation="edit",
                headers={"Authorization": f"Bearer {runtime_config.api_key}"},
                data=prepared.payload,
                files=files,
            )
    finally:
        for image_file in source_files:
            image_file.close()

    items = _extract_response_items(body) if isinstance(body, dict) else []

    if not items:
        return {
            "error": "Image API did not return any image data",
            "raw_response": body,
        }

    images = []
    for index, item in enumerate(items):
        images.append(
            await _convert_result_item(
                item,
                user_id=user_id,
                runtime=runtime,
                index=index,
            )
        )

    return _response_with_metadata(
        {
            "success": True,
            "images": images,
        },
        profile=profile,
        model=resolved_model,
        operation="edit",
        dropped_parameters=prepared.dropped_parameters,
    )


@tool
async def image_generate(
    prompt: Annotated[str, "Describe the image you want to create or edit."],
    input_images: Annotated[
        list[str] | None,
        "Optional source image URLs or project file URLs. Provide one or more images to switch to image-to-image mode; leave empty for pure text-to-image.",
    ] = None,
    mode: Annotated[
        ImageMode,
        "Operation mode. Use auto to generate when no input image is provided and edit when input images are provided.",
    ] = ImageMode.AUTO,
    model: Annotated[
        str | None,
        "Optional image model override. Defaults to IMAGE_GENERATION_MODEL.",
    ] = None,
    provider: Annotated[
        str | None,
        "Optional provider adapter override such as openai_images, generic_openai_images, or siliconflow.",
    ] = None,
    background: Annotated[
        ImageBackground,
        "Background handling for the generated image. Choose auto, opaque, or transparent.",
    ] = ImageBackground.AUTO,
    input_fidelity: Annotated[
        ImageInputFidelity,
        "How strongly edits should preserve the input image. Choose low or high.",
    ] = ImageInputFidelity.LOW,
    size: Annotated[
        ImageSize,
        "Canvas size for the result. Choose square, portrait, or landscape.",
    ] = ImageSize.SQUARE,
    quality: Annotated[
        ImageQuality,
        "Generation quality. Choose auto, low, medium, or high.",
    ] = ImageQuality.AUTO,
    n: Annotated[
        int,
        "Number of images to generate. Values outside 1-10 are clamped.",
    ] = 1,
    output_format: Annotated[
        ImageOutputFormat,
        "Output file format. Choose png, jpeg, or webp.",
    ] = ImageOutputFormat.PNG,
    negative_prompt: Annotated[
        str | None,
        "Optional negative prompt for providers or models that support it.",
    ] = None,
    seed: Annotated[int | None, "Optional random seed for providers that support it."] = None,
    steps: Annotated[
        int | None, "Optional inference step count for providers that support it."
    ] = None,
    guidance_scale: Annotated[
        float | None,
        "Optional guidance scale / CFG value for providers that support it.",
    ] = None,
    strength: Annotated[
        float | None,
        "Optional image-to-image strength for providers that support it.",
    ] = None,
    extra_options: Annotated[
        dict[str, Any] | None,
        "Provider-specific raw options. Null values remove a generated provider parameter.",
    ] = None,
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Generate or edit images with an OpenAI-compatible image API.

    Use this tool for either:
    - text-to-image generation when only `prompt` is provided
    - image-to-image editing when `input_images` is provided

    The tool accepts a common set of image options and maps them through the configured
    provider profile before calling the remote API. Unsupported options are dropped unless
    the profile enables strict parameter validation. Input images can be uploaded files,
    project file URLs, or other accessible image URLs.

    The response contains uploaded image URLs plus metadata such as the generated file key
    and any revised prompt returned by the image API.
    """
    try:
        input_image_list = list(input_images or [])
        resolved_mode = _enum_value(mode)
        if resolved_mode == ImageMode.AUTO.value:
            operation = "edit" if input_image_list else "generation"
        elif resolved_mode in {ImageMode.EDIT.value, ImageMode.IMG2IMG.value}:
            operation = "edit"
        else:
            operation = "generation"

        if operation == "edit" and not input_image_list:
            return await _json_dumps_result({"error": "input_images is required for image edits"})
        if operation == "generation" and input_image_list and resolved_mode != ImageMode.AUTO.value:
            return await _json_dumps_result({"error": "mode=generate does not accept input_images"})

        if operation == "edit":
            result = await _call_edit_api(
                prompt=prompt,
                input_images=input_image_list,
                background=background,
                input_fidelity=input_fidelity,
                size=size,
                quality=quality,
                n=n,
                output_format=output_format,
                model=model,
                provider=provider,
                negative_prompt=negative_prompt,
                seed=seed,
                steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,
                extra_options=extra_options,
                runtime=runtime,
            )
        else:
            result = await _call_generation_api(
                prompt=prompt,
                background=background,
                size=size,
                quality=quality,
                n=n,
                output_format=output_format,
                model=model,
                provider=provider,
                negative_prompt=negative_prompt,
                seed=seed,
                steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,
                extra_options=extra_options,
                runtime=runtime,
            )
        return await _json_dumps_result(result)
    except Exception as exc:
        logger.warning("[image_generate] failed: %s", exc)
        return await _json_dumps_result({"error": f"Image generation failed: {exc}"})


def get_image_generation_tool() -> BaseTool:
    return image_generate
