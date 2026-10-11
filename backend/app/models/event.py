import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.user import User


class Event(TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("ends_on >= starts_on", name="dates_order"),
        Index("ix_events_admin_id", "admin_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    meeting_point: Mapped[dict[str, Any]] = mapped_column(JSONB)
    pickup_point: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    destination: Mapped[dict[str, Any]] = mapped_column(JSONB)
    meeting_instruction: Mapped[str] = mapped_column(Text, server_default=text("''"))
    chat_url: Mapped[str | None] = mapped_column(Text)
    join_open: Mapped[bool] = mapped_column(server_default=true())
    invite_code: Mapped[str] = mapped_column(String(6), unique=True)

    admin: Mapped[User] = relationship(lazy="raise")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (Index("ix_memberships_user_id", "user_id"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
