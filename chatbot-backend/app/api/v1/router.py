"""Top-level v1 API router.

Every v1 sub-router mounts under `settings.API_PREFIX` (default `/api/v1`).
Leaf routers keep their own tags and relative path prefixes; this module is
the only place that knows about the top-level prefix.
"""

from fastapi import APIRouter

from app.api.v1 import auth, local_auth
from app.core.config import settings

api_router = APIRouter(prefix=settings.API_PREFIX)
api_router.include_router(auth.router, prefix="/auth")

# Local sqlite-auth register/login routes — mounted only when toggled on.
if settings.AUTH_PROVIDER == "sqlite":
    api_router.include_router(local_auth.router, prefix="/auth")
