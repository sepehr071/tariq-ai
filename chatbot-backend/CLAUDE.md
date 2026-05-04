# Tariq AI — Auth Backend

FastAPI resource server for the Tariq AI chat platform. Validates Keycloak-issued JWTs via JWKS. No local user store — Keycloak is the sole identity provider. Consumed by the Next.js frontend via `/api/auth/me` proxy.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | FastAPI (async) |
| ORM | SQLAlchemy (async) + Alembic migrations |
| Database | PostgreSQL (production) / SQLite (dev, via aiosqlite) |
| Auth | Keycloak JWKS (RS256) via authlib + httpx |
| Config | pydantic-settings |
| Package manager | uv |
| Python | 3.13 |
| Identity provider | Keycloak 26 (self-hosted via docker-compose.yml) |

## Commands

```bash
# From backend/
uv sync                                             # Install runtime deps
uv sync --group dev                                 # Install dev deps (ruff, mypy)
uv run uvicorn app.main:app --reload --port 8000    # Start API — http://localhost:8000
uv run alembic upgrade head                         # Run DB migrations (PostgreSQL only)
uv run alembic revision --autogenerate -m "msg"     # Create new migration

# Quality gates
uv run ruff check .                                 # Lint
uv run ruff format .                                # Format
uv run mypy app                                     # Type check
pre-commit install                                  # One-time: install git hooks
pre-commit run --all-files                          # Run all hooks manually

# Keycloak (see keycloak.md for full setup)
docker compose --env-file .env.docker up -d --wait  # Start Keycloak + Postgres + bootstrap
docker compose --env-file .env.docker down           # Stop
docker compose --env-file .env.docker down -v        # Stop + wipe Keycloak DB
```

## Project Structure

```
backend/
├── pyproject.toml                  # uv project: runtime deps + [dependency-groups] dev + [tool.ruff] + [tool.mypy]
├── uv.lock
├── alembic.ini                     # Alembic config (PostgreSQL migrations)
├── alembic/
│   ├── env.py                      # Imports app.core.config + app.core.db
│   └── versions/                   # Migration files (includes drop of old users/refresh_tokens tables)
├── app.py                          # Entry point shim (imports app.main:app)
├── gunicorn.conf.py                # Production gunicorn config
├── docker-compose.yml              # Keycloak 26 + Postgres 16 + one-shot bootstrap (dev + prod)
├── .env, .env.example              # FastAPI runtime config
├── .env.docker, .env.docker.example # Compose + bootstrap config
├── .pre-commit-config.yaml         # ruff + mypy + standard hygiene hooks
├── keycloak/
│   └── bootstrap.sh                # kcadm.sh: creates realm, client, roles, audience mapper, optional dev user
└── app/
    ├── main.py                     # FastAPI app: CORS, lifespan (JWKS warm-up), request-ID middleware, global exception handlers
    ├── core/
    │   ├── config.py               # pydantic-settings: DATABASE_URL, KEYCLOAK_*, CORS_ORIGINS, API_PREFIX
    │   ├── db.py                   # Async SQLAlchemy engine + session
    │   └── logging.py              # JSON log formatter + request_id ContextVar + configure_logging()
    ├── api/
    │   ├── deps.py                 # get_current_user (from Keycloak JWT), require_role("admin") factory
    │   └── v1/
    │       ├── router.py           # Top-level APIRouter(prefix=settings.API_PREFIX), default "/api/v1"; aggregates sub-routers
    │       └── auth.py             # GET /me (mounted at {API_PREFIX}/auth via router prefix)
    ├── services/
    │   └── keycloak.py             # JWKS fetch + cache, verify_token(), extract_roles(), warm_up()
    └── models/                     # SQLAlchemy models (users/refresh_tokens removed — Keycloak is user store)
```

## Architecture Decisions

### Authentication (Keycloak)

- **Keycloak 26** runs in Docker (`docker-compose.yml`) with its own Postgres — not the app DB
- **Realm:** `tariq`. **Client:** `tariq-web` (public, PKCE S256). **Roles:** `admin`, `user` (default)
- **OIDC flow** runs entirely in the frontend (Next.js route handlers) — backend never touches passwords or sessions
- Backend is a **pure resource server**: fetches Keycloak JWKS at startup, validates every `Authorization: Bearer` token against it (RS256, `iss`, `aud`, `exp`)
- `get_current_user` dependency returns `CurrentUser(id, email, name, roles)` from JWT claims
- `require_role("admin")` dependency factory for role-gated endpoints — reads `realm_access.roles` from token
- JWKS cached in-memory with configurable TTL (`KEYCLOAK_JWKS_CACHE_TTL`); auto-refreshes on `kid` miss
- `warm_up()` called in FastAPI lifespan — logs warning if Keycloak unreachable (doesn't block startup)
- Audience mapper on the client ensures tokens carry `aud: tariq-api` for backend validation
- **No local user table** — `users` and `refresh_tokens` tables dropped via Alembic migration

### API Structure

- All business endpoints live under `settings.API_PREFIX` (default `/api/v1`). Prefix applied once in `app/api/v1/router.py` via `APIRouter(prefix=settings.API_PREFIX)`; leaf routers (e.g. `auth.py`) set their own tag + sub-prefix. The Python module path `app/api/v1/` is internal organization and stays regardless of the URL prefix. FastAPI's `/docs`, `/redoc`, and `/openapi.json` are also mounted under `API_PREFIX` so a reverse proxy can route the whole subpath uniformly
- `app/core/` holds cross-cutting concerns (config, db, logging) — never imports from `app/api/`
- `app/api/deps.py` holds FastAPI dependencies (`get_current_user`, `require_role`, `get_db`) — imported by route modules
- `app/services/` holds business logic and external integrations (Keycloak JWKS); routes stay thin

### Error Handling & Observability

- Global exception handlers in `main.py` for `RequestValidationError`, `HTTPException`, and catch-all `Exception`
- All error responses use shape `{"detail": "...", "code": "...", "request_id": "..."}` — stack traces never leak to clients
- Request-ID middleware sets `X-Request-ID` response header (reuses inbound header if present, else generates UUID4)
- `app/core/logging.py` provides a stdlib JSON formatter + `request_id_ctx` ContextVar — every log line carries the request ID automatically

### Database

- Async SQLAlchemy with `async_sessionmaker` and `get_db()` generator for dependency injection (in `app.api.deps`)
- SQLite for dev (`sqlite+aiosqlite:///./tariq.db`)
- PostgreSQL for production — managed by Alembic migrations

### Frontend Integration

- Frontend runs OIDC authorization code flow with PKCE against Keycloak
- Frontend stores `tariq-access-token` (5 min) and `tariq-refresh-token` (30 min) as httpOnly cookies
- Frontend `/api/auth/me` proxy forwards to this backend's `${API_PREFIX}/auth/me` (default `/api/v1/auth/me`) with the access token as Bearer header. The prefix is baked into the frontend's `FASTAPI_URL` env var, so the proxy code doesn't know about the prefix
- Frontend handles token refresh and revocation directly against Keycloak's token endpoint
- CORS configured for frontend origin via `CORS_ORIGINS` env var

## Endpoints

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `${API_PREFIX}/auth/me` | Bearer (Keycloak JWT) | `{id, name, email, roles, created_at}` |

Default `API_PREFIX=/api/v1`, so out-of-the-box the route is `/api/v1/auth/me`.

HTTP status codes: 200 (success), 401 (invalid/expired token), 403 (insufficient role).

All non-2xx responses share the shape: `{"detail": str, "code": str, "request_id": str}`. Every response (success or error) carries an `X-Request-ID` header.

## Environment Variables

`.env`:
```
API_PREFIX=/api/v1
DATABASE_URL=sqlite+aiosqlite:///./tariq.db
KEYCLOAK_ISSUER=http://localhost:8080/realms/tariq
KEYCLOAK_AUDIENCE=tariq-api
KEYCLOAK_JWKS_CACHE_TTL=3600
KEYCLOAK_CLOCK_SKEW=10
CORS_ORIGINS=["http://localhost:3000"]
```

`.env.docker` (gitignored — used only by docker-compose):
```
KC_DB_NAME=keycloak
KC_DB_USER=keycloak
KC_DB_PASSWORD=<strong-password>
KC_ADMIN_USER=admin
KC_ADMIN_PASSWORD=<strong-password>
```

## Conventions

- `snake_case` everywhere
- Type hints on all function signatures (`mypy --strict` enforces this)
- Async throughout (SQLAlchemy async engine, httpx for JWKS)
- Layering: `app/core/*` (no upward imports) ← `app/services/*` ← `app/api/deps.py` ← `app/api/v1/*.py`
- New endpoints go under `app/api/v1/` and register with `app/api/v1/router.py`. Bump the Python module to `app/api/v2/` (and create a new router mounted at an additional prefix) only if you need to run multiple versions side-by-side for breaking client changes — the `API_PREFIX` env var is for deployment routing, not versioning
- Services in `app/services/` hold business logic; routes in `app/api/v1/` stay thin
- Alembic for PostgreSQL migrations; `Base.metadata.create_all` for SQLite dev
- Never commit `.env` or `.env.docker` — use `.env.example` / `.env.docker.example` as templates
- `keycloak/bootstrap.sh` is idempotent — safe to re-run after changes
- Lint + types are enforced via `.pre-commit-config.yaml` (ruff + mypy) — install with `pre-commit install`
