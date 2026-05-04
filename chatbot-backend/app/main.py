import logging
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from alembic.config import Config
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from alembic import command
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import engine, init_db
from app.core.logging import configure_logging, request_id_ctx
from app.core.rate_limit import limiter
from app.services.keycloak import warm_up as keycloak_warm_up

configure_logging()
logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
MAX_REQUEST_BYTES = 1_048_576  # 1 MiB — JSON-only API; nothing legitimate exceeds this.


def _run_migrations() -> None:
    """Run Alembic migrations (PostgreSQL only; SQLite dev uses in-process sync)."""
    if "sqlite" in settings.DATABASE_URL:
        return
    try:
        cfg = Config("alembic.ini")
        command.upgrade(cfg, "head")
        logger.info("Database migrations applied successfully")
    except Exception:
        logger.exception("Failed to run migrations")
        raise


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    _run_migrations()
    # SQLite dev path: create tables in-process (Alembic is Postgres-only).
    # Required so the optional `users` table exists when AUTH_PROVIDER=sqlite.
    if "sqlite" in settings.DATABASE_URL:
        await init_db()
    # Skip Keycloak JWKS warm-up entirely when running with the local provider —
    # it would log scary warnings against an unreachable Keycloak that the
    # sqlite mode doesn't depend on.
    if settings.AUTH_PROVIDER == "keycloak":
        try:
            await keycloak_warm_up()
        except Exception:
            logger.warning(
                "Keycloak JWKS warm-up failed — tokens will be rejected until it recovers",
                exc_info=True,
            )
    yield
    await engine.dispose()


app = FastAPI(
    title="Tariq API",
    lifespan=lifespan,
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign every request a UUID4, surfacing it via contextvar + response header.

    If the client sends X-Request-ID we honour it so callers can correlate
    their own logs; otherwise a fresh UUID is minted.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER)
        request_id = incoming or str(uuid.uuid4())
        token = request_id_ctx.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests larger than MAX_REQUEST_BYTES based on Content-Length.

    Content-Length is the cheap, universal check. Requests without it (chunked
    transfer) bypass this guard but are uncommon for our JSON clients; if needed
    a per-stream cap can be added later.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                size = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={
                        "detail": "Invalid Content-Length header",
                        "code": "bad_request",
                        "request_id": request_id_ctx.get(),
                    },
                )
            if size > MAX_REQUEST_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={
                        "detail": "Request body too large",
                        "code": "payload_too_large",
                        "request_id": request_id_ctx.get(),
                    },
                )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Set defensive headers on every response.

    HSTS only goes on responses to HTTPS requests (or via a trusted proxy that
    set X-Forwarded-Proto: https) — sending it over HTTP is ignored by browsers
    and clutters the response.

    No CSP — this backend serves JSON only; the frontend owns its own CSP.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
        is_https = request.url.scheme == "https" or forwarded_proto == "https"
        if is_https:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=()",
        )
        return response


# Order matters: outermost middleware is added LAST in Starlette. We want
# RequestIdMiddleware to run first (innermost surface for downstream code is
# the contextvar), then body-size guard before any handler reads the body,
# then security headers wrapping every response. CORS stays outermost so
# preflight responses also get headers stamped.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(RequestIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def _error_response(status_code: int, detail: str, code: str) -> JSONResponse:
    body = {
        "detail": detail,
        "code": code,
        "request_id": request_id_ctx.get(),
    }
    return JSONResponse(status_code=status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    # In production, drop the field-path list — it's a recon aid for attackers.
    if settings.ENV == "production":
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": "Invalid request",
                "code": "validation_error",
                "request_id": request_id_ctx.get(),
            },
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "code": "validation_error",
            "request_id": request_id_ctx.get(),
            "errors": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    # Map common status codes to stable string codes; fall back to the numeric one.
    code_map = {
        status.HTTP_400_BAD_REQUEST: "bad_request",
        status.HTTP_401_UNAUTHORIZED: "unauthorized",
        status.HTTP_403_FORBIDDEN: "forbidden",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_409_CONFLICT: "conflict",
        status.HTTP_429_TOO_MANY_REQUESTS: "rate_limited",
    }
    code = code_map.get(exc.status_code, f"http_{exc.status_code}")
    response = JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "code": code,
            "request_id": request_id_ctx.get(),
        },
    )
    if exc.headers:
        for header, value in exc.headers.items():
            response.headers[header] = value
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    # Log the full traceback server-side but never leak it to the client.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return _error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Internal server error",
        code="internal_error",
    )


app.include_router(api_router)
