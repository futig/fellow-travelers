import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import Application, Transfer, Trip


async def load_transfers(
    session: AsyncSession, transfer_ids: Iterable[uuid.UUID]
) -> list[Transfer]:
    """Трансферы с участниками (пользователь, рейс, локации) — два запроса на любой список.

    Только чтение; данные свежие из БД (`populate_existing`). Порядок не гарантирован.
    """
    ids = list(transfer_ids)
    if not ids:
        return []
    stmt = (
        select(Transfer)
        .where(Transfer.id.in_(ids))
        .options(
            selectinload(Transfer.applications).options(
                joinedload(Application.user),
                # обе локации: populate_existing перезаписывает уже загруженные заявки,
                # и рейс не должен остаться без departure_location (нужна Trip.build)
                joinedload(Application.trip).joinedload(Trip.arrival_location),
                joinedload(Application.trip).joinedload(Trip.departure_location),
            )
        )
        .execution_options(populate_existing=True)
    )
    return list((await session.execute(stmt)).scalars().all())


async def load_transfer(session: AsyncSession, transfer_id: uuid.UUID) -> Transfer | None:
    found = await load_transfers(session, [transfer_id])
    return found[0] if found else None
