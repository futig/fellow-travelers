import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import event as sa_event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import ApplicationStatus, Event, TransferStatus, User
from tests.api.conftest import USER_TELEGRAM_ID, auth_headers
from tests.factories import (
    make_application,
    make_event,
    make_membership,
    make_transfer,
    make_trip,
    make_user,
)
from tests.helpers.contract import assert_contract

MISSING_ID = "6f1b7a52-3c9e-4f5a-9d44-1a2b3c4d5e6f"
PARTICIPANTS_PATH = "/events/{event_id}/admin/participants"
TRANSFERS_PATH = "/events/{event_id}/admin/transfers"
ADMIN_TELEGRAM_ID = 500
BASE = datetime(2026, 11, 12, 5, 5, tzinfo=UTC)

COUNTER_KEYS = ["expected", "searching", "assigned", "solo", "at_meeting_point", "departed"]


async def get_participants(
    client: AsyncClient,
    event_id: uuid.UUID | str,
    telegram_id: int = ADMIN_TELEGRAM_ID,
    params: Any = None,
) -> Response:
    response = await client.get(
        f"/events/{event_id}/admin/participants",
        params=params,
        headers=auth_headers(telegram_id),
    )
    assert_contract(response, "GET", PARTICIPANTS_PATH)
    return response


async def get_transfers(
    client: AsyncClient, event_id: uuid.UUID | str, telegram_id: int = ADMIN_TELEGRAM_ID
) -> Response:
    response = await client.get(
        f"/events/{event_id}/admin/transfers", headers=auth_headers(telegram_id)
    )
    assert_contract(response, "GET", TRANSFERS_PATH)
    return response


def counters(response: Response) -> list[int]:
    data = response.json()["counters"]
    assert list(data) == COUNTER_KEYS
    return [data[k] for k in COUNTER_KEYS]


def names(response: Response) -> list[str]:
    return [p["contact"]["first_name"] for p in response.json()["participants"]]


@pytest.fixture
async def admin(db_session: AsyncSession) -> User:
    return await make_user(db_session, telegram_id=ADMIN_TELEGRAM_ID, first_name="Ivan")


@pytest.fixture
async def event(db_session: AsyncSession, admin: User) -> Event:
    return await make_event(db_session, admin_id=admin.id)


async def person(session: AsyncSession, event: Event, name: str, **kw: Any) -> User:
    user = await make_user(session, first_name=name, phone=f"+7999{name}", **kw)
    await make_membership(session, event_id=event.id, user_id=user.id)
    return user


async def trip_at(session: AsyncSession, event: Event, minutes: int = 0) -> uuid.UUID:
    trip = await make_trip(
        session, event_id=event.id, scheduled_arrival=BASE + timedelta(minutes=minutes)
    )
    return trip.id


async def applied(
    session: AsyncSession,
    event: Event,
    name: str,
    minutes: int,
    status: ApplicationStatus = ApplicationStatus.SEARCHING,
    *,
    transfer_id: uuid.UUID | None = None,
    trip_id: uuid.UUID | None = None,
    last_name: str | None = None,
    **kw: Any,
) -> User:
    user = await person(session, event, name, last_name=last_name)
    if trip_id is None:
        trip_id = await trip_at(session, event, minutes)
    if transfer_id is None:
        kw["status"] = status
    await make_application(
        session,
        event_id=event.id,
        user_id=user.id,
        trip_id=trip_id,
        transfer_id=transfer_id,
        **kw,
    )
    return user


async def mixed_group(session: AsyncSession, event: Event) -> dict[str, Any]:
    """9 человек: B2 searching, C2+D1 (T1), E1 solo, F2 cancelled, G2+H1 (T2), A без заявки."""
    await person(session, event, "Alla")
    await applied(session, event, "Bob", 0, with_companion=True, at_meeting_point=True)
    t1 = await make_transfer(session, event_id=event.id)
    await applied(
        session, event, "Cora", 10, transfer_id=t1.id, with_companion=True, at_meeting_point=True
    )
    await applied(session, event, "Dan", 20, transfer_id=t1.id)
    await applied(session, event, "Eve", 30, ApplicationStatus.SOLO, at_meeting_point=True)
    await applied(
        session,
        event,
        "Fay",
        35,
        ApplicationStatus.CANCELLED,
        with_companion=True,
        at_meeting_point=True,
    )
    t2 = await make_transfer(session, event_id=event.id)
    await applied(
        session,
        event,
        "Gus",
        40,
        transfer_id=t2.id,
        with_companion=True,
        at_meeting_point=True,
        departed_at=BASE,
    )
    await applied(session, event, "Hal", 50, transfer_id=t2.id)
    return {"t1": t1, "t2": t2}


# ---------------------------------------------------------------- доступ


@pytest.mark.parametrize("path", [PARTICIPANTS_PATH, TRANSFERS_PATH])
async def test_requires_auth(api_client: AsyncClient, path: str) -> None:
    response = await api_client.get(path.format(event_id=MISSING_ID))

    assert response.status_code == 401
    assert_contract(response, "GET", path)


async def test_stranger_gets_404(api_client: AsyncClient, event: Event, other_user: User) -> None:
    assert (await get_participants(api_client, event.id, 43)).status_code == 404
    assert (await get_transfers(api_client, event.id, 43)).status_code == 404


async def test_unknown_event_gets_404(api_client: AsyncClient, admin: User) -> None:
    assert (await get_participants(api_client, MISSING_ID)).status_code == 404
    assert (await get_transfers(api_client, MISSING_ID)).status_code == 404


async def test_member_gets_403(
    api_client: AsyncClient, db_session: AsyncSession, event: Event, user: User
) -> None:
    await make_membership(db_session, event_id=event.id, user_id=user.id)

    assert (await get_participants(api_client, event.id, USER_TELEGRAM_ID)).status_code == 403
    assert (await get_transfers(api_client, event.id, USER_TELEGRAM_ID)).status_code == 403


@pytest.mark.parametrize(
    "params",
    [{"status": "bogus"}, {"status": ["searching", "bogus"]}, {"trip_id": "not-a-uuid"}],
)
async def test_invalid_filter_is_422(
    api_client: AsyncClient, event: Event, params: dict[str, Any]
) -> None:
    response = await get_participants(api_client, event.id, params=params)

    assert response.status_code == 422


# ---------------------------------------------------------------- участники


async def test_empty_group(api_client: AsyncClient, event: Event) -> None:
    response = await get_participants(api_client, event.id)

    assert response.status_code == 200
    assert response.json()["participants"] == []
    assert counters(response) == [0, 0, 0, 0, 0, 0]


async def test_mixed_group(api_client: AsyncClient, db_session: AsyncSession, event: Event) -> None:
    groups = await mixed_group(db_session, event)

    response = await get_participants(api_client, event.id)

    assert response.status_code == 200
    # expected = 2+6+1 (cancelled не в счёт); at_meeting_point = 2+2+1+2 без cancelled
    assert response.json()["counters"] == {
        "expected": 9,
        "searching": 2,
        "assigned": 6,
        "solo": 1,
        "at_meeting_point": 7,
        "departed": 2,
    }
    participants = response.json()["participants"]
    assert names(response) == ["Bob", "Cora", "Dan", "Eve", "Fay", "Gus", "Hal", "Alla"]
    by_name = {p["contact"]["first_name"]: p for p in participants}
    assert by_name["Alla"]["application"] is None
    assert by_name["Alla"]["contact"]["phone"] == "+7999Alla"
    bob = by_name["Bob"]["application"]
    assert bob["status"] == "searching"
    assert bob["passengers"] == 2
    assert bob["at_meeting_point"] is True
    assert bob["transfer_id"] is None
    assert by_name["Cora"]["application"]["transfer_id"] == str(groups["t1"].id)
    assert by_name["Hal"]["application"]["transfer_id"] == str(groups["t2"].id)
    assert by_name["Gus"]["application"]["departed_at"] is not None
    assert by_name["Fay"]["application"]["status"] == "cancelled"


async def test_filter_single_status(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    await mixed_group(db_session, event)
    unfiltered = counters(await get_participants(api_client, event.id))

    response = await get_participants(api_client, event.id, params={"status": "assigned"})

    assert names(response) == ["Cora", "Dan", "Gus", "Hal"]
    assert counters(response) == unfiltered


async def test_filter_two_statuses(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    await mixed_group(db_session, event)
    unfiltered = counters(await get_participants(api_client, event.id))

    response = await get_participants(
        api_client, event.id, params={"status": ["searching", "solo"]}
    )

    assert names(response) == ["Bob", "Eve"]
    assert counters(response) == unfiltered


async def test_filter_cancelled_excludes_no_application(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    await mixed_group(db_session, event)

    response = await get_participants(api_client, event.id, params={"status": "cancelled"})

    assert names(response) == ["Fay"]


async def test_filter_trip_and_combination(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    shared = await trip_at(db_session, event, 5)
    await applied(db_session, event, "Ann", 0, trip_id=shared)
    await applied(db_session, event, "Ben", 0, ApplicationStatus.SOLO, trip_id=shared)
    await applied(db_session, event, "Cat", 60)
    await person(db_session, event, "Zed")
    unfiltered = counters(await get_participants(api_client, event.id))

    by_trip = await get_participants(api_client, event.id, params={"trip_id": str(shared)})
    combined = await get_participants(
        api_client, event.id, params={"trip_id": str(shared), "status": "solo"}
    )
    none = await get_participants(
        api_client, event.id, params={"trip_id": str(shared), "status": "cancelled"}
    )

    assert names(by_trip) == ["Ann", "Ben"]
    assert names(combined) == ["Ben"]
    assert names(none) == []
    assert counters(by_trip) == counters(combined) == unfiltered == [3, 2, 0, 1, 0, 0]
    # без фильтра участник без заявки в списке
    assert names(await get_participants(api_client, event.id)) == ["Ann", "Ben", "Cat", "Zed"]


async def test_filter_unknown_trip_gives_empty(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    await mixed_group(db_session, event)

    response = await get_participants(api_client, event.id, params={"trip_id": MISSING_ID})

    assert response.json()["participants"] == []
    assert counters(response)[0] == 9


async def test_order(api_client: AsyncClient, db_session: AsyncSession, event: Event) -> None:
    same = await trip_at(db_session, event, 20)
    await person(db_session, event, "Yuri")
    await person(db_session, event, "Anna")
    await applied(db_session, event, "Zoe", 0, trip_id=same)
    await applied(db_session, event, "Mia", 0, trip_id=same)
    await applied(db_session, event, "Kim", 0, trip_id=same, last_name="B")
    await applied(db_session, event, "Kim", 0, trip_id=same, last_name="A")
    await applied(db_session, event, "Late", 90)
    # расчётное прибытие раньше расписания меняет порядок
    early = await make_trip(
        db_session,
        event_id=event.id,
        scheduled_arrival=BASE + timedelta(minutes=200),
        estimated_arrival=BASE + timedelta(minutes=1),
    )
    await applied(db_session, event, "Est", 0, trip_id=early.id)

    response = await get_participants(api_client, event.id)

    assert names(response) == ["Est", "Kim", "Kim", "Mia", "Zoe", "Late", "Anna", "Yuri"]
    kims = [
        p["contact"]["last_name"]
        for p in response.json()["participants"]
        if p["contact"]["first_name"] == "Kim"
    ]
    assert kims == ["A", "B"]


async def test_admin_as_member_is_listed(
    api_client: AsyncClient, db_session: AsyncSession, event: Event, admin: User
) -> None:
    await make_membership(db_session, event_id=event.id, user_id=admin.id)

    response = await get_participants(api_client, event.id)

    assert names(response) == ["Ivan"]
    assert response.json()["participants"][0]["application"] is None


async def test_admin_without_membership_not_listed(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    await person(db_session, event, "Ann")

    assert names(await get_participants(api_client, event.id)) == ["Ann"]


async def test_other_group_not_included(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    other = await make_event(db_session)
    await applied(db_session, other, "Alien", 0)
    await applied(db_session, event, "Ann", 0)

    response = await get_participants(api_client, event.id)

    assert names(response) == ["Ann"]
    assert counters(response) == [1, 1, 0, 0, 0, 0]


# ---------------------------------------------------------------- трансферы


async def test_transfers_empty(api_client: AsyncClient, event: Event) -> None:
    response = await get_transfers(api_client, event.id)

    assert response.status_code == 200
    assert response.json() == []


async def test_transfers_order_and_content(
    api_client: AsyncClient, db_session: AsyncSession, event: Event, admin: User
) -> None:
    later = await make_transfer(db_session, event_id=event.id)
    earlier = await make_transfer(db_session, event_id=event.id)
    await applied(db_session, event, "L1", 50, transfer_id=later.id, with_companion=True)
    await applied(db_session, event, "L2", 60, transfer_id=later.id)
    await applied(db_session, event, "E1", 5, transfer_id=earlier.id)
    # админ сам в трансфере — всё равно is_me=false
    admin_trip = await trip_at(db_session, event, 70)
    await make_membership(db_session, event_id=event.id, user_id=admin.id)
    await make_application(
        db_session, event_id=event.id, user_id=admin.id, trip_id=admin_trip, transfer_id=earlier.id
    )

    response = await get_transfers(api_client, event.id)

    data = response.json()
    assert [t["id"] for t in data] == [str(earlier.id), str(later.id)]
    assert [m["contact"]["first_name"] for m in data[0]["members"]] == ["E1", "Ivan"]
    assert data[1]["passengers_total"] == 3
    assert all(not m["is_me"] for t in data for m in t["members"])
    assert data[0]["members"][0]["contact"]["phone"] == "+7999E1"


async def test_transfers_tie_broken_by_created_at(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await trip_at(db_session, event, 0)
    first = await make_transfer(db_session, event_id=event.id)
    second = await make_transfer(db_session, event_id=event.id)
    # created_at у обоих может совпасть в одной транзакции — разводим явно
    first.created_at = BASE
    second.created_at = BASE + timedelta(seconds=1)
    await db_session.flush()
    for transfer, name in ((second, "S"), (first, "F")):
        await applied(db_session, event, name, 0, transfer_id=transfer.id, trip_id=trip)

    data = (await get_transfers(api_client, event.id)).json()

    assert [t["id"] for t in data] == [str(first.id), str(second.id)]


async def test_departed_transfer_is_listed(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    done = await make_transfer(db_session, event_id=event.id, status=TransferStatus.DEPARTED)
    await applied(db_session, event, "A", 0, transfer_id=done.id, departed_at=BASE)
    await applied(db_session, event, "B", 5, transfer_id=done.id, departed_at=BASE)

    data = (await get_transfers(api_client, event.id)).json()

    assert [t["status"] for t in data] == ["departed"]
    assert all(m["departed_at"] is not None for m in data[0]["members"])


async def test_other_group_transfers_hidden(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    other = await make_event(db_session)
    foreign = await make_transfer(db_session, event_id=other.id)
    await applied(db_session, other, "X", 0, transfer_id=foreign.id)
    await applied(db_session, other, "Y", 5, transfer_id=foreign.id)

    assert (await get_transfers(api_client, event.id)).json() == []


# ---------------------------------------------------------------- без N+1


async def _count_queries(engine: AsyncEngine, client: AsyncClient, event: Event, path: str) -> int:
    statements: list[str] = []

    def record(conn: Any, cursor: Any, statement: str, *args: Any) -> None:
        statements.append(statement)

    sa_event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        response = await client.get(
            f"/events/{event.id}/admin/{path}", headers=auth_headers(ADMIN_TELEGRAM_ID)
        )
    finally:
        sa_event.remove(engine.sync_engine, "before_cursor_execute", record)
    assert response.status_code == 200
    return len(statements)


async def _group(session: AsyncSession, admin: User, size: int) -> Event:
    group = await make_event(session, admin_id=admin.id)
    transfer = await make_transfer(session, event_id=group.id)
    await person(session, group, "NoApp")
    for i in range(size):
        await applied(
            session,
            group,
            f"P{i}",
            i * 5,
            transfer_id=transfer.id if i % 2 == 0 else None,
            with_companion=i % 3 == 0,
        )
    return group


@pytest.mark.parametrize("path", ["participants", "transfers"])
async def test_query_count_does_not_grow(
    api_client: AsyncClient,
    db_session: AsyncSession,
    db_engine: AsyncEngine,
    admin: User,
    path: str,
) -> None:
    small = await _group(db_session, admin, 2)
    large = await _group(db_session, admin, 6)

    # прогрев: первый запрос админа ещё обновляет его запись при аутентификации
    await _count_queries(db_engine, api_client, small, path)
    few = await _count_queries(db_engine, api_client, small, path)
    many = await _count_queries(db_engine, api_client, large, path)

    assert few == many
