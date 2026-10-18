import json

from app.auth.telegram import sign_init_data

__all__ = ["BOT_TOKEN", "sign_init_data", "user_json"]

# conftest выставляет его в окружение как BOT_TOKEN приложения
BOT_TOKEN = "123456:test-token"


def user_json(**overrides: object) -> str:
    user: dict[str, object] = {"id": 42, "first_name": "Ivan", "username": "ivan"}
    user.update(overrides)
    return json.dumps(user, ensure_ascii=False)
