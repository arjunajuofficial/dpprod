import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, update

from database import AsyncSessionLocal
from models import SmsLog, Setting
from sms.tg100 import send_sms

log = logging.getLogger("sms_service")

MAX_ATTEMPTS = 3
RETRY_DELAY = 30       # seconds between retry attempts
RATE_WINDOW = 300      # 5-minute rate-limit window per server
QUEUE_SLEEP = 5        # seconds between queue drain passes

_queue: asyncio.Queue = asyncio.Queue()
_rate_cache: dict[Optional[int], datetime] = {}   # rate_key -> last sent time
_rate_key_map: dict[int, int] = {}                 # entry_id -> custom rate key


async def _get_settings() -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Setting))
        rows = result.scalars().all()
        return {r.key: r.value for r in rows}


def _rate_limited(server_id: Optional[int], window: int = RATE_WINDOW) -> bool:
    last = _rate_cache.get(server_id)
    if last is None:
        return False
    return (datetime.now(timezone.utc) - last).total_seconds() < window


async def enqueue(
    message: str,
    server_id: Optional[int] = None,
    recipient: Optional[str] = None,
    _rate_key: Optional[int] = None,   # override rate-limit bucket (None = use server_id)
) -> None:
    cfg = await _get_settings()
    if cfg.get("sms_enabled", "true").lower() != "true":
        return
    dest = recipient or cfg.get("sms_destination", "")
    if not dest:
        log.warning("No SMS destination configured, dropping message.")
        return
    async with AsyncSessionLocal() as db:
        entry = SmsLog(
            server_id=server_id,
            recipient=dest,
            message=message,
            status="queued",
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        log.info("Queued SMS id=%d for %s", entry.id, dest)
    # Store the rate key alongside the entry id so _send_entry uses the right bucket
    if _rate_key is not None:
        _rate_key_map[entry.id] = _rate_key
    await _queue.put(entry.id)


async def _send_entry(entry_id: int) -> None:
    cfg = await _get_settings()

    async with AsyncSessionLocal() as db:
        entry = await db.get(SmsLog, entry_id)
        if entry is None or entry.status == "sent":
            return

        rate_enabled = cfg.get("sms_rate_limit", "true").lower() == "true"
        rate_window  = int(cfg.get("sms_rate_window", str(RATE_WINDOW)))
        rate_key     = _rate_key_map.pop(entry_id, entry.server_id)  # custom bucket or server bucket
        if rate_enabled and _rate_limited(rate_key, rate_window):
            log.info("Rate-limited — skipping SMS id=%d", entry_id)
            await db.execute(
                update(SmsLog)
                .where(SmsLog.id == entry_id)
                .values(status="failed", error="rate-limited")
            )
            await db.commit()
            return

        host = cfg.get("tg100_host", "192.168.1.250")
        gsm_port = cfg.get("tg100_gsm_port", "1")
        username = cfg.get("tg100_username", "apiuser")
        password = cfg.get("tg100_password", "apipass")

        for attempt in range(1, MAX_ATTEMPTS + 1):
            ok, response = await send_sms(host, gsm_port, username, password, entry.recipient, entry.message)
            if ok:
                _rate_cache[rate_key] = datetime.now(timezone.utc)
                await db.execute(
                    update(SmsLog)
                    .where(SmsLog.id == entry_id)
                    .values(status="sent", attempts=attempt, sent_at=datetime.now(timezone.utc), error=None)
                )
                await db.commit()
                log.info("SMS id=%d sent (attempt %d)", entry_id, attempt)
                return
            else:
                log.warning("SMS id=%d attempt %d failed: %s", entry_id, attempt, response)
                if attempt < MAX_ATTEMPTS:
                    await asyncio.sleep(RETRY_DELAY)

        await db.execute(
            update(SmsLog)
            .where(SmsLog.id == entry_id)
            .values(status="failed", attempts=MAX_ATTEMPTS, error=response)
        )
        await db.commit()
        log.error("SMS id=%d failed after %d attempts", entry_id, MAX_ATTEMPTS)


async def sms_worker() -> None:
    log.info("SMS worker started")
    while True:
        try:
            entry_id = await asyncio.wait_for(_queue.get(), timeout=QUEUE_SLEEP)
            await _send_entry(entry_id)
            _queue.task_done()
        except asyncio.TimeoutError:
            pass
        except Exception as e:
            log.exception("SMS worker error: %s", e)
