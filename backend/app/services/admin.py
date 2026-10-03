import uuid
from collections.abc import Sequence

from sqlalchemy import ColumnElement, Integer, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, ApplicationStatus, Membership, Transfer, Trip, User
from app.schemas.admin import Counters
from app.services.applications import WITH_TRIP
from app.services.transfers import load_transfers


async def get_counters(session: AsyncSession, event_id: uuid.UUID) -> Counters:
    """Счётчики по всей группе одним запросом; считаются люди (спутник = 2), не заявки."""
    people = case((Application.with_companion, 2), else_=1)
    active = Application.status != ApplicationStatus.CANCELLED

    def total(condition: ColumnElement[bool]) -> ColumnElement[int]:
        return cast(func.coalesce(func.sum(case((condition, people), else_=0)), 0), Integer)

    stmt = select(
        total(active).label("expected"),
        total(Application.status == ApplicationStatus.SEARCHING).label("searching"),
        total(Application.status == ApplicationStatus.ASSIGNED).label("assigned"),
        total(Application.status == ApplicationStatus.SOLO).label("solo"),
        total(active & Application.at_meeting_point).label("at_meeting_point"),
        total(Application.departed_at.is_not(None)).label("departed"),
    ).where(Application.event_id == event_id)
    row = (await session.execute(stmt)).one()
    return Counters(**row._asdict())


async def list_participants(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    statuses: Sequence[ApplicationStatus] | None,
    trip_id: uuid.UUID | None,
) -> list[tuple[User, Application | None]]:
    """Участники группы с заявками (если есть). Только чтение, фиксированное число запросов.

    Любой фильтр исключает участников без заявки.
    """
    stmt = (
        select(User, Application)
        .join(Membership, Membership.user_id == User.id)
        .outerjoin(
            Application,
            (Application.user_id == User.id) & (Application.event_id == event_id),
        )
        .outerjoin(Trip, Trip.id == Application.trip_id)
        .where(Membership.event_id == event_id)
        .options(*WITH_TRIP)
        .order_by(
            Application.id.is_(None),
            Trip.effective_arrival,
            User.first_name,
            User.last_name,
            User.id,
        )
        .execution_options(populate_existing=True)
    )
    if statuses:
        stmt = stmt.where(Application.status.in_(statuses))
    if trip_id is not None:
        stmt = stmt.where(Application.trip_id == trip_id)
    return [(user, application) for user, application in (await session.execute(stmt)).all()]


async def list_transfers(session: AsyncSession, event_id: uuid.UUID) -> list[Transfer]:
    """Все трансферы группы: по самому раннему прибытию участников, затем created_at, id."""
    ordered = (
        select(Transfer.id)
        .outerjoin(Application, Application.transfer_id == Transfer.id)
        .outerjoin(Trip, Trip.id == Application.trip_id)
        .where(Transfer.event_id == event_id)
        .group_by(Transfer.id, Transfer.created_at)
        .order_by(func.min(Trip.effective_arrival), Transfer.created_at, Transfer.id)
    )
    ids = list((await session.scalars(ordered)).all())
    by_id = {t.id: t for t in await load_transfers(session, ids)}
    return [by_id[i] for i in ids]
