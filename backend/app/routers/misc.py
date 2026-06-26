"""Screening, Telegram, Twilio inbound, FMCSA lookup, compliance, RingCentral, and notifications."""
import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from .. import config
from ..ai import screen_heuristic, screen_with_ai
from ..definitions import MAIN_DOCS, STEP_IDS, expiring_docs, now_iso
from ..deps import require_admin
from ..errors import error
from ..messaging import mark_optout_activity
from ..store import add_activity, add_optout, find_by_id, read_all, remove_optout, upsert

router = APIRouter()


# ── Screening ────────────────────────────────────────────────────────────────

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


# ── Telegram ─────────────────────────────────────────────────────────────────

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


# ── Twilio inbound ───────────────────────────────────────────────────────────

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


# ── FMCSA DOT / MC Lookup ───────────────────────────────────────────────────

_FMCSA_KEY = lambda: config.__dict__.get("FMCSA_API_KEY") or __import__("os").environ.get("FMCSA_API_KEY", "")


@router.get("/api/fmcsa/lookup", dependencies=[Depends(require_admin)])
async def fmcsa_lookup(dot: str = "", mc: str = ""):
    """Look up a carrier by DOT or MC number using the FMCSA WebServices API."""
    key = _FMCSA_KEY()
    if not dot and not mc:
        raise error(400, "Provide a dot or mc number.")

    if not key:
        # Return mock/demo data when no key is configured
        return {
            "simulated": True,
            "legalName": "Demo Carrier LLC",
            "dbaName": "",
            "dotNumber": dot or "1234567",
            "mcNumber": mc or "MC-123456",
            "physicalAddress": {"street": "123 Trucking Blvd", "city": "Dallas", "state": "TX", "zip": "75001", "country": "US"},
            "phone": "(214) 555-0100",
            "operatingStatus": "AUTHORIZED FOR Property",
            "carrierOperation": "Interstate",
            "message": "Configure FMCSA_API_KEY in environment for live data.",
        }

    try:
        base = "https://mobile.fmcsa.dot.gov/qc/services"
        if dot:
            url = f"{base}/carriers/{dot}?webKey={key}"
        else:
            url = f"{base}/carriers/mc/{mc}?webKey={key}"

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
            r.raise_for_status()
            data = r.json()

        carrier = data.get("content") or {}
        addr = carrier.get("phyStreet", "")
        return {
            "simulated": False,
            "legalName": carrier.get("legalName") or carrier.get("name") or "",
            "dbaName": carrier.get("dbaName") or "",
            "dotNumber": carrier.get("dotNumber") or dot,
            "mcNumber": carrier.get("mcNumber") or mc,
            "physicalAddress": {
                "street": carrier.get("phyStreet") or "",
                "city": carrier.get("phyCity") or "",
                "state": carrier.get("phyState") or "",
                "zip": carrier.get("phyZip") or "",
                "country": carrier.get("phyCountry") or "US",
            },
            "phone": carrier.get("telephone") or "",
            "operatingStatus": carrier.get("operatingStatus") or "",
            "carrierOperation": carrier.get("carrierOperation") or "",
            "totalDrivers": carrier.get("totalDrivers"),
            "totalTrucks": carrier.get("totalTrucks"),
        }
    except httpx.HTTPStatusError as e:
        raise error(502, f"FMCSA API error: {e.response.status_code}")
    except Exception as e:  # noqa: BLE001
        raise error(502, f"FMCSA lookup failed: {e}")


# ── RingCentral SMS & Calls ──────────────────────────────────────────────────

@router.post("/api/candidates/{cid}/sms", dependencies=[Depends(require_admin)])
async def send_candidate_sms(cid: str, request: Request):
    """Send an SMS to a candidate via RingCentral."""
    from ..ringcentral import is_configured as rc_configured, send_sms
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    text = body.get("text") or ""
    to = body.get("to") or c.get("phone") or ""
    if not text.strip():
        raise error(400, "Message text is required.")
    if not to:
        raise error(400, "Candidate has no phone number.")

    if rc_configured():
        result = await send_sms(to, text)
        if not result.get("ok"):
            raise error(502, result.get("error") or "SMS send failed")
        add_activity(c, "sms_sent", "Admin", f"SMS sent via RingCentral: {text[:80]}{'…' if len(text) > 80 else ''}", channel="ringcentral", to=to)
    else:
        # Log as manual activity even without RC configured
        add_activity(c, "sms_logged", "Admin", f"SMS (manual): {text[:120]}{'…' if len(text) > 120 else ''}", channel="sms", to=to)

    c["lastActivityAt"] = now_iso()
    await upsert(c)
    return {"ok": True, "simulated": not rc_configured()}


@router.post("/api/candidates/{cid}/call-log", dependencies=[Depends(require_admin)])
async def log_candidate_call(cid: str, request: Request):
    """Log a call result on a candidate record."""
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    result = body.get("result") or "connected"
    duration = int(body.get("duration") or 0)
    notes = body.get("notes") or ""
    to = body.get("to") or c.get("phone") or ""
    valid_results = ["connected", "no_answer", "voicemail", "bad_number", "follow_up_needed"]
    if result not in valid_results:
        raise error(400, f"result must be one of: {', '.join(valid_results)}")

    result_labels = {
        "connected": "Connected", "no_answer": "No Answer", "voicemail": "Left Voicemail",
        "bad_number": "Bad Number", "follow_up_needed": "Follow-up Needed",
    }
    label = result_labels.get(result, result)
    note = f"Call logged: {label}" + (f" — {duration}s" if duration else "") + (f" — {notes}" if notes else "")
    add_activity(c, "call_logged", "Admin", note, channel="ringcentral", to=to, result=result, duration=duration, notes=notes)
    c["lastActivityAt"] = now_iso()
    await upsert(c)
    return {"ok": True}


# ── Compliance Dashboard ─────────────────────────────────────────────────────

def _compliance_score(c: dict) -> dict:
    """Compute a compliance snapshot for a candidate."""
    docs = c.get("documents") or {}
    checklist = c.get("checklist") or {}
    application = c.get("application") or {}

    missing_docs = [d["label"] for d in MAIN_DOCS if not docs.get(d["id"])]
    expired = expiring_docs(c)
    expiring_soon = [e for e in expired if e.get("daysLeft") is not None and 0 < e.get("daysLeft", 99) <= 30]
    actually_expired = [e for e in expired if e.get("daysLeft") is not None and e.get("daysLeft", 1) <= 0]

    complete_steps = len([sid for sid in STEP_IDS if (checklist.get(sid) or {}).get("status") == "complete"])
    total_steps = len(STEP_IDS)

    # Application completeness
    app_fields = ["firstName", "lastName", "email", "phone", "cdlNumber", "cdlState", "dateOfBirth"]
    app_filled = sum(1 for f in app_fields if application.get(f))
    app_pct = round((app_filled / len(app_fields)) * 100)

    # Experience fit (simple score)
    years = application.get("yearsExperience") or application.get("years") or 0
    try:
        years_num = int(str(years).split()[0]) if years else 0
    except (ValueError, IndexError):
        years_num = 0
    exp_score = min(years_num * 10, 100)

    # Compliance risk
    dui = application.get("dui") == "Yes"
    sap = application.get("sap") == "Yes"
    accidents = application.get("accidents") == "Yes"
    risk = "high" if dui or sap else ("medium" if accidents else "low")

    # Recommended next action
    if missing_docs:
        recommended = f"Request: {missing_docs[0]}"
    elif actually_expired:
        recommended = f"Renew expired: {actually_expired[0]['label']}"
    elif expiring_soon:
        recommended = f"Expiring soon: {expiring_soon[0]['label']}"
    elif complete_steps < total_steps:
        next_step = next((sid for sid in STEP_IDS if (checklist.get(sid) or {}).get("status") != "complete"), None)
        if next_step:
            from ..definitions import CHECKLIST_STEPS
            step_label = next((s["label"] for s in CHECKLIST_STEPS if s["id"] == next_step), next_step)
            recommended = f"Complete: {step_label}"
        else:
            recommended = "Review checklist"
    elif not c.get("submittedAt"):
        recommended = "Send application link"
    else:
        recommended = "Ready for onboarding review"

    return {
        "candidateId": c.get("id"),
        "name": c.get("name"),
        "stage": c.get("stage"),
        "missingDocs": missing_docs,
        "expiredDocs": actually_expired,
        "expiringSoon": expiring_soon,
        "checklistProgress": {"complete": complete_steps, "total": total_steps},
        "applicationCompleteness": app_pct,
        "experienceFit": exp_score,
        "complianceRisk": risk,
        "recommendedAction": recommended,
        "onboardingBlocked": bool(missing_docs or actually_expired or complete_steps < total_steps),
    }


@router.get("/api/compliance/dashboard", dependencies=[Depends(require_admin)])
async def compliance_dashboard():
    """Return a compliance snapshot for all candidates."""
    all_candidates = await read_all()
    results = [_compliance_score(c) for c in all_candidates]

    summary = {
        "total": len(results),
        "missingDocuments": sum(1 for r in results if r["missingDocs"]),
        "expiredDocuments": sum(1 for r in results if r["expiredDocs"]),
        "expiringSoon": sum(1 for r in results if r["expiringSoon"]),
        "onboardingBlocked": sum(1 for r in results if r["onboardingBlocked"]),
        "readyForOnboarding": sum(1 for r in results if not r["onboardingBlocked"] and r.get("stage") != "Hired"),
        "highRisk": sum(1 for r in results if r["complianceRisk"] == "high"),
    }
    return {"summary": summary, "candidates": results}


@router.get("/api/candidates/{cid}/scorecard", dependencies=[Depends(require_admin)])
async def candidate_scorecard(cid: str):
    """Return the compliance scorecard for a single candidate."""
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    return _compliance_score(c)


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/api/notifications", dependencies=[Depends(require_admin)])
async def get_notifications():
    """Return actionable system notifications aggregated across all candidates."""
    all_candidates = await read_all()
    notifications = []

    for c in all_candidates:
        cid = c.get("id")
        name = c.get("name") or "Unknown Driver"

        # New unread application
        if c.get("submittedAt") and not c.get("applicationReviewed"):
            notifications.append({
                "id": f"app_{cid}",
                "type": "new_application",
                "title": "New Application Submitted",
                "body": f"{name} submitted their driver application.",
                "candidateId": cid,
                "candidateName": name,
                "at": c.get("submittedAt"),
                "severity": "info",
            })

        # Expired / expiring documents
        for exp in expiring_docs(c):
            days = exp.get("daysLeft") or 0
            if days <= 0:
                notifications.append({
                    "id": f"exp_{cid}_{exp['type']}",
                    "type": "document_expired",
                    "title": f"{exp['label']} Expired",
                    "body": f"{name}'s {exp['label']} has expired.",
                    "candidateId": cid,
                    "candidateName": name,
                    "at": exp.get("value"),
                    "severity": "error",
                })
            elif days <= 30:
                notifications.append({
                    "id": f"exp_{cid}_{exp['type']}",
                    "type": "document_expiring",
                    "title": f"{exp['label']} Expiring Soon",
                    "body": f"{name}'s {exp['label']} expires in {days} days.",
                    "candidateId": cid,
                    "candidateName": name,
                    "at": exp.get("value"),
                    "severity": "warning",
                })

        # DocuSign completed
        for env in (c.get("docusign") or {}).get("envelopes") or []:
            if env.get("status") == "completed" and env.get("completedAt"):
                notifications.append({
                    "id": f"ds_{env.get('envelopeId')}",
                    "type": "docusign_completed",
                    "title": "DocuSign Completed",
                    "body": f"{name} signed {env.get('documentName') or 'document'}.",
                    "candidateId": cid,
                    "candidateName": name,
                    "at": env.get("completedAt"),
                    "severity": "success",
                })

    # Sort newest first
    notifications.sort(key=lambda n: n.get("at") or "", reverse=True)
    return {"notifications": notifications[:100], "total": len(notifications)}
