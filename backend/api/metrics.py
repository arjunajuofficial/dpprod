import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Metric
from schemas import MetricResponse
from auth import require_auth
from utils import utc_iso

router = APIRouter()


@router.get("/{server_id}/export.csv")
async def export_metrics_csv(
    server_id: int,
    limit: int = Query(5000, le=50000),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_auth),
):
    result = await db.execute(
        select(Metric)
        .where(Metric.server_id == server_id)
        .order_by(Metric.timestamp.desc())
        .limit(limit)
    )
    rows = list(reversed(result.scalars().all()))
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "cpu", "ram", "disk", "latency_ms"])
    for m in rows:
        writer.writerow([utc_iso(m.timestamp), m.cpu, m.ram, m.disk, m.latency_ms if m.latency_ms is not None else ""])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=metrics_server_{server_id}.csv"},
    )


@router.get("/{server_id}", response_model=list[MetricResponse])
async def get_metrics(
    server_id: int,
    limit: int = Query(48, le=200),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_auth),
):
    result = await db.execute(
        select(Metric)
        .where(Metric.server_id == server_id)
        .order_by(Metric.timestamp.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return list(reversed(rows))
