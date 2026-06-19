"""
Data retention worker — prunes old rows so the database doesn't grow forever.

Retention windows are configurable via Settings (in days; 0 = keep forever):
    metrics_retention_days   (default 30)
    alerts_retention_days    (default 90, resolved alerts only)
    sms_retention_days       (default 90)
    events_retention_days    (default 30)
    audit_retention_days     (default 180)

Runs once shortly after startup, then every RETENTION_INTERVAL seconds.
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, and_

from database import AsyncSessionLocal
from models import Metric, Alert, SmsLog, ServerEventLog, AuditLog

RETENTION_INTERVAL = int(os.getenv("RETENTION_INTERVAL", "3600"))  # seconds


def _cutoff(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


async def run_retention_once() -> dict[str, int]:
    """Prune expired rows. Returns {table: rows_deleted} for logging/tests."""
    from api.settings_routes import get_all_settings
    cfg = await get_all_settings()

    def _days(key: str, default: str) -> int:
        try:
            return max(0, int(cfg.get(key, default) or default))
        except ValueError:
            return int(default)

    plan = {
        "metrics": (_days("metrics_retention_days", "30"),
                    lambda d: delete(Metric).where(Metric.timestamp < _cutoff(d))),
        # Only resolved alerts are pruned — active ones are kept regardless of age
        "alerts": (_days("alerts_retention_days", "90"),
                   lambda d: delete(Alert).where(and_(
                       Alert.resolved_at.is_not(None), Alert.timestamp < _cutoff(d)))),
        "sms_logs": (_days("sms_retention_days", "90"),
                     lambda d: delete(SmsLog).where(SmsLog.timestamp < _cutoff(d))),
        "server_event_logs": (_days("events_retention_days", "30"),
                              lambda d: delete(ServerEventLog).where(ServerEventLog.created_at < _cutoff(d))),
        "audit_logs": (_days("audit_retention_days", "180"),
                       lambda d: delete(AuditLog).where(AuditLog.timestamp < _cutoff(d))),
    }

    deleted: dict[str, int] = {}
    async with AsyncSessionLocal() as session:
        for table, (days, stmt_for) in plan.items():
            if days <= 0:
                deleted[table] = 0
                continue
            result = await session.execute(stmt_for(days))
            deleted[table] = result.rowcount or 0
        await session.commit()

    total = sum(deleted.values())
    if total:
        print(f"[retention] Pruned {total} rows: " +
              ", ".join(f"{t}={n}" for t, n in deleted.items() if n))
    return deleted


async def retention_loop() -> None:
    await asyncio.sleep(60)  # let startup settle first
    print(f"[retention] Worker started — runs every {RETENTION_INTERVAL}s")
    while True:
        try:
            await run_retention_once()
        except asyncio.CancelledError:
            print("[retention] Cancelled.")
            return
        except Exception as e:
            print(f"[retention] Error: {e}")
        await asyncio.sleep(RETENTION_INTERVAL)
