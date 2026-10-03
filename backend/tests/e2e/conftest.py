"""Сквозные тесты: используют тот же HTTP-клиент с БД, что и тесты API."""

from tests.api.conftest import api_client

__all__ = ["api_client"]
