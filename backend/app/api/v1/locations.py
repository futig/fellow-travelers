from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, SessionDep
from app.errors import AppError, ErrorCode
from app.models import LocationKind
from app.schemas.location import Location
from app.services import locations as locations_service

router = APIRouter(prefix="/locations", tags=["trips"])

MIN_QUERY_LENGTH = 2


@router.get("")
async def search_locations(
    _: CurrentUser,
    session: SessionDep,
    q: Annotated[str, Query()],
    kind: LocationKind | None = None,
) -> list[Location]:
    query = q.strip()
    if len(query) < MIN_QUERY_LENGTH:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            "Проверьте введённые данные",
            422,
            {"fields": {"q": "Слишком короткое значение"}},
        )
    found = await locations_service.search_locations(session, query, kind)
    return [Location.build(location) for location in found]
