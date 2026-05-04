"""Structured JSON logging with request-id context.

Stdlib only — no structlog. A ContextVar holds the per-request UUID so every
log record emitted while handling that request carries the same id without
the caller having to thread it through explicitly.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

# Prefer orjson — ~3x faster on the hot path. Fall back to stdlib json if missing.
try:
    import orjson

    def _dumps(payload: dict[str, Any]) -> str:
        encoded: bytes = orjson.dumps(payload, default=str)
        return encoded.decode()

except ImportError:  # pragma: no cover — orjson is a runtime dep, fallback for safety only.

    def _dumps(payload: dict[str, Any]) -> str:
        return json.dumps(payload, default=str, ensure_ascii=False)


request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

# Attributes that are always present on LogRecord — anything else the caller
# passed via `extra=` is treated as a structured field worth emitting.
_STD_LOGRECORD_ATTRS = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)


class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }

        # Pull structured extras passed via logger.info("msg", extra={...}).
        for key, value in record.__dict__.items():
            if key in _STD_LOGRECORD_ATTRS or key.startswith("_"):
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        return _dumps(payload)


def configure_logging(level: int = logging.INFO) -> None:
    """Replace the root handler set with a single JSON stdout handler.

    Called once at app startup. Safe to call multiple times — existing handlers
    are cleared first so test harnesses can re-init without duplicating output.
    """
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)

    # Keep uvicorn's access log flowing through the same JSON formatter.
    for noisy in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(noisy)
        logger.handlers = []
        logger.propagate = True
