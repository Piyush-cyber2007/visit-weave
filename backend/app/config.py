from functools import lru_cache
from pathlib import Path
import secrets

from pydantic import PrivateAttr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: str = "development"
    database_url: str | None = None
    jwt_secret_key: str | None = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    otp_expire_minutes: int = 5
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60
    otp_max_requests_per_hour: int = 5
    sms_provider: str | None = None
    sms_api_key: str | None = None
    sms_provider_url: str | None = None
    sms_sender: str | None = None
    auth_internal_secret: str | None = None
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    doctor_provisioning_key: str | None = None

    _ephemeral_secret: str = PrivateAttr(default_factory=lambda: secrets.token_urlsafe(48))

    @property
    def token_secret(self) -> str:
        return self.jwt_secret_key or self._ephemeral_secret

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            value = self.database_url
            if value.startswith("postgres://"):
                value = value.replace("postgres://", "postgresql+psycopg://", 1)
            elif value.startswith("postgresql://"):
                value = value.replace("postgresql://", "postgresql+psycopg://", 1)
            if value.startswith("sqlite:///"):
                value = value.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
            return value

        if self.environment.lower() not in {"development", "test"}:
            raise RuntimeError("DATABASE_URL is required outside development and test environments.")

        sqlite_path = REPOSITORY_ROOT / "backend" / "data" / "auth-dev.db"
        return str(URL.create("sqlite+aiosqlite", database=str(sqlite_path)))

    @property
    def allowed_frontend_origins(self) -> set[str]:
        return {origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()}

    def validate_runtime(self) -> None:
        if self.environment.lower() == "production":
            if not self.jwt_secret_key or len(self.jwt_secret_key) < 32:
                raise RuntimeError("JWT_SECRET_KEY must contain at least 32 characters in production.")
            if not self.database_url or not self.database_url.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
                raise RuntimeError("A PostgreSQL DATABASE_URL is required in production.")
            if not self.auth_internal_secret or len(self.auth_internal_secret) < 32:
                raise RuntimeError("AUTH_INTERNAL_SECRET must contain at least 32 characters in production.")
        if self.access_token_expire_minutes < 1 or self.refresh_token_expire_days < 1:
            raise RuntimeError("Token lifetimes must be positive.")
        if self.otp_expire_minutes < 1 or self.otp_max_attempts < 1:
            raise RuntimeError("OTP expiration and attempt limits must be positive.")


@lru_cache
def get_settings() -> Settings:
    return Settings()
