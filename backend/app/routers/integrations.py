"""Unified communications + FMCSA integration API.

Exposes the documented RingCentral / Email / FMCSA surface used by the SPA. It
reuses the existing real integrations (``ringcentral.send_sms`` JWT OAuth,
``messaging.deliver_email`` Resend/SMTP, ``messaging.deliver_sms`` Twilio, and the
FMCSA SAFER WebServices API) and degrades to demo responses when credentials are
absent. Multi-number/inbox config, message history and the FMCSA watchlist are
persisted in the KV store so they survive restarts.
"""
import json
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Request

from .. import config, messaging, ringcentral
from ..deps import require_admin
from ..errors import error
from ..store import add_optout, find_by_id, kv_delete, kv_get, kv_set, new_uuid

router = APIRouter()

FMCSA_KEY = os.environ.get("FMCSA_API_KEY", "")
_now = lambda: datetime.now(timezone.utc).isoformat()


# ── KV-backed collections ─────────────────────────────────────────────────────
async def _get(key: str, default):
    raw = await kv_get(key)
    if raw is None:
        await kv_set(key, json.dumps(default))
        return default
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return default


async def _set(key: str, value) -> None:
    await kv_set(key, json.dumps(value))


_RC_DEFAULT = [
    {"id": "rc1", "phoneNumber": "+1 214-555-1000", "label": "Recruiting Main", "extensionId": "EXT-101", "smsEnabled": True, "callsEnabled": True, "assignedUser": "Nina Patel", "assignedTeam": "Recruiting", "receiveSms": True, "receiveCalls": True, "sharedInbox": True, "defaultOutbound": True, "active": True},
    {"id": "rc2", "phoneNumber": "+1 214-555-1010", "label": "Compliance Line", "extensionId": "EXT-110", "smsEnabled": True, "callsEnabled": True, "assignedUser": "Dana Reed", "assignedTeam": "Compliance", "receiveSms": True, "receiveCalls": True, "sharedInbox": True, "defaultOutbound": False, "active": True},
    {"id": "rc3", "phoneNumber": "+1 469-555-2200", "label": "Dispatch", "extensionId": "EXT-120", "smsEnabled": True, "callsEnabled": True, "assignedUser": "Sam Pike", "assignedTeam": "Dispatch", "receiveSms": False, "receiveCalls": True, "sharedInbox": False, "defaultOutbound": False, "active": True},
]
_EMAIL_DEFAULT = [
    {"id": "em1", "emailAddress": "recruiting@quickhire.com", "label": "Recruiting", "provider": "Gmail", "assignedUser": "Nina Patel", "assignedTeam": "Recruiting", "receiveEmails": True, "sendEmails": True, "sharedInbox": True, "defaultOutbound": True, "signature": "QuickHire Recruiting", "active": True},
    {"id": "em3", "emailAddress": "compliance@quickhire.com", "label": "Compliance", "provider": "Outlook", "assignedUser": "Dana Reed", "assignedTeam": "Compliance", "receiveEmails": True, "sendEmails": True, "sharedInbox": True, "defaultOutbound": False, "signature": "QuickHire Compliance", "active": True},
]

K_RC, K_EMAIL, K_MSGS, K_WATCH = "integ:rc_numbers", "integ:email_inboxes", "integ:messages", "integ:fmcsa_watchlist"


async def _append_message(m: dict) -> dict:
    msgs = await _get(K_MSGS, [])
    msgs.append(m)
    await _set(K_MSGS, msgs[-2000:])
    return m


def _msg(driver_id, channel, direction, frm, to, body, status, **extra) -> dict:
    return {"id": new_uuid(), "driverId": driver_id, "candidateId": driver_id, "carrierId": extra.get("carrierId"),
            "channel": channel, "direction": direction, "from": frm, "to": to, "subject": extra.get("subject"),
            "body": body, "status": status, "providerMessageId": extra.get("providerMessageId"),
            "createdAt": _now(), "createdBy": extra.get("createdBy", "system"), "assignedTo": extra.get("assignedTo"),
            "via": extra.get("via")}


# ══════════════════════════ RingCentral ══════════════════════════
@router.get("/api/ringcentral/status", dependencies=[Depends(require_admin)])
async def rc_status():
    return {"type": "ringcentral", "connected": ringcentral.is_configured(),
            "status": "connected" if ringcentral.is_configured() else "demo",
            "accountId": os.environ.get("RINGCENTRAL_ACCOUNT_ID", "~"),
            "extensionId": os.environ.get("RINGCENTRAL_EXTENSION_ID", "~"),
            "webhookStatus": "active", "lastSyncAt": _now()}


@router.get("/api/ringcentral/numbers", dependencies=[Depends(require_admin)])
async def rc_numbers():
    return await _get(K_RC, _RC_DEFAULT)


@router.patch("/api/ringcentral/numbers/{nid}/settings", dependencies=[Depends(require_admin)])
async def rc_patch(nid: str, request: Request):
    body = await request.json()
    nums = await _get(K_RC, _RC_DEFAULT)
    found = None
    for n in nums:
        if n["id"] == nid:
            n.update({k: v for k, v in body.items() if k in n})
            found = n
        elif body.get("defaultOutbound") and n.get("defaultOutbound"):
            n["defaultOutbound"] = False  # single default
    if not found:
        raise error(404, "Number not found")
    await _set(K_RC, nums)
    return found


@router.post("/api/ringcentral/sync", dependencies=[Depends(require_admin)])
async def rc_sync():
    """Pull the account's real phone numbers from RingCentral and merge them into
    the stored config, preserving per-number routing toggles by phone number."""
    stored = await _get(K_RC, _RC_DEFAULT)
    live = await ringcentral.list_phone_numbers()
    if not live:
        return {"ok": True, "simulated": True, "numbers": stored, "message": "RingCentral not configured — set RINGCENTRAL_* env vars."}
    by_phone = {n.get("phoneNumber"): n for n in stored}
    merged = []
    for L in live:
        ex = by_phone.get(L["phoneNumber"])
        if ex:
            ex.update({k: L[k] for k in ("label", "extensionId", "smsEnabled", "callsEnabled")})
            if not ex.get("assignedUser") and L.get("assignedUser"):
                ex["assignedUser"] = L["assignedUser"]
            merged.append(ex)
        else:
            merged.append({"id": new_uuid(), "phoneNumber": L["phoneNumber"], "label": L["label"], "extensionId": L["extensionId"],
                           "smsEnabled": L["smsEnabled"], "callsEnabled": L["callsEnabled"], "assignedUser": L.get("assignedUser", ""),
                           "assignedTeam": "", "receiveSms": L["smsEnabled"], "receiveCalls": L["callsEnabled"],
                           "sharedInbox": False, "defaultOutbound": False, "active": True})
    if merged and not any(n.get("defaultOutbound") for n in merged):
        sms_first = next((n for n in merged if n.get("smsEnabled")), merged[0])
        sms_first["defaultOutbound"] = True
    await _set(K_RC, merged)
    return {"ok": True, "simulated": False, "numbers": merged}


@router.post("/api/ringcentral/test-sms", dependencies=[Depends(require_admin)])
async def rc_test_sms(request: Request):
    body = await request.json()
    to = body.get("to") or os.environ.get("TEST_PHONE", "")
    text = body.get("text") or "QuickHire RingCentral test message."
    if ringcentral.is_configured() and to:
        res = await ringcentral.send_sms(to, text)
        return {"ok": res.get("ok", False), "simulated": False, **res}
    return {"ok": True, "simulated": True, "message": "Configure RingCentral env vars for live SMS."}


@router.post("/api/drivers/{did}/sms", dependencies=[Depends(require_admin)])
async def driver_sms(did: str, request: Request):
    body = await request.json()
    to, text = body.get("to", ""), body.get("body") or body.get("text", "")
    via = body.get("from") or body.get("via") or "rc1"
    res, status, simulated = {}, "sent", True
    if to and ringcentral.is_configured():
        res = await ringcentral.send_sms(to, text); simulated = False
        status = "sent" if res.get("ok") else "failed"
    elif to and config.sms_enabled():
        res = await messaging.deliver_sms(to, text); simulated = False
        status = "sent" if res.get("ok") else "failed"
    m = await _append_message(_msg(did, "sms", "outbound", body.get("fromNumber", ""), to, text, status, via=via, providerMessageId=res.get("messageId"), createdBy=body.get("createdBy", "recruiter")))
    return {"ok": status != "failed", "simulated": simulated, "message": m}


@router.post("/api/drivers/{did}/call-log", dependencies=[Depends(require_admin)])
async def driver_call_log(did: str, request: Request):
    body = await request.json()
    outcome = body.get("outcome", "connected")
    to, notes, dur = body.get("to", ""), body.get("notes", ""), int(body.get("durationSec") or 0)
    if ringcentral.is_configured() and to:
        try:
            await ringcentral.log_call(to, outcome, dur, notes)
        except Exception:  # noqa: BLE001
            pass
    channel = "voicemail" if outcome == "left_voicemail" else "call"
    m = await _append_message(_msg(did, channel, "outbound", body.get("from", ""), to, notes or outcome, "completed", via=body.get("via", "rc1"), createdBy=body.get("createdBy", "recruiter")))
    m["callOutcome"] = outcome
    return {"ok": True, "message": m}


@router.get("/api/drivers/{did}/messages", dependencies=[Depends(require_admin)])
async def driver_messages(did: str):
    msgs = await _get(K_MSGS, [])
    return [m for m in msgs if m.get("driverId") == did]


@router.post("/api/ringcentral/webhook")
async def rc_webhook(request: Request):
    """Inbound SMS / call / voicemail notifications from RingCentral."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    # RingCentral validation handshake
    vt = request.headers.get("validation-token")
    if vt:
        from fastapi.responses import Response
        return Response(status_code=200, headers={"Validation-Token": vt})
    msg = (body.get("body") or {})
    text = msg.get("subject") or msg.get("text") or ""
    frm = ((msg.get("from") or {}).get("phoneNumber")) or ""
    if text.strip().upper() in {"STOP", "UNSUBSCRIBE", "QUIT"} and frm:
        await add_optout(frm)
    await _append_message(_msg(None, "sms", "inbound", frm, "", text, "received", via="rc1"))
    return {"ok": True}


# ══════════════════════════ Email ══════════════════════════
def _email_connected() -> bool:
    return bool(config.RESEND_API_KEY or config.SMTP_HOST)


@router.get("/api/email/status", dependencies=[Depends(require_admin)])
async def email_status():
    provider = "Resend" if config.RESEND_API_KEY else ("SMTP" if config.SMTP_HOST else "demo")
    return {"type": "email", "connected": _email_connected(), "provider": provider,
            "status": "connected" if _email_connected() else "demo", "lastSyncAt": _now()}


@router.get("/api/email/inboxes", dependencies=[Depends(require_admin)])
async def email_inboxes():
    return await _get(K_EMAIL, _EMAIL_DEFAULT)


@router.patch("/api/email/inboxes/{iid}/settings", dependencies=[Depends(require_admin)])
async def email_patch(iid: str, request: Request):
    body = await request.json()
    boxes = await _get(K_EMAIL, _EMAIL_DEFAULT)
    found = None
    for b in boxes:
        if b["id"] == iid:
            b.update({k: v for k, v in body.items() if k in b}); found = b
        elif body.get("defaultOutbound") and b.get("defaultOutbound"):
            b["defaultOutbound"] = False
    if not found:
        raise error(404, "Inbox not found")
    await _set(K_EMAIL, boxes)
    return found


@router.post("/api/email/test-send", dependencies=[Depends(require_admin)])
async def email_test(request: Request):
    body = await request.json()
    to = body.get("to") or config.NOTIFY_EMAIL
    if _email_connected() and to:
        res = await messaging.deliver_email(to, "QuickHire email test", "<p>This is a QuickHire test email.</p>")
        return {"ok": res.get("ok", False), "simulated": False, **res}
    return {"ok": True, "simulated": True, "message": "Configure RESEND_API_KEY or SMTP_* for live email."}


@router.post("/api/drivers/{did}/email", dependencies=[Depends(require_admin)])
async def driver_email(did: str, request: Request):
    body = await request.json()
    to, subject = body.get("to", ""), body.get("subject", "")
    html = body.get("html") or f"<div style='font-family:Inter,Arial,sans-serif;white-space:pre-wrap'>{body.get('body','')}</div>"
    status, simulated, res = "sent", True, {}
    if to and _email_connected():
        res = await messaging.deliver_email(to, subject, html, body.get("body")); simulated = False
        status = "sent" if res.get("ok") else "failed"
    m = await _append_message(_msg(did, "email", "outbound", body.get("from", ""), to, body.get("body", ""), status, subject=subject, via=body.get("via", "em1"), providerMessageId=res.get("id"), createdBy=body.get("createdBy", "recruiter")))
    return {"ok": status != "failed", "simulated": simulated, "message": m}


@router.get("/api/drivers/{did}/emails", dependencies=[Depends(require_admin)])
async def driver_emails(did: str):
    msgs = await _get(K_MSGS, [])
    return [m for m in msgs if m.get("driverId") == did and m.get("channel") == "email"]


@router.post("/api/email/webhook")
async def email_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    frm = body.get("from") or body.get("sender") or ""
    subject = body.get("subject") or ""
    text = body.get("text") or body.get("body") or ""
    if "unsubscribe" in text.lower() or "stop" == text.strip().lower():
        # record communication preference (no phone to opt out; flag in message)
        pass
    await _append_message(_msg(None, "email", "inbound", frm, "", text, "received", subject=subject, via="em1"))
    return {"ok": True}


# ══════════════════════════ FMCSA ══════════════════════════
async def _fmcsa_fetch(dot: str = "", mc: str = ""):
    if not FMCSA_KEY:
        return None
    base = "https://mobile.fmcsa.dot.gov/qc/services"
    url = f"{base}/carriers/{dot}?webKey={FMCSA_KEY}" if dot else f"{base}/carriers/mc/{mc}?webKey={FMCSA_KEY}"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers={"Accept": "application/json"})
        r.raise_for_status()
        content = r.json().get("content") or {}
    c = content.get("carrier") if isinstance(content.get("carrier"), dict) else content
    return {"legalName": c.get("legalName") or c.get("name") or "", "dbaName": c.get("dbaName") or "",
            "dotNumber": c.get("dotNumber") or dot, "mcNumber": c.get("mcNumber") or mc,
            "operatingStatus": c.get("operatingStatus") or "", "authorityStatus": c.get("allowedToOperate") or "",
            "phone": c.get("telephone") or "", "powerUnits": c.get("totalPowerUnits"), "drivers": c.get("totalDrivers"),
            "safetyRating": c.get("safetyRating") or "None",
            "physicalAddress": f"{c.get('phyStreet','')}, {c.get('phyCity','')}, {c.get('phyState','')} {c.get('phyZipcode','')}".strip(", ")}


@router.get("/api/fmcsa/status", dependencies=[Depends(require_admin)])
async def fmcsa_status():
    return {"type": "fmcsa", "configured": bool(FMCSA_KEY), "dataMode": "api" if FMCSA_KEY else "demo",
            "status": "connected" if FMCSA_KEY else "demo", "lastSyncAt": _now(),
            "note": "PSP & Clearinghouse require authorized consent and are not part of public SAFER lookup."}


@router.post("/api/fmcsa/test-lookup", dependencies=[Depends(require_admin)])
async def fmcsa_test_lookup():
    try:
        live = await _fmcsa_fetch(dot="998812")
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "simulated": bool(not FMCSA_KEY), "error": str(e)}
    if live:
        return {"ok": True, "simulated": False, "carrier": live}
    return {"ok": True, "simulated": True, "carrier": {"legalName": "MIDWEST FREIGHT LINES LLC", "dotNumber": "998812", "operatingStatus": "Active"}}


@router.get("/api/fmcsa/watchlist", dependencies=[Depends(require_admin)])
async def fmcsa_watchlist():
    return await _get(K_WATCH, [])


@router.post("/api/fmcsa/watchlist", dependencies=[Depends(require_admin)])
async def fmcsa_watch_add(request: Request):
    body = await request.json()
    wl = await _get(K_WATCH, [])
    if any(w.get("dotNumber") == body.get("dotNumber") for w in wl):
        return {"ok": True, "duplicate": True}
    entry = {"id": new_uuid(), "dotNumber": body.get("dotNumber"), "mcNumber": body.get("mcNumber"),
             "name": body.get("legalName") or body.get("name"), "authorityStatus": body.get("authorityStatus"),
             "safetyRating": body.get("safetyRating"), "powerUnits": body.get("powerUnits"), "drivers": body.get("drivers"),
             "addedAt": _now(), "lastChecked": _now(), "change": None}
    wl.append(entry)
    await _set(K_WATCH, wl)
    return {"ok": True, "entry": entry}


@router.delete("/api/fmcsa/watchlist/{wid}", dependencies=[Depends(require_admin)])
async def fmcsa_watch_remove(wid: str):
    wl = await _get(K_WATCH, [])
    wl = [w for w in wl if w.get("id") != wid]
    await _set(K_WATCH, wl)
    return {"ok": True}
