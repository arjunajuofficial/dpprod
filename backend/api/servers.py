from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from database import get_db
from models import Server, Alert, Metric, ServerEventLog, ServiceMonitor, SmsLog
from schemas import ServerCreate, ServerUpdate, ServerResponse
from auth import require_auth, require_admin
from api.audit import audit_log

router = APIRouter()


@router.get("", response_model=list[ServerResponse])
async def list_servers(db: AsyncSession = Depends(get_db), _=Depends(require_auth)):
    result = await db.execute(select(Server).order_by(Server.site, Server.hostname))
    return result.scalars().all()


@router.post("", response_model=ServerResponse, status_code=201)
async def create_server(body: ServerCreate, payload: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    server = Server(**body.model_dump())
    db.add(server)
    await db.commit()
    await db.refresh(server)
    await audit_log(payload["sub"], "server.create", f"{server.hostname} ({server.ip_address})")
    return server


@router.put("/{server_id}", response_model=ServerResponse)
async def update_server(server_id: int, body: ServerUpdate, payload: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    for key, val in body.model_dump(exclude_none=True).items():
        setattr(server, key, val)
    await db.commit()
    await db.refresh(server)
    await audit_log(payload["sub"], "server.update", f"{server.hostname} ({server.ip_address})")
    return server


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: int, payload: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    hostname = server.hostname
    # Delete/detach child records explicitly — SQLite FK cascade is not enabled
    await db.execute(delete(Alert).where(Alert.server_id == server_id))
    await db.execute(delete(Metric).where(Metric.server_id == server_id))
    await db.execute(delete(ServerEventLog).where(ServerEventLog.server_id == server_id))
    # ServiceMonitor rows cascade their ServiceStatus via ORM relationship
    monitors = await db.execute(select(ServiceMonitor).where(ServiceMonitor.server_id == server_id))
    for m in monitors.scalars().all():
        await db.delete(m)
    await db.execute(update(SmsLog).where(SmsLog.server_id == server_id).values(server_id=None))
    await db.delete(server)
    await db.commit()
    await audit_log(payload["sub"], "server.delete", hostname)


# ── Maintenance mode ─────────────────────────────────────────────────────────

class MaintenanceBody(BaseModel):
    # Minutes from now; null/0 = end maintenance immediately
    minutes: Optional[int] = Field(default=None, ge=0, le=60 * 24 * 30)


@router.put("/{server_id}/maintenance", response_model=ServerResponse)
async def set_maintenance(
    server_id: int,
    body: MaintenanceBody,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    if body.minutes:
        server.maintenance_until = datetime.now(timezone.utc) + timedelta(minutes=body.minutes)
        detail = f"{server.hostname} until {server.maintenance_until.isoformat()}"
        action = "server.maintenance_on"
    else:
        server.maintenance_until = None
        detail = server.hostname
        action = "server.maintenance_off"

    await db.commit()
    await db.refresh(server)
    await audit_log(payload["sub"], action, detail)
    return server
