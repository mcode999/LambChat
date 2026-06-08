from src.kernel.config.base import Settings
from src.kernel.config.definitions import SETTING_DEFINITIONS, SettingType


def test_image_generation_provider_settings_defaults_match_runtime_settings() -> None:
    settings = Settings(_env_file=None)

    assert settings.IMAGE_GENERATION_PROVIDER == "openai_images"
    assert settings.IMAGE_GENERATION_MODEL_ID == ""
    assert settings.IMAGE_GENERATION_CAPABILITIES_JSON == {}
    assert SETTING_DEFINITIONS["IMAGE_GENERATION_MODEL_ID"]["default"] == ""
    assert SETTING_DEFINITIONS["IMAGE_GENERATION_MODEL_ID"]["type"] == SettingType.SELECT
    assert SETTING_DEFINITIONS["IMAGE_GENERATION_PROVIDER"]["default"] == "openai_images"
    assert SETTING_DEFINITIONS["IMAGE_GENERATION_PROVIDER"]["type"] == SettingType.SELECT
    assert SETTING_DEFINITIONS["IMAGE_GENERATION_CAPABILITIES_JSON"]["default"] == {}
    assert SETTING_DEFINITIONS["IMAGE_GENERATION_CAPABILITIES_JSON"]["type"] == SettingType.JSON
