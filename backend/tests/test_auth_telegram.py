import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response

from app.auth import CurrentInitData, InitData, InitDataError, validate_init_data
from tests.helpers.telegram import BOT_TOKEN, sign_init_data, user_json

NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
MAX_AGE = timedelta(hours=24)


def _ts(delta: timedelta = timedelta()) -> str:
    return str(int((NOW + delta).timestamp()))


def _fields(**overrides: str) -> dict[str, str]:
    fields = {"user": user_json(), "auth_date": _ts(), "query_id": "AAH"}
    fields.update(overrides)
    return fields


def _validate(raw: str, *, token: str = BOT_TOKEN, now: datetime = NOW) -> InitData:
    return validate_init_data(raw, bot_token=token, max_age=MAX_AGE, now=now)


def test_reference_vector() -> None:
    # независимая реализация по документации Telegram, без helpers и кода приложения
    token = "7777:reference-token"
    pairs = {
        "auth_date": "1700000000",
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        "user": '{"id":279058397,"first_name":"Vladislav","username":"vdkfrost"}',
    }
    check = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    digest = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    raw = urlencode({**pairs, "hash": digest})
    now = datetime.fromtimestamp(1700000100, UTC)
    result = validate_init_data(raw, bot_token=token, max_age=MAX_AGE, now=now)
    assert result.user.id == 279058397
    assert result.user.username == "vdkfrost"


def test_valid_full() -> None:
    user = user_json(last_name="Petrov", photo_url="https://t.me/i/u.jpg", language_code="ru")
    raw = sign_init_data(_fields(user=user, start_param="trip_abc"), BOT_TOKEN)
    result = _validate(raw)
    assert result.user.id == 42
    assert result.user.first_name == "Ivan"
    assert result.user.last_name == "Petrov"
    assert result.user.username == "ivan"
    assert result.user.photo_url == "https://t.me/i/u.jpg"
    assert result.user.language_code == "ru"
    assert result.auth_date == NOW
    assert result.auth_date.tzinfo is not None
    assert result.start_param == "trip_abc"


def test_unicode_name() -> None:
    raw = sign_init_data(_fields(user=user_json(first_name="Иван", last_name="Петров")), BOT_TOKEN)
    result = _validate(raw)
    assert result.user.first_name == "Иван"
    assert result.user.last_name == "Петров"


def test_optional_fields_absent() -> None:
    raw = sign_init_data(_fields(user='{"id": 1, "first_name": "A"}'), BOT_TOKEN)
    result = _validate(raw)
    assert result.user.last_name is None
    assert result.user.username is None
    assert result.user.photo_url is None
    assert result.user.language_code is None
    assert result.start_param is None


def test_empty_optional_strings_become_none() -> None:
    user = user_json(last_name="", username="", photo_url="", language_code="")
    raw = sign_init_data(_fields(user=user, start_param=""), BOT_TOKEN)
    result = _validate(raw)
    assert result.user.last_name is None
    assert result.user.username is None
    assert result.user.photo_url is None
    assert result.user.language_code is None
    assert result.start_param is None


def test_signature_field_is_part_of_check_string() -> None:
    raw = sign_init_data(_fields(signature="abc_DEF"), BOT_TOKEN)
    assert _validate(raw).user.id == 42


def test_wrong_hash() -> None:
    raw = sign_init_data(_fields(), BOT_TOKEN).replace("hash=", "hash=0")
    with pytest.raises(InitDataError):
        _validate(raw)


def test_tampered_field() -> None:
    raw = sign_init_data(_fields(), BOT_TOKEN)
    tampered = raw.replace("AAH", "BBB")
    assert tampered != raw
    with pytest.raises(InitDataError):
        _validate(tampered)


def test_other_token() -> None:
    raw = sign_init_data(_fields(), "999:other")
    with pytest.raises(InitDataError):
        _validate(raw)


def test_missing_hash() -> None:
    with pytest.raises(InitDataError):
        _validate(urlencode(_fields()))


@pytest.mark.parametrize("missing", ["user", "auth_date"])
def test_missing_required(missing: str) -> None:
    fields = _fields()
    del fields[missing]
    with pytest.raises(InitDataError):
        _validate(sign_init_data(fields, BOT_TOKEN))


@pytest.mark.parametrize("value", ["abc", "", "12.5", "-5", "١٢٣"])
def test_bad_auth_date(value: str) -> None:
    with pytest.raises(InitDataError):
        _validate(sign_init_data(_fields(auth_date=value), BOT_TOKEN))


def test_auth_date_out_of_range() -> None:
    with pytest.raises(InitDataError):
        _validate(sign_init_data(_fields(auth_date="9" * 30), BOT_TOKEN))


def test_age_boundary() -> None:
    raw = sign_init_data(_fields(auth_date=_ts(-MAX_AGE)), BOT_TOKEN)
    assert _validate(raw).auth_date == NOW - MAX_AGE
    raw = sign_init_data(_fields(auth_date=_ts(-MAX_AGE - timedelta(seconds=1))), BOT_TOKEN)
    with pytest.raises(InitDataError):
        _validate(raw)


def test_future_boundary() -> None:
    raw = sign_init_data(_fields(auth_date=_ts(timedelta(seconds=60))), BOT_TOKEN)
    assert _validate(raw).user.id == 42
    raw = sign_init_data(_fields(auth_date=_ts(timedelta(seconds=61))), BOT_TOKEN)
    with pytest.raises(InitDataError):
        _validate(raw)


def test_duplicate_key() -> None:
    raw = sign_init_data(_fields(), BOT_TOKEN) + "&query_id=AAH"
    with pytest.raises(InitDataError):
        _validate(raw)


@pytest.mark.parametrize("raw", ["garbage", "a=1&&b=2", ""])
def test_malformed_query(raw: str) -> None:
    with pytest.raises(InitDataError):
        _validate(raw)


@pytest.mark.parametrize(
    "user",
    [
        "{not json",
        "[1, 2]",
        '"str"',
        '{"id": "42", "first_name": "A"}',
        '{"id": true, "first_name": "A"}',
        '{"id": 1.5, "first_name": "A"}',
        '{"first_name": "A"}',
        '{"id": 1, "first_name": ""}',
        '{"id": 1}',
        '{"id": 1, "first_name": 5}',
        '{"id": 1, "first_name": "A", "username": 5}',
    ],
)
def test_bad_user(user: str) -> None:
    with pytest.raises(InitDataError):
        _validate(sign_init_data(_fields(user=user), BOT_TOKEN))


def test_naive_now() -> None:
    raw = sign_init_data(_fields(), BOT_TOKEN)
    with pytest.raises(ValueError, match="timezone-aware"):
        _validate(raw, now=datetime(2026, 1, 1, 12, 0, 0))


# --- зависимость get_init_data ---


@pytest.fixture
def auth_app(app: FastAPI) -> FastAPI:
    @app.get("/_whoami")
    async def whoami(init_data: CurrentInitData) -> dict[str, int]:
        return {"id": init_data.user.id}

    return app


def _live_init_data(age: timedelta = timedelta()) -> str:
    auth_date = str(int((datetime.now(UTC) - age).timestamp()))
    return sign_init_data(_fields(auth_date=auth_date), BOT_TOKEN)


async def _get(client: AsyncClient, authorization: str | None) -> Response:
    headers = {} if authorization is None else {"Authorization": authorization}
    return await client.get("/_whoami", headers=headers)


@pytest.mark.usefixtures("auth_app")
async def test_dependency_valid(client: AsyncClient) -> None:
    response = await _get(client, f"tma {_live_init_data()}")
    assert response.status_code == 200
    assert response.json() == {"id": 42}


@pytest.mark.usefixtures("auth_app")
async def test_dependency_scheme_case_insensitive(client: AsyncClient) -> None:
    response = await _get(client, f"TMA   {_live_init_data()}")
    assert response.status_code == 200


@pytest.mark.usefixtures("auth_app")
@pytest.mark.parametrize("header", [None, "", "Bearer xxx", "tma", "tma   ", "tma garbage"])
async def test_dependency_unauthorized(client: AsyncClient, header: str | None) -> None:
    response = await _get(client, header)
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "UNAUTHORIZED", "message": "Требуется авторизация", "details": None}
    }


@pytest.mark.usefixtures("auth_app")
async def test_dependency_expired(client: AsyncClient) -> None:
    response = await _get(client, f"tma {_live_init_data(timedelta(days=2))}")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
