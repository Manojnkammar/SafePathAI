from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_prefix: str = "/api/v1"
    database_url: str = "sqlite+aiosqlite:///./safepath.db"
    cors_origins: str = "*"  # comma-separated list, or "*"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    validation_threshold: float = 0.6
    detection_confidence_threshold: float = 0.5
    auto_dispatch_confidence: float = 0.8

    # W(e) = alpha * t(e) + beta * h(e) + gamma * c(e)
    route_alpha: float = 1.0
    route_beta: float = 1.0
    route_gamma: float = 1.0

    hazard_ttl_hours: int = 6

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()