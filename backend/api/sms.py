import csv
import io
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc

from auth import require_auth
from database import AsyncSessionLocal
from models import SmsLog, Server
from sms import service as sms_service
from api.audit import audit_log
from utils import utc_iso

router = APIRouter(prefix="/api/sms", tags=["sms"])


def _fmt(entry: SmsLog, hostname: Optional[str]) -> dict:
    return {
        "id": entry.id,
        "server_id": entry.server_id,
        "hostname": hostname,
        "recipient": entry.recipient,
        "message": entry.message,
        "status": entry.status,
        "attempts": entry.attempts,
        "timestamp": utc_iso(entry.timestamp),
        "sent_at": utc_iso(entry.sent_at),
        "error": entry.error,
    }


@router.get("/logs")
async def get_sms_logs(
    limit: int = Query(50, ge=1, le=200),
    _: Any = Depends(require_auth),
) -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SmsLog).order_by(desc(SmsLog.timestamp)).limit(limit)
        )
        logs = result.scalars().all()
        hostnames: dict[int, str] = {}
        server_ids = {l.server_id for l in logs if l.server_id is not None}
        if server_ids:
            srv_result = await db.execute(
                select(Server).where(Server.id.in_(server_ids))
            )
            for s in srv_result.scalars().all():
                hostnames[s.id] = s.hostname
        return [_fmt(l, hostnames.get(l.server_id) if l.server_id else None) for l in logs]


@router.get("/logs/export.csv")
async def export_sms_logs_csv(
    limit: int = Query(2000, ge=1, le=10000),
    _: Any = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SmsLog).order_by(desc(SmsLog.timestamp)).limit(limit)
        )
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "recipient", "message", "status", "attempts", "timestamp", "sent_at", "error"])
        for l in result.scalars().all():
            writer.writerow([
                l.id, l.recipient, l.message, l.status, l.attempts,
                utc_iso(l.timestamp), utc_iso(l.sent_at) or "", l.error or "",
            ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sms_logs.csv"},
    )


class TestSmsBody(BaseModel):
    recipient: Optional[str] = None


@router.post("/test")
async def send_test_sms(body: TestSmsBody, payload: dict = Depends(require_auth)) -> dict:
    await sms_service.enqueue(
        "Test SMS from Station Monitor — if you received this, TG100 is configured correctly.",
        server_id=None,
        recipient=body.recipient,
    )
    await audit_log(payload["sub"], "sms.test", body.recipient or "default destination")
    return {"queued": True}
