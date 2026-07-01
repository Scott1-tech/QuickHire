"""/api/leads/* — universal lead intake (Meta, Indeed, Zapier/generic, CSV…).

Inbound webhooks are PUBLIC (authenticated per-source by the adapter's secret /
signature), so they are NOT behind ``require_admin``. Everything else (the review
inbox, convert, status, CSV import) is admin-only like the rest of the workdeck.
"""
import csv
import io
import json
import os

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse

from ..deps import base_url, require_admin
from ..errors import error
from ..leads import get_adapter, ingest_lead, sources_status, to_canonical
from ..messaging import dispatch_link
from ..store import add_activity, find_by_id, read_all, upsert

router = APIRouter()


# ── Public webhook intake ─────────────────────────────────────────────────────
@router.get("/api/leads/intake/{source}")
async def intake_verify(source: str, request: Request):
    """Webhook verification handshake.

    Meta does a GET with ``hub.challenge`` when you subscribe a webhook; echo it
    back when the verify token matches. Other sources just get a 200 OK so their
    'test connection' buttons succeed.
    """
    if get_adapter(source) is None:
        raise error(404, f"Unknown lead source '{source}'.")
    challenge = request.query_params.get("hub.challenge")
    if challenge is not None:
        expected = os.environ.get("META_VERIFY_TOKEN", "")
        provided = request.query_params.get("hub.verify_token", "")
        if expected and provided != expected:
            raise error(403, "Verify token mismatch.")
        return PlainTextResponse(challenge)
    return {"ok": True, "source": source}


@router.post("/api/leads/intake/{source}")
async def intake(source: str, request: Request):
    adapter = get_adapter(source)
    if adapter is None:
        raise error(404, f"Unknown lead source '{source}'.")

    raw = await request.body()
    if not await adapter.verify(request, raw):
        raise error(401, "Signature/secret verification failed.")

    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        raise error(400, "Body is not valid JSON.")

    leads = await adapter.normalize(payload)
    results, created, merged, skipped = [], 0, 0, 0
    for lead in leads:
        try:
            r = await ingest_lead(lead)
        except ValueError as e:
            skipped += 1
            results.append({"ok": False, "reason": str(e)})
            continue
        results.append({"ok": True, **r})
        if r.get("created"):
            created += 1
        elif r.get("duplicate"):
            merged += 1
    return {"ok": True, "source": adapter.source, "received": len(leads),
            "created": created, "merged": merged, "skipped": skipped, "results": results}


# ── Review inbox (admin) ──────────────────────────────────────────────────────
@router.get("/api/leads/inbox", dependencies=[Depends(require_admin)])
async def lead_inbox():
    """Unreviewed leads awaiting a recruiter — the review-first queue."""
    out = [c for c in await read_all() if c.get("subStatus") == "new_unreviewed"]
    out.sort(key=lambda c: c.get("createdAt") or "", reverse=True)
    return [{"id": c.get("id"), "name": c.get("name"), "email": c.get("email"), "phone": c.get("phone"),
             "source": c.get("source"), "campaign": ((c.get("sources") or [{}])[0]).get("campaign"),
             "createdAt": c.get("createdAt"), "recruiter": c.get("recruiter"),
             "sourceCount": len(c.get("sources") or [])}
            for c in out]


@router.post("/api/leads/{cid}/convert", dependencies=[Depends(require_admin)])
async def convert_lead(cid: str, request: Request):
    """Recruiter accepts a lead → send the application link.

    This is the ONLY place a lead gets contacted, satisfying review-first / TCPA:
    cold leads are never auto-texted on intake.
    """
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    recruiter = body.get("recruiter")
    if recruiter:
        c["recruiter"] = recruiter
    if c.get("subStatus") == "new_unreviewed":
        add_activity(c, "lead_converted", recruiter or "Admin",
                     f"Lead reviewed and accepted from {c.get('source') or 'intake'} — sending application link.")
    c["subStatus"] = "in_progress"
    dispatch = await dispatch_link(c, base_url(request), regenerate=False)
    await upsert(c)
    return {"ok": True, "id": c["id"], "link": dispatch["link"],
            "email": dispatch["email"], "sms": dispatch["sms"], "anySuccess": dispatch["anySuccess"]}


@router.post("/api/leads/{cid}/dismiss", dependencies=[Depends(require_admin)])
async def dismiss_lead(cid: str, request: Request):
    """Reject a junk/duplicate lead without contacting it."""
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    c["subStatus"] = "dismissed"
    add_activity(c, "lead_dismissed", "Admin", body.get("reason") or "Lead dismissed from inbox (not pursued).")
    await upsert(c)
    return {"ok": True}


# ── CSV / bulk import (admin) ─────────────────────────────────────────────────
@router.post("/api/leads/import", dependencies=[Depends(require_admin)])
async def import_leads(request: Request):
    """Bulk import from a pasted CSV (``csv`` field) or a JSON ``rows`` array.

    Every row runs through the same canonical normalization + dedup as webhooks,
    so column headers can be named however the export tool named them.
    """
    body = await request.json()
    source = body.get("source") or "csv"
    rows: list[dict] = []
    if body.get("csv"):
        reader = csv.DictReader(io.StringIO(body["csv"]))
        rows = [dict(r) for r in reader]
    elif isinstance(body.get("rows"), list):
        rows = body["rows"]
    else:
        raise error(400, "Provide a 'csv' string or a 'rows' array.")

    created, merged, skipped, errors = 0, 0, 0, []
    for i, row in enumerate(rows):
        lead = to_canonical(row, source=source)
        try:
            r = await ingest_lead(lead)
        except ValueError as e:
            skipped += 1
            errors.append({"row": i + 1, "reason": str(e)})
            continue
        if r.get("created"):
            created += 1
        elif r.get("duplicate"):
            merged += 1
    return {"ok": True, "source": source, "total": len(rows),
            "created": created, "merged": merged, "skipped": skipped, "errors": errors}


# ── Settings status + connection helper (admin) ───────────────────────────────
@router.get("/api/leads/status", dependencies=[Depends(require_admin)])
async def leads_status(request: Request):
    """Per-source connection cards + the intake URL to paste into Zapier/Meta."""
    base = base_url(request)
    return {"sources": sources_status(),
            "intakeUrlTemplate": f"{base}/api/leads/intake/{{source}}",
            "secretConfigured": bool(os.environ.get("LEAD_WEBHOOK_SECRET"))}


@router.post("/api/leads/test", dependencies=[Depends(require_admin)])
async def test_lead(request: Request):
    """Inject a simulated lead so the inbox + pipeline are demoable end-to-end."""
    body = await request.json()
    source = body.get("source") or "generic"
    sample = body.get("lead") or {"full_name": "Test Driver", "email": "test.driver@example.com",
                                   "phone": "+15125550123", "campaign": "Demo import"}
    r = await ingest_lead(to_canonical(sample, source=source))
    return {"ok": True, "simulated": True, **r}
