"""Audit trail — who did what, when."""
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc

from auth import require_admin
from database import AsyncSessionLocal
from models import AuditLog
from utils import utc_iso

router = APIRouter(prefix="/api/audit", tags=["audit"])


async def audit_log(username: str, action: str, detail: str = "") -> None:
    """Record an audit entry in its own session. Never raises."""
    try:
        async with AsyncSessionLocal() as db:
            db.add(AuditLog(username=username, action=action, detail=detail[:1000]))
            await db.commit()
    except Exception:
        pass  # auditing must never break the actual operation


@router.get("")
async def list_audit(
    limit: int = Query(100, ge=1, le=500),
    _: Any = Depends(require_admin),
) -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit)
        )
        return [
            {
                "id": a.id,
                "username": a.username,
                "action": a.action,
                "detail": a.detail,
                "timestamp": utc_iso(a.timestamp),
            }
            for a in result.scalars().all()
        ]
