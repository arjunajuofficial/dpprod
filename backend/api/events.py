from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy import select

from auth import require_auth
from database import AsyncSessionLocal
from models import ServerEventLog
from utils import utc_iso

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/{server_id}")
async def get_server_events(
    server_id: int,
    limit: int = 50,
    _: Any = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ServerEventLog)
            .where(ServerEventLog.server_id == server_id)
            .order_by(ServerEventLog.event_time.desc())
            .limit(limit)
        )
        events = result.scalars().all()
        return [
            {
                "id": e.id,
                "event_id": e.event_id,
                "event_time": utc_iso(e.event_time),
                "source": e.source,
                "level": e.level,
                "message": e.message,
            }
            for e in events
        ]
