import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError, ErrorCode
from app.models import Event, Membership, User


def _not_found() -> AppError:
    return AppError(ErrorCode.NOT_FOUND, "Группа не найдена", 404)


async def is_member(session: AsyncSession, event_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    found = await session.scalar(
        select(Membership.user_id).where(
            Membership.event_id == event_id, Membership.user_id == user_id
        )
    )
    return found is not None


async def get_event_for_member(session: AsyncSession, event_id: uuid.UUID, user: User) -> Event:
    """Группа, доступная админу или участнику; иначе 404 (существование не раскрываем)."""
    event = await session.get(Event, event_id)
    if event is None:
        raise _not_found()
    if event.admin_id != user.id and not await is_member(session, event_id, user.id):
        raise _not_found()
    return event


async def get_event_for_admin(session: AsyncSession, event_id: uuid.UUID, user: User) -> Event:
    event = await get_event_for_member(session, event_id, user)
    if event.admin_id != user.id:
        raise AppError(ErrorCode.FORBIDDEN, "Управлять группой может только её создатель", 403)
    return event
