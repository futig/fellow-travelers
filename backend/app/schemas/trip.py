import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.models import Trip as TripModel
from app.models import TripSource, TripStatus
from app.models.enums import TransportMode
from app.schemas.location import Location
from app.timezones import to_local

# формат из openapi.yaml; сначала обрезаем пробелы по краям
TripNumber = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9]{2,3}\s?\d{1,5}$")
]


def normalize_number(number: str) -> str:
    """`"su 1234"` -> `"SU1234"`."""
    return "".join(number.split()).upper()


class TripInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: TransportMode
    number: TripNumber
    departure_location_id: uuid.UUID
    arrival_location_id: uuid.UUID
    scheduled_departure: datetime
    scheduled_arrival: datetime


class TripUpdate(BaseModel):
    """Частичное обновление. `null` допустим только для estimated_arrival.

    Что передано, различаем через `model_fields_set`.
    """

    model_config = ConfigDict(extra="forbid")

    number: TripNumber | None = None
    departure_location_id: uuid.UUID | None = None
    arrival_location_id: uuid.UUID | None = None
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    estimated_arrival: datetime | None = None

    @field_validator(
        "number",
        "departure_location_id",
        "arrival_location_id",
        "scheduled_departure",
        "scheduled_arrival",
        mode="before",
    )
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Поле не может быть null")
        return value


class Trip(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    mode: TransportMode
    number: str
    departure_location: Location
    arrival_location: Location
    scheduled_departure: datetime
    scheduled_arrival: datetime
    estimated_arrival: datetime | None
    effective_arrival: datetime
    status: TripStatus
    source: TripSource
    updated_at: datetime

    @classmethod
    def build(cls, trip: TripModel) -> "Trip":
        """Время — со смещением своего аэропорта. Локации рейса должны быть загружены."""
        departure = trip.departure_location
        arrival = trip.arrival_location
        estimated = trip.estimated_arrival
        effective = estimated if estimated is not None else trip.scheduled_arrival
        return cls(
            id=trip.id,
            event_id=trip.event_id,
            mode=trip.mode,
            number=trip.number,
            departure_location=Location.build(departure),
            arrival_location=Location.build(arrival),
            scheduled_departure=to_local(trip.scheduled_departure, departure.timezone),
            scheduled_arrival=to_local(trip.scheduled_arrival, arrival.timezone),
            estimated_arrival=None if estimated is None else to_local(estimated, arrival.timezone),
            effective_arrival=to_local(effective, arrival.timezone),
            status=trip.status,
            source=trip.source,
            updated_at=trip.updated_at.astimezone(UTC),
        )
