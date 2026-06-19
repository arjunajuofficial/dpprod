from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import require_auth, require_admin
from database import get_db
from models import Server, ServiceMonitor, ServiceStatus
from schemas import ServiceMonitorCreate, ServiceMonitorUpdate, ServiceMonitorResponse
from agent_client import agent_headers

router = APIRouter()


# ── List ─────────────────────────────────────────────────────────────────────

@router.get("/api/servers/{server_id}/services", response_model=list[ServiceMonitorResponse])
async def list_services(
    server_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_auth),
):
    result = await db.execute(
        select(ServiceMonitor)
        .where(ServiceMonitor.server_id == server_id)
        .options(selectinload(ServiceMonitor.current_status))
        .order_by(ServiceMonitor.display_name)
    )
    return result.scalars().all()


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/api/servers/{server_id}/services", response_model=ServiceMonitorResponse, status_code=201)
async def create_service(
    server_id: int,
    body: ServiceMonitorCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_admin),
):
    monitor = ServiceMonitor(server_id=server_id, **body.model_dump())
    db.add(monitor)
    await db.commit()
    await db.refresh(monitor, ["current_status"])
    return monitor


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/api/servers/{server_id}/services/{monitor_id}", response_model=ServiceMonitorResponse)
async def update_service(
    server_id: int,
    monitor_id: int,
    body: ServiceMonitorUpdate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_admin),
):
    result = await db.execute(
        select(ServiceMonitor)
        .where(ServiceMonitor.id == monitor_id, ServiceMonitor.server_id == server_id)
        .options(selectinload(ServiceMonitor.current_status))
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Service monitor not found")
    for key, val in body.model_dump(exclude_none=True).items():
        setattr(monitor, key, val)
    monitor.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(monitor, ["current_status"])
    return monitor


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/api/servers/{server_id}/services/{monitor_id}", status_code=204)
async def delete_service(
    server_id: int,
    monitor_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_admin),
):
    result = await db.execute(
        select(ServiceMonitor).where(
            ServiceMonitor.id == monitor_id,
            ServiceMonitor.server_id == server_id,
        )
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Service monitor not found")
    await db.delete(monitor)
    await db.commit()


# ── Force-check: immediately check all service monitors and return fresh status ─

@router.post("/api/servers/{server_id}/services/check-now", response_model=list[ServiceMonitorResponse])
async def check_services_now(
    server_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_auth),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    if server.status != "offline":
        from worker.monitor import _check_service_monitors
        await _check_service_monitors(db, server)
        await db.commit()

    # Return fresh data
    result2 = await db.execute(
        select(ServiceMonitor)
        .where(ServiceMonitor.server_id == server_id)
        .options(selectinload(ServiceMonitor.current_status))
        .order_by(ServiceMonitor.display_name)
    )
    return result2.scalars().all()


# ── Discover Windows services via agent ───────────────────────────────────────

@router.post("/api/servers/{server_id}/services/discover")
async def discover_services(
    server_id: int,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(require_auth),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"http://{server.ip_address}:{server.agent_port}/services/discover",
                headers=agent_headers(),
            )
            if r.status_code == 200:
                return r.json()
            raise HTTPException(status_code=502, detail=f"Agent returned {r.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Agent unreachable: {e}")
