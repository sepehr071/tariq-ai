"""Local email+password auth routes — mounted only when AUTH_PROVIDER=sqlite.

Issues HS256 JWTs in JSON bodies (the frontend route handler is responsible
for setting the cookie). Generic 401 on login failure to avoid email enumeration.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.services.local_auth import hash_password, issue_token, verify_password

router = APIRouter(tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    name: str | None = Field(default=None, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")  # type: ignore[untyped-decorator]
async def register(
    request: Request,  # noqa: ARG001 — required by slowapi to read client IP
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Create a new local account and return a fresh access token."""
    if not settings.AUTH_ALLOW_REGISTRATION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled",
        )

    email = payload.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role="user",
    )
    db.add(user)
    await db.flush()  # populate defaults so issue_token sees the final state

    token = issue_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.AUTH_JWT_TTL_SECONDS,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/minute")  # type: ignore[untyped-decorator]
async def login(
    request: Request,  # noqa: ARG001 — required by slowapi to read client IP
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Verify credentials and return a fresh access token.

    Returns a generic 401 on missing user OR bad password — never leaks whether
    the email exists.
    """
    email = payload.email.lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = issue_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.AUTH_JWT_TTL_SECONDS,
    )
