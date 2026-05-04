# Tariq AI — Frontend

Bilingual (Persian/English) Next.js 16 App Router frontend for the Tariq AI
chat platform. Landing page, Keycloak-backed auth, and streaming chat
powered by a self-hosted [Dify](https://dify.ai) instance.

Consumes two backends:

- **Auth** — [Keycloak 26](../keycloak.md) (OIDC code flow + PKCE) via
  server-side route handlers that mint httpOnly cookies. A sibling
  [FastAPI service](../backend) validates JWTs via JWKS.
- **Chat** — Dify at `DIFY_BASE_URL` (SSE streaming).

---

## What DevOps runs

### 1. Prerequisites

- **Node.js** ≥ 20.18
- **pnpm** ≥ 10 (via Corepack: `corepack enable`)
- A reachable Keycloak + FastAPI (start these from `../backend/` first —
  see `backend/README.md`)
- A Dify instance with an API key

### 2. Setup

```bash
cp .env.example .env.local        # edit — see table below
pnpm install
pnpm dev                           # http://localhost:3000
```

### 3. Production

```bash
pnpm build
pnpm start                         # http://localhost:3000 by default
```

Deploy as any Node.js server (Vercel, Docker, PM2, systemd). `pnpm start`
honours `PORT` and `HOSTNAME` env vars.

### 4. Other commands

```bash
pnpm lint        # ESLint
```

> **Dev compiler note:** `pnpm dev` runs `next dev --webpack` to avoid a
> Turbopack compile hang on Windows in Next.js 16.1.x. Production
> (`pnpm build` / `pnpm start`) uses Turbopack — unaffected on Linux.

---

## Environment variables

### `frontend/.env.local`

| Key | Required | Purpose |
|-----|----------|---------|
| `KEYCLOAK_ISSUER` | **yes** | Realm issuer, e.g. `https://keycloak.example.com/realms/tariq`. Must equal the backend's value. |
| `KEYCLOAK_CLIENT_ID` | no (default `tariq-web`) | Public OIDC client ID. Must equal compose `CLIENT_ID`. |
| `NEXT_PUBLIC_APP_ORIGIN` | **yes** | Public URL of this app, e.g. `https://app.example.com`. Must equal compose `APP_ORIGIN`. Ships to the browser. |
| `FASTAPI_URL` | **yes** | Backend URL **including the `API_PREFIX`** (e.g. `http://backend:8000/api/v1` in-cluster, or `https://app.example.com/api/v1` / `…/tariqrag` in prod). Must match the backend's `API_PREFIX`. |
| `DIFY_API_KEY` | **yes** | Dify API key. **Server-only — never exposed to the client.** |
| `DIFY_BASE_URL` | **yes** | Dify API base, e.g. `https://dify.novin-dev.com/v1`. |

**Cross-service invariants** (shared with the backend):

- `KEYCLOAK_ISSUER` in this file must match `backend/.env`.
- `KEYCLOAK_CLIENT_ID` must match `CLIENT_ID` in `backend/.env.docker`.
- `NEXT_PUBLIC_APP_ORIGIN` must match `APP_ORIGIN` in `backend/.env.docker`.

---

## Route map

| URL | Auth | Purpose |
|-----|------|---------|
| `/[locale]/` | public | Landing page |
| `/[locale]/login` | public (redirects if logged in) | Single "Sign in" button → Keycloak |
| `/[locale]/register` | public (redirects if logged in) | Single "Create account" button → Keycloak |
| `/[locale]/chat` | **protected** | Chat interface |
| `/api/auth/login` | — | Start OIDC flow (PKCE + redirect) |
| `/api/auth/callback` | — | Exchange code for tokens, set httpOnly cookies |
| `/api/auth/refresh` | — | Rotate tokens |
| `/api/auth/logout` | — | Revoke refresh token, clear cookies |
| `/api/auth/me` | — | Proxy to FastAPI with auto-refresh on 401 |
| `/api/chat/*` | — | Proxy to Dify (adds `DIFY_API_KEY` server-side) |

Locales: `en`, `fa`. The `/api/auth/login` handler detects locale from the
`Referer` and passes `ui_locales` to Keycloak so the login page renders
in the right language.

---

## Tech stack

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Next.js (App Router, Turbopack) | 16 |
| React | React | 19 |
| Styling | Tailwind CSS (v4, OKLCH colors) | 4 |
| Components | shadcn/ui | 3.8 |
| Animation | Framer Motion | 12 |
| i18n | next-intl | 4 |
| Theme | next-themes | 0.4 |
| Markdown | react-markdown + remark-gfm | 9 |
| Font | Vazirmatn (Latin + Persian/Arabic) | — |

---

## More details

- **Codebase conventions + architecture:** see `CLAUDE.md`.
- **Keycloak setup + production hardening:** see `../keycloak.md`.
- **Backend:** see sibling `../backend/README.md`.
