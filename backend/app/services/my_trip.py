from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Event, Transfer, User
from app.services.access import is_member
from app.services.applications import find_application
from app.services.transfers import load_transfer


@dataclass(frozen=True)
class MyTripData:
    is_participant: bool
    application: Application | None
    transfer: Transfer | None


async def get_my_trip(session: AsyncSession, event: Event, user: User) -> MyTripData:
    """Данные экрана «Моя поездка»: только чтение, без блокировок и commit."""
    is_participant = await is_member(session, event.id, user.id)
    application = await find_application(session, event.id, user.id)
    transfer = None
    if application is not None and application.transfer_id is not None:
        transfer = await load_transfer(session, application.transfer_id)
    return MyTripData(is_participant, application, transfer)
