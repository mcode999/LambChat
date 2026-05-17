from src.infra.persona_preset.storage import PersonaPresetStorage


def test_admin_visibility_query_keeps_user_presets_owner_scoped() -> None:
    query = PersonaPresetStorage._build_visible_query(
        user_id="admin-1",
        include_admin=True,
    )

    assert query == {
        "$or": [
            {"scope": "user", "owner_user_id": "admin-1"},
            {"scope": "global"},
        ]
    }


def test_admin_visibility_query_combines_scope_filter_with_owner_visibility() -> None:
    query = PersonaPresetStorage._build_visible_query(
        user_id="admin-1",
        include_admin=True,
        scope="user",
    )

    assert query == {
        "$or": [
            {"scope": "user", "owner_user_id": "admin-1"},
            {"scope": "global"},
        ],
        "scope": "user",
    }
