from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Location, LocationKind

SEARCH_LIMIT = 20
_ESCAPE = "\\"


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def search_locations(
    session: AsyncSession, query: str, kind: LocationKind | None = None
) -> list[Location]:
    """Код — префикс, город и название — подстрока, без учёта регистра."""
    escaped = escape_like(query)
    code_prefix = Location.code.ilike(f"{escaped}%", escape=_ESCAPE)
    city_match = Location.city.ilike(f"%{escaped}%", escape=_ESCAPE)
    name_match = Location.name.ilike(f"%{escaped}%", escape=_ESCAPE)
    rank = case(
        (func.lower(Location.code) == query.lower(), 0),
        (code_prefix, 1),
        (city_match, 2),
        else_=3,
    )
    stmt = (
        select(Location)
        .where(or_(code_prefix, city_match, name_match))
        .order_by(rank, Location.city, Location.code)
        .limit(SEARCH_LIMIT)
    )
    if kind is not None:
        stmt = stmt.where(Location.kind == kind)
    return list((await session.scalars(stmt)).all())
