from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr

from app.api.deps import CurrentUser, get_current_user
from app.core.rate_limit import limiter

router = APIRouter(tags=["auth"])


class UserResponse(BaseModel):
    id: str
    name: str | None
    email: EmailStr | None
    roles: list[str]
    created_at: datetime | None


@router.get("/me", response_model=UserResponse)
@limiter.limit("100/minute")  # type: ignore[untyped-decorator]
async def me(
    request: Request,  # noqa: ARG001 — required by slowapi to read client IP
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> UserResponse:
    """Return the current authenticated user derived from the Keycloak JWT."""
    created_at = datetime.fromtimestamp(user.iat, tz=UTC) if user.iat else None
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        roles=list(user.roles),
        created_at=created_at,
    )
