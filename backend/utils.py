"""Shared utilities for the Station Monitor backend."""
from datetime import datetime, timezone
from typing import Optional


def utc_iso(dt: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime to UTC ISO-8601 string with Z suffix.

    Handles naive datetimes (from SQLite) by treating them as UTC.
    Returns None if dt is None.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace('+00:00', 'Z')
