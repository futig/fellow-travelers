import hashlib
import hmac
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import parse_qsl

from fastapi import Depends
from fastapi.security import APIKeyHeader

from app.config import get_settings
from app.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)

# допустимое расхождение часов клиента и сервера
MAX_FUTURE_SKEW = timedelta(seconds=60)
_AUTH_SCHEME = "tma"


@dataclass(frozen=True, slots=True)
class TelegramUser:
    id: int
    first_name: str
    last_name: str | None
    username: str | None
    photo_url: str | None
    language_code: str | None


@dataclass(frozen=True, slots=True)
class InitData:
    user: TelegramUser
    auth_date: datetime
    start_param: str | None


class InitDataError(Exception):
    """Причина отказа — только для логов, пользователю не показывается."""


def _parse_pairs(raw: str) -> dict[str, str]:
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise InitDataError("initData is not a valid query string") from exc
    fields: dict[str, str] = {}
    for key, value in pairs:
        if key in fields:
            raise InitDataError(f"duplicate key: {key}")
        fields[key] = value
    return fields


def _check_hash(fields: dict[str, str], bot_token: str) -> None:
    received = fields.get("hash")
    if received is None:
        raise InitDataError("hash is missing")
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()) if k != "hash")
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected.encode(), received.encode()):
        raise InitDataError("hash mismatch")


def _parse_auth_date(fields: dict[str, str], now: datetime, max_age: timedelta) -> datetime:
    value = fields.get("auth_date")
    if value is None:
        raise InitDataError("auth_date is missing")
    if not (value.isascii() and value.isdigit()):
        raise InitDataError("auth_date is not an integer")
    try:
        auth_date = datetime.fromtimestamp(int(value), UTC)
    except (OverflowError, OSError, ValueError) as exc:
        raise InitDataError("auth_date is out of range") from exc
    if now - auth_date > max_age:
        raise InitDataError("auth_date is too old")
    if auth_date - now > MAX_FUTURE_SKEW:
        raise InitDataError("auth_date is in the future")
    return auth_date


def _optional_str(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise InitDataError(f"user.{key} is not a string")
    return value


def _parse_user(fields: dict[str, str]) -> TelegramUser:
    value = fields.get("user")
    if value is None:
        raise InitDataError("user is missing")
    try:
        data = json.loads(value)
    except ValueError as exc:
        raise InitDataError("user is not valid JSON") from exc
    if not isinstance(data, dict):
        raise InitDataError("user is not an object")
    user_id = data.get("id")
    if not isinstance(user_id, int) or isinstance(user_id, bool):
        raise InitDataError("user.id is not an integer")
    first_name = data.get("first_name")
    if not isinstance(first_name, str) or not first_name:
        raise InitDataError("user.first_name is missing")
    return TelegramUser(
        id=user_id,
        first_name=first_name,
        last_name=_optional_str(data, "last_name"),
        username=_optional_str(data, "username"),
        photo_url=_optional_str(data, "photo_url"),
        language_code=_optional_str(data, "language_code"),
    )


def validate_init_data(raw: str, *, bot_token: str, max_age: timedelta, now: datetime) -> InitData:
    """Проверяет подпись и свежесть initData по правилам Telegram Mini Apps."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    fields = _parse_pairs(raw)
    _check_hash(fields, bot_token)
    auth_date = _parse_auth_date(fields, now, max_age)
    user = _parse_user(fields)
    return InitData(user=user, auth_date=auth_date, start_param=fields.get("start_param") or None)


_authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
    description="`tma <initData>` — значение Telegram.WebApp.initData",
)


def _unauthorized() -> AppError:
    return AppError(ErrorCode.UNAUTHORIZED, "Требуется авторизация", 401)


def get_init_data(
    authorization: Annotated[str | None, Depends(_authorization_header)] = None,
) -> InitData:
    if not authorization:
        raise _unauthorized()
    scheme, _, raw = authorization.strip().partition(" ")
    raw = raw.strip()
    if scheme.lower() != _AUTH_SCHEME or not raw:
        raise _unauthorized()
    settings = get_settings()
    try:
        return validate_init_data(
            raw,
            bot_token=settings.bot_token.get_secret_value(),
            max_age=timedelta(seconds=settings.init_data_max_age_seconds),
            now=datetime.now(UTC),
        )
    except InitDataError as exc:
        logger.info("initData rejected: %s", exc)
        raise _unauthorized() from exc


CurrentInitData = Annotated[InitData, Depends(get_init_data)]
