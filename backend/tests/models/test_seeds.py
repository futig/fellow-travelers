import csv
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Location, LocationKind
from app.seeds.locations import AIRPORTS_CSV, AirportsCsvError, load_airports, seed_locations

HEADER = "code,name,city,country,timezone\n"
FIRST_ROW = "DME,Домодедово,Москва,RU,Europe/Moscow\n"


def test_csv_has_unique_codes() -> None:
    with AIRPORTS_CSV.open(encoding="utf-8", newline="") as f:
        codes = [row["code"] for row in csv.DictReader(f)]
    assert len(codes) == len(set(codes))


def test_csv_timezones_are_valid() -> None:
    rows = load_airports()
    assert rows
    for row in rows:
        ZoneInfo(row["timezone"])


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("svo,Шереметьево,Москва,RU,Europe/Moscow", "строка 3"),
        ("SVOO,Шереметьево,Москва,RU,Europe/Moscow", "строка 3"),
        ("SVO,Шереметьево,Москва,RUS,Europe/Moscow", "строка 3"),
        ("SVO,Шереметьево,Москва,RU,Europe/Nowhere", "строка 3"),
        ("DME,Домодедово,Москва,RU,Europe/Moscow", "дубль"),
    ],
)
def test_invalid_csv_reports_line_number(tmp_path: Path, line: str, expected: str) -> None:
    path = tmp_path / "airports.csv"
    path.write_text(HEADER + FIRST_ROW + line + "\n", encoding="utf-8")
    with pytest.raises(AirportsCsvError, match=expected):
        load_airports(path)


async def test_seed_is_idempotent(db_session: AsyncSession) -> None:
    expected = len(load_airports())

    async def snapshot() -> list[tuple[str, str, str]]:
        result = await db_session.execute(
            select(Location.code, Location.name, Location.timezone).order_by(Location.code)
        )
        return [(code, name, tz) for code, name, tz in result.all()]

    first = await seed_locations(db_session)
    before = await snapshot()
    second = await seed_locations(db_session)
    after = await snapshot()

    assert first == second == expected
    assert before == after
    assert len(after) == expected
    count = await db_session.scalar(
        select(func.count()).select_from(Location).where(Location.kind == LocationKind.AIRPORT)
    )
    assert count == expected


async def test_seed_restores_changed_rows(db_session: AsyncSession) -> None:
    svo = (await db_session.execute(select(Location).where(Location.code == "SVO"))).scalar_one()
    original = svo.name
    svo.name = "Изменено"
    await db_session.flush()

    await seed_locations(db_session)
    await db_session.refresh(svo)

    assert svo.name == original
