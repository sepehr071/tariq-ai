from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Production guard — sqlite is fine for dev/tests but will silently lose data,
# corrupt under concurrency, and ignore Alembic migrations in real deployments.
if settings.ENV == "production" and settings.DATABASE_URL.startswith("sqlite"):
    raise RuntimeError("SQLite is not allowed in production")


def _engine_kwargs() -> dict[str, Any]:
    """Pool tuning — skipped for sqlite which uses NullPool by default."""
    if "sqlite" in settings.DATABASE_URL:
        return {}
    return {
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_pre_ping": True,
    }


engine = create_async_engine(settings.DATABASE_URL, echo=False, **_engine_kwargs())
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables for SQLite dev runs.

    Used in place of Alembic when `DATABASE_URL` is sqlite — needed by the
    optional `AUTH_PROVIDER=sqlite` flow so the `users` table exists without
    operators having to wire up migrations for a dev database.
    """
    # Trigger model imports so every table registers on Base.metadata.
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
