import logging
from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

_REQUEST_SOURCES = frozenset({"body", "query", "path", "header", "cookie"})


class ErrorCode(StrEnum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    PHONE_REQUIRED = "PHONE_REQUIRED"
    NOT_FOUND = "NOT_FOUND"
    INVITE_NOT_FOUND = "INVITE_NOT_FOUND"
    JOIN_CLOSED = "JOIN_CLOSED"
    APPLICATION_LOCKED = "APPLICATION_LOCKED"
    ALREADY_DEPARTED = "ALREADY_DEPARTED"
    CAPACITY_EXCEEDED = "CAPACITY_EXCEEDED"
    TRIP_IN_USE = "TRIP_IN_USE"
    INCOMPATIBLE_TRANSFER = "INCOMPATIBLE_TRANSFER"
    FLIGHT_PROVIDER_UNAVAILABLE = "FLIGHT_PROVIDER_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def _error_response(
    status_code: int,
    code: ErrorCode,
    message: str,
    details: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = {"error": {"code": code.value, "message": message, "details": details}}
    return JSONResponse(body, status_code=status_code, headers=headers)


def _field_path(loc: tuple[int | str, ...]) -> str:
    source = str(loc[0]) if loc else "body"
    parts = loc[1:] if source in _REQUEST_SOURCES else loc
    return ".".join(str(p) for p in parts) or source


_TYPE_MESSAGES: dict[str, str] = {
    "missing": "Обязательное поле",
    "string_too_short": "Слишком короткое значение",
    "literal_error": "Недопустимое значение",
    "enum": "Недопустимое значение",
    "uuid_parsing": "Некорректный идентификатор",
    "uuid_type": "Некорректный идентификатор",
    "date_parsing": "Некорректная дата",
    "date_from_datetime_parsing": "Некорректная дата",
    "date_type": "Некорректная дата",
    "datetime_parsing": "Некорректные дата и время",
    "datetime_from_date_parsing": "Некорректные дата и время",
    "datetime_type": "Некорректные дата и время",
    "string_pattern_mismatch": "Неверный формат",
    "url_parsing": "Некорректная ссылка",
    "url_scheme": "Некорректная ссылка",
    "url_type": "Некорректная ссылка",
    "too_short": "Слишком мало элементов",
    "too_long": "Слишком много элементов",
    "extra_forbidden": "Лишнее поле",
    **dict.fromkeys(
        (
            "string_type",
            "int_type",
            "int_parsing",
            "float_type",
            "float_parsing",
            "bool_type",
            "bool_parsing",
            "dict_type",
            "list_type",
            "model_type",
            "model_attributes_type",
        ),
        "Неверный тип значения",
    ),
}

# тип ошибки -> (ключ ctx, шаблон с числом, вариант без числа)
_LIMIT_MESSAGES: dict[str, tuple[str, str, str]] = {
    "string_too_long": ("max_length", "Не длиннее {} символов", "Слишком длинное значение"),
    "greater_than_equal": ("ge", "Не меньше {}", "Слишком маленькое значение"),
    "less_than_equal": ("le", "Не больше {}", "Слишком большое значение"),
    "greater_than": ("gt", "Больше {}", "Слишком маленькое значение"),
    "less_than": ("lt", "Меньше {}", "Слишком большое значение"),
}


def _translate(err: Mapping[str, Any]) -> str:
    err_type = str(err.get("type", ""))
    ctx: Mapping[str, Any] = err.get("ctx") or {}
    if err_type in _LIMIT_MESSAGES:
        key, template, fallback = _LIMIT_MESSAGES[err_type]
        return template.format(ctx[key]) if key in ctx else fallback
    if err_type in ("value_error", "assertion_error"):
        text = str(ctx["error"]) if "error" in ctx else ""
        return text or "Некорректное значение"
    return _TYPE_MESSAGES.get(err_type, "Некорректное значение")


_HTTP_ERRORS: dict[int, tuple[ErrorCode, str]] = {
    401: (ErrorCode.UNAUTHORIZED, "Требуется авторизация"),
    403: (ErrorCode.FORBIDDEN, "Доступ запрещён"),
    404: (ErrorCode.NOT_FOUND, "Не найдено"),
    405: (ErrorCode.VALIDATION_ERROR, "Метод не поддерживается"),
}


def _http_error_info(status: int) -> tuple[ErrorCode, str]:
    if status in _HTTP_ERRORS:
        return _HTTP_ERRORS[status]
    if status >= 500:
        return ErrorCode.INTERNAL_ERROR, "Внутренняя ошибка сервера"
    return ErrorCode.VALIDATION_ERROR, "Ошибка запроса"


async def _handle_app_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return _error_response(exc.status_code, exc.code, exc.message, exc.details)


async def _handle_validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    fields: dict[str, str] = {}
    for err in exc.errors():
        if err["type"] == "json_invalid":
            fields.setdefault("body", "Некорректный JSON")
        else:
            fields.setdefault(_field_path(err["loc"]), _translate(err))
    return _error_response(
        422, ErrorCode.VALIDATION_ERROR, "Проверьте введённые данные", {"fields": fields}
    )


async def _handle_http_exception(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code, message = _http_error_info(exc.status_code)
    headers = dict(exc.headers) if exc.headers else None
    return _error_response(exc.status_code, code, message, headers=headers)


async def _handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception", exc_info=exc)
    return _error_response(500, ErrorCode.INTERNAL_ERROR, "Внутренняя ошибка сервера")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(Exception, _handle_unexpected)
