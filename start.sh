#!/usr/bin/env bash
# Tariq AI — one-command bootstrapper.
#   1. Installs missing prereqs (uv, pnpm, docker, openssl) where possible.
#   2. Scans free TCP ports for backend / frontend / keycloak.
#   3. Runs setup.sh with discovered ports (syncs frontend<->backend env).
#   4. Runs dev.sh (backend + frontend in parallel).
#
# Usage:
#   ./start.sh                       # keycloak auth (default), auto-find ports
#   ./start.sh --auth sqlite         # local users, no docker/keycloak
#   ./start.sh --reset               # regenerate .env files
#   ./start.sh --no-run              # setup only, don't launch dev servers
#   ./start.sh --skip-install        # don't auto-install missing tools
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AUTH_PROVIDER=keycloak
RESET_FLAG=()
RUN=1
SKIP_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auth) AUTH_PROVIDER="$2"; shift 2 ;;
    --reset) RESET_FLAG+=(--reset); shift ;;
    --no-run) RUN=0; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
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
  if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi
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
    npm install -g pnpm
  fi
  have pnpm || { c_err "pnpm install failed"; return 1; }
  c_ok "pnpm $(pnpm --version) installed"
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
  ensure_openssl
  if [[ "$AUTH_PROVIDER" == "keycloak" ]]; then ensure_docker || c_warn "Continuing without docker — keycloak mode will fail."; fi
  c_ok "Prereqs ready"
else
  c_info "Skipping prereq install (--skip-install)"
fi

# --------------------------------------------------------------------------- #
# Free-port scan (bash /dev/tcp probe — works without nc/lsof)
# --------------------------------------------------------------------------- #
port_listening() {
  # returns 0 if SOMETHING listens on $1
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
# Hand off to setup.sh — it writes both .envs with matching URLs/ports
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
# Launch dev servers
# --------------------------------------------------------------------------- #
if [[ $RUN -eq 1 ]]; then
  echo
  c_info "Launching dev servers (Ctrl-C to stop)"
  exec "$ROOT/dev.sh"
else
  c_ok "Setup complete. Run ./dev.sh when ready."
fi
