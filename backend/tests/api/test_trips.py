import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Trip, TripSource, User
from tests.api.conftest import auth_headers
from tests.factories import (
    get_location,
    make_application,
    make_event,
    make_membership,
    make_trip,
)
from tests.helpers.contract import assert_contract

MISSING_ID = "6f1b7a52-3c9e-4f5a-9d44-1a2b3c4d5e6f"
OTHER_TELEGRAM_ID = 43


async def trip_payload(session: AsyncSession, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "mode": "flight",
        "number": "SU 1234",
        "departure_location_id": str((await get_location(session, "OVB")).id),
        "arrival_location_id": str((await get_location(session, "SVO")).id),
        "scheduled_departure": "2026-11-12T07:30:00",
        "scheduled_arrival": "2026-11-12T10:05:00",
    }
    payload.update(overrides)
    return payload


def fields(response: Response) -> dict[str, str]:
    result: dict[str, str] = response.json()["error"]["details"]["fields"]
    return result


@pytest.fixture
async def event(db_session: AsyncSession, user: User) -> Event:
    return await make_event(db_session, admin_id=user.id)


async def post_trip(
    client: AsyncClient, event_id: Any, payload: dict[str, Any], telegram_id: int = 42
) -> Response:
    response = await client.post(
        f"/events/{event_id}/trips", json=payload, headers=auth_headers(telegram_id)
    )
    assert_contract(response, "POST", "/events/{event_id}/trips")
    return response


async def patch_trip(
    client: AsyncClient, trip_id: Any, payload: dict[str, Any], telegram_id: int = 42
) -> Response:
    response = await client.patch(
        f"/trips/{trip_id}", json=payload, headers=auth_headers(telegram_id)
    )
    assert_contract(response, "PATCH", "/trips/{trip_id}")
    return response


async def delete_trip(client: AsyncClient, trip_id: Any, telegram_id: int = 42) -> Response:
    response = await client.delete(f"/trips/{trip_id}", headers=auth_headers(telegram_id))
    assert_contract(response, "DELETE", "/trips/{trip_id}")
    return response


# ---------------------------------------------------------------- POST


async def test_create_trip_naive_times_are_airport_local(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    response = await post_trip(api_client, event.id, await trip_payload(db_session))

    assert response.status_code == 201
    body = response.json()
    assert body["number"] == "SU1234"
    assert body["mode"] == "flight"
    assert body["event_id"] == str(event.id)
    assert body["scheduled_departure"] == "2026-11-12T07:30:00+07:00"
    assert body["scheduled_arrival"] == "2026-11-12T10:05:00+03:00"
    assert body["estimated_arrival"] is None
    assert body["effective_arrival"] == body["scheduled_arrival"]
    assert body["status"] == "scheduled"
    assert body["source"] == "manual"
    assert body["departure_location"]["code"] == "OVB"
    assert body["arrival_location"]["code"] == "SVO"
    assert datetime.fromisoformat(body["updated_at"]).utcoffset() == timedelta(0)
    stored = (
        await db_session.execute(select(Trip).where(Trip.id == uuid.UUID(body["id"])))
    ).scalar_one()
    assert stored.scheduled_departure == datetime(2026, 11, 12, 0, 30, tzinfo=UTC)
    assert stored.scheduled_arrival == datetime(2026, 11, 12, 7, 5, tzinfo=UTC)


async def test_create_trip_with_explicit_offsets(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    payload = await trip_payload(
        db_session,
        scheduled_departure="2026-11-12T00:30:00Z",
        scheduled_arrival="2026-11-12T10:05:00+03:00",
    )

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 201
    body = response.json()
    assert body["scheduled_departure"] == "2026-11-12T07:30:00+07:00"
    assert body["scheduled_arrival"] == "2026-11-12T10:05:00+03:00"


async def test_create_trip_across_midnight(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    payload = await trip_payload(
        db_session,
        scheduled_departure="2026-11-12T22:00:00",
        scheduled_arrival="2026-11-13T00:40:00",
    )

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 201
    body = response.json()
    assert body["scheduled_departure"] == "2026-11-12T22:00:00+07:00"
    assert body["scheduled_arrival"] == "2026-11-13T00:40:00+03:00"


@pytest.mark.parametrize(
    ("number", "expected"),
    [("su 1234", "SU1234"), (" Su1234 ", "SU1234"), ("s7 12", "S712"), ("U6123", "U6123")],
)
async def test_create_trip_normalizes_number(
    api_client: AsyncClient,
    db_session: AsyncSession,
    event: Event,
    number: str,
    expected: str,
) -> None:
    response = await post_trip(api_client, event.id, await trip_payload(db_session, number=number))

    assert response.status_code == 201
    assert response.json()["number"] == expected


@pytest.mark.parametrize("number", ["S", "SU", "SU1234567", "SU  1234", "SU-1234", "123456789", ""])
async def test_create_trip_invalid_number(
    api_client: AsyncClient, db_session: AsyncSession, event: Event, number: str
) -> None:
    response = await post_trip(api_client, event.id, await trip_payload(db_session, number=number))

    assert response.status_code == 422
    assert "number" in fields(response)


async def test_create_trip_unknown_location(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    payload = await trip_payload(
        db_session, departure_location_id=MISSING_ID, arrival_location_id=MISSING_ID
    )

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 422
    assert fields(response) == {
        "departure_location_id": "Аэропорт не найден",
        "arrival_location_id": "Аэропорт не найден",
    }


async def test_create_trip_unknown_arrival_only(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    payload = await trip_payload(db_session, arrival_location_id=MISSING_ID)

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 422
    assert fields(response) == {"arrival_location_id": "Аэропорт не найден"}


async def test_create_trip_same_airports(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    svo = str((await get_location(db_session, "SVO")).id)
    payload = await trip_payload(db_session, departure_location_id=svo, arrival_location_id=svo)

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 422
    assert list(fields(response)) == ["arrival_location_id"]


@pytest.mark.parametrize(
    ("departure", "arrival"),
    [
        ("2026-11-12T10:00:00+03:00", "2026-11-12T10:00:00+03:00"),
        # 10:00 по Новосибирску = 06:00 по Москве; 05:00 по Москве раньше вылета
        ("2026-11-12T10:00:00", "2026-11-12T05:00:00"),
        ("2026-11-12T10:00:00+07:00", "2026-11-12T03:00:00Z"),
    ],
)
async def test_create_trip_arrival_not_after_departure(
    api_client: AsyncClient,
    db_session: AsyncSession,
    event: Event,
    departure: str,
    arrival: str,
) -> None:
    payload = await trip_payload(
        db_session, scheduled_departure=departure, scheduled_arrival=arrival
    )

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 422
    assert fields(response) == {"scheduled_arrival": "Прилёт должен быть позже вылета"}


async def test_create_trip_duplicate(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    payload = await trip_payload(db_session)
    assert (await post_trip(api_client, event.id, payload)).status_code == 201

    response = await post_trip(api_client, event.id, {**payload, "number": "su1234"})

    assert response.status_code == 422
    assert fields(response) == {"number": "Такой рейс уже добавлен"}
    # сессия остаётся рабочей: другой рейс создаётся
    other = await post_trip(api_client, event.id, {**payload, "number": "SU1235"})
    assert other.status_code == 201


async def test_create_trip_same_number_in_other_event(
    api_client: AsyncClient, db_session: AsyncSession, user: User, event: Event
) -> None:
    other_event = await make_event(db_session, admin_id=user.id)
    payload = await trip_payload(db_session)
    assert (await post_trip(api_client, event.id, payload)).status_code == 201

    assert (await post_trip(api_client, other_event.id, payload)).status_code == 201


@pytest.mark.parametrize("mode", ["train", "", None])
async def test_create_trip_mode_must_be_flight(
    api_client: AsyncClient, db_session: AsyncSession, event: Event, mode: Any
) -> None:
    response = await post_trip(api_client, event.id, await trip_payload(db_session, mode=mode))

    assert response.status_code == 422
    assert "mode" in fields(response)


async def test_create_trip_rejects_extra_and_missing_fields(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    payload = await trip_payload(db_session, status="landed")
    del payload["number"]

    response = await post_trip(api_client, event.id, payload)

    assert response.status_code == 422
    assert set(fields(response)) == {"status", "number"}


async def test_create_trip_by_member_is_403(
    api_client: AsyncClient, db_session: AsyncSession, other_user: User, event: Event
) -> None:
    await make_membership(db_session, event_id=event.id, user_id=other_user.id)

    response = await post_trip(
        api_client, event.id, await trip_payload(db_session), OTHER_TELEGRAM_ID
    )

    assert response.status_code == 403


async def test_create_trip_by_stranger_is_404(
    api_client: AsyncClient, db_session: AsyncSession, other_user: User, event: Event
) -> None:
    response = await post_trip(
        api_client, event.id, await trip_payload(db_session), OTHER_TELEGRAM_ID
    )

    assert response.status_code == 404


async def test_create_trip_unknown_event_is_404(
    api_client: AsyncClient, db_session: AsyncSession, user: User
) -> None:
    response = await post_trip(api_client, MISSING_ID, await trip_payload(db_session))

    assert response.status_code == 404


# ---------------------------------------------------------------- GET list


async def test_list_trips_for_member_sorted(
    api_client: AsyncClient, db_session: AsyncSession, user: User, other_user: User
) -> None:
    event = await make_event(db_session, admin_id=user.id)
    await make_membership(db_session, event_id=event.id, user_id=other_user.id)
    late = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)
    early = datetime(2026, 11, 12, 5, 0, tzinfo=UTC)
    departure = datetime(2026, 11, 12, 1, 0, tzinfo=UTC)
    for number, arrival in (("SU9", late), ("SU2", early), ("SU1", early)):
        await make_trip(
            db_session,
            event_id=event.id,
            number=number,
            scheduled_departure=departure,
            scheduled_arrival=arrival,
        )
    await make_trip(db_session)  # рейс чужой группы

    response = await api_client.get(
        f"/events/{event.id}/trips", headers=auth_headers(OTHER_TELEGRAM_ID)
    )

    assert response.status_code == 200
    assert_contract(response, "GET", "/events/{event_id}/trips")
    assert [t["number"] for t in response.json()] == ["SU1", "SU2", "SU9"]
    first = response.json()[0]
    assert first["departure_location"]["code"] == "SVX"
    assert first["scheduled_departure"] == "2026-11-12T06:00:00+05:00"
    assert first["scheduled_arrival"] == "2026-11-12T08:00:00+03:00"


async def test_list_trips_for_admin_empty(api_client: AsyncClient, event: Event) -> None:
    response = await api_client.get(f"/events/{event.id}/trips", headers=auth_headers())

    assert response.status_code == 200
    assert_contract(response, "GET", "/events/{event_id}/trips")
    assert response.json() == []


async def test_list_trips_for_stranger_is_404(
    api_client: AsyncClient, other_user: User, event: Event
) -> None:
    response = await api_client.get(
        f"/events/{event.id}/trips", headers=auth_headers(OTHER_TELEGRAM_ID)
    )

    assert response.status_code == 404
    assert_contract(response, "GET", "/events/{event_id}/trips")


# ---------------------------------------------------------------- PATCH


async def test_patch_single_field(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id, source=TripSource.PROVIDER)
    before = trip.scheduled_arrival

    response = await patch_trip(api_client, trip.id, {"number": "dp 55"})

    assert response.status_code == 200
    body = response.json()
    assert body["number"] == "DP55"
    assert body["source"] == "manual"
    assert datetime.fromisoformat(body["scheduled_arrival"]) == before


async def test_patch_estimated_arrival_set_and_reset(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    set_response = await patch_trip(
        api_client, trip.id, {"estimated_arrival": "2026-11-12T09:15:00"}
    )

    assert set_response.status_code == 200
    body = set_response.json()
    assert body["estimated_arrival"] == "2026-11-12T09:15:00+03:00"
    assert body["effective_arrival"] == "2026-11-12T09:15:00+03:00"
    assert body["scheduled_arrival"] == "2026-11-12T08:05:00+03:00"

    reset_response = await patch_trip(api_client, trip.id, {"estimated_arrival": None})

    assert reset_response.status_code == 200
    body = reset_response.json()
    assert body["estimated_arrival"] is None
    assert body["effective_arrival"] == "2026-11-12T08:05:00+03:00"


@pytest.mark.parametrize(
    "field",
    [
        "number",
        "departure_location_id",
        "arrival_location_id",
        "scheduled_departure",
        "scheduled_arrival",
    ],
)
async def test_patch_null_only_allowed_for_estimated_arrival(
    api_client: AsyncClient, db_session: AsyncSession, event: Event, field: str
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    response = await patch_trip(api_client, trip.id, {field: None})

    assert response.status_code == 422
    assert field in fields(response)


async def test_patch_breaking_time_order(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    response = await patch_trip(api_client, trip.id, {"scheduled_departure": "2026-11-12T20:00:00"})

    assert response.status_code == 422
    assert fields(response) == {"scheduled_arrival": "Прилёт должен быть позже вылета"}


async def test_patch_change_arrival_airport_with_naive_time(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)  # SVX -> SVO
    kgd = await get_location(db_session, "KGD")

    response = await patch_trip(
        api_client,
        trip.id,
        {"arrival_location_id": str(kgd.id), "scheduled_arrival": "2026-11-12T09:00:00"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["arrival_location"]["code"] == "KGD"
    # Калининград — UTC+2
    assert body["scheduled_arrival"] == "2026-11-12T09:00:00+02:00"
    assert body["scheduled_departure"] == "2026-11-12T07:30:00+05:00"


async def test_patch_change_airport_without_time_keeps_moment(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)  # прилёт 05:05 UTC
    kgd = await get_location(db_session, "KGD")

    response = await patch_trip(api_client, trip.id, {"arrival_location_id": str(kgd.id)})

    assert response.status_code == 200
    body = response.json()
    assert body["scheduled_arrival"] == "2026-11-12T07:05:00+02:00"
    assert datetime.fromisoformat(body["scheduled_arrival"]) == datetime(
        2026, 11, 12, 5, 5, tzinfo=UTC
    )


async def test_patch_unknown_and_same_airport(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    unknown = await patch_trip(api_client, trip.id, {"departure_location_id": MISSING_ID})
    assert unknown.status_code == 422
    assert fields(unknown) == {"departure_location_id": "Аэропорт не найден"}

    same = await patch_trip(
        api_client, trip.id, {"departure_location_id": str(trip.arrival_location_id)}
    )
    assert same.status_code == 422
    assert list(fields(same)) == ["arrival_location_id"]


async def test_patch_duplicate(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    first = await make_trip(db_session, event_id=event.id, number="SU1")
    second = await make_trip(db_session, event_id=event.id, number="SU2")

    response = await patch_trip(api_client, second.id, {"number": first.number})

    assert response.status_code == 422
    assert fields(response) == {"number": "Такой рейс уже добавлен"}


async def test_patch_rejects_mode(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    response = await patch_trip(api_client, trip.id, {"mode": "flight"})

    assert response.status_code == 422
    assert "mode" in fields(response)


async def test_patch_by_member_is_403_and_stranger_is_404(
    api_client: AsyncClient, db_session: AsyncSession, other_user: User, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    stranger = await patch_trip(api_client, trip.id, {"number": "SU7"}, OTHER_TELEGRAM_ID)
    assert stranger.status_code == 404
    assert stranger.json()["error"]["message"] == "Рейс не найден"

    await make_membership(db_session, event_id=event.id, user_id=other_user.id)
    member = await patch_trip(api_client, trip.id, {"number": "SU7"}, OTHER_TELEGRAM_ID)
    assert member.status_code == 403


async def test_patch_missing_trip_is_404(api_client: AsyncClient, user: User) -> None:
    response = await patch_trip(api_client, MISSING_ID, {"number": "SU7"})

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Рейс не найден"


# ---------------------------------------------------------------- DELETE


async def test_delete_trip(api_client: AsyncClient, db_session: AsyncSession, event: Event) -> None:
    trip = await make_trip(db_session, event_id=event.id)
    trip_id = trip.id

    response = await delete_trip(api_client, trip_id)

    assert response.status_code == 204
    assert await db_session.get(Trip, trip_id, populate_existing=True) is None


async def test_delete_trip_with_application_is_409(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)
    await make_application(db_session, event_id=event.id, trip_id=trip.id)

    response = await delete_trip(api_client, trip.id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TRIP_IN_USE"
    assert await db_session.get(Trip, trip.id) is not None


async def test_delete_trip_foreign_key_race_is_409(
    api_client: AsyncClient,
    db_session: AsyncSession,
    event: Event,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trip = await make_trip(db_session, event_id=event.id)
    await make_application(db_session, event_id=event.id, trip_id=trip.id)

    async def no_application_found(*args: Any, **kwargs: Any) -> bool:
        return False

    monkeypatch.setattr(db_session, "scalar", no_application_found)
    response = await delete_trip(api_client, trip.id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "TRIP_IN_USE"


async def test_delete_trip_by_member_and_stranger(
    api_client: AsyncClient, db_session: AsyncSession, other_user: User, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)

    assert (await delete_trip(api_client, trip.id, OTHER_TELEGRAM_ID)).status_code == 404

    await make_membership(db_session, event_id=event.id, user_id=other_user.id)
    assert (await delete_trip(api_client, trip.id, OTHER_TELEGRAM_ID)).status_code == 403
    assert await db_session.get(Trip, trip.id) is not None


# ---------------------------------------------------------------- 401


@pytest.mark.parametrize(
    ("method", "url", "template"),
    [
        ("GET", f"/events/{MISSING_ID}/trips", "/events/{event_id}/trips"),
        ("POST", f"/events/{MISSING_ID}/trips", "/events/{event_id}/trips"),
        ("PATCH", f"/trips/{MISSING_ID}", "/trips/{trip_id}"),
        ("DELETE", f"/trips/{MISSING_ID}", "/trips/{trip_id}"),
    ],
)
async def test_requires_auth(api_client: AsyncClient, method: str, url: str, template: str) -> None:
    response = await api_client.request(method, url)

    assert response.status_code == 401
    assert_contract(response, method, template)


async def test_patch_estimated_arrival_before_departure(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(db_session, event_id=event.id)  # вылет 02:30 UTC

    response = await patch_trip(
        api_client, trip.id, {"estimated_arrival": "2026-11-12T05:00:00+05:00"}
    )

    assert response.status_code == 422
    assert fields(response) == {"estimated_arrival": "Расчётное прибытие должно быть позже вылета"}


async def test_patch_departure_after_stored_estimated_arrival(
    api_client: AsyncClient, db_session: AsyncSession, event: Event
) -> None:
    trip = await make_trip(
        db_session,
        event_id=event.id,
        scheduled_arrival=datetime(2026, 11, 12, 9, 0, tzinfo=UTC),
        estimated_arrival=datetime(2026, 11, 12, 5, 0, tzinfo=UTC),
    )

    response = await patch_trip(api_client, trip.id, {"scheduled_departure": "2026-11-12T12:00:00"})

    assert response.status_code == 422
    assert fields(response) == {"estimated_arrival": "Расчётное прибытие должно быть позже вылета"}
