import time
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from tests.factories import make_user
from tests.helpers.telegram import BOT_TOKEN, sign_init_data, user_json

USER_TELEGRAM_ID = 42
OTHER_TELEGRAM_ID = 43


def auth_headers(telegram_id: int = USER_TELEGRAM_ID, **user_fields: Any) -> dict[str, str]:
    """Заголовок `Authorization: tma ...` с подписанным initData (auth_date = сейчас)."""
    user_fields.setdefault("first_name", "Ivan")
    fields = {
        "auth_date": str(int(time.time())),
        "user": user_json(id=telegram_id, **user_fields),
    }
    return {"Authorization": f"tma {sign_init_data(fields, BOT_TOKEN)}"}


@pytest.fixture
async def api_client(app: FastAPI, db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def override_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = override_session
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def user(db_session: AsyncSession) -> User:
    return await make_user(
        db_session,
        telegram_id=USER_TELEGRAM_ID,
        first_name="Ivan",
        username="ivan",
        phone="+79991234567",
    )


@pytest.fixture
async def other_user(db_session: AsyncSession) -> User:
    return await make_user(
        db_session,
        telegram_id=OTHER_TELEGRAM_ID,
        first_name="Petr",
        username="petr",
        phone="+79990000000",
    )
