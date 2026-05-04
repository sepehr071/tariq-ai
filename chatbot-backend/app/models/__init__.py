"""SQLAlchemy models package.

Importing this package side-effect-loads every model so they register on
`Base.metadata`. Required for both Alembic autogenerate and the SQLite-dev
`Base.metadata.create_all` path.
"""

from app.models.user import User

__all__ = ["User"]
