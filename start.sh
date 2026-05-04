#!/usr/bin/env bash
# Tariq AI — one-command bootstrapper (pm2 launcher).
#   1. Installs missing prereqs (uv, pnpm, pm2, docker, openssl) where possible.
#   2. Stops existing pm2 entries (so their ports free up before scan).
#   3. Optionally wipes .next/ + sqlite db (--clean).
#   4. Scans free TCP ports for backend / frontend / keycloak.
#   5. Runs setup.sh with discovered ports (syncs frontend<->backend env).
#   6. Optionally rewrites APP_ORIGIN + CORS for non-localhost server (--public-host).
#   7. Builds frontend (skipped with --dev) and starts both via pm2.
#   8. Waits for backend health, then smoke-tests both stacks via curl.
#
# Usage:
#   ./start.sh                                # keycloak auth, prod build
#   ./start.sh --auth sqlite                  # local users, no docker
#   ./start.sh --auth sqlite --dev            # pnpm dev under pm2
#   ./start.sh --auth sqlite --clean          # wipe .next/ + tariq.db first
#   ./start.sh --auth sqlite --public-host http://1.2.3.4   # remote-accessible server
#   ./start.sh --reset                        # regenerate .env files
#   ./start.sh --no-run                       # setup only, don't launch pm2
#   ./start.sh --skip-install                 # don't auto-install missing tools
#   ./start.sh --skip-build                   # skip pnpm build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/chatbot-backend"
FRONTEND="$ROOT/chatbot-frontend"
PM2_BACKEND=tariq-backend
PM2_FRONTEND=tariq-frontend

AUTH_PROVIDER=keycloak
RESET_FLAG=()
RUN=1
SKIP_INSTALL=0
SKIP_BUILD=0
DEV_MODE=0
CLEAN=0
PUBLIC_HOST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auth) AUTH_PROVIDER="$2"; shift 2 ;;
    --reset) RESET_FLAG+=(--reset); shift ;;
    --no-run) RUN=0; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --dev) DEV_MODE=1; shift ;;
    --clean) CLEAN=1; shift ;;
    --public-host) PUBLIC_HOST="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

c_ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
c_info() { printf '\033[36m→\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
c_err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

# --------------------------------------------------------------------------- #
# OS / package manager detection
# --------------------------------------------------------------------------- #
OS="$(uname -s)"
case "$OS" in
  Linux*)   PLATFORM=linux ;;
  Darwin*)  PLATFORM=macos ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows ;;
  *)        PLATFORM=unknown ;;
esac

PKG=""
if [[ "$PLATFORM" == "linux" ]]; then
  for c in apt-get dnf pacman zypper apk; do
    command -v "$c" >/dev/null 2>&1 && { PKG="$c"; break; }
  done
elif [[ "$PLATFORM" == "macos" ]]; then
  command -v brew >/dev/null 2>&1 && PKG=brew
fi

sudo_if() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

install_pkg() {
  local pkg="$1"
  case "$PKG" in
    apt-get) sudo_if apt-get update -y >/dev/null && sudo_if apt-get install -y "$pkg" ;;
    dnf)     sudo_if dnf install -y "$pkg" ;;
    pacman)  sudo_if pacman -Sy --noconfirm "$pkg" ;;
    zypper)  sudo_if zypper install -y "$pkg" ;;
    apk)     sudo_if apk add --no-cache "$pkg" ;;
    brew)    brew install "$pkg" ;;
    *) return 1 ;;
  esac
}

# --------------------------------------------------------------------------- #
# Prereq install
# --------------------------------------------------------------------------- #
have() { command -v "$1" >/dev/null 2>&1; }

ensure_uv() {
  have uv && return 0
  c_info "Installing uv (Astral)"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  have uv || { c_err "uv install failed; install manually from https://astral.sh/uv"; return 1; }
  c_ok "uv installed"
}

ensure_node() {
  have node && return 0
  c_info "Installing Node.js 20"
  case "$PKG" in
    brew) install_pkg node@20 || install_pkg node ;;
    apt-get)
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo_if -E bash -
      sudo_if apt-get install -y nodejs
      ;;
    dnf|pacman|zypper|apk) install_pkg nodejs && install_pkg npm || true ;;
    *) c_err "Install Node 20+ manually: https://nodejs.org/"; return 1 ;;
  esac
  have node || return 1
  c_ok "Node $(node --version) installed"
}

ensure_pnpm() {
  have pnpm && return 0
  ensure_node || return 1
  c_info "Installing pnpm via corepack"
  if have corepack; then
    corepack enable 2>/dev/null || true
    corepack prepare pnpm@latest --activate 2>/dev/null || npm install -g pnpm
  else
    sudo_if npm install -g pnpm || npm install -g pnpm
  fi
  have pnpm || { c_err "pnpm install failed"; return 1; }
  c_ok "pnpm $(pnpm --version) installed"
}

ensure_pm2() {
  have pm2 && return 0
  ensure_node || return 1
  c_info "Installing pm2 globally"
  sudo_if npm install -g pm2 || npm install -g pm2
  have pm2 || { c_err "pm2 install failed"; return 1; }
  c_ok "pm2 $(pm2 -v) installed"
}

ensure_openssl() {
  have openssl && return 0
  c_info "Installing openssl"
  install_pkg openssl || { c_err "Install openssl manually."; return 1; }
}

ensure_curl() {
  have curl && return 0
  c_info "Installing curl"
  install_pkg curl || { c_err "Install curl manually."; return 1; }
}

ensure_docker() {
  have docker && docker compose version >/dev/null 2>&1 && return 0
  if [[ "$PLATFORM" == "macos" || "$PLATFORM" == "windows" ]]; then
    c_warn "Docker Desktop not found. Install from https://docs.docker.com/desktop/"
    return 1
  fi
  c_info "Installing Docker Engine + compose plugin"
  case "$PKG" in
    apt-get)
      sudo_if apt-get update -y >/dev/null
      sudo_if apt-get install -y docker.io docker-compose-plugin || {
        curl -fsSL https://get.docker.com | sudo_if sh
      }
      ;;
    dnf)    sudo_if dnf install -y docker docker-compose-plugin || curl -fsSL https://get.docker.com | sudo_if sh ;;
    pacman) sudo_if pacman -Sy --noconfirm docker docker-compose ;;
    *)      curl -fsSL https://get.docker.com | sudo_if sh ;;
  esac
  sudo_if systemctl enable --now docker 2>/dev/null || true
  have docker || { c_err "Docker install failed."; return 1; }
  c_ok "Docker installed"
}

if [[ $SKIP_INSTALL -eq 0 ]]; then
  c_info "Checking prereqs (platform=$PLATFORM, pkg=${PKG:-none})"
  ensure_uv
  ensure_pnpm
  ensure_pm2
  ensure_openssl
  ensure_curl
  if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then ensure_docker || c_warn "Continuing without docker — keycloak mode will fail."; fi
  c_ok "Prereqs ready"
else
  c_info "Skipping prereq install (--skip-install)"
  have pm2 || { c_err "pm2 missing — re-run without --skip-install"; exit 1; }
  have curl || { c_err "curl missing — re-run without --skip-install"; exit 1; }
fi

# --------------------------------------------------------------------------- #
# Stop existing pm2 entries BEFORE port scan (so their ports free up)
# --------------------------------------------------------------------------- #
c_info "Stopping any existing pm2 entries"
pm2 delete "$PM2_BACKEND" "$PM2_FRONTEND" >/dev/null 2>&1 || true

# --------------------------------------------------------------------------- #
# Optional: wipe build/db artifacts (--clean)
# --------------------------------------------------------------------------- #
if [[ $CLEAN -eq 1 ]]; then
  c_info "Cleaning .next/ and sqlite db"
  rm -rf "$FRONTEND/.next" || true
  rm -f "$BACKEND/tariq.db" "$BACKEND/tariq.db-journal" || true
  c_ok "Cleaned"
fi

# --------------------------------------------------------------------------- #
# Free-port scan (bash /dev/tcp probe — works without nc/lsof)
# --------------------------------------------------------------------------- #
port_listening() {
  (exec 3<>/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
  local rc=$?
  exec 3<&- 2>/dev/null || true
  exec 3>&- 2>/dev/null || true
  return $rc
}

find_free_port() {
  local start="$1"
  local max=$((start + 100))
  local p="$start"
  while [[ $p -lt $max ]]; do
    if ! port_listening "$p"; then echo "$p"; return 0; fi
    p=$((p + 1))
  done
  c_err "No free port near $start"; return 1
}

c_info "Scanning free ports"
BACKEND_PORT=$(find_free_port 8000)
FRONTEND_PORT=$(find_free_port 3000)
KEYCLOAK_PORT=$(find_free_port 8080)
c_ok "Backend=$BACKEND_PORT  Frontend=$FRONTEND_PORT  Keycloak=$KEYCLOAK_PORT"

# --------------------------------------------------------------------------- #
# Hand off to setup.sh — writes both .envs with matching URLs/ports
# --------------------------------------------------------------------------- #
SETUP_ARGS=(
  --auth "$AUTH_PROVIDER"
  --backend-port "$BACKEND_PORT"
  --frontend-port "$FRONTEND_PORT"
  --keycloak-port "$KEYCLOAK_PORT"
  "${RESET_FLAG[@]}"
)
c_info "Running setup.sh ${SETUP_ARGS[*]}"
"$ROOT/setup.sh" "${SETUP_ARGS[@]}"

# --------------------------------------------------------------------------- #
# Override APP_ORIGIN + CORS for non-localhost servers (--public-host)
# --------------------------------------------------------------------------- #
set_env_kv() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} 1' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

if [[ -n "$PUBLIC_HOST" ]]; then
  # PUBLIC_HOST is the full origin browsers will see (scheme + host [+ port]).
  # Use verbatim — do NOT append FRONTEND_PORT. If user serves through nginx
  # on :80, origin has no port. If they open :3001 directly, they include it.
  PUBLIC_ORIGIN="${PUBLIC_HOST%/}"
  c_info "Overriding APP_ORIGIN to $PUBLIC_ORIGIN"
  set_env_kv "$BACKEND/.env" "CORS_ORIGINS" "[\"$PUBLIC_ORIGIN\",\"http://localhost:$FRONTEND_PORT\"]"
  set_env_kv "$FRONTEND/.env.local" "NEXT_PUBLIC_APP_ORIGIN" "$PUBLIC_ORIGIN"
  c_ok "CORS + APP_ORIGIN updated for public access"
fi

# --------------------------------------------------------------------------- #
# Build frontend (prod mode only)
# --------------------------------------------------------------------------- #
if [[ $RUN -eq 1 && $DEV_MODE -eq 0 && $SKIP_BUILD -eq 0 ]]; then
  c_info "Building frontend (pnpm build)"
  (cd "$FRONTEND" && PORT="$FRONTEND_PORT" pnpm build)
  c_ok "Frontend built"
fi

# --------------------------------------------------------------------------- #
# Health-poll helper
# --------------------------------------------------------------------------- #
wait_for_url() {
  local url="$1" name="$2" tries="${3:-60}"
  c_info "Waiting for $name ($url)"
  local i=0
  while [[ $i -lt $tries ]]; do
    if curl -fsS -o /dev/null -m 2 "$url"; then
      c_ok "$name responded after ${i}s"
      return 0
    fi
    # also accept 4xx as 'reachable' — endpoints that need auth still return HTTP
    if curl -s -o /dev/null -m 2 -w '%{http_code}' "$url" | grep -qE '^[2345][0-9][0-9]$'; then
      c_ok "$name reachable (4xx is fine — process is up)"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  c_err "$name did not respond within ${tries}s"
  return 1
}

# --------------------------------------------------------------------------- #
# Launch via pm2
# --------------------------------------------------------------------------- #
if [[ $RUN -eq 1 ]]; then
  echo
  c_info "Starting pm2 services"

  # Backend — uvicorn under uv
  (
    cd "$BACKEND"
    unset VIRTUAL_ENV
    pm2 start uv \
      --name "$PM2_BACKEND" \
      --interpreter none \
      --time \
      --update-env \
      -- run python -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
  )

  # Wait for backend to bind its port + accept HTTP
  wait_for_url "http://localhost:${BACKEND_PORT}/api/v1/openapi.json" "backend" 60 || {
    c_err "Backend never came up — check: pm2 logs $PM2_BACKEND"
    exit 1
  }

  # Frontend — pnpm start (prod) or pnpm dev
  FRONTEND_CMD=start
  [[ $DEV_MODE -eq 1 ]] && FRONTEND_CMD=dev
  (
    cd "$FRONTEND"
    PORT="$FRONTEND_PORT" \
    NODE_USE_ENV_PROXY=1 \
    NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}" \
    pm2 start pnpm \
      --name "$PM2_FRONTEND" \
      --interpreter none \
      --time \
      --update-env \
      -- "$FRONTEND_CMD"
  )

  # Wait for frontend
  wait_for_url "http://localhost:${FRONTEND_PORT}/" "frontend" 90 || {
    c_warn "Frontend slow to start — check: pm2 logs $PM2_FRONTEND"
  }

  pm2 save >/dev/null 2>&1 || true

  # ----------------------------------------------------------------------- #
  # Smoke tests — confirm frontend can reach backend through its proxy
  # ----------------------------------------------------------------------- #
  c_info "Smoke testing integration"
  ME_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://localhost:${FRONTEND_PORT}/api/auth/me" || echo 000)
  if [[ "$ME_CODE" == "401" ]]; then
    c_ok "frontend /api/auth/me → 401 (expected when no cookie). Frontend ↔ backend wired correctly."
  elif [[ "$ME_CODE" == "200" ]]; then
    c_ok "frontend /api/auth/me → 200 (cookie present from previous session)."
  else
    c_warn "frontend /api/auth/me → $ME_CODE (expected 401). Frontend may not reach backend."
    c_warn "  Check FASTAPI_URL in $FRONTEND/.env.local matches backend port $BACKEND_PORT"
  fi

  if [[ "$AUTH_PROVIDER" == "sqlite" ]]; then
    BACKEND_LOGIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
      -X POST "http://localhost:${BACKEND_PORT}/api/v1/auth/login" \
      -H 'Content-Type: application/json' \
      -d '{"email":"smoke@test.invalid","password":"wrongpass"}' || echo 000)
    if [[ "$BACKEND_LOGIN_CODE" == "401" ]]; then
      c_ok "backend /auth/login → 401 (expected for unknown user). Login path alive."
    else
      c_warn "backend /auth/login → $BACKEND_LOGIN_CODE (expected 401)"
    fi
  fi

  echo
  c_ok "Services running"
  pm2 ls
  echo
  if [[ -n "$PUBLIC_HOST" ]]; then
    echo "  Frontend (public): ${PUBLIC_HOST%/}"
  fi
  echo "  Frontend (local):  http://localhost:${FRONTEND_PORT}"
  echo "  Backend docs:      http://localhost:${BACKEND_PORT}/api/v1/docs"
  echo
  echo "  Effective env:"
  grep -E "^(PORT|FASTAPI_URL|NEXT_PUBLIC_APP_ORIGIN|AUTH_PROVIDER|DATABASE_URL)=" "$BACKEND/.env" "$FRONTEND/.env.local" 2>/dev/null | sed 's/^/    /'
  echo
  echo "  Logs:  pm2 logs $PM2_BACKEND   |   pm2 logs $PM2_FRONTEND"
  echo "  Stop:  pm2 delete $PM2_BACKEND $PM2_FRONTEND"
  echo "  Boot:  pm2 startup    (then run printed sudo cmd, then: pm2 save)"
else
  c_ok "Setup complete. Re-run without --no-run to launch pm2."
fi
