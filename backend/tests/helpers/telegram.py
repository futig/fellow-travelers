import hashlib
import hmac
import json
from urllib.parse import urlencode

# conftest выставляет его в окружение как BOT_TOKEN приложения
BOT_TOKEN = "123456:test-token"


def sign_init_data(fields: dict[str, str], bot_token: str) -> str:
    """Собирает подписанную строку initData; user передавайте уже как JSON-строку."""
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    digest = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**fields, "hash": digest})


def user_json(**overrides: object) -> str:
    user: dict[str, object] = {"id": 42, "first_name": "Ivan", "username": "ivan"}
    user.update(overrides)
    return json.dumps(user, ensure_ascii=False)
