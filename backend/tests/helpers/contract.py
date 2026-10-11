"""Проверка ответов API по docs/contracts/openapi.yaml."""

import functools
from pathlib import Path
from typing import Any

import httpx
import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "docs" / "contracts" / "openapi.yaml"
_ROOT_URI = "urn:fellow-travelers:openapi"
_FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER


@functools.cache
def _contract() -> dict[str, Any]:
    with CONTRACT_PATH.open(encoding="utf-8") as f:
        loaded = yaml.safe_load(f)
    assert isinstance(loaded, dict)
    return loaded


@functools.cache
def _registry() -> Registry[Any]:
    resource = Resource.from_contents(_contract(), default_specification=DRAFT202012)
    registry: Registry[Any] = Registry().with_resource(_ROOT_URI, resource)
    return registry


def _resolve_ref(node: dict[str, Any]) -> dict[str, Any]:
    ref = node.get("$ref")
    if ref is None:
        return node
    assert isinstance(ref, str), f"Неподдерживаемый $ref: {ref}"
    assert ref.startswith("#/"), f"Неподдерживаемый $ref: {ref}"
    target: Any = _contract()
    for part in ref[2:].split("/"):
        target = target[part.replace("~1", "/").replace("~0", "~")]
    assert isinstance(target, dict)
    return _resolve_ref(target)


def _absolute_refs(node: Any) -> Any:
    """Делает локальные `$ref: '#/...'` абсолютными, чтобы они разрешались в корне контракта."""
    if isinstance(node, dict):
        return {
            key: (
                _ROOT_URI + value
                if key == "$ref" and str(value).startswith("#")
                else _absolute_refs(value)
            )
            for key, value in node.items()
        }
    if isinstance(node, list):
        return [_absolute_refs(item) for item in node]
    return node


def _find_response(method: str, path: str, status: int) -> dict[str, Any] | None:
    paths: dict[str, Any] = _contract()["paths"]
    assert path in paths, f"Путь {path} не описан в контракте"
    operation = paths[path].get(method.lower())
    assert operation is not None, f"Операция {method.upper()} {path} не описана в контракте"
    responses: dict[str, Any] = operation["responses"]
    declared = responses.get(str(status))
    return None if declared is None else _resolve_ref(declared)


def assert_contract(response: httpx.Response, method: str, path: str) -> None:
    """Проверяет статус и тело ответа по контракту.

    `path` — шаблон из контракта без `/api/v1`, например `/events/{event_id}`.
    Строго: допустимы только статусы, описанные у операции в контракте.
    """
    status = response.status_code
    declared = _find_response(method, path, status)
    if declared is None:
        known = sorted(_contract()["paths"][path][method.lower()]["responses"])
        raise AssertionError(
            f"Статус {status} не описан в контракте для {method.upper()} {path} "
            f"(описаны: {', '.join(known)}). Тело: {response.text[:300]}"
        )
    content = declared.get("content")
    if not content:
        assert response.content == b"", f"Ожидалось пустое тело, получено: {response.text[:300]}"
        return
    schema = content["application/json"]["schema"]
    body = response.json()
    validator = Draft202012Validator(
        _absolute_refs(schema), registry=_registry(), format_checker=_FORMAT_CHECKER
    )
    errors = sorted(validator.iter_errors(body), key=lambda e: list(e.absolute_path))
    if errors:
        details = "\n".join(
            f"  {'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in errors
        )
        raise AssertionError(
            f"Ответ {status} на {method.upper()} {path} не соответствует контракту:\n{details}"
        )
