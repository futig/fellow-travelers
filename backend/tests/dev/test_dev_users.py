from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.telegram import InitDataError, validate_init_data
from app.config import Settings
from app.dev import users as dev
from app.models import User
from tests.helpers.telegram import BOT_TOKEN

NOW = datetime.now(UTC)
MAX_AGE = timedelta(days=1)


def _settings(*, debug: bool) -> Settings:
    return Settings.model_construct(
        database_url="x", bot_token=SecretStr(BOT_TOKEN), bot_username="b", debug=debug
    )


def test_init_data_passes_validation_with_same_token() -> None:
    for user in dev.DEV_USERS:
        raw = dev.build_init_data(user, BOT_TOKEN)
        parsed = validate_init_data(raw, bot_token=BOT_TOKEN, max_age=MAX_AGE, now=NOW)
        assert parsed.user.id == user.telegram_id
        assert parsed.user.first_name == user.first_name
        assert parsed.user.last_name == user.last_name
        assert parsed.user.username == user.username


def test_init_data_rejected_with_other_token() -> None:
    raw = dev.build_init_data(dev.DEV_USERS[0], BOT_TOKEN)
    with pytest.raises(InitDataError):
        validate_init_data(raw, bot_token="other-token", max_age=MAX_AGE, now=NOW)


def test_anton_has_no_username() -> None:
    assert dev.DEV_USERS[2].username is None


def test_env_keeps_foreign_lines_and_replaces_ours() -> None:
    existing = (
        "# Сгенерировано: python -m app.dev.users (2020-01-01). старый\n"
        "VITE_BOT_USERNAME=my_bot\n"
        "VITE_MOCK_TELEGRAM=false\n"
        "VITE_DEV_USERS=old\n"
        "OTHER=1\n"
    )
    out = dev.render_env(existing, "NEW", today=NOW.date(), max_age_seconds=86400)
    lines = out.splitlines()
    assert lines[0].startswith("# Сгенерировано: python -m app.dev.users")
    assert "2020-01-01" not in out
    assert "VITE_MOCK_TELEGRAM=true" in lines
    assert "VITE_DEV_USERS=NEW" in lines
    assert "VITE_BOT_USERNAME=my_bot" in lines
    assert "OTHER=1" in lines
    assert "old" not in out
    assert out.count("VITE_DEV_USERS=") == 1


def test_env_from_empty_file() -> None:
    out = dev.render_env("", "X", today=NOW.date(), max_age_seconds=1)
    assert out.splitlines()[1:] == ["VITE_MOCK_TELEGRAM=true", "VITE_DEV_USERS=X"]


def test_dev_users_roundtrip() -> None:
    entries = [(dev.label_for(u), dev.build_init_data(u, BOT_TOKEN)) for u in dev.DEV_USERS]
    encoded = dev.encode_dev_users(entries)
    assert not set("=+/") & set(encoded)
    decoded = dev.decode_dev_users(encoded)
    assert [(d["label"], d["init_data"]) for d in decoded] == entries
    assert decoded[0]["label"] == "Иван Петров · +7 999 000-00-01"


def test_select_users_bounds() -> None:
    assert len(dev.select_users(3)) == 3
    for bad in (0, 6):
        with pytest.raises(ValueError, match="--count"):
            dev.select_users(bad)


def test_refuses_without_debug_and_force() -> None:
    assert dev.check_allowed(_settings(debug=False), force=False) is not None
    assert dev.check_allowed(_settings(debug=True), force=False) is None
    assert dev.check_allowed(_settings(debug=False), force=True) is None


def test_main_refuses_without_debug(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(dev, "get_settings", lambda: _settings(debug=False))
    target = tmp_path / "env"
    assert dev.main(["--frontend-env", str(target)]) == 1
    assert "DEBUG=true" in capsys.readouterr().err
    assert not target.exists()


async def test_create_dev_users_is_idempotent(db_session: AsyncSession) -> None:
    users = dev.select_users(3)
    await dev.create_dev_users(db_session, users)
    await dev.create_dev_users(db_session, users)
    rows = (
        (
            await db_session.execute(
                select(User).where(User.telegram_id.in_(u.telegram_id for u in users))
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 3
    by_id = {r.telegram_id: r for r in rows}
    for u in users:
        assert by_id[u.telegram_id].phone == u.phone
        assert by_id[u.telegram_id].username == u.username
    assert by_id[900000003].username is None
    total = await db_session.scalar(
        select(func.count())
        .select_from(User)
        .where(User.telegram_id.in_(u.telegram_id for u in users))
    )
    assert total == 3
