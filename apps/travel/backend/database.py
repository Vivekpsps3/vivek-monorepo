"""Travel session access. The site server owns the engine."""

from apps.server.database import get_db

__all__ = ["get_db"]
