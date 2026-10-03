import uuid
from datetime import timedelta

from sqlalchemy import BigInteger, bindparam, delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.matching import MatchCandidate, find_group
from app.models import (
    Application,
    ApplicationStatus,
    Transfer,
    TransferOrigin,
    TransferStatus,
    Trip,
)

_UINT64_RANGE = 1 << 64
_INT64_MAX = (1 << 63) - 1


def event_lock_key(event_id: uuid.UUID) -> int:
    """Детерминированный signed int64 из UUID группы: старшие 64 бита `event_id.int`."""
    key = event_id.int >> 64
    return key - _UINT64_RANGE if key > _INT64_MAX else key


async def lock_event(session: AsyncSession, event_id: uuid.UUID) -> None:
    """Транзакционная advisory-блокировка группы: подбор и выход из трансфера идут по очереди.

    Каждый сценарий, меняющий заявки или трансферы группы, берёт её первой и только потом читает
    состояние (с `populate_existing`), иначе заявка могла бы попасть в два трансфера.
    Блокировка снимается вместе с транзакцией, то есть на commit/rollback сценария.
    """
    stmt = text("SELECT pg_advisory_xact_lock(:key)").bindparams(
        bindparam("key", event_lock_key(event_id), type_=BigInteger)
    )
    await session.execute(stmt)


def _candidate(application: Application, trip: Trip) -> MatchCandidate:
    return MatchCandidate(
        id=application.id,
        arrival_location_id=trip.arrival_location_id,
        arrival_at=trip.estimated_arrival or trip.scheduled_arrival,
        passengers=2 if application.with_companion else 1,
        baggage=application.baggage_count,
        max_wait=timedelta(minutes=application.max_wait_minutes),
    )


async def match_application(session: AsyncSession, application: Application) -> Transfer | None:
    """Первоначальный подбор среди неназначенных заявок группы; только flush, без commit.

    Вызывать под `lock_event`. Существующие трансферы не дополняются (pre-MVP).
    """
    if (
        application.status != ApplicationStatus.SEARCHING
        or application.departed_at is not None
        or application.transfer_id is not None
    ):
        return None
    own_trip = (
        await session.execute(
            select(Trip).where(Trip.id == application.trip_id),
            execution_options={"populate_existing": True},
        )
    ).scalar_one()
    rows = (
        await session.execute(
            select(Application, Trip)
            .join(Trip, Trip.id == Application.trip_id)
            .where(
                Application.event_id == application.event_id,
                Application.id != application.id,
                Application.status == ApplicationStatus.SEARCHING,
                Application.departed_at.is_(None),
                Application.transfer_id.is_(None),
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    by_id = {app.id: app for app, _ in rows}
    group = find_group(
        _candidate(application, own_trip), (_candidate(app, trip) for app, trip in rows)
    )
    if group is None:
        return None
    transfer = Transfer(event_id=application.event_id, origin=TransferOrigin.AUTO)
    session.add(transfer)
    await session.flush()
    for member in group:
        target = application if member.id == application.id else by_id[member.id]
        # status и transfer_id меняются вместе: один UPDATE, CHECK assigned_has_transfer цел
        target.status = ApplicationStatus.ASSIGNED
        target.transfer_id = transfer.id
    await session.flush()
    return transfer


async def leave_transfer(
    session: AsyncSession, application: Application, *, new_status: ApplicationStatus
) -> None:
    """Снимает заявку с трансфера и выставляет ей `new_status` (solo/cancelled); только flush.

    Если в трансфере осталось меньше двух заявок, он расформировывается: оставшаяся заявка
    возвращается в `searching` и проходит первоначальный подбор (если она уже уехала, становится
    `solo` и не подбирается). Иначе состав остаётся как есть
    (замену в pre-MVP не ищем).

    Порядок важен из-за CHECK `assigned_has_transfer` и FK без отложенной проверки: уходящая заявка
    меняет transfer_id и status одним UPDATE и флашится первой; трансфер удаляется только после
    того, как на него никто не ссылается.
    """
    transfer_id = application.transfer_id
    if transfer_id is None:
        return
    remaining = list(
        (
            await session.scalars(
                select(Application)
                .where(Application.transfer_id == transfer_id, Application.id != application.id)
                .order_by(Application.created_at, Application.id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    application.status = new_status
    application.transfer_id = None
    await session.flush()

    if len(remaining) >= 2:
        if all(app.departed_at is not None for app in remaining):
            await session.execute(
                update(Transfer)
                .where(Transfer.id == transfer_id)
                .values(status=TransferStatus.DEPARTED)
            )
        return

    for app in remaining:
        # уехавший остаток едет сам: «Ищем попутчиков» ему показывать нельзя
        app.status = (
            ApplicationStatus.SOLO if app.departed_at is not None else ApplicationStatus.SEARCHING
        )
        app.transfer_id = None
    await session.flush()
    await session.execute(delete(Transfer).where(Transfer.id == transfer_id))
    for app in remaining:
        if app.departed_at is None:
            await match_application(session, app)


async def all_departed(session: AsyncSession, transfer_id: uuid.UUID) -> bool:
    waiting = await session.scalar(
        select(func.count())
        .select_from(Application)
        .where(Application.transfer_id == transfer_id, Application.departed_at.is_(None))
    )
    return waiting == 0
