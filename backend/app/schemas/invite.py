import uuid
from datetime import date

from pydantic import BaseModel

from app.models import Event as EventModel


class InvitePreview(BaseModel):
    event_id: uuid.UUID
    title: str
    starts_on: date
    ends_on: date
    join_open: bool
    already_member: bool

    @classmethod
    def build(cls, event: EventModel, *, already_member: bool) -> "InvitePreview":
        return cls(
            event_id=event.id,
            title=event.title,
            starts_on=event.starts_on,
            ends_on=event.ends_on,
            join_open=event.join_open,
            already_member=already_member,
        )
