"""Service settings loaded from the environment (prefix ``ITZA_``)."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["development", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ITZA_", env_file=".env", extra="ignore")

    environment: Environment = "development"
    log_level: LogLevel = "INFO"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5180"]
    )

    data_dir: Path = Path("data")
    # Read-only mount of the team dataset store (SMAP and IMERG clips); unset means live data only.
    dataset_store_dir: Path | None = None
    prithvi_dir: Path = Path("models/prithvi")
    ml_model_dir: Path = Path("models/stress-v1")
    earthdata_token: SecretStr | None = Field(
        default=None, validation_alias="EARTHDATA_TOKEN", repr=False, exclude=True
    )
    earthdata_username: SecretStr | None = Field(
        default=None, validation_alias="EARTHDATA_USERNAME", repr=False, exclude=True
    )
    earthdata_password: SecretStr | None = Field(
        default=None, validation_alias="EARTHDATA_PASSWORD", repr=False, exclude=True
    )
    power_base_url: str = "https://power.larc.nasa.gov"
    context_wait_s: float = Field(default=20.0, gt=0, le=25)
    upstream_timeout_s: float = Field(default=30.0, gt=0)
    upstream_retries: int = Field(default=3, ge=0, le=10)
    upstream_backoff_s: float = Field(default=0.5, ge=0)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def docs_enabled(self) -> bool:
        return self.environment != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
