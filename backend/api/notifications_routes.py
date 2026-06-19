"""Test endpoints for email/webhook notification channels."""
from fastapi import APIRouter, Depends

from auth import require_admin
from api.audit import audit_log
import notifications

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.post("/test-email")
async def test_email(payload: dict = Depends(require_admin)) -> dict:
    ok, detail = await notifications.send_email(
        "Test email from Station Monitor — SMTP is configured correctly.",
        subject="[TEST] Station Monitor",
    )
    await audit_log(payload["sub"], "notifications.test_email", detail)
    return {"ok": ok, "detail": detail}


@router.post("/test-webhook")
async def test_webhook(payload: dict = Depends(require_admin)) -> dict:
    ok, detail = await notifications.send_webhook(
        "Test webhook from Station Monitor — endpoint is configured correctly.",
        severity="info",
    )
    await audit_log(payload["sub"], "notifications.test_webhook", detail)
    return {"ok": ok, "detail": detail}
