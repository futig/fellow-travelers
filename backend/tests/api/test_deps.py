from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.auth.telegram import InitData, TelegramUser
from app.models import User


def _init_data(telegram_id: int, first_name: str) -> InitData:
    tg = TelegramUser(
        id=telegram_id,
        first_name=first_name,
        last_name=None,
        username=None,
        photo_url=None,
        language_code=None,
    )
    return InitData(user=tg, auth_date=datetime.now(UTC), start_param=None)


@pytest.mark.parametrize("changed", [False, True])
async def test_get_current_user_always_commits(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch, changed: bool
) -> None:
    """Commit нужен и без изменений, иначе блокировка строки живёт до конца запроса."""
    await get_current_user(_init_data(900, "Anna"), db_session)
    commit = AsyncMock(wraps=db_session.commit)
    monkeypatch.setattr(db_session, "commit", commit)

    user = await get_current_user(_init_data(900, "Anya" if changed else "Anna"), db_session)

    assert isinstance(user, User)
    assert user.first_name == ("Anya" if changed else "Anna")
    commit.assert_awaited_once()


async def test_get_current_user_commits_on_insert(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    commit = AsyncMock(wraps=db_session.commit)
    monkeypatch.setattr(db_session, "commit", commit)

    await get_current_user(_init_data(901, "New"), db_session)

    commit.assert_awaited_once()
