from functools import lru_cache
from typing import Self

from pydantic import HttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    bot_token: SecretStr
    bot_username: str
    telegram_relay_url: HttpUrl | None = None
    telegram_relay_secret: SecretStr = SecretStr("")
    init_data_max_age_seconds: int = 86400
    debug: bool = False

    @field_validator("telegram_relay_url", mode="before")
    @classmethod
    def empty_relay_url(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def validate_relay(self) -> Self:
        url = self.telegram_relay_url
        if bool(url) != bool(self.telegram_relay_secret.get_secret_value()):
            raise ValueError("TELEGRAM_RELAY_URL и TELEGRAM_RELAY_SECRET задаются вместе")
        if url and (
            url.scheme != "https"
            or url.username
            or url.password
            or url.query
            or url.fragment
            or url.path not in (None, "/")
        ):
            raise ValueError("TELEGRAM_RELAY_URL должен быть HTTPS-адресом без пути и параметров")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
