from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Location, LocationKind, User
from tests.api.conftest import auth_headers
from tests.helpers.contract import assert_contract


async def search(client: AsyncClient, **params: Any) -> Any:
    response = await client.get("/locations", params=params, headers=auth_headers())
    assert_contract(response, "GET", "/locations")
    return response


def codes(response: Any) -> list[str]:
    return [item["code"] for item in response.json()]


@pytest.mark.parametrize("q", ["svo", "SVO", " Svo "])
async def test_search_by_code(api_client: AsyncClient, user: User, q: str) -> None:
    response = await search(api_client, q=q)

    assert response.status_code == 200
    assert codes(response) == ["SVO"]
    assert response.json()[0] == {
        "id": response.json()[0]["id"],
        "kind": "airport",
        "code": "SVO",
        "name": "Шереметьево",
        "city": "Москва",
        "country": "RU",
        "timezone": "Europe/Moscow",
    }


async def test_search_by_city_case_insensitive(api_client: AsyncClient, user: User) -> None:
    response = await search(api_client, q="моск")

    assert response.status_code == 200
    assert codes(response) == ["DME", "SVO", "VKO"]


async def test_search_by_name_substring(api_client: AsyncClient, user: User) -> None:
    response = await search(api_client, q="ольцов")

    assert codes(response) == ["SVX"]


async def test_exact_code_goes_first(
    api_client: AsyncClient, db_session: AsyncSession, user: User
) -> None:
    db_session.add_all(
        [
            Location(
                kind=LocationKind.AIRPORT,
                code="ZZZ",
                name="Тест",
                city="Svoboda",
                country="RU",
                timezone="Europe/Moscow",
            ),
            Location(
                kind=LocationKind.AIRPORT,
                code="SVOA",
                name="Тест 2",
                city="Яр",
                country="RU",
                timezone="Europe/Moscow",
            ),
            Location(
                kind=LocationKind.AIRPORT,
                code="QQQ",
                name="Svoboda name",
                city="Яя",
                country="RU",
                timezone="Europe/Moscow",
            ),
        ]
    )
    await db_session.flush()

    response = await search(api_client, q="svo")

    assert codes(response) == ["SVO", "SVOA", "ZZZ", "QQQ"]


@pytest.mark.parametrize("q", ["%%", "S_O", "_VO", "\\\\"])
async def test_like_wildcards_are_literal(api_client: AsyncClient, user: User, q: str) -> None:
    response = await search(api_client, q=q)

    assert response.status_code == 200
    assert response.json() == []


async def test_limit_is_20(api_client: AsyncClient, db_session: AsyncSession, user: User) -> None:
    db_session.add_all(
        Location(
            kind=LocationKind.AIRPORT,
            code=f"T{i:02d}",
            name=f"Порт {i}",
            city="Тестоград",
            country="RU",
            timezone="Europe/Moscow",
        )
        for i in range(25)
    )
    await db_session.flush()

    response = await search(api_client, q="тестоград")

    assert len(response.json()) == 20


async def test_kind_filter(api_client: AsyncClient, db_session: AsyncSession, user: User) -> None:
    empty = await search(api_client, q="svo", kind="station")
    assert empty.json() == []

    db_session.add(
        Location(
            kind=LocationKind.STATION,
            code="SVOS",
            name="Вокзал",
            city="Москва",
            country="RU",
            timezone="Europe/Moscow",
        )
    )
    await db_session.flush()

    assert codes(await search(api_client, q="svo", kind="station")) == ["SVOS"]
    assert codes(await search(api_client, q="svo", kind="airport")) == ["SVO"]


@pytest.mark.parametrize(
    "params", [{"q": "s"}, {"q": " s "}, {"q": ""}, {}, {"q": "svo", "kind": "x"}]
)
async def test_invalid_query_is_422(
    api_client: AsyncClient, user: User, params: dict[str, str]
) -> None:
    response = await search(api_client, **params)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_requires_auth(api_client: AsyncClient) -> None:
    response = await api_client.get("/locations", params={"q": "svo"})

    assert response.status_code == 401
    assert_contract(response, "GET", "/locations")
