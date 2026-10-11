from typing import Annotated

from fastapi import APIRouter, Path, Response

from app.api.deps import CurrentUser, SessionDep
from app.schemas.event import Event
from app.schemas.invite import InvitePreview
from app.services import invites as invites_service
from app.services.access import is_member

router = APIRouter(prefix="/invites", tags=["invites"])

InviteCode = Annotated[str, Path(pattern=r"^[A-Za-z0-9]{6}$")]


@router.get("/{code}")
async def get_invite_preview(
    code: InviteCode, user: CurrentUser, session: SessionDep
) -> InvitePreview:
    event = await invites_service.get_event_by_code(session, code)
    return InvitePreview.build(event, already_member=await is_member(session, event.id, user.id))


@router.post("/{code}/join")
async def join_by_invite(
    code: InviteCode, response: Response, user: CurrentUser, session: SessionDep
) -> Event:
    event = await invites_service.get_event_by_code(session, code)
    created = await invites_service.join_event(session, event, user)
    if created:
        response.status_code = 201
    return Event.build(event, user_id=user.id, is_participant=True)
