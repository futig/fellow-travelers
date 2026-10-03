import uuid

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, str_enum
from app.models.enums import LocationKind


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("kind", "code", name="uq_locations_kind_code"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[LocationKind] = mapped_column(str_enum(LocationKind, name="location_kind"))
    code: Mapped[str] = mapped_column(String(8))
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(2))
    timezone: Mapped[str] = mapped_column(String(64))
