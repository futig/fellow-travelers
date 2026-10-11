from fastapi import APIRouter

from app.api.deps import CurrentUser, SessionDep
from app.schemas.event import EventSummary
from app.schemas.user import Me
from app.services import events as events_service

router = APIRouter(prefix="/me", tags=["profile"])


@router.get("")
async def get_me(user: CurrentUser) -> Me:
    return Me.from_user(user)


@router.get("/events")
async def list_my_events(user: CurrentUser, session: SessionDep) -> list[EventSummary]:
    items = await events_service.list_my_events(session, user)
    return [
        EventSummary(
            id=item.event.id,
            title=item.event.title,
            starts_on=item.event.starts_on,
            ends_on=item.event.ends_on,
            is_admin=item.is_admin,
            is_participant=item.is_participant,
            my_application_status=item.my_application_status,
        )
        for item in items
    ]
