import uuid
from datetime import date
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    StringConstraints,
    ValidationInfo,
    field_validator,
)

from app.models import ApplicationStatus
from app.models import Event as EventModel
from app.schemas.common import Point

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
MeetingInstruction = Annotated[str, StringConstraints(max_length=2000)]

DATES_ORDER_MESSAGE = "Дата окончания раньше даты начала"


def _check_chat_url(value: str | None) -> str | None:
    if value is None:
        return None
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError("Ссылка должна начинаться с http:// или https://")
    return value


def _check_dates_order(value: date, info: ValidationInfo) -> date:
    starts_on = info.data.get("starts_on")
    if starts_on is not None and value < starts_on:
        raise ValueError(DATES_ORDER_MESSAGE)
    return value


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    starts_on: date
    ends_on: date
    meeting_point: Point
    pickup_point: Point | None = None
    destination: Point
    meeting_instruction: MeetingInstruction
    chat_url: str | None = None

    _ends_not_before_start = field_validator("ends_on")(_check_dates_order)
    _chat_url_scheme = field_validator("chat_url")(_check_chat_url)


class EventUpdate(BaseModel):
    """Частичное обновление. `null` допустим только для pickup_point и chat_url.

    Что передано, различаем через `model_fields_set`.
    """

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    meeting_point: Point | None = None
    pickup_point: Point | None = None
    destination: Point | None = None
    meeting_instruction: MeetingInstruction | None = None
    chat_url: str | None = None
    join_open: bool | None = None

    @field_validator(
        "title",
        "starts_on",
        "ends_on",
        "meeting_point",
        "destination",
        "meeting_instruction",
        "join_open",
        mode="before",
    )
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Поле не может быть null")
        return value

    @field_validator("ends_on")
    @classmethod
    def _ends_not_before_start(cls, value: date | None, info: ValidationInfo) -> date | None:
        # null отсекает _not_null; при неполной паре дат итог проверит сервис
        return value if value is None else _check_dates_order(value, info)

    _chat_url_scheme = field_validator("chat_url")(_check_chat_url)


class Event(BaseModel):
    id: uuid.UUID
    title: str
    starts_on: date
    ends_on: date
    meeting_point: Point
    pickup_point: Point
    destination: Point
    meeting_instruction: str
    chat_url: str | None
    join_open: bool
    is_admin: bool
    is_participant: bool

    @classmethod
    def build(cls, event: EventModel, *, user_id: uuid.UUID, is_participant: bool) -> "Event":
        meeting_point = Point.model_validate(event.meeting_point)
        pickup_point = (
            meeting_point
            if event.pickup_point is None
            else Point.model_validate(event.pickup_point)
        )
        return cls(
            id=event.id,
            title=event.title,
            starts_on=event.starts_on,
            ends_on=event.ends_on,
            meeting_point=meeting_point,
            pickup_point=pickup_point,
            destination=Point.model_validate(event.destination),
            meeting_instruction=event.meeting_instruction,
            chat_url=event.chat_url,
            join_open=event.join_open,
            is_admin=event.admin_id == user_id,
            is_participant=is_participant,
        )


class EventSummary(BaseModel):
    id: uuid.UUID
    title: str
    starts_on: date
    ends_on: date
    is_admin: bool
    is_participant: bool
    my_application_status: ApplicationStatus | None


class Invite(BaseModel):
    code: str
    link: str
