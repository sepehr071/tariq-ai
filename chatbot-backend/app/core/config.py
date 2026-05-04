from typing import Literal, Self

from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite+aiosqlite:///./tariq.db"
    # Connection pool size for SQLAlchemy (Postgres only — sqlite uses NullPool).
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    # Deployment environment: "development" | "production". Toggles prod-only guards
    # (sqlite refusal in db.py, redacted validation errors in main.py).
    ENV: str = "development"

    # Keycloak — all required
    KEYCLOAK_ISSUER: AnyHttpUrl
    KEYCLOAK_AUDIENCE: str = "tariq-api"
    KEYCLOAK_JWKS_CACHE_TTL: int = 600  # seconds (lowered from 3600 for faster rotation pickup)
    KEYCLOAK_CLOCK_SKEW: int = 10  # seconds of leeway on exp/nbf
    # Grace window during JWKS rotation: keep last-known-good keyset for this long
    # after a refresh so in-flight tokens signed by the previous key still verify.
    KEYCLOAK_JWKS_GRACE_SECONDS: int = 300

    # ---- Optional sqlite auth provider ----
    # `keycloak` (default) keeps the original Keycloak resource-server flow.
    # `sqlite` enables a local email+password store with HS256 JWTs issued by
    # this backend — sibling to Keycloak, NOT a replacement.
    AUTH_PROVIDER: Literal["keycloak", "sqlite"] = "keycloak"
    # HS256 signing secret. REQUIRED when AUTH_PROVIDER=sqlite. Min 32 chars.
    AUTH_JWT_SECRET: str = ""
    # `iss` claim baked into locally-issued JWTs.
    AUTH_JWT_ISSUER: str = "tariq-backend"
    # `aud` claim. Default matches KEYCLOAK_AUDIENCE so frontend verify can
    # share its audience check between providers.
    AUTH_JWT_AUDIENCE: str = "tariq-api"
    # Token lifetime in seconds (1 hour default). No refresh-token endpoint.
    AUTH_JWT_TTL_SECONDS: int = 3600
    # When false, /auth/register returns 403 — login still works for seeded users.
    AUTH_ALLOW_REGISTRATION: bool = True

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Router prefix for all API endpoints (incl. /docs, /redoc, /openapi.json).
    # Default matches the frontend's FASTAPI_URL default. Override per deployment
    # to serve the API under a different subpath (e.g. "/tariqrag").
    API_PREFIX: str = "/api/v1"

    @field_validator("KEYCLOAK_ISSUER")
    @classmethod
    def issuer_no_trailing_slash(cls, v: AnyHttpUrl) -> AnyHttpUrl:
        # Keycloak's 'iss' claim never has a trailing slash — normalize for exact comparison.
        url = str(v).rstrip("/")
        return AnyHttpUrl(url)

    @field_validator("API_PREFIX")
    @classmethod
    def api_prefix_normalized(cls, v: str) -> str:
        v = v.rstrip("/")
        if not v or not v.startswith("/"):
            raise ValueError("API_PREFIX must start with '/' and not be empty (e.g. '/api/v1').")
        return v

    @model_validator(mode="after")
    def _validate_local_auth_secret(self) -> Self:
        # Fail-fast at startup if the sqlite provider is on but the secret is
        # missing or too weak — this is a runtime auth failure waiting to happen.
        if self.AUTH_PROVIDER == "sqlite":
            if not self.AUTH_JWT_SECRET:
                raise ValueError(
                    "AUTH_JWT_SECRET must be set when AUTH_PROVIDER=sqlite "
                    "(min 32 chars; generate with `openssl rand -hex 32`)."
                )
            if len(self.AUTH_JWT_SECRET) < 32:
                raise ValueError(
                    "AUTH_JWT_SECRET must be at least 32 characters when AUTH_PROVIDER=sqlite."
                )
        return self


settings = Settings()
