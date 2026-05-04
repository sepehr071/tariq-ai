#!/usr/bin/env bash
# Tariq AI — one-command bootstrapper (pm2 launcher).
#   1. Installs missing prereqs (uv, pnpm, pm2, docker, openssl) where possible.
#   2. Stops existing pm2 entries (so their ports free up before scan).
#   3. Scans free TCP ports for backend / frontend / keycloak.
#   4. Runs setup.sh with discovered ports (syncs frontend<->backend env).
#   5. Builds frontend (skipped with --dev) and starts both via pm2.
#
# Usage:
#   ./start.sh                       # keycloak auth, prod build, auto-find ports
#   ./start.sh --auth sqlite         # local users, no docker/keycloak
#   ./start.sh --dev                 # pnpm dev instead of build+start
#   ./start.sh --reset               # regenerate .env files
#   ./start.sh --no-run              # setup only, don't launch pm2
#   ./start.sh --skip-install        # don't auto-install missing tools
#   ./start.sh --skip-build          # skip pnpm build (assume .next exists)
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auth) AUTH_PROVIDER="$2"; shift 2 ;;
    --reset) RESET_FLAG+=(--reset); shift ;;
    --no-run) RUN=0; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --dev) DEV_MODE=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
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
  if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then ensure_docker || c_warn "Continuing without docker — keycloak mode will fail."; fi
  c_ok "Prereqs ready"
else
  c_info "Skipping prereq install (--skip-install)"
  have pm2 || { c_err "pm2 missing — re-run without --skip-install"; exit 1; }
fi

# --------------------------------------------------------------------------- #
# Stop existing pm2 entries BEFORE port scan (so their ports free up)
# --------------------------------------------------------------------------- #
c_info "Stopping any existing pm2 entries"
pm2 delete "$PM2_BACKEND" "$PM2_FRONTEND" >/dev/null 2>&1 || true

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
  local start="$1" max=$((start + 100)) p="$start"
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
# Build frontend (prod mode only)
# --------------------------------------------------------------------------- #
if [[ $RUN -eq 1 && $DEV_MODE -eq 0 && $SKIP_BUILD -eq 0 ]]; then
  c_info "Building frontend (pnpm build)"
  (cd "$FRONTEND" && PORT="$FRONTEND_PORT" pnpm build)
  c_ok "Frontend built"
fi

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
      -- run python -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
  )

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

  pm2 save >/dev/null 2>&1 || true

  echo
  c_ok "Services running"
  pm2 ls
  echo
  echo "  Backend:  http://localhost:${BACKEND_PORT}/api/v1/docs"
  echo "  Frontend: http://localhost:${FRONTEND_PORT}"
  echo
  echo "  Logs:     pm2 logs $PM2_BACKEND   |   pm2 logs $PM2_FRONTEND"
  echo "  Stop:     pm2 delete $PM2_BACKEND $PM2_FRONTEND"
  echo "  Boot:     pm2 startup   (then run the printed sudo cmd, then pm2 save)"
else
  c_ok "Setup complete. Re-run without --no-run to launch pm2."
fi
