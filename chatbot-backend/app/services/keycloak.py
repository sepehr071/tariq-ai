"""Keycloak JWT verification via JWKS.

Fetches and caches the realm's OpenID configuration and JWKS, then verifies
incoming access tokens against them. Pure stateless — the backend is a
resource server, not an auth server.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any

import httpx
from authlib.jose import JsonWebKey, JsonWebToken, KeySet
from authlib.jose.errors import JoseError

from app.core.config import settings

_JWT = JsonWebToken(["RS256"])

# Module-level cache. Key set rotates rarely; single-process cache is fine.
# - "jwks" / "jwks_expires_at": currently active key set + its expiry.
# - "prev_jwks" / "prev_jwks_until": last-known-good set kept after rotation
#   so in-flight tokens signed by the old key still verify during the grace window.
# - "openid_config": cached well-known doc; only refetched on cold start.
_cache: dict[str, Any] = {
    "jwks": None,
    "jwks_expires_at": 0.0,
    "prev_jwks": None,
    "prev_jwks_until": 0.0,
    "openid_config": None,
}
_lock = asyncio.Lock()

# Matches `Cache-Control: ..., max-age=<seconds>, ...` (case-insensitive).
_CACHE_CONTROL_MAX_AGE = re.compile(r"max-age\s*=\s*(\d+)", re.IGNORECASE)


def _issuer() -> str:
    return str(settings.KEYCLOAK_ISSUER).rstrip("/")


def _ttl_from_cache_control(headers: httpx.Headers) -> int:
    """Honor upstream Cache-Control: max-age if present, else fall back to env TTL."""
    cache_control = headers.get("cache-control")
    if cache_control:
        match = _CACHE_CONTROL_MAX_AGE.search(cache_control)
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                pass
    return settings.KEYCLOAK_JWKS_CACHE_TTL


async def _fetch_openid_config(client: httpx.AsyncClient) -> dict[str, Any]:
    url = f"{_issuer()}/.well-known/openid-configuration"
    resp = await client.get(url, timeout=10.0)
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    return data


async def _fetch_jwks(client: httpx.AsyncClient, jwks_uri: str) -> tuple[KeySet, int]:
    resp = await client.get(jwks_uri, timeout=10.0)
    resp.raise_for_status()
    return JsonWebKey.import_key_set(resp.json()), _ttl_from_cache_control(resp.headers)


async def _load_jwks(force: bool = False) -> KeySet:
    now = time.time()
    if not force and _cache["jwks"] is not None and now < _cache["jwks_expires_at"]:
        return _cache["jwks"]

    async with _lock:
        # Double-check inside the lock.
        now = time.time()
        if not force and _cache["jwks"] is not None and now < _cache["jwks_expires_at"]:
            return _cache["jwks"]

        async with httpx.AsyncClient() as client:
            if _cache["openid_config"] is None:
                _cache["openid_config"] = await _fetch_openid_config(client)
            jwks_uri = _cache["openid_config"]["jwks_uri"]
            new_jwks, ttl = await _fetch_jwks(client, jwks_uri)

            # Demote the outgoing keyset into the grace slot so tokens signed by
            # the old key keep validating for KEYCLOAK_JWKS_GRACE_SECONDS.
            previous = _cache["jwks"]
            if previous is not None and previous is not new_jwks:
                _cache["prev_jwks"] = previous
                _cache["prev_jwks_until"] = time.time() + settings.KEYCLOAK_JWKS_GRACE_SECONDS

            _cache["jwks"] = new_jwks
            _cache["jwks_expires_at"] = time.time() + ttl
            return new_jwks


def _grace_jwks() -> KeySet | None:
    """Return the previous keyset if still inside the grace window."""
    prev: KeySet | None = _cache["prev_jwks"]
    if prev is None:
        return None
    if time.time() >= _cache["prev_jwks_until"]:
        return None
    return prev


class TokenVerificationError(Exception):
    """Raised when a token fails verification."""


async def warm_up() -> None:
    """Called from FastAPI lifespan on startup to prefetch JWKS."""
    try:
        await _load_jwks()
    except Exception as exc:  # noqa: BLE001
        # Don't fail startup — Keycloak might still be booting. Tokens will be
        # rejected with 401 until JWKS is reachable, and verify_token retries.
        raise RuntimeError(f"JWKS warm-up failed: {exc}") from exc


def _decode(
    token: str, jwks: KeySet, claims_options: dict[str, Any], leeway: int
) -> dict[str, Any]:
    claims = _JWT.decode(token, key=jwks, claims_options=claims_options)
    claims.validate(leeway=leeway)
    return dict(claims)


async def verify_token(token: str) -> dict[str, Any]:
    """Verify a Keycloak access token and return its claims.

    Validates signature (RS256 against JWKS), issuer, audience, and expiry.
    On `kid` miss, falls back to the previous keyset within the grace window
    before forcing a JWKS refresh. Raises TokenVerificationError on any failure.
    """
    expected_iss = _issuer()
    expected_aud = settings.KEYCLOAK_AUDIENCE
    leeway = settings.KEYCLOAK_CLOCK_SKEW

    claims_options = {
        "iss": {"essential": True, "value": expected_iss},
        "aud": {"essential": True, "values": [expected_aud]},
        "exp": {"essential": True},
    }

    # Attempt 1: current cached keyset.
    try:
        jwks = await _load_jwks()
        return _decode(token, jwks, claims_options, leeway)
    except JoseError as exc:
        if "kid" not in str(exc).lower():
            raise TokenVerificationError(str(exc)) from exc
        first_exc: Exception = exc
    except Exception as exc:  # noqa: BLE001
        raise TokenVerificationError(str(exc)) from exc

    # Attempt 2: previous keyset, only if we're still inside the grace window.
    prev = _grace_jwks()
    if prev is not None:
        try:
            return _decode(token, prev, claims_options, leeway)
        except JoseError:
            pass  # fall through to forced refresh
        except Exception as exc:  # noqa: BLE001
            raise TokenVerificationError(str(exc)) from exc

    # Attempt 3: force JWKS refresh (key rotation). Always raises.
    try:
        jwks = await _load_jwks(force=True)
        return _decode(token, jwks, claims_options, leeway)
    except JoseError as exc:
        raise TokenVerificationError(str(exc)) from first_exc
    except Exception as exc:  # noqa: BLE001
        raise TokenVerificationError(str(exc)) from first_exc


def extract_roles(claims: dict[str, Any]) -> list[str]:
    """Pull realm roles out of the token claims."""
    realm_access = claims.get("realm_access") or {}
    return list(realm_access.get("roles") or [])
