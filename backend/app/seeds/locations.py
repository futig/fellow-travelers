import asyncio
import csv
import re
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import dispose_engine, get_session_factory
from app.models import Location, LocationKind

AIRPORTS_CSV = Path(__file__).resolve().parents[2] / "data" / "airports.csv"

_CODE_RE = re.compile(r"[A-Z]{3}")
_COUNTRY_RE = re.compile(r"[A-Z]{2}")
_COLUMNS = ("code", "name", "city", "country", "timezone")


class AirportsCsvError(ValueError):
    pass


def load_airports(path: Path = AIRPORTS_CSV) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or tuple(reader.fieldnames) != _COLUMNS:
            raise AirportsCsvError(f"{path.name}: ожидаются колонки {','.join(_COLUMNS)}")
        for row in reader:
            line = reader.line_num
            values = {column: (row[column] or "").strip() for column in _COLUMNS}
            for column, value in values.items():
                if not value:
                    raise AirportsCsvError(f"{path.name}, строка {line}: пустое поле {column}")
            if not _CODE_RE.fullmatch(values["code"]):
                raise AirportsCsvError(
                    f"{path.name}, строка {line}: неверный код {values['code']!r}"
                )
            if not _COUNTRY_RE.fullmatch(values["country"]):
                raise AirportsCsvError(
                    f"{path.name}, строка {line}: неверная страна {values['country']!r}"
                )
            try:
                ZoneInfo(values["timezone"])
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise AirportsCsvError(
                    f"{path.name}, строка {line}: неверная таймзона {values['timezone']!r}"
                ) from exc
            if values["code"] in seen:
                raise AirportsCsvError(f"{path.name}, строка {line}: дубль кода {values['code']}")
            seen.add(values["code"])
            rows.append(values)
    return rows


async def seed_locations(session: AsyncSession) -> int:
    """Идемпотентно загружает аэропорты из CSV; возвращает число строк в файле."""
    rows = load_airports()
    stmt = insert(Location).values([{**row, "kind": LocationKind.AIRPORT} for row in rows])
    stmt = stmt.on_conflict_do_update(
        index_elements=[Location.kind, Location.code],
        set_={column: stmt.excluded[column] for column in ("name", "city", "country", "timezone")},
    )
    await session.execute(stmt)
    await session.commit()
    return len(rows)


async def main() -> None:
    try:
        async with get_session_factory()() as session:
            count = await seed_locations(session)
        print(f"Загружено аэропортов: {count}")
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
