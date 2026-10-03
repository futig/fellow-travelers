from datetime import date
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import Select, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApplicationStatus, User
from tests.api.conftest import auth_headers
from tests.factories import make_application, make_event, make_membership, make_user
from tests.helpers.contract import assert_contract

SOME_ID = "6f1b7a52-3c9e-4f5a-9d44-1a2b3c4d5e6f"

ENDPOINTS = [
    ("GET", "/me", "/me"),
    ("GET", "/me/events", "/me/events"),
    ("POST", "/events", "/events"),
    ("GET", f"/events/{SOME_ID}", "/events/{event_id}"),
    ("PATCH", f"/events/{SOME_ID}", "/events/{event_id}"),
    ("GET", f"/events/{SOME_ID}/invite", "/events/{event_id}/invite"),
]


@pytest.mark.parametrize(("method", "url", "template"), ENDPOINTS)
async def test_requires_authorization(
    api_client: AsyncClient, method: str, url: str, template: str
) -> None:
    response = await api_client.request(method, url)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert_contract(response, method, template)


async def test_first_request_creates_user(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    response = await api_client.get(
        "/me", headers=auth_headers(7, first_name="Anna", last_name="K", username="anna")
    )

    assert response.status_code == 200
    assert_contract(response, "GET", "/me")
    body = response.json()
    assert body["telegram_id"] == 7
    assert body["first_name"] == "Anna"
    assert body["last_name"] == "K"
    assert body["username"] == "anna"
    assert body["phone"] is None
    assert body["has_phone"] is False
    stored = (await db_session.execute(select(User).where(User.telegram_id == 7))).scalar_one()
    assert str(stored.id) == body["user_id"]


async def test_repeat_request_updates_profile(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    first = await api_client.get("/me", headers=auth_headers(7, first_name="Anna"))
    second = await api_client.get(
        "/me", headers=auth_headers(7, first_name="Anya", username="anya", last_name="K")
    )

    assert_contract(second, "GET", "/me")
    body = second.json()
    assert body["user_id"] == first.json()["user_id"]
    assert (body["first_name"], body["last_name"], body["username"]) == ("Anya", "K", "anya")
    count = await db_session.scalar(
        select(func.count()).select_from(User).where(User.telegram_id == 7)
    )
    assert count == 1


async def test_profile_cleared_in_telegram_is_cleared(api_client: AsyncClient) -> None:
    await api_client.get("/me", headers=auth_headers(7, username="anna"))
    response = await api_client.get("/me", headers=auth_headers(7, username=None))

    assert_contract(response, "GET", "/me")
    assert response.json()["username"] is None


async def test_unchanged_profile_is_not_rewritten(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    await api_client.get("/me", headers=auth_headers(7))
    query: Select[Any] = (
        select(literal_column("xmin")).select_from(User).where(User.telegram_id == 7)
    )
    version = await db_session.scalar(query)

    await api_client.get("/me", headers=auth_headers(7))

    assert await db_session.scalar(query) == version


async def test_phone_is_never_overwritten(api_client: AsyncClient, user: User) -> None:
    response = await api_client.get("/me", headers=auth_headers(first_name="Vanya"))

    assert_contract(response, "GET", "/me")
    body = response.json()
    assert body["first_name"] == "Vanya"
    assert body["phone"] == "+79991234567"
    assert body["has_phone"] is True


async def test_me_events_empty(api_client: AsyncClient, user: User) -> None:
    response = await api_client.get("/me/events", headers=auth_headers())

    assert response.status_code == 200
    assert_contract(response, "GET", "/me/events")
    assert response.json() == []


async def test_me_events_admin_participant_and_status(
    api_client: AsyncClient, db_session: AsyncSession, user: User, other_user: User
) -> None:
    own = await make_event(db_session, admin_id=user.id, title="Своя")
    foreign = await make_event(db_session, admin_id=other_user.id, title="Чужая")
    await make_membership(db_session, event_id=foreign.id, user_id=user.id)
    await make_application(
        db_session, event_id=foreign.id, user_id=user.id, status=ApplicationStatus.SOLO
    )

    response = await api_client.get("/me/events", headers=auth_headers())

    assert_contract(response, "GET", "/me/events")
    by_id = {item["id"]: item for item in response.json()}
    assert set(by_id) == {str(own.id), str(foreign.id)}
    assert by_id[str(own.id)] == {
        "id": str(own.id),
        "title": "Своя",
        "starts_on": "2026-11-12",
        "ends_on": "2026-11-14",
        "is_admin": True,
        "is_participant": False,
        "my_application_status": None,
    }
    assert by_id[str(foreign.id)]["is_admin"] is False
    assert by_id[str(foreign.id)]["is_participant"] is True
    assert by_id[str(foreign.id)]["my_application_status"] == "solo"


async def test_me_events_admin_and_participant_is_single_entry(
    api_client: AsyncClient, db_session: AsyncSession, user: User
) -> None:
    event = await make_event(db_session, admin_id=user.id)
    await make_membership(db_session, event_id=event.id, user_id=user.id)

    response = await api_client.get("/me/events", headers=auth_headers())

    assert_contract(response, "GET", "/me/events")
    items = response.json()
    assert len(items) == 1
    assert items[0]["is_admin"] is True
    assert items[0]["is_participant"] is True


async def test_me_events_hides_foreign_groups(
    api_client: AsyncClient, db_session: AsyncSession, user: User, other_user: User
) -> None:
    foreign = await make_event(db_session, admin_id=other_user.id)
    third = await make_user(db_session)
    await make_membership(db_session, event_id=foreign.id, user_id=third.id)
    await make_application(db_session, event_id=foreign.id, user_id=third.id)

    response = await api_client.get("/me/events", headers=auth_headers())

    assert_contract(response, "GET", "/me/events")
    assert response.json() == []


async def test_me_events_other_users_application_is_not_mixed_in(
    api_client: AsyncClient, db_session: AsyncSession, user: User, other_user: User
) -> None:
    event = await make_event(db_session, admin_id=other_user.id)
    await make_membership(db_session, event_id=event.id, user_id=user.id)
    await make_application(db_session, event_id=event.id, user_id=other_user.id)

    response = await api_client.get("/me/events", headers=auth_headers())

    assert_contract(response, "GET", "/me/events")
    items = response.json()
    assert len(items) == 1
    assert items[0]["my_application_status"] is None


async def test_me_events_order(
    api_client: AsyncClient, db_session: AsyncSession, user: User
) -> None:
    def dates(month: int) -> dict[str, date]:
        return {"starts_on": date(2026, month, 1), "ends_on": date(2026, month, 2)}

    await make_event(db_session, admin_id=user.id, title="B", **dates(12))
    await make_event(db_session, admin_id=user.id, title="Б", **dates(11))
    await make_event(db_session, admin_id=user.id, title="A", **dates(11))

    response = await api_client.get("/me/events", headers=auth_headers())

    assert_contract(response, "GET", "/me/events")
    assert [item["title"] for item in response.json()] == ["A", "Б", "B"]
