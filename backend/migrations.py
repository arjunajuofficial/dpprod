"""
Lightweight schema migrations.

SQLAlchemy's create_all() only creates *missing tables* — it never adds new
columns to existing tables.  This module adds any columns introduced after the
initial release so existing databases upgrade in place without data loss.

Safe to run on every startup (idempotent).
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

# (table, column, SQL type clause) — keep in sync with models.py
_COLUMNS: list[tuple[str, str, str]] = [
    ("servers", "maintenance_until", "DATETIME"),
    ("alerts",  "acknowledged_at",   "DATETIME"),
    ("alerts",  "acknowledged_by",   "VARCHAR"),
]


def _existing_columns(sync_conn, table: str) -> set[str]:
    rows = sync_conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {row[1] for row in rows}


async def run_migrations(engine: AsyncEngine) -> None:
    if not engine.url.get_backend_name().startswith("sqlite"):
        # Non-SQLite deployments should use Alembic; skip silently.
        return

    async with engine.begin() as conn:
        for table, column, sql_type in _COLUMNS:
            def _add(sync_conn, table=table, column=column, sql_type=sql_type):
                if column not in _existing_columns(sync_conn, table):
                    sync_conn.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
                    )
                    print(f"[migrate] Added {table}.{column}")
            await conn.run_sync(_add)
