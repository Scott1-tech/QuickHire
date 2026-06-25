"""/api/config and /api/admin/login."""
from fastapi import APIRouter, Request

from .. import anna, config
from ..definitions import CHECKLIST_STEPS, MAIN_DOCS, OTHER_DOCS
from ..docusign import service as docusign

router = APIRouter()


@router.get("/api/config")
async def get_config():
    return {
        "requiresPassword": bool(config.ADMIN_PASSWORD),
        "companyName": config.COMPANY_NAME,
        "checklistSteps": CHECKLIST_STEPS,
        "mainDocs": MAIN_DOCS,
        "otherDocs": OTHER_DOCS,
        "hasMolly": bool(config.ANTHROPIC_API_KEY),
        "hasAnna": True,
        "annaAi": bool(config.ANTHROPIC_API_KEY),
        "annaIntegrations": anna.integration_status(),
        "hasTelegram": bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID),
        "hasEmail": config.email_enabled(),
        "hasSms": config.sms_enabled(),
        "hasDocusign": True,
        "docusign": docusign.status(),
        "linkTtlDays": config.LINK_TTL_DAYS,
    }


@router.post("/api/admin/login")
async def admin_login(request: Request):
    if not config.ADMIN_PASSWORD:
        return {"ok": True}
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": (body or {}).get("password") == config.ADMIN_PASSWORD}
