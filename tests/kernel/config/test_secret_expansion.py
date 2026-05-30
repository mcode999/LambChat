from src.kernel.config.constants import MCP_ENCRYPTION_SALT_MIN_LENGTH
from src.kernel.config.utils import expand_encryption_salt


def test_expand_encryption_salt_is_deterministic_for_short_values() -> None:
    first = expand_encryption_salt("shared-salt")
    second = expand_encryption_salt("shared-salt")

    assert first == second
    assert len(first) >= MCP_ENCRYPTION_SALT_MIN_LENGTH
    assert first != "shared-salt"


def test_expand_encryption_salt_leaves_long_values_unchanged() -> None:
    salt = "a" * MCP_ENCRYPTION_SALT_MIN_LENGTH

    assert expand_encryption_salt(salt) == salt
