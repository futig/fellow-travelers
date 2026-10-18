"""Dev-CLI: тестовые пользователи и их initData для разработки в браузере без Telegram.

    python -m app.dev.users [--frontend-env PATH] [--count N] [--force]

Создаёт пользователей с телефоном, подписывает для каждого initData токеном BOT_TOKEN
и пишет их в env-файл фронтенда (VITE_DEV_USERS).
"""

import argparse
import asyncio
import base64
import json
import secrets
import sys
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.auth.telegram import sign_init_data
from app.config import Settings, get_settings
from app.services.users import TelegramProfile, save_phone

DEFAULT_COUNT = 3
MAX_COUNT = 5
DEFAULT_FRONTEND_ENV = Path("../frontend/.env.development.local")
RECOMMENDED_MAX_AGE_SECONDS = 7 * 24 * 3600
_OUR_KEYS = ("VITE_MOCK_TELEGRAM", "VITE_DEV_USERS")
_HEADER_PREFIX = "# Сгенерировано:"


@dataclass(frozen=True, slots=True)
class DevUser:
    telegram_id: int
    first_name: str
    last_name: str
    username: str | None
    phone: str

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


DEV_USERS: tuple[DevUser, ...] = (
    DevUser(900000001, "Иван", "Петров", "dev_ivan", "+79990000001"),
    DevUser(900000002, "Мария", "Соколова", "dev_maria", "+79990000002"),
    DevUser(900000003, "Антон", "Максимов", None, "+79990000003"),
    DevUser(900000004, "Луна", "Сокол", "dev_luna", "+79990000004"),
    DevUser(900000005, "Егор", "Макаров", "dev_egor", "+79990000005"),
)


def format_phone(phone: str) -> str:
    """`+79990000001` -> `+7 999 000-00-01` (только для подписи в выпадающем списке)."""
    d = phone.removeprefix("+")
    if len(d) != 11:
        return phone
    return f"+{d[0]} {d[1:4]} {d[4:7]}-{d[7:9]}-{d[9:]}"


def label_for(user: DevUser) -> str:
    return f"{user.full_name} · {format_phone(user.phone)}"


def build_init_data(user: DevUser, bot_token: str, *, now: float | None = None) -> str:
    """initData, как её выдаёт Telegram: user (JSON), auth_date, query_id и hash."""
    payload: dict[str, object] = {
        "id": user.telegram_id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "language_code": "ru",
    }
    if user.username:
        payload["username"] = user.username
    fields = {
        "query_id": "AAH" + secrets.token_urlsafe(12),
        "user": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        "auth_date": str(int(time.time() if now is None else now)),
        # SDK мини-приложения требует поле signature; бэкенд его не проверяет, но хэширует
        "signature": "dev",
    }
    return sign_init_data(fields, bot_token)


def encode_dev_users(entries: Sequence[tuple[str, str]]) -> str:
    """[(label, init_data)] -> base64url без паддинга от JSON-массива."""
    data = [{"label": label, "init_data": init_data} for label, init_data in entries]
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_dev_users(value: str) -> list[dict[str, str]]:
    raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    result: list[dict[str, str]] = json.loads(raw)
    return result


def render_env(existing: str, dev_users_value: str, *, today: date, max_age_seconds: int) -> str:
    """Собирает содержимое env-файла: наши строки заменяются, остальные сохраняются."""
    kept = [
        line
        for line in existing.splitlines()
        if not line.startswith(_HEADER_PREFIX) and line.partition("=")[0].strip() not in _OUR_KEYS
    ]
    while kept and not kept[0].strip():
        kept.pop(0)
    header = (
        f"{_HEADER_PREFIX} python -m app.dev.users ({today.isoformat()}). Не коммитить. "
        f"initData действует INIT_DATA_MAX_AGE_SECONDS ({max_age_seconds} с)."
    )
    lines = [header, "VITE_MOCK_TELEGRAM=true", f"VITE_DEV_USERS={dev_users_value}", *kept]
    return "\n".join(lines) + "\n"


def select_users(count: int) -> tuple[DevUser, ...]:
    if not 1 <= count <= MAX_COUNT:
        raise ValueError(f"--count должен быть от 1 до {MAX_COUNT}")
    return DEV_USERS[:count]


def check_allowed(settings: Settings, *, force: bool) -> str | None:
    """Текст отказа, если запуск не разрешён; иначе None."""
    if settings.debug or force:
        return None
    return (
        "Отказ: DEBUG выключен, похоже на не-dev окружение. Скрипт пишет тестовых пользователей "
        "в БД. Для разработки поставьте DEBUG=true в backend/.env или передайте --force."
    )


async def create_dev_users(session: AsyncSession, users: Sequence[DevUser]) -> None:
    """Создаёт или обновляет пользователей вместе с телефоном (идемпотентно)."""
    for user in users:
        await save_phone(
            session,
            TelegramProfile(
                telegram_id=user.telegram_id,
                first_name=user.first_name,
                last_name=user.last_name,
                username=user.username,
                photo_url=None,
            ),
            user.phone,
        )


async def _run(database_url: str, users: Sequence[DevUser]) -> None:
    # свой engine без echo: при DEBUG=true движок приложения засыпал бы вывод SQL
    engine = create_async_engine(database_url)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            await create_dev_users(session, users)
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.dev.users",
        description="Тестовые пользователи и initData для разработки в браузере.",
    )
    parser.add_argument("--frontend-env", type=Path, default=DEFAULT_FRONTEND_ENV)
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT)
    parser.add_argument("--force", action="store_true", help="запустить при DEBUG=false")
    args = parser.parse_args(argv)

    try:
        users = select_users(args.count)
    except ValueError as exc:
        parser.error(str(exc))
    settings = get_settings()
    refusal = check_allowed(settings, force=args.force)
    if refusal:
        print(refusal, file=sys.stderr)
        return 1

    asyncio.run(_run(settings.database_url, users))

    token = settings.bot_token.get_secret_value()
    entries = [(label_for(u), build_init_data(u, token)) for u in users]
    env_path: Path = args.frontend_env
    existing = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    max_age = settings.init_data_max_age_seconds
    content = render_env(
        existing, encode_dev_users(entries), today=date.today(), max_age_seconds=max_age
    )
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(content, encoding="utf-8")

    print("Тестовые пользователи (с телефоном):")
    for u in users:
        username = f"@{u.username}" if u.username else "без username"
        print(f"  {u.telegram_id}  {label_for(u)}  ({username})")
    print(f"Env фронтенда записан: {env_path}")
    print(f"initData действует {max_age} с ({max_age / 3600:.1f} ч).")
    if max_age < RECOMMENDED_MAX_AGE_SECONDS:
        print(
            "Для разработки увеличьте INIT_DATA_MAX_AGE_SECONDS в backend/.env "
            "(например, 604800) или перезапускайте скрипт."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
