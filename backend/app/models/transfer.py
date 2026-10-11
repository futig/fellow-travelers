import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, str_enum
from app.models.enums import TransferOrigin, TransferStatus

if TYPE_CHECKING:
    from app.models.application import Application


class Transfer(TimestampMixin, Base):
    __tablename__ = "transfers"
    __table_args__ = (Index("ix_transfers_event_id", "event_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    status: Mapped[TransferStatus] = mapped_column(
        str_enum(TransferStatus, name="transfer_status"),
        server_default=TransferStatus.ACTIVE.value,
    )
    origin: Mapped[TransferOrigin] = mapped_column(
        str_enum(TransferOrigin, name="transfer_origin"),
        server_default=TransferOrigin.AUTO.value,
    )

    applications: Mapped[list["Application"]] = relationship(
        back_populates="transfer", lazy="raise"
    )
