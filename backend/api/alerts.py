import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Alert
from auth import require_auth
from api.audit import audit_log
from utils import utc_iso

router = APIRouter()


def _format(alert: Alert) -> dict:
    return {
        "id": alert.id,
        "server_id": alert.server_id,
        "server_hostname": alert.server.hostname if alert.server else "unknown",
        "server_site": alert.server.site if alert.server else "",
        "severity": alert.severity,
        "message": alert.message,
        "sms_sent": alert.sms_sent,
        "timestamp": utc_iso(alert.timestamp),
        "resolved_at": utc_iso(alert.resolved_at),
        "acknowledged_at": utc_iso(alert.acknowledged_at),
        "acknowledged_by": alert.acknowledged_by,
    }


@router.get("")
async def list_alerts(
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_auth),
):
    result = await db.execute(
        select(Alert)
        .options(selectinload(Alert.server))
        .order_by(Alert.timestamp.desc())
        .limit(limit)
    )
    return [_format(a) for a in result.scalars().all()]


@router.get("/active")
async def active_alerts(db: AsyncSession = Depends(get_db), _=Depends(require_auth)):
    result = await db.execute(
        select(Alert)
        .options(selectinload(Alert.server))
        .where(Alert.resolved_at.is_(None))
        .order_by(Alert.timestamp.desc())
    )
    return [_format(a) for a in result.scalars().all()]


@router.get("/export.csv")
async def export_alerts_csv(
    limit: int = Query(2000, le=10000),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_auth),
):
    result = await db.execute(
        select(Alert)
        .options(selectinload(Alert.server))
        .order_by(Alert.timestamp.desc())
        .limit(limit)
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "hostname", "site", "severity", "message",
        "timestamp", "resolved_at", "acknowledged_at", "acknowledged_by", "sms_sent",
    ])
    for a in result.scalars().all():
        writer.writerow([
            a.id,
            a.server.hostname if a.server else "unknown",
            a.server.site if a.server else "",
            a.severity,
            a.message,
            utc_iso(a.timestamp),
            utc_iso(a.resolved_at) or "",
            utc_iso(a.acknowledged_at) or "",
            a.acknowledged_by or "",
            a.sms_sent,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=alerts.csv"},
    )


async def _get_alert(db: AsyncSession, alert_id: int) -> Alert:
    result = await db.execute(
        select(Alert).options(selectinload(Alert.server)).where(Alert.id == alert_id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/{alert_id}/ack")
async def acknowledge_alert(
    alert_id: int,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    alert = await _get_alert(db, alert_id)
    if alert.acknowledged_at is None:
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.acknowledged_by = payload["sub"]
        await db.commit()
        await audit_log(payload["sub"], "alert.ack", f"alert #{alert_id}: {alert.message[:80]}")
    return _format(alert)


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    alert = await _get_alert(db, alert_id)
    if alert.resolved_at is None:
        now = datetime.now(timezone.utc)
        alert.resolved_at = now
        if alert.acknowledged_at is None:
            alert.acknowledged_at = now
            alert.acknowledged_by = payload["sub"]
        await db.commit()
        await audit_log(payload["sub"], "alert.resolve", f"alert #{alert_id}: {alert.message[:80]}")
    return _format(alert)
