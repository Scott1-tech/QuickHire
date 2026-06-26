"""Screening, Telegram, and Twilio inbound (STOP/START) routes."""
import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from .. import config
from ..ai import screen_heuristic, screen_with_ai
from ..deps import require_admin
from ..errors import error
from ..messaging import mark_optout_activity
from ..store import add_optout, find_by_id, remove_optout

router = APIRouter()


@router.post("/api/screen", dependencies=[Depends(require_admin)])
async def screen(request: Request):
    body = await request.json()
    requirements, driver = body.get("requirements"), body.get("driver")
    if not requirements or not driver:
        raise error(400, "requirements and driver are required.")
    if config.ANTHROPIC_API_KEY:
        try:
            result = await screen_with_ai(requirements, driver)
            return {**result, "engine": "ai", "model": config.SCREENING_MODEL}
        except Exception as e:  # noqa: BLE001
            return {**screen_heuristic(requirements, driver), "engine": "rules", "aiError": str(e)}
    return {**screen_heuristic(requirements, driver), "engine": "rules"}


@router.post("/api/telegram/{cid}", dependencies=[Depends(require_admin)])
async def telegram(cid: str):
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        raise error(400, "Telegram integration not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.")
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    submitted = c.get("submittedAt")
    text = (
        f"*New Application — {config.COMPANY_NAME}*\n\n"
        f"Driver: {c.get('name')}\nEmail: {c.get('email')}\nStage: {c.get('stage')}\n"
        f"Submitted: {submitted if submitted else 'Not yet'}"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"},
        )
    data = {}
    try:
        data = r.json()
    except Exception:  # noqa: BLE001
        pass
    if not data.get("ok"):
        raise error(500, data.get("description") or "Telegram error")
    return {"ok": True}


@router.post("/api/twilio/inbound")
async def twilio_inbound(request: Request):
    form = await request.form()
    from_ = form.get("From") or ""
    body = str(form.get("Body") or "").strip().upper()
    stop = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}
    start = {"START", "YES", "UNSTOP"}
    if body in stop:
        await add_optout(from_)
        await mark_optout_activity(from_, True)
    elif body in start:
        await remove_optout(from_)
        await mark_optout_activity(from_, False)
    return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>', media_type="text/xml")
