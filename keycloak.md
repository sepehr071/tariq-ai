# Keycloak Auth — Tariq

Self-hosted Keycloak is the identity provider for Tariq. FastAPI and Next.js both treat it as the source of truth for users and tokens.

## How it works

```
Browser ─► Next.js (3000) ─► /api/auth/login ─► Keycloak (8080) login page
                                                        │
                                                        ▼
Next.js /api/auth/callback ◄── code ─── Keycloak (user signs in)
        │ exchanges code for access + refresh tokens (PKCE)
        │ stores them in httpOnly cookies (tariq-access-token, tariq-refresh-token)
        ▼
Next.js /api/auth/me proxy ─► FastAPI /api/v1/auth/me (8000)
                                              │ validates JWT via Keycloak JWKS
                                              ▼
                                          returns user data
```

- **Flow:** OIDC Authorization Code + PKCE. Next.js never touches passwords — the login form lives on Keycloak.
- **Tokens:** access (5 min) + refresh (30 min SSO idle). Both stored in httpOnly cookies set by the Next.js proxy. Client-side JS never sees them.
- **Backend:** FastAPI is a pure resource server. It fetches Keycloak's JWKS at startup and validates every Bearer token against it (RS256, `iss`, `aud`, `exp`). No passwords, no user table, no session DB.
- **Realm:** `tariq`. **Client:** `tariq-web` (public, PKCE S256). **Roles:** `admin`, `user` (default).
- **Locales:** Persian (`fa`) and English (`en`). The `/api/auth/login` handler passes `ui_locales` based on the current path so Keycloak renders in the right language.

## One-time setup

```bash
cd backend
cp .env.docker.example .env.docker
# edit KC_DB_PASSWORD and KC_ADMIN_PASSWORD to strong values
docker compose --env-file .env.docker up -d --wait
```

That's it. Compose brings up three services in order:

1. **`keycloak-db`** (Postgres) — starts and becomes healthy.
2. **`keycloak`** — starts and becomes healthy.
3. **`keycloak-bootstrap`** — runs `keycloak/bootstrap.sh` once (creates realm,
   client, roles, audience mapper, and — if `CREATE_DEV_USER=true` — a demo
   user), then exits `0`.

The bootstrap script is idempotent, so re-running `docker compose up` on
subsequent boots is a no-op.

Verify:

```bash
docker compose --env-file .env.docker logs keycloak-bootstrap
curl -s http://localhost:8080/realms/tariq/.well-known/openid-configuration | head
```

Log in at http://localhost:3000/fa/login as `demo@example.com` / `ChangeMe123!`
(the defaults from `.env.docker.example`).

### Production overrides

The same compose file and bootstrap script work in production — override these
env vars in `.env.docker` for the target environment:

| Var | Prod value |
|-----|------------|
| `KC_HOSTNAME` | Your real domain, e.g. `keycloak.example.com` |
| `KC_HOSTNAME_STRICT` | `true` |
| `APP_ORIGIN` | Frontend public URL, e.g. `https://app.example.com` |
| `CREATE_DEV_USER` | `false` (disable the demo user) |
| `KC_DB_PASSWORD` / `KC_ADMIN_PASSWORD` | Strong values from a real secret store |

Re-running `docker compose up -d` after changing these updates the Keycloak
client's redirect URIs and web origins in place (idempotent).

### Promote a user to admin (optional)

For users created manually after first boot, or to promote someone other than
the dev user:

```bash
docker compose --env-file .env.docker exec keycloak /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 --realm master \
  --user admin --password "$KC_ADMIN_PASSWORD"

docker compose --env-file .env.docker exec keycloak /opt/keycloak/bin/kcadm.sh \
  add-roles -r tariq --uusername demo@example.com --rolename admin
```

## Running the app

Two terminals:

```bash
# Terminal 1 — backend
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — frontend
cd frontend
# make sure .env.local has KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, NEXT_PUBLIC_APP_ORIGIN
# (see .env.example)
npm run dev
```

Open http://localhost:3000/fa/login → click Sign in → log in on the Keycloak page → land back on `/fa/chat`.

## Environment variables

**`backend/.env`**

```
KEYCLOAK_ISSUER=http://localhost:8080/realms/tariq
KEYCLOAK_AUDIENCE=tariq-api
```

**`frontend/.env.local`**

```
KEYCLOAK_ISSUER=http://localhost:8080/realms/tariq
KEYCLOAK_CLIENT_ID=tariq-web
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
FASTAPI_URL=http://localhost:8000
```

**`backend/.env.docker`** (gitignored — used only by compose)

```
KC_DB_NAME=keycloak
KC_DB_USER=keycloak
KC_DB_PASSWORD=dev-keycloak-db-pw
KC_ADMIN_USER=admin
KC_ADMIN_PASSWORD=dev-admin-pw
```

## File map

| File | Role |
|------|------|
| `backend/docker-compose.yml` | Keycloak 26 + Postgres 16 |
| `backend/keycloak/bootstrap.sh` | `kcadm.sh` script: realm, client, roles, audience mapper |
| `backend/app/services/keycloak.py` | JWKS fetch + cache, `verify_token()` |
| `backend/app/dependencies.py` | `get_current_user` (from JWT), `require_role("admin")` |
| `backend/app/api/v1/auth.py` | `GET /api/v1/auth/me` only |
| `frontend/src/lib/keycloak.ts` | OIDC helpers: PKCE, cookie writes, token exchange/refresh/revoke |
| `frontend/src/app/api/auth/login/route.ts` | Start flow (PKCE + state cookies, redirect to Keycloak) |
| `frontend/src/app/api/auth/register/route.ts` | Same, but deep-links to Keycloak registration page |
| `frontend/src/app/api/auth/callback/route.ts` | Exchange code for tokens, set httpOnly cookies |
| `frontend/src/app/api/auth/refresh/route.ts` | Rotate via `grant_type=refresh_token` |
| `frontend/src/app/api/auth/logout/route.ts` | Revoke refresh token, clear cookies |
| `frontend/src/app/api/auth/me/route.ts` | Forward Bearer to FastAPI, auto-refresh on 401 |
| `frontend/src/context/auth-context.tsx` | `signIn()` / `signUp()` redirect, `logout()` |

## Day-2 operations

**Stop everything:** `docker compose --env-file .env.docker down`
**Reset Keycloak DB (wipes users):** `docker compose --env-file .env.docker down -v`
**Tail Keycloak logs:** `docker compose --env-file .env.docker logs -f keycloak`
**Tail bootstrap logs:** `docker compose --env-file .env.docker logs keycloak-bootstrap`
**Re-run bootstrap after edits:** `docker compose --env-file .env.docker up -d keycloak-bootstrap` — idempotent.

## Deferred (not in this cut)

- Keycloakify theme for a branded Persian/English login page — current setup uses Keycloak's stock theme translated via `ui_locales`.
- SMTP for real email verification + password reset.
- Social login (Google/GitHub) — add as an identity provider in Keycloak admin when needed.
- Production hardening: TLS termination, `start` (non-dev) mode, secrets in a real vault. (`KC_HOSTNAME`, `KC_HOSTNAME_STRICT`, `APP_ORIGIN`, and `CREATE_DEV_USER=false` are already env-driven — see **Production overrides** above.)
