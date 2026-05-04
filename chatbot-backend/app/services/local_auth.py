"""Local email+password auth for the optional `AUTH_PROVIDER=sqlite` flow.

Sibling to `app.services.keycloak`, NOT a replacement. Provides bcrypt password
hashing plus HS256 JWT issuance/verification using `authlib.jose` (matching the
Keycloak verify path's library so error handling stays uniform).
"""

from __future__ import annotations

import time
from typing import Any

import bcrypt
from authlib.jose import JsonWebToken
from authlib.jose.errors import JoseError

from app.core.config import settings
from app.models.user import User
from app.services.keycloak import TokenVerificationError

_JWT = JsonWebToken(["HS256"])
_BCRYPT_COST = 12


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (cost 12) of the given password."""
    hashed: bytes = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(_BCRYPT_COST))
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verification. False on any decoding error."""
    try:
        ok: bool = bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed hash — treat as a failed check rather than crashing the request.
        return False
    return ok


def issue_token(user: User) -> str:
    """Issue an HS256 JWT for the given user. Lifetime = AUTH_JWT_TTL_SECONDS."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "iss": settings.AUTH_JWT_ISSUER,
        "aud": settings.AUTH_JWT_AUDIENCE,
        "iat": now,
        "exp": now + settings.AUTH_JWT_TTL_SECONDS,
    }
    header = {"alg": "HS256", "typ": "JWT"}
    token = _JWT.encode(header, payload, settings.AUTH_JWT_SECRET)
    return token.decode("utf-8") if isinstance(token, bytes) else str(token)


def verify_local_token(token: str) -> dict[str, Any]:
    """Verify an HS256 JWT issued by `issue_token`.

    Validates signature, `iss`, `aud`, and `exp`. Raises `TokenVerificationError`
    (reused from `services.keycloak`) on any failure so the existing 401 path in
    `app.api.deps.get_current_user` can catch a single exception type.
    """
    claims_options = {
        "iss": {"essential": True, "value": settings.AUTH_JWT_ISSUER},
        "aud": {"essential": True, "values": [settings.AUTH_JWT_AUDIENCE]},
        "exp": {"essential": True},
    }
    try:
        claims = _JWT.decode(token, key=settings.AUTH_JWT_SECRET, claims_options=claims_options)
        claims.validate(leeway=0)
    except JoseError as exc:
        raise TokenVerificationError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise TokenVerificationError(str(exc)) from exc
    return dict(claims)
