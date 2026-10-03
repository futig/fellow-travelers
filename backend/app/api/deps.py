from typing import Annotated

from fastapi import Depends
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.telegram import CurrentInitData
from app.db import get_session
from app.models import User

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(init_data: CurrentInitData, session: SessionDep) -> User:
    """Находит или создаёт пользователя по initData и обновляет его профиль из Telegram.

    UPDATE выполняется только при изменении данных. Телефон не трогаем: его сохраняет бот.

    Коммит делается всегда, в том числе когда ничего не изменилось: `INSERT ... ON CONFLICT DO
    UPDATE ... WHERE` блокирует конфликтующую строку, даже если UPDATE не выполнился. Без коммита
    блокировка жила бы до конца запроса, и параллельные запросы одного пользователя шли бы
    по очереди.
    """
    tg = init_data.user
    values = {
        "first_name": tg.first_name,
        "last_name": tg.last_name,
        "username": tg.username,
        "photo_url": tg.photo_url,
    }
    insert_stmt = insert(User).values(telegram_id=tg.id, **values)
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[User.telegram_id],
        set_={name: insert_stmt.excluded[name] for name in values},
        where=or_(
            *(getattr(User, name).is_distinct_from(insert_stmt.excluded[name]) for name in values)
        ),
    ).returning(User)
    result = await session.execute(stmt, execution_options={"populate_existing": True})
    user: User | None = result.scalar_one_or_none()
    if user is None:
        user = (
            await session.execute(
                select(User).where(User.telegram_id == tg.id),
                execution_options={"populate_existing": True},
            )
        ).scalar_one()
    await session.commit()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
