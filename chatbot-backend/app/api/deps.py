from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.services.keycloak import (
    TokenVerificationError,
    extract_roles,
    verify_token,
)
from app.services.local_auth import verify_local_token

bearer_scheme = HTTPBearer()


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: str  # 'sub' claim — UUID string (Keycloak user ID or local User.id)
    email: str | None
    name: str | None
    roles: tuple[str, ...]
    iat: int | None


def _user_from_keycloak_claims(claims: dict[str, Any]) -> CurrentUser:
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing 'sub' claim",
        )
    return CurrentUser(
        id=sub,
        email=claims.get("email"),
        name=claims.get("name") or claims.get("preferred_username"),
        roles=tuple(extract_roles(claims)),
        iat=claims.get("iat"),
    )


def _user_from_local_claims(claims: dict[str, Any]) -> CurrentUser:
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing 'sub' claim",
        )
    role = claims.get("role") or "user"
    return CurrentUser(
        id=sub,
        email=claims.get("email"),
        name=claims.get("name"),
        roles=(role,),
        iat=claims.get("iat"),
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> CurrentUser:
    """Validate the Bearer token and return the caller.

    Dispatches on `settings.AUTH_PROVIDER`:
      - `keycloak` (default): RS256 verify against Keycloak JWKS.
      - `sqlite`: HS256 verify against `AUTH_JWT_SECRET`.
    """
    token = credentials.credentials
    try:
        if settings.AUTH_PROVIDER == "sqlite":
            claims = verify_local_token(token)
            return _user_from_local_claims(claims)
        claims = await verify_token(token)
        return _user_from_keycloak_claims(claims)
    except TokenVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_role(*required: str) -> Callable[..., Awaitable[CurrentUser]]:
    """Dependency factory for role-gated endpoints."""
    required_set = frozenset(required)

    async def _checker(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if not required_set.intersection(user.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {sorted(required_set)}",
            )
        return user

    return _checker
