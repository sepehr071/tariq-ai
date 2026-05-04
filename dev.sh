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

# When a corporate proxy is set in HTTPS_PROXY, tell Node 22+ to honor it for
# outbound fetch (Dify) AND exclude localhost so backend calls don't get hijacked.
export NODE_USE_ENV_PROXY=1
export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}"

(cd "$BACKEND" && unset VIRTUAL_ENV && uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BPORT") &
(cd "$FRONTEND" && PORT="$FPORT" pnpm dev) &
wait
