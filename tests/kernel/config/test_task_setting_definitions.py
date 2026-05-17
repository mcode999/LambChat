from __future__ import annotations

from src.kernel.config.definitions import SETTING_DEFINITIONS


def test_arq_worker_max_jobs_is_admin_setting_not_frontend_visible() -> None:
    definition = SETTING_DEFINITIONS["ARQ_WORKER_MAX_JOBS"]

    assert definition["default"] == 64
    assert definition.get("frontend_visible", False) is False
