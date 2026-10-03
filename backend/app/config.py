from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    bot_token: SecretStr
    bot_username: str
    init_data_max_age_seconds: int = 86400
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
