from __future__ import annotations

from types import SimpleNamespace

from src.infra.task.arq_settings import build_arq_redis_settings


def test_build_arq_redis_settings_uses_project_redis_url() -> None:
    settings = SimpleNamespace(
        REDIS_URL="redis://redis.example:6380/2",
        REDIS_PASSWORD=None,
    )

    redis_settings = build_arq_redis_settings(settings)

    assert redis_settings.host == "redis.example"
    assert redis_settings.port == 6380
    assert redis_settings.database == 2


def test_build_arq_redis_settings_prefers_explicit_project_password() -> None:
    settings = SimpleNamespace(
        REDIS_URL="redis://:url-password@redis.example:6379/0",
        REDIS_PASSWORD="settings-password",
    )

    redis_settings = build_arq_redis_settings(settings)

    assert redis_settings.password == "settings-password"


def test_build_arq_redis_settings_supports_rediss_scheme() -> None:
    settings = SimpleNamespace(
        REDIS_URL="rediss://redis.example:6379/0",
        REDIS_PASSWORD=None,
    )

    redis_settings = build_arq_redis_settings(settings)

    assert redis_settings.ssl is True
