"""Gunicorn configuration for Tariq Auth API."""

import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
wsgi_app = "app:app"

# Worker processes — `GUNICORN_WORKERS` env overrides; default scales with CPU.
workers = int(os.getenv("GUNICORN_WORKERS", str(multiprocessing.cpu_count() * 2 + 1)))
worker_class = "uvicorn.workers.UvicornWorker"

# Timeouts — 60s accommodates a cold JWKS fetch on first request after Keycloak restart.
timeout = 60
graceful_timeout = 30
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Process naming
proc_name = "tariq-auth"
