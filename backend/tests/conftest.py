import os
from collections.abc import AsyncIterator

os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost:5432/test"
os.environ["BOT_TOKEN"] = "123456:test-token"
os.environ["BOT_USERNAME"] = "test_bot"

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture
def app() -> FastAPI:
    get_settings.cache_clear()
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
