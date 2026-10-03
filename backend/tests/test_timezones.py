from datetime import UTC, datetime, timedelta, timezone

from app.timezones import from_local_or_aware, to_local


def test_to_local_uses_zone_offset() -> None:
    moment = datetime(2026, 11, 12, 0, 30, tzinfo=UTC)

    local = to_local(moment, "Asia/Novosibirsk")

    assert local.isoformat() == "2026-11-12T07:30:00+07:00"
    assert local == moment


def test_to_local_crosses_midnight() -> None:
    moment = datetime(2026, 11, 12, 22, 30, tzinfo=UTC)

    local = to_local(moment, "Europe/Moscow")

    assert local.isoformat() == "2026-11-13T01:30:00+03:00"


def test_to_local_respects_dst() -> None:
    summer = to_local(datetime(2026, 7, 1, 12, 0, tzinfo=UTC), "Europe/Berlin")
    winter = to_local(datetime(2026, 12, 1, 12, 0, tzinfo=UTC), "Europe/Berlin")

    assert summer.utcoffset() == timedelta(hours=2)
    assert winter.utcoffset() == timedelta(hours=1)


def test_naive_is_treated_as_local() -> None:
    result = from_local_or_aware(datetime(2026, 11, 12, 7, 30), "Asia/Novosibirsk")

    assert result.utcoffset() == timedelta(hours=7)
    assert result.astimezone(UTC) == datetime(2026, 11, 12, 0, 30, tzinfo=UTC)


def test_naive_local_across_midnight() -> None:
    result = from_local_or_aware(datetime(2026, 11, 13, 0, 15), "Europe/Moscow")

    assert result.astimezone(UTC) == datetime(2026, 11, 12, 21, 15, tzinfo=UTC)


def test_naive_local_follows_dst() -> None:
    summer = from_local_or_aware(datetime(2026, 7, 1, 12, 0), "Europe/Berlin")
    winter = from_local_or_aware(datetime(2026, 12, 1, 12, 0), "Europe/Berlin")

    assert summer.astimezone(UTC).hour == 10
    assert winter.astimezone(UTC).hour == 11


def test_aware_is_kept_as_is() -> None:
    moment = datetime(2026, 11, 12, 10, 5, tzinfo=timezone(timedelta(hours=3)))

    assert from_local_or_aware(moment, "Asia/Novosibirsk") is moment
