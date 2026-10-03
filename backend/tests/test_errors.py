from pathlib import Path
from typing import Any

import pytest
import yaml
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient
from pydantic import BaseModel, Field, field_validator

from app.errors import AppError, ErrorCode, _translate

OPENAPI_PATH = Path(__file__).resolve().parent.parent.parent / "docs" / "contracts" / "openapi.yaml"


class Point(BaseModel):
    address: str


class Payload(BaseModel):
    title: str
    point: Point


class Limits(BaseModel):
    name: str = Field(max_length=3)
    age: int = Field(ge=18)
    code: str

    @field_validator("code")
    @classmethod
    def _check_code(cls, value: str) -> str:
        raise ValueError("Код должен быть числом")


def _add_routes(app: FastAPI) -> None:
    @app.get("/boom-app")
    async def boom_app() -> None:
        raise AppError(ErrorCode.JOIN_CLOSED, "Вступление в группу закрыто", 409)

    @app.post("/validate")
    async def validate(payload: Payload) -> dict[str, str]:
        return {"title": payload.title}

    @app.get("/forbidden")
    async def forbidden() -> None:
        raise HTTPException(403)

    @app.post("/limits")
    async def limits(payload: Limits) -> None:
        return None

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret")


async def test_app_error(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.get("/boom-app")

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "JOIN_CLOSED",
            "message": "Вступление в группу закрыто",
            "details": None,
        }
    }


async def test_validation_error(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.post("/validate", json={"point": {}})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "Проверьте введённые данные"
    assert set(error["details"]["fields"]) == {"title", "point.address"}


async def test_unknown_path(client: AsyncClient) -> None:
    response = await client.get("/nope")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "Не найдено", "details": None}
    }


async def test_unhandled_exception(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "Внутренняя ошибка сервера",
            "details": None,
        }
    }
    assert "secret" not in response.text


async def test_method_not_allowed(client: AsyncClient) -> None:
    response = await client.post("/healthz")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["message"] == "Метод не поддерживается"
    assert "GET" in response.headers["allow"]


def test_error_code_matches_openapi() -> None:
    spec: dict[str, Any] = yaml.safe_load(OPENAPI_PATH.read_text(encoding="utf-8"))
    enum = spec["components"]["schemas"]["Error"]["properties"]["error"]["properties"]["code"][
        "enum"
    ]

    assert [c.value for c in ErrorCode] == enum


async def test_invalid_json(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.post(
        "/validate", content="{bad", headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"] == {"fields": {"body": "Некорректный JSON"}}


async def test_http_exception_message_is_russian(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.get("/forbidden")

    assert response.status_code == 403
    assert response.json() == {
        "error": {"code": "FORBIDDEN", "message": "Доступ запрещён", "details": None}
    }


async def test_translated_field_messages(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.post("/limits", json={"name": "abcd", "age": 5, "code": "x"})

    assert response.json()["error"]["details"]["fields"] == {
        "name": "Не длиннее 3 символов",
        "age": "Не меньше 18",
        "code": "Код должен быть числом",
    }


async def test_missing_field_message(app: FastAPI, client: AsyncClient) -> None:
    _add_routes(app)

    response = await client.post("/validate", json={})

    assert response.json()["error"]["details"]["fields"] == {
        "title": "Обязательное поле",
        "point": "Обязательное поле",
    }


@pytest.mark.parametrize(
    ("err", "expected"),
    [
        ({"type": "missing"}, "Обязательное поле"),
        ({"type": "string_type"}, "Неверный тип значения"),
        ({"type": "string_too_long", "ctx": {"max_length": 5}}, "Не длиннее 5 символов"),
        ({"type": "string_too_long"}, "Слишком длинное значение"),
        ({"type": "greater_than_equal", "ctx": {"ge": 1}}, "Не меньше 1"),
        ({"type": "less_than_equal", "ctx": {"le": 9}}, "Не больше 9"),
        ({"type": "greater_than", "ctx": {"gt": 0}}, "Больше 0"),
        ({"type": "less_than", "ctx": {"lt": 3}}, "Меньше 3"),
        ({"type": "value_error", "ctx": {"error": ValueError("Плохо")}}, "Плохо"),
        ({"type": "value_error"}, "Некорректное значение"),
        ({"type": "uuid_parsing"}, "Некорректный идентификатор"),
        ({"type": "something_new"}, "Некорректное значение"),
    ],
)
def test_translate(err: dict[str, Any], expected: str) -> None:
    assert _translate(err) == expected
