"""Перевод моментов времени в местное время аэропорта и обратно."""

from datetime import datetime
from zoneinfo import ZoneInfo


def to_local(dt: datetime, tz_name: str) -> datetime:
    """Тот же момент, выраженный в таймзоне `tz_name` (со смещением этой зоны)."""
    return dt.astimezone(ZoneInfo(tz_name))


def from_local_or_aware(dt: datetime, tz_name: str) -> datetime:
    """Datetime со смещением возвращается как есть; без смещения — местное время в `tz_name`."""
    if dt.tzinfo is None or dt.utcoffset() is None:
        return dt.replace(tzinfo=ZoneInfo(tz_name))
    return dt
