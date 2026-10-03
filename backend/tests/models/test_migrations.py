import asyncio

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models import Base
from tests.db import alembic_config, migrate_from_scratch


def _diff(connection: Connection) -> list[object]:
    context = MigrationContext.configure(
        connection, opts={"compare_type": True, "compare_server_default": True}
    )
    return list(compare_metadata(context, Base.metadata))


async def test_migration_matches_models(db_engine: AsyncEngine) -> None:
    async with db_engine.connect() as connection:
        assert await connection.run_sync(_diff) == []


async def test_downgrade_base_then_upgrade_head(
    db_engine: AsyncEngine, migrated_database: str
) -> None:
    # Alembic (env.py) сам вызывает asyncio.run, поэтому из работающего цикла — только в потоке
    await asyncio.to_thread(command.downgrade, alembic_config(), "base")
    await db_engine.dispose()  # соединения пула знают про старую схему
    try:
        async with db_engine.connect() as connection:
            tables = await connection.run_sync(lambda c: inspect(c).get_table_names())
        assert tables == ["alembic_version"]
    finally:
        await asyncio.to_thread(migrate_from_scratch, migrated_database)
        await db_engine.dispose()
