from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Trip
from tests.factories import make_trip


async def test_offset_time_roundtrips_as_same_moment(db_session: AsyncSession) -> None:
    departure = datetime(2026, 11, 12, 7, 30, tzinfo=timezone(timedelta(hours=5)))
    arrival = datetime(2026, 11, 12, 10, 5, tzinfo=timezone(timedelta(hours=3)))
    trip = await make_trip(db_session, scheduled_departure=departure, scheduled_arrival=arrival)
    trip_id = trip.id
    db_session.expunge_all()

    loaded = (await db_session.execute(select(Trip).where(Trip.id == trip_id))).scalar_one()

    assert loaded.scheduled_departure == departure
    assert loaded.scheduled_arrival == arrival
    assert loaded.scheduled_arrival.tzinfo is not None
    assert loaded.scheduled_arrival.astimezone(UTC) == datetime(2026, 11, 12, 7, 5, tzinfo=UTC)
