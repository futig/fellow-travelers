import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.users import (
    InvalidPhoneError,
    TelegramProfile,
    normalize_phone,
    save_phone,
    upsert_profile,
)
from tests.factories import make_user


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("79991234567", "+79991234567"),
        ("+79991234567", "+79991234567"),
        ("+7 (999) 123-45-67", "+79991234567"),
        ("8 999 123 45 67", "+89991234567"),
        ("1234567", "+1234567"),
        ("123456789012345", "+123456789012345"),
    ],
)
def test_normalize_phone(raw: str, expected: str) -> None:
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["123456", "1234567890123456", "+7999abc4567", "", "++79991234567"])
def test_normalize_phone_invalid(raw: str) -> None:
    with pytest.raises(InvalidPhoneError):
        normalize_phone(raw)


async def test_save_phone_creates_user(db_session: AsyncSession) -> None:
    profile = TelegramProfile(telegram_id=555_001, first_name="Анна", username="anna")
    user = await save_phone(db_session, profile, "+7 (999) 123-45-67")
    assert user.phone == "+79991234567"
    assert user.first_name == "Анна"
    assert user.username == "anna"


async def test_save_phone_existing_user(db_session: AsyncSession) -> None:
    existing = await make_user(db_session, telegram_id=555_002, first_name="Old")
    profile = TelegramProfile(telegram_id=555_002, first_name="New")
    user = await save_phone(db_session, profile, "79991234567")
    assert user.id == existing.id
    assert user.phone == "+79991234567"
    assert user.first_name == "New"


async def test_save_phone_invalid_does_not_create_user(db_session: AsyncSession) -> None:
    with pytest.raises(InvalidPhoneError):
        await save_phone(db_session, TelegramProfile(telegram_id=555_003, first_name="X"), "12")
    user = await upsert_profile(db_session, TelegramProfile(telegram_id=555_003, first_name="X"))
    assert user.phone is None


async def test_upsert_keeps_phone_and_photo(db_session: AsyncSession) -> None:
    user = await make_user(
        db_session, telegram_id=555_004, phone="+79991234567", photo_url="http://p/1.png"
    )
    updated = await upsert_profile(
        db_session, TelegramProfile(telegram_id=555_004, first_name="Renamed", username="u")
    )
    assert updated.id == user.id
    assert updated.first_name == "Renamed"
    assert updated.phone == "+79991234567"
    assert updated.photo_url == "http://p/1.png"


async def test_upsert_explicit_photo_overrides(db_session: AsyncSession) -> None:
    await make_user(db_session, telegram_id=555_005, photo_url="http://p/1.png")
    updated = await upsert_profile(
        db_session, TelegramProfile(telegram_id=555_005, first_name="A", photo_url=None)
    )
    assert updated.photo_url is None
