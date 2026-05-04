# Tariq AI — Workspace

Bilingual (Persian/English) AI chat platform. Text-only (no file uploads/images/voice).

This directory is a **local workspace** holding two sibling projects. Each is its own independent git repo — there is no combined repo at this level.

## Layout

```
tariq-front-back/
├── frontend/        # Next.js 16 App Router + shadcn/ui + next-intl + Framer Motion (own repo)
├── backend/         # FastAPI + Keycloak JWT validation + Keycloak docker-compose (own repo)
├── keycloak.md      # Keycloak architecture + production overrides
├── widget.md        # Embeddable chat widget — deployment + host-site integration
└── .env.example     # Combined env reference for DevOps (all three deployables)
```

- **Identity provider:** self-hosted **Keycloak 26**, started via `backend/docker-compose.yml`. A one-shot `keycloak-bootstrap` compose service auto-creates the realm, client, roles, audience mapper, and (optionally) a dev user. No manual `kcadm.sh` steps.
- **Chat AI:** self-hosted **Dify** at `https://dify.novin-dev.com/` (external — not in this workspace).
- **Frontend** runs OIDC code flow with PKCE against Keycloak, stores tokens in httpOnly cookies, and proxies `/api/auth/me` to the backend.
- **Backend** is a pure resource server — validates Keycloak JWTs via JWKS, no user DB.

## Two surfaces on one Next.js deployment

The frontend serves **two independent chat surfaces**, which share components but nothing else:

| Surface | Route | Auth | Needs backend? | Notes |
|---------|-------|------|----------------|-------|
| Full-page chat | `/[locale]/chat` | Keycloak required | Yes (FastAPI + Keycloak) | Sidebar, history, Keycloak user ID, answer-mode preset (stored in localStorage) |
| Embeddable widget | `/embed/[locale]` + `/widget.js` | Anonymous | **No** | One-line script-tag install on host sites; per-host Dify app routing |

Embedding a chat bubble on another site needs **only** the frontend (Next.js + Dify API key). The FastAPI backend and Keycloak are not in the widget path. See `widget.md` for full details.

## Where to look

| Topic | Path |
|-------|------|
| DevOps setup (per service) | `backend/README.md`, `frontend/README.md` |
| Frontend implementation details | `frontend/CLAUDE.md` |
| Backend implementation details | `backend/CLAUDE.md` |
| Keycloak architecture + prod overrides | `keycloak.md` |
| Embed widget — deployment, `data-*` attrs, `window.Tariq` API | `widget.md` |
| Widget implementation spec (dev reference) | `frontend/docs/embed-widget-spec.md` |
| Combined env-var reference | `.env.example` (this directory) |

## Running locally

First-time setup — one command brings up Keycloak and runs bootstrap:

```bash
cd backend
cp .env.example .env                      # FastAPI runtime config
cp .env.docker.example .env.docker        # Keycloak compose + bootstrap config (edit passwords)
docker compose --env-file .env.docker up -d --wait
```

Then in two terminals:

```bash
# Terminal 1 — backend
cd backend
uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
cp .env.example .env.local                # edit DIFY_API_KEY etc.
pnpm install
pnpm dev
```

Frontend: http://localhost:3000 · Backend docs: http://localhost:8000/docs · Keycloak: http://localhost:8080

With `CREATE_DEV_USER=true` (default in `.env.docker.example`), log in at `/fa/login` as `demo@example.com` / `ChangeMe123!`.

## Deploying

- The same `backend/docker-compose.yml` + `bootstrap.sh` serve dev and prod; override `KC_HOSTNAME`, `APP_ORIGIN`, `CREATE_DEV_USER=false`, and strong passwords in `.env.docker`.
- Env-var handoff for DevOps: see root `.env.example` — it lists every key across all three files with required/optional flags and cross-file invariants.
