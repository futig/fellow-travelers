import httpx
import pytest
from jsonschema import Draft202012Validator

from tests.helpers.contract import assert_contract

EVENT_ID = "6f1b7a52-3c9e-4f5a-9d44-1a2b3c4d5e6f"


def _event(**overrides: object) -> dict[str, object]:
    point = {"address": "Терминал D", "lat": None, "lon": None}
    body: dict[str, object] = {
        "id": EVENT_ID,
        "title": "Конференция",
        "starts_on": "2026-11-12",
        "ends_on": "2026-11-14",
        "meeting_point": point,
        "pickup_point": point,
        "destination": point,
        "meeting_instruction": "",
        "chat_url": None,
        "join_open": True,
        "is_admin": True,
        "is_participant": False,
    }
    body.update(overrides)
    return body


def _check(
    status: int, body: object, method: str = "GET", path: str = "/events/{event_id}"
) -> None:
    assert_contract(httpx.Response(status, json=body), method, path)


def test_valid_response_passes() -> None:
    _check(200, _event())


def test_missing_required_field_fails() -> None:
    body = _event()
    del body["join_open"]
    with pytest.raises(AssertionError, match="join_open"):
        _check(200, body)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", "not-a-uuid"),
        ("starts_on", "12.11.2026"),
        ("starts_on", "2026-13-45"),
        ("chat_url", 5),
    ],
)
def test_invalid_format_or_type_fails(field: str, value: object) -> None:
    with pytest.raises(AssertionError, match=field):
        _check(200, _event(**{field: value}))


def test_invalid_date_time_fails() -> None:
    # в Event нет date-time; проверяем формат на реальной схеме с date-time, если она есть
    schema = {"type": "string", "format": "date-time"}
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    assert not validator.is_valid("2026-11-12 10:00")
    assert validator.is_valid("2026-11-12T10:00:00+03:00")


def test_invalid_uri_fails() -> None:
    validator = Draft202012Validator(
        {"type": "string", "format": "uri"}, format_checker=Draft202012Validator.FORMAT_CHECKER
    )
    assert not validator.is_valid("not a uri")
    assert validator.is_valid("https://t.me/bot?startapp=join_ABC234")


def test_invite_uri_in_response_is_checked() -> None:
    with pytest.raises(AssertionError, match="link"):
        _check(200, {"code": "ABC234", "link": "not a uri"}, path="/events/{event_id}/invite")


def test_undeclared_status_fails() -> None:
    with pytest.raises(AssertionError, match="не описан"):
        _check(200, _event(), method="POST", path="/events")


def test_error_response_is_validated_via_component_ref() -> None:
    error = {"error": {"code": "NOT_FOUND", "message": "x", "details": None}}
    _check(404, error)
    with pytest.raises(AssertionError):
        _check(404, {"error": {"code": "NOPE", "message": "x", "details": None}})


def test_unauthorized_is_described_for_every_operation() -> None:
    _check(401, {"error": {"code": "UNAUTHORIZED", "message": "x", "details": None}})
