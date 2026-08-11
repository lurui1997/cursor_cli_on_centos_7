"""Application settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_vision_model: str = "gpt-4o"
    openai_text_model: str = "gpt-4o-mini"
    default_mode: str = "auto"  # auto | openai | demo
    max_image_bytes: int = 8 * 1024 * 1024
    host: str = "0.0.0.0"
    port: int = 8765


@lru_cache
def get_settings() -> Settings:
    return Settings()
