"""
Unified alert notification dispatch.

`dispatch()` fans an alert message out to every enabled channel:
  - SMS  (Yeastar TG100, existing sms.service queue — has its own rate limiting)
  - Email (SMTP, stdlib smtplib executed in a thread so the event loop never blocks)
  - Webhook (generic JSON POST — works with Slack/Teams/Discord-style endpoints)

Email/webhook share a simple per-rate-key cooldown so a flapping server cannot
spam an inbox, mirroring the SMS rate-limit behaviour.
"""
import asyncio
import logging
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Optional

import httpx

import sms.service as sms_service

log = logging.getLogger("notifications")

_last_sent: dict[tuple[str, int | None], datetime] = {}  # (channel, rate_key) -> time


async def _get_settings() -> dict:
    from api.settings_routes import get_all_settings
    return await get_all_settings()


def _cooled_down(channel: str, rate_key: Optional[int], window: int) -> bool:
    if window <= 0:
        return True
    last = _last_sent.get((channel, rate_key))
    if last is None:
        return True
    return (datetime.now(timezone.utc) - last).total_seconds() >= window


def _mark_sent(channel: str, rate_key: Optional[int]) -> None:
    _last_sent[(channel, rate_key)] = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def _send_email_sync(cfg: dict, subject: str, body: str) -> None:
    host = cfg.get("smtp_host", "")
    port = int(cfg.get("smtp_port", "587") or "587")
    user = cfg.get("smtp_user", "")
    password = cfg.get("smtp_password", "")
    use_tls = cfg.get("smtp_tls", "true").lower() == "true"
    sender = cfg.get("email_from", user or "station-monitor@localhost")
    recipients = [r.strip() for r in cfg.get("email_to", "").split(",") if r.strip()]
    if not host or not recipients:
        raise ValueError("SMTP host or recipients not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if use_tls:
            smtp.starttls(context=ssl.create_default_context())
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)


async def send_email(message: str, subject: str = "Station Monitor Alert") -> tuple[bool, str]:
    cfg = await _get_settings()
    if cfg.get("email_enabled", "false").lower() != "true":
        return False, "email disabled"
    try:
        await asyncio.to_thread(_send_email_sync, cfg, subject, message)
        return True, "sent"
    except Exception as e:
        log.warning("Email send failed: %s", e)
        return False, str(e)


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

async def send_webhook(message: str, severity: str = "info",
                       hostname: str = "", site: str = "") -> tuple[bool, str]:
    cfg = await _get_settings()
    if cfg.get("webhook_enabled", "false").lower() != "true":
        return False, "webhook disabled"
    url = cfg.get("webhook_url", "").strip()
    if not url:
        return False, "no webhook URL configured"
    payload = {
        "text": message,                       # Slack/Teams-compatible
        "message": message,
        "severity": severity,
        "hostname": hostname,
        "site": site,
        "source": "station-monitor",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
            ok = r.status_code < 300
            return ok, f"HTTP {r.status_code}"
    except Exception as e:
        log.warning("Webhook send failed: %s", e)
        return False, str(e)


# ---------------------------------------------------------------------------
# Unified dispatch
# ---------------------------------------------------------------------------

async def dispatch(
    message: str,
    server_id: Optional[int] = None,
    severity: str = "critical",
    hostname: str = "",
    site: str = "",
    rate_key: Optional[int] = None,   # None = use server_id bucket
) -> None:
    """Send `message` through every enabled channel. Never raises."""
    bucket = rate_key if rate_key is not None else server_id
    try:
        cfg = await _get_settings()
    except Exception as e:
        log.error("Could not load settings for dispatch: %s", e)
        return

    window = int(cfg.get("sms_rate_window", "300") or "300")

    # SMS — existing queue handles retries + its own rate limiting
    try:
        await sms_service.enqueue(message, server_id=server_id, _rate_key=rate_key)
    except Exception as e:
        log.error("SMS enqueue failed: %s", e)

    # Email
    if cfg.get("email_enabled", "false").lower() == "true" and _cooled_down("email", bucket, window):
        ok, _ = await send_email(message, subject=f"[{severity.upper()}] Station Monitor")
        if ok:
            _mark_sent("email", bucket)

    # Webhook
    if cfg.get("webhook_enabled", "false").lower() == "true" and _cooled_down("webhook", bucket, window):
        ok, _ = await send_webhook(message, severity=severity, hostname=hostname, site=site)
        if ok:
            _mark_sent("webhook", bucket)
