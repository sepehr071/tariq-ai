#!/usr/bin/env bash
# Tariq AI — one-shot setup for Linux/macOS/WSL.
# Idempotent. Re-run anytime; existing .env files are kept unless --reset is passed.
#
# Usage:
#   ./setup.sh                                                  # defaults: 8000/3000/8080, keycloak
#   ./setup.sh --auth sqlite                                    # local email+password (no Keycloak)
#   ./setup.sh --backend-port 8200 --frontend-port 3200 --keycloak-port 8280
#   ./setup.sh --reset                                          # regenerate .env files
#   ./setup.sh --skip-compose                                   # don't start Keycloak
#   ./setup.sh --skip-deps                                      # don't run uv sync / pnpm install
#
# Auth modes:
#   keycloak (default) — full OIDC stack via docker-compose. Requires docker.
#   sqlite             — local users table, HS256 JWT, no Keycloak/docker needed.
#
# After completion, run `./dev.sh` (created by this script).

set -euo pipefail

# --------------------------------------------------------------------------- #
# Defaults + arg parsing
# --------------------------------------------------------------------------- #
BACKEND_PORT=8000
FRONTEND_PORT=3000
KEYCLOAK_PORT=8080
AUTH_PROVIDER=keycloak
RESET=0
SKIP_COMPOSE=0
SKIP_DEPS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-port) BACKEND_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    --keycloak-port) KEYCLOAK_PORT="$2"; shift 2 ;;
    --auth) AUTH_PROVIDER="$2"; shift 2 ;;
    --reset) RESET=1; shift ;;
    --skip-compose) SKIP_COMPOSE=1; shift ;;
    --skip-deps) SKIP_DEPS=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

case "$AUTH_PROVIDER" in
  keycloak|sqlite) ;;
  *) echo "Invalid --auth value: $AUTH_PROVIDER (expected keycloak|sqlite)" >&2; exit 1 ;;
esac

# In sqlite mode, Keycloak compose is irrelevant.
if [[ "$AUTH_PROVIDER" == "sqlite" ]]; then
  SKIP_COMPOSE=1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/chatbot-backend"
FRONTEND="$ROOT/chatbot-frontend"

c_ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }
c_info() { printf '\033[36m→\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
c_err() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

# --------------------------------------------------------------------------- #
# Prereq check
# --------------------------------------------------------------------------- #
need() {
  command -v "$1" >/dev/null 2>&1 || { c_err "Missing tool: $1 ($2)"; MISSING=1; }
}
MISSING=0
need uv         "curl -LsSf https://astral.sh/uv/install.sh | sh"
need pnpm       "npm install -g pnpm  (requires Node 20+)"
need openssl    "apt install openssl  (or brew install openssl)"
need awk        "(coreutils)"
if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then
  need docker     "https://docs.docker.com/engine/install/"
fi
[[ $MISSING -eq 1 ]] && { c_err "Install missing tools first."; exit 1; }

if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then
  docker compose version >/dev/null 2>&1 || {
    c_err "'docker compose' (v2 plugin) not found. Install docker-compose-plugin."
    exit 1
  }
fi

c_ok "Prereqs present (auth=$AUTH_PROVIDER)."

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
randpass() { openssl rand -base64 32 | tr -d '\n=+/' | cut -c1-32; }
randhex() { openssl rand -hex 32; }  # 64-char hex for HS256 JWT secret

set_env() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} 1' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

ensure_env() {
  local target="$1" template="$2"
  if [[ -f "$target" && $RESET -eq 0 ]]; then
    c_info "Keep existing $(basename "$target") (use --reset to regenerate)"
    return 1
  fi
  cp "$template" "$target"
  c_ok "Created $(basename "$target") from template"
  return 0
}

# --------------------------------------------------------------------------- #
# Backend .env
# --------------------------------------------------------------------------- #
KC_ISSUER="http://localhost:${KEYCLOAK_PORT}/realms/tariq"
APP_ORIGIN="http://localhost:${FRONTEND_PORT}"
FASTAPI_URL_INTERNAL="http://localhost:${BACKEND_PORT}/api/v1"

c_info "Configuring backend/.env"
ensure_env "$BACKEND/.env" "$BACKEND/.env.example" || true
set_env "$BACKEND/.env" "PORT" "$BACKEND_PORT"
set_env "$BACKEND/.env" "AUTH_PROVIDER" "$AUTH_PROVIDER"
set_env "$BACKEND/.env" "CORS_ORIGINS" "[\"$APP_ORIGIN\"]"

if [[ "$AUTH_PROVIDER" == "sqlite" ]]; then
  # Default to SQLite DB for sqlite-auth mode (no Postgres required).
  set_env "$BACKEND/.env" "DATABASE_URL" "sqlite+aiosqlite:///./tariq.db"
  # KEYCLOAK_ISSUER must be valid AnyHttpUrl per pydantic; placeholder is fine
  # because verify path is gated on AUTH_PROVIDER and never called in sqlite mode.
  set_env "$BACKEND/.env" "KEYCLOAK_ISSUER" "http://unused.local/realms/tariq"
  # Generate / reuse JWT signing secret. Same value goes to frontend.
  if [[ -z "$(grep -E '^AUTH_JWT_SECRET=' "$BACKEND/.env" | cut -d= -f2-)" ]]; then
    JWT_SECRET="$(randhex)"
    set_env "$BACKEND/.env" "AUTH_JWT_SECRET" "$JWT_SECRET"
    c_ok "Generated AUTH_JWT_SECRET"
  else
    JWT_SECRET="$(grep -E '^AUTH_JWT_SECRET=' "$BACKEND/.env" | cut -d= -f2-)"
    c_info "Reusing existing AUTH_JWT_SECRET"
  fi
else
  # keycloak mode
  set_env "$BACKEND/.env" "KEYCLOAK_ISSUER" "$KC_ISSUER"
  if grep -qE "^DATABASE_URL=postgresql" "$BACKEND/.env"; then
    c_warn "DATABASE_URL is Postgres — ensure the DB exists or switch to sqlite."
  fi
fi

# --------------------------------------------------------------------------- #
# Backend .env.docker (Keycloak only)
# --------------------------------------------------------------------------- #
if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then
  c_info "Configuring backend/.env.docker"
  if ensure_env "$BACKEND/.env.docker" "$BACKEND/.env.docker.example"; then
    set_env "$BACKEND/.env.docker" "KC_DB_PASSWORD" "$(randpass)"
    set_env "$BACKEND/.env.docker" "KC_ADMIN_PASSWORD" "$(randpass)"
    set_env "$BACKEND/.env.docker" "DEV_USER_PASSWORD" "$(randpass)"
    c_ok "Generated random KC_DB_PASSWORD, KC_ADMIN_PASSWORD, DEV_USER_PASSWORD"
  fi
  set_env "$BACKEND/.env.docker" "KC_PORT" "$KEYCLOAK_PORT"
  set_env "$BACKEND/.env.docker" "APP_ORIGIN" "$APP_ORIGIN"
fi

# --------------------------------------------------------------------------- #
# Frontend .env.local
# --------------------------------------------------------------------------- #
c_info "Configuring frontend/.env.local"
ensure_env "$FRONTEND/.env.local" "$FRONTEND/.env.example" || true
set_env "$FRONTEND/.env.local" "PORT" "$FRONTEND_PORT"
set_env "$FRONTEND/.env.local" "FASTAPI_URL" "$FASTAPI_URL_INTERNAL"
set_env "$FRONTEND/.env.local" "NEXT_PUBLIC_APP_ORIGIN" "$APP_ORIGIN"
set_env "$FRONTEND/.env.local" "NEXT_PUBLIC_AUTH_PROVIDER" "$AUTH_PROVIDER"

if [[ "$AUTH_PROVIDER" == "sqlite" ]]; then
  set_env "$FRONTEND/.env.local" "AUTH_JWT_SECRET" "$JWT_SECRET"
  set_env "$FRONTEND/.env.local" "AUTH_JWT_ISSUER" "tariq-backend"
  set_env "$FRONTEND/.env.local" "AUTH_JWT_AUDIENCE" "tariq-api"
  # KEYCLOAK_ISSUER unused, but keep a placeholder so any stray import doesn't crash
  set_env "$FRONTEND/.env.local" "KEYCLOAK_ISSUER" "http://unused.local/realms/tariq"
else
  set_env "$FRONTEND/.env.local" "KEYCLOAK_ISSUER" "$KC_ISSUER"
fi

# --------------------------------------------------------------------------- #
# Dependencies
# --------------------------------------------------------------------------- #
if [[ $SKIP_DEPS -eq 0 ]]; then
  c_info "Syncing backend deps (uv sync)"
  (cd "$BACKEND" && uv sync >/dev/null)
  c_ok "Backend deps installed"

  c_info "Installing frontend deps (pnpm install)"
  (cd "$FRONTEND" && pnpm install --silent)
  c_ok "Frontend deps installed"
fi

# --------------------------------------------------------------------------- #
# Compose: Keycloak + bootstrap (keycloak mode only)
# --------------------------------------------------------------------------- #
if [[ $SKIP_COMPOSE -eq 0 ]]; then
  c_info "Starting Keycloak (docker compose)"
  (cd "$BACKEND" && docker compose --env-file .env.docker up -d --wait)
  c_ok "Keycloak healthy on port $KEYCLOAK_PORT"
fi

# --------------------------------------------------------------------------- #
# Generate dev.sh launcher
# --------------------------------------------------------------------------- #
DEV_SH="$ROOT/dev.sh"
cat > "$DEV_SH" <<'EOF'
#!/usr/bin/env bash
# Run backend (uvicorn --reload) + frontend (pnpm dev) in parallel.
# Ctrl-C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/chatbot-backend"
FRONTEND="$ROOT/chatbot-frontend"

BPORT="$(grep -E '^PORT=' "$BACKEND/.env" | cut -d= -f2 || echo 8000)"
FPORT="$(grep -E '^PORT=' "$FRONTEND/.env.local" | cut -d= -f2 || echo 3000)"

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# When HTTPS_PROXY is set (corporate networks), tell Node 22+ to honor it for
# outbound fetch AND exclude localhost so backend calls aren't hijacked.
export NODE_USE_ENV_PROXY=1
export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}"

# Unset VIRTUAL_ENV so uv resolves the project's local .venv even if the
# parent shell has a stale activation pointing elsewhere.
(cd "$BACKEND" && unset VIRTUAL_ENV && uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BPORT") &
(cd "$FRONTEND" && PORT="$FPORT" pnpm dev) &
wait
EOF
chmod +x "$DEV_SH"
c_ok "Wrote dev.sh"

# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #
echo
echo "==============================================================================="
echo "  Tariq AI — setup complete (auth=$AUTH_PROVIDER)"
echo "==============================================================================="
echo "  Frontend:        http://localhost:${FRONTEND_PORT}"
echo "  Backend docs:    http://localhost:${BACKEND_PORT}/api/v1/docs"

if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then
  KC_ADMIN_PW_SHOW="$(grep -E '^KC_ADMIN_PASSWORD=' "$BACKEND/.env.docker" | cut -d= -f2-)"
  DEV_USER_EMAIL="$(grep -E '^DEV_USER_EMAIL=' "$BACKEND/.env.docker" | cut -d= -f2-)"
  DEV_USER_PW_SHOW="$(grep -E '^DEV_USER_PASSWORD=' "$BACKEND/.env.docker" | cut -d= -f2-)"
  echo "  Keycloak admin:  http://localhost:${KEYCLOAK_PORT}/admin   (admin / ${KC_ADMIN_PW_SHOW})"
  echo
  echo "  Dev login (full-page chat):"
  echo "    Email:    ${DEV_USER_EMAIL}"
  echo "    Password: ${DEV_USER_PW_SHOW}"
else
  echo "  Auth: local sqlite users table (no Keycloak)."
  echo
  echo "  No users yet. Register the first one at:"
  echo "    http://localhost:${FRONTEND_PORT}/en/register"
  echo "  Or via curl:"
  echo "    curl -X POST http://localhost:${BACKEND_PORT}/api/v1/auth/register \\"
  echo "      -H 'Content-Type: application/json' \\"
  echo "      -d '{\"email\":\"you@example.com\",\"password\":\"...\",\"name\":\"You\"}'"
fi

echo
echo "  Next steps:"
echo "    1. Edit chatbot-frontend/.env.local: set DIFY_API_KEY (required for chat)."
echo "    2. Run ./dev.sh to start backend + frontend."
echo "    3. Open http://localhost:${FRONTEND_PORT}/fa/login"
echo
echo "  Re-run with --reset to regenerate .env files."
echo "  Re-run with --auth sqlite|keycloak to switch providers."
echo "==============================================================================="
