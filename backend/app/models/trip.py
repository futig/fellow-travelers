import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import TransportMode, TripSource, TripStatus
from app.models.location import Location


class Trip(TimestampMixin, Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint("scheduled_arrival > scheduled_departure", name="arrival_after_departure"),
        UniqueConstraint(
            "event_id",
            "mode",
            "number",
            "scheduled_departure",
            name="uq_trips_event_mode_number_departure",
        ),
        Index("ix_trips_event_id_scheduled_arrival", "event_id", "scheduled_arrival"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    mode: Mapped[TransportMode] = mapped_column(str_enum(TransportMode, name="transport_mode"))
    number: Mapped[str] = mapped_column(String(16))
    departure_location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
    arrival_location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
    scheduled_departure: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    scheduled_arrival: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    estimated_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[TripStatus] = mapped_column(
        str_enum(TripStatus, name="trip_status"), server_default=TripStatus.SCHEDULED.value
    )
    source: Mapped[TripSource] = mapped_column(
        str_enum(TripSource, name="trip_source"), server_default=TripSource.MANUAL.value
    )
    provider_ref: Mapped[str | None] = mapped_column(String(128))

    departure_location: Mapped[Location] = relationship(
        foreign_keys=[departure_location_id], lazy="raise"
    )
    arrival_location: Mapped[Location] = relationship(
        foreign_keys=[arrival_location_id], lazy="raise"
    )

    @property
    def effective_arrival(self) -> datetime:
        """Расчётное прибытие, если известно, иначе по расписанию — по нему идёт подбор."""
        return self.estimated_arrival or self.scheduled_arrival
