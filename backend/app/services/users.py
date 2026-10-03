import re
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User

_PHONE_SEPARATORS = re.compile(r"[\s()\-.]")
_PHONE_RE = re.compile(r"\+\d{7,15}")


class InvalidPhoneError(ValueError):
    """Телефон не удалось привести к формату E.164."""


class _Unset:
    """Маркер «поле не передано»: отличает его от осознанного None."""


UNSET = _Unset()


@dataclass(frozen=True)
class TelegramProfile:
    telegram_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    # Бот не знает аватар, а initData его передаёт. UNSET — не трогать сохранённое значение.
    photo_url: str | _Unset | None = UNSET


def normalize_phone(raw: str) -> str:
    """Приводит телефон к E.164: убирает пробелы, скобки, дефисы, добавляет ведущий `+`."""
    cleaned = _PHONE_SEPARATORS.sub("", raw)
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    if not _PHONE_RE.fullmatch(cleaned):
        raise InvalidPhoneError(raw)
    return cleaned


async def upsert_profile(session: AsyncSession, profile: TelegramProfile) -> User:
    """Находит или создаёт пользователя и обновляет профиль из Telegram. Телефон не трогает.

    UPDATE выполняется только при изменении данных. Коммит делается всегда, в том числе когда
    ничего не изменилось: `INSERT ... ON CONFLICT DO UPDATE ... WHERE` блокирует конфликтующую
    строку, даже если UPDATE не выполнился. Без коммита блокировка жила бы до конца запроса,
    и параллельные запросы одного пользователя шли бы по очереди.
    """
    values: dict[str, str | None] = {
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "username": profile.username,
    }
    if not isinstance(profile.photo_url, _Unset):
        values["photo_url"] = profile.photo_url
    insert_stmt = insert(User).values(telegram_id=profile.telegram_id, **values)
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
                select(User).where(User.telegram_id == profile.telegram_id),
                execution_options={"populate_existing": True},
            )
        ).scalar_one()
    await session.commit()
    return user


async def save_phone(session: AsyncSession, profile: TelegramProfile, raw_phone: str) -> User:
    """Сохраняет телефон пользователя (создаёт пользователя, если его нет).

    Raises:
        InvalidPhoneError: телефон не соответствует E.164.
    """
    phone = normalize_phone(raw_phone)
    user = await upsert_profile(session, profile)
    user.phone = phone
    await session.commit()
    return user
