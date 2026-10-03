import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, SessionDep
from app.schemas.my_trip import MyTrip
from app.services import my_trip as my_trip_service
from app.services.access import get_event_for_member

router = APIRouter(tags=["applications"])


@router.get("/events/{event_id}/my-trip")
async def get_my_trip(event_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> MyTrip:
    event = await get_event_for_member(session, event_id, user)
    data = await my_trip_service.get_my_trip(session, event, user)
    return MyTrip.build(
        event,
        user,
        is_participant=data.is_participant,
        application=data.application,
        transfer=data.transfer,
    )
