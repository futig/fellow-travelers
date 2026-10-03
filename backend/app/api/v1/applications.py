import uuid

from fastapi import APIRouter, Response

from app.api.deps import CurrentUser, SessionDep
from app.schemas.application import Application, ApplicationInput, MarksInput
from app.services import applications as applications_service
from app.services.access import get_event_for_member

router = APIRouter(tags=["applications"])


@router.get("/events/{event_id}/my-application")
async def get_my_application(
    event_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> Application:
    event = await get_event_for_member(session, event_id, user)
    return Application.build(await applications_service.get_my_application(session, event, user))


@router.put("/events/{event_id}/my-application")
async def upsert_my_application(
    event_id: uuid.UUID,
    data: ApplicationInput,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
) -> Application:
    event = await get_event_for_member(session, event_id, user)
    application, created = await applications_service.upsert_my_application(
        session, event, user, data
    )
    if created:
        response.status_code = 201
    return Application.build(application)


@router.post("/events/{event_id}/my-application/go-solo")
async def go_solo(event_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Application:
    event = await get_event_for_member(session, event_id, user)
    return Application.build(await applications_service.go_solo(session, event, user))


@router.post("/events/{event_id}/my-application/resume-search")
async def resume_search(event_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Application:
    event = await get_event_for_member(session, event_id, user)
    return Application.build(await applications_service.resume_search(session, event, user))


@router.post("/events/{event_id}/my-application/cancel")
async def cancel_my_application(
    event_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> Application:
    event = await get_event_for_member(session, event_id, user)
    return Application.build(await applications_service.cancel_my_application(session, event, user))


@router.put("/events/{event_id}/my-application/marks")
async def set_my_marks(
    event_id: uuid.UUID, data: MarksInput, user: CurrentUser, session: SessionDep
) -> Application:
    event = await get_event_for_member(session, event_id, user)
    return Application.build(await applications_service.set_my_marks(session, event, user, data))
