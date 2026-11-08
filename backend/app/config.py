import re
from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BOT_USERNAME = re.compile(r"[A-Za-z0-9_]{5,32}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    bot_token: SecretStr
    bot_username: str
    init_data_max_age_seconds: int = 86400
    debug: bool = False
    web_app_url: str | None = None

    @field_validator("bot_username")
    @classmethod
    def _check_bot_username(cls, value: str) -> str:
        """Имя бота идёт в ссылки t.me: снимаем ведущий «@» и падаем на старте при мусоре."""
        name = value.removeprefix("@")
        if not _BOT_USERNAME.fullmatch(name):
            raise ValueError("BOT_USERNAME: ожидается имя бота из 5–32 символов [A-Za-z0-9_]")
        return name

    @field_validator("web_app_url")
    @classmethod
    def _check_web_app_url(cls, value: str | None) -> str | None:
        """Адрес мини-приложения для кнопки меню: пусто → None, голый домен → https://."""
        if value is None:
            return None
        url = value.strip()
        if not url:
            return None
        if "://" not in url:
            url = f"https://{url}"
        if not url.startswith("https://"):
            raise ValueError("WEB_APP_URL: ожидается адрес с https://")
        return url.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
