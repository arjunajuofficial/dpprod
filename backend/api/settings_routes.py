from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from auth import require_auth, require_admin
from database import AsyncSessionLocal
from models import Setting
from api.audit import audit_log

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULTS: dict[str, str] = {
    "tg100_host": "192.168.1.250",
    "tg100_gsm_port": "1",
    "tg100_username": "apiuser",
    "tg100_password": "apipass",
    "sms_destination": "+91XXXXXXXXXX",
    "sms_enabled": "true",
    "sms_on_recovery": "true",
    "sms_rate_limit": "true",
    "sms_rate_window": "300",
    "watch_event_ids": "6008",
    "ping_interval": "15",
    "agent_interval": "30",
    "metrics_interval": "60",
    "offline_threshold": "3",
    "cpu_threshold": "85",
    "ram_threshold": "85",
    "disk_threshold": "90",
    "latency_threshold": "100",
    # Email notifications
    "email_enabled": "false",
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_user": "",
    "smtp_password": "",
    "smtp_tls": "true",
    "email_from": "",
    "email_to": "",
    # Webhook notifications (Slack/Teams/generic JSON POST)
    "webhook_enabled": "false",
    "webhook_url": "",
    # Data retention (days; 0 = keep forever)
    "metrics_retention_days": "30",
    "alerts_retention_days": "90",
    "sms_retention_days": "90",
    "events_retention_days": "30",
    "audit_retention_days": "180",
}

# Keys whose values must never be returned in plain text is overkill for an
# internal NOC tool, but never log them to the audit trail:
_SENSITIVE = {"tg100_password", "smtp_password", "db_password", "ssh_password"}


async def get_all_settings() -> dict[str, str]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Setting))
        rows = result.scalars().all()
        merged = dict(DEFAULTS)
        merged.update({r.key: r.value for r in rows})
        return merged


@router.get("")
async def read_settings(_: Any = Depends(require_auth)) -> dict[str, str]:
    return await get_all_settings()


class SettingsPatch(BaseModel):
    settings: dict[str, str]


@router.put("")
async def update_settings(body: SettingsPatch, payload: dict = Depends(require_admin)) -> dict[str, str]:
    async with AsyncSessionLocal() as db:
        for key, value in body.settings.items():
            existing = await db.get(Setting, key)
            if existing:
                existing.value = value
                existing.updated_at = datetime.now(timezone.utc)
            else:
                db.add(Setting(key=key, value=value))
        await db.commit()
    changed = [k for k in body.settings.keys() if k not in _SENSITIVE]
    await audit_log(payload["sub"], "settings.update", ", ".join(sorted(changed)))
    return await get_all_settings()
