"""Shared slowapi limiter instance.

Lives in `core/` so route modules can import it without depending on `app.main`,
which would create a circular import (main imports the v1 router which imports
the auth route which needs the limiter).
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

# Keyed by client IP. Per-route limits applied via `@limiter.limit(...)` decorator.
limiter: Limiter = Limiter(key_func=get_remote_address)
