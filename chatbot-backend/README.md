# Tariq AI — Backend

FastAPI resource server for the Tariq AI chat platform. Validates JWTs
issued by a self-hosted **Keycloak 26** identity provider (also bundled
via `docker-compose.yml`). No local user store — Keycloak is the single
source of truth for identity.

Consumed by the Next.js frontend via `/api/auth/me` proxy. See the sibling
`frontend/` repo for the UI.

---

## What DevOps runs

### 1. Prerequisites

| Tool | Version |
|------|---------|
| Docker + Docker Compose v2 | latest |
| Python | 3.13 |
| [`uv`](https://docs.astral.sh/uv/getting-started/installation/) | 0.10+ |

### 2. First-time setup — two commands

```bash
# Inside backend/
cp .env.example .env                     # FastAPI runtime config
cp .env.docker.example .env.docker       # Keycloak compose config — edit passwords!
docker compose --env-file .env.docker up -d --wait
```

That's the entire Keycloak setup. Compose starts three services in order:

1. **`keycloak-db`** — Postgres 16, persistent volume.
2. **`keycloak`** — Keycloak 26, waits for DB to be healthy.
3. **`keycloak-bootstrap`** — one-shot service that creates the realm,
   client, roles, audience mapper, and (if `CREATE_DEV_USER=true`) a demo
   user, then exits `0`. Idempotent on re-runs.

Verify:

```bash
docker compose --env-file .env.docker logs keycloak-bootstrap
curl -s http://localhost:8080/realms/tariq/.well-known/openid-configuration | head
```

### 3. Start the FastAPI app

```bash
uv sync                                                # install deps
uv run uvicorn app.main:app --reload --port 8000       # dev
```

API: http://localhost:8000 · Docs: http://localhost:8000/api/v1/docs
(swap `/api/v1` for whatever `API_PREFIX` you set.)

### 4. Production

```bash
uv run gunicorn -c gunicorn.conf.py
```

Alembic migrations run automatically on startup against PostgreSQL. For
SQLite dev, tables are created by `Base.metadata.create_all`.

---

## Environment variables

### `backend/.env` — FastAPI runtime

| Key | Required | Default | Purpose |
|-----|----------|---------|---------|
| `API_PREFIX` | no | `/api/v1` | Router prefix for all endpoints + `/docs`, `/redoc`, `/openapi.json`. Must start with `/`, no trailing slash. Frontend's `FASTAPI_URL` must include the same suffix. |
| `DATABASE_URL` | no | `sqlite+aiosqlite:///./tariq.db` | Use `postgresql+asyncpg://…` in prod |
| `KEYCLOAK_ISSUER` | **yes** | — | e.g. `https://keycloak.example.com/realms/tariq` |
| `KEYCLOAK_AUDIENCE` | no | `tariq-api` | Must match compose `AUDIENCE` |
| `KEYCLOAK_JWKS_CACHE_TTL` | no | `3600` | Seconds between JWKS refetches |
| `KEYCLOAK_CLOCK_SKEW` | no | `10` | Token `exp` leeway in seconds |
| `CORS_ORIGINS` | no | `["http://localhost:3000"]` | JSON array; include real frontend origin in prod |

### `backend/.env.docker` — Keycloak compose + bootstrap

| Key | Required | Default | Purpose |
|-----|----------|---------|---------|
| `KC_DB_PASSWORD` | **yes** | — | Postgres password |
| `KC_ADMIN_USER` | **yes** | — | Keycloak master admin username |
| `KC_ADMIN_PASSWORD` | **yes** | — | Keycloak master admin password |
| `KC_DB_NAME` / `KC_DB_USER` | no | `keycloak` / `keycloak` | |
| `KC_HOSTNAME` | no | `localhost` | Real domain in prod, e.g. `keycloak.example.com` |
| `KC_HOSTNAME_STRICT` | no | `false` | `true` in prod |
| `APP_ORIGIN` | no | `http://localhost:3000` | Frontend public URL (→ redirect URIs + web origins) |
| `REALM_NAME` | no | `tariq` | |
| `CLIENT_ID` | no | `tariq-web` | OIDC client ID |
| `AUDIENCE` | no | `tariq-api` | JWT `aud` claim |
| `CREATE_DEV_USER` | no | `false` | `true` auto-creates a demo user. **Must be `false` in prod.** |
| `DEV_USER_EMAIL` / `DEV_USER_PASSWORD` / `DEV_USER_ROLE` | no | `demo@example.com` / `ChangeMe123!` / `user` | Only used when `CREATE_DEV_USER=true` |

**Cross-file invariants DevOps must hold:**

- `KEYCLOAK_ISSUER` in `backend/.env` and `frontend/.env.local` are identical.
- `backend/.env` `KEYCLOAK_AUDIENCE` = compose `AUDIENCE`.
- `frontend/.env.local` `KEYCLOAK_CLIENT_ID` = compose `CLIENT_ID`.
- `frontend/.env.local` `NEXT_PUBLIC_APP_ORIGIN` = compose `APP_ORIGIN`.

---

## Endpoints

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET`  | `${API_PREFIX}/auth/me` | Bearer (Keycloak JWT) | `{id, name, email, roles, created_at}` |

Default prefix is `/api/v1`, so out-of-the-box the route is `/api/v1/auth/me`.

Status codes: `200` success · `401` invalid/expired token · `403` insufficient role.

---

## Day-2 operations

```bash
docker compose --env-file .env.docker down              # stop
docker compose --env-file .env.docker down -v           # stop + wipe Keycloak DB
docker compose --env-file .env.docker logs -f keycloak  # tail logs
docker compose --env-file .env.docker up -d keycloak-bootstrap  # re-run bootstrap
```

---

## More details

- **Keycloak architecture + production hardening:** see `../keycloak.md`.
- **Frontend:** see sibling `frontend/` repo.
- **Codebase conventions:** see `CLAUDE.md`.
