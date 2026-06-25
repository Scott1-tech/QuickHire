"""/api/anna/* — Anna driver-qualification agent routes."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from .. import anna, config
from ..anna_settings import clear_key, effective_key, key_source, mask_key, set_key
from ..deps import require_admin
from ..errors import error
from ..store import (
    find_carrier_by_id,
    find_portfolio,
    read_carriers,
    read_portfolios,
    upsert_carrier,
    upsert_portfolio,
)

router = APIRouter(dependencies=[Depends(require_admin)])

SPEC_PARSE_VERSION = 1


async def _anna_opts() -> dict:
    return {"apiKey": await effective_key()}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit_log(p: dict, event: str, detail: str = "", actor: str = "Anna") -> None:
    p.setdefault("audit", []).append({"at": _now(), "actor": actor, "event": event, "detail": detail or ""})


def _portfolio_summary(p: dict) -> dict:
    eligible_count = len([r for r in (p.get("recommendations") or []) if r.get("status") == "ELIGIBLE"])
    carrier = p.get("carrier") or {}
    review = p.get("review") or {}
    compliance = p.get("compliance") or {}
    return {
        "id": p.get("id"), "createdAt": p.get("createdAt"),
        "driverName": (p.get("driver") or {}).get("name") or "—",
        "carrierName": carrier.get("carrierName"),
        "fitScore": carrier.get("fitScore"),
        "recommendationCount": eligible_count,
        "reviewStatus": review.get("status") or "pending",
        "recruiter": review.get("assignedRecruiter"),
        "complianceFlag": compliance.get("flag"),
    }


async def _anna_carriers() -> list:
    out = []
    for c in await read_carriers():
        if not c.get("requirements") or not len(c["requirements"]):
            continue
        if not c.get("structuredRequirements") or c.get("structuredSpecVersion") != SPEC_PARSE_VERSION:
            res = await anna.extract_carrier_spec(c["requirements"], await _anna_opts())
            c["structuredRequirements"] = res["requirements"]
            c["structuredSpecVersion"] = SPEC_PARSE_VERSION
            await upsert_carrier(c)
        out.append({"id": c["id"], "name": c["name"], "requirements": c["structuredRequirements"], "specVersion": SPEC_PARSE_VERSION})
    return out


# ── Anna settings (Anthropic API key) ────────────────────────────────────────
@router.get("/api/anna/settings")
async def anna_get_settings():
    eff = await effective_key()
    return {
        "configured": bool(eff),
        "source": await key_source(),
        "keyHint": mask_key(eff),
        "model": anna.MODELS["fast"],
        "integrations": anna.integration_status(),
    }


@router.post("/api/anna/settings")
async def anna_set_settings(request: Request):
    body = await request.json()
    api_key = str(body.get("apiKey") or "").strip()
    if not api_key:
        raise error(400, "apiKey is required.")
    if not re.match(r"^sk-", api_key):
        raise error(400, 'That does not look like an Anthropic API key (it should start with "sk-").')
    await set_key(api_key)
    return {"ok": True, "configured": True, "source": "ui", "keyHint": mask_key(api_key)}


@router.delete("/api/anna/settings")
async def anna_delete_settings():
    await clear_key()
    return {"ok": True, "configured": bool(config.ANTHROPIC_API_KEY), "source": await key_source(), "keyHint": mask_key(await effective_key())}


@router.post("/api/anna/settings/test")
async def anna_test_settings(request: Request):
    body = await request.json()
    api_key = str(body.get("apiKey") or "").strip() or await effective_key()
    if not api_key:
        raise error(400, "No API key configured.")
    try:
        await anna.call_claude(api_key=api_key, model=anna.MODELS["fast"], max_tokens=8, messages=[{"role": "user", "content": "Reply with the word OK."}])
        return {"ok": True, "message": "Connection successful — Anna is live."}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail={"ok": False, "error": str(e)})


@router.post("/api/anna/chat")
async def anna_chat(request: Request):
    body = await request.json()
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise error(400, "messages[] is required.")
    try:
        return await anna.chat(messages=messages, context=body.get("context") or {}, opts=await _anna_opts())
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.post("/api/anna/scan")
async def anna_scan(request: Request):
    body = await request.json()
    if not body.get("dataUrl"):
        raise error(400, "dataUrl is required.")
    if not config.ANTHROPIC_API_KEY:
        raise error(503, "Document scanning requires ANTHROPIC_API_KEY.")
    try:
        return await anna.extract_from_document({"dataUrl": body.get("dataUrl"), "docType": body.get("docType"), "apiKey": config.ANTHROPIC_API_KEY})
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.post("/api/anna/match")
async def anna_match(request: Request):
    body = await request.json()
    driver, lead = body.get("driver"), body.get("lead")
    if not driver and not lead:
        raise error(400, "driver or lead is required.")
    try:
        norm = await anna.normalize_driver(driver or lead, await _anna_opts())
        match = anna.match_driver(norm["profile"], await _anna_carriers(), {"minScore": float(body.get("minScore") or 0)})
        return {"profile": norm["profile"], "match": match}
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.post("/api/anna/leads")
async def anna_leads(request: Request):
    body = await request.json()
    lead = body.get("lead")
    if not lead:
        raise error(400, "lead is required.")
    try:
        result = await anna.process_lead(
            lead=lead,
            carriers=await _anna_carriers(),
            opts={**(await _anna_opts()), "recruiterPool": body.get("recruiterPool") or [], "minScore": float(body.get("minScore") or 0)},
        )
        if result.get("portfolio"):
            consent_input = body.get("consent") or lead
            consent = anna.normalize_consent(consent_input)
            has_consent = consent.get("mvr") or consent.get("psp") or consent.get("clearinghouse")
            if has_consent:
                result["portfolio"]["consent"] = consent
            elig = (result["match"].get("summary") or {}).get("eligible") or 0
            _audit_log(result["portfolio"], "lead_received",
                       f"Lead intake (source: {result.get('source')}). Anna ranked {len(result['portfolio'].get('recommendations') or [])} carriers; {elig} eligible.")
            if has_consent:
                types = [t for t in ("mvr", "psp", "clearinghouse") if consent.get(t)]
                _audit_log(result["portfolio"], "consent_intake", f"Consent captured at intake for {', '.join(types)}.", "Driver")
            await upsert_portfolio(result["portfolio"])
        return {"profile": result["profile"], "match": result["match"], "source": result.get("source"), "portfolio": result.get("portfolio")}
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.post("/api/anna/rematch")
async def anna_rematch(request: Request):
    body = await request.json()
    driver = body.get("driver")
    if not driver:
        raise error(400, "driver is required.")
    try:
        norm = await anna.normalize_driver(driver, await _anna_opts())
        return anna.suggest_rematch(norm["profile"], await _anna_carriers(), {"excludeCarrierIds": body.get("excludeCarrierIds") or []})
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.get("/api/anna/portfolios")
async def anna_portfolios():
    return [_portfolio_summary(p) for p in await read_portfolios()]


@router.get("/api/anna/portfolios/{pid}")
async def anna_portfolio(pid: str):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    return p


@router.get("/api/anna/portfolios/{pid}/packet")
async def anna_packet(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    review = p.get("review") or {}
    packet = {
        "generatedAt": _now(),
        "company": config.COMPANY_NAME,
        "driver": p.get("driver"),
        "selectedCarrier": p.get("carrier"),
        "recommendations": p.get("recommendations"),
        "consent": p.get("consent"),
        "complianceSources": p.get("complianceSources"),
        "compliance": p.get("compliance"),
        "decision": {
            "status": review.get("status"), "decidedBy": review.get("decidedBy"), "decidedAt": review.get("decidedAt"),
            "reason": review.get("decisionReason"), "carrierSelectedBy": review.get("carrierSelectedBy"),
        },
        "auditTrail": p.get("audit") or [],
    }
    if (request.query_params.get("format") or "") == "html":
        return HTMLResponse(_render_packet_html(packet, p["id"]))
    return packet


@router.post("/api/anna/portfolios/{pid}/select-carrier")
async def anna_select_carrier(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    carrier_id = body.get("carrierId")
    if not carrier_id:
        raise error(400, "carrierId is required.")
    try:
        who = body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter"
        anna.select_carrier(p, carrier_id, who)
        _audit_log(p, "carrier_selected", f"Carrier \"{p['carrier']['carrierName']}\" selected ({p['carrier']['fitScore']}% fit) from Anna's ranked list.", who)
        await upsert_portfolio(p)
        return {"ok": True, "carrier": p.get("carrier"), "review": p.get("review")}
    except ValueError as e:
        raise error(400, str(e))


@router.post("/api/anna/portfolios/{pid}/consent")
async def anna_consent(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    consent = anna.normalize_consent(body or {})
    consent["capturedAt"] = _now()
    consent["ip"] = request.client.host if request.client else None
    p["consent"] = consent
    types = [t for t in ("mvr", "psp", "clearinghouse") if consent.get(t)]
    _audit_log(p, "consent_recorded",
               f"Driver consent recorded for {', '.join(types) or 'none'}{(' (signed by ' + consent['by'] + ')') if consent.get('by') else ''}.",
               (body or {}).get("by") or "Recruiter")
    await upsert_portfolio(p)
    return {"ok": True, "consent": consent}


@router.post("/api/anna/portfolios/{pid}/compliance")
async def anna_compliance(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    carrier_sel = p.get("carrier") or {}
    if not carrier_sel.get("carrierId"):
        raise error(400, "Select a carrier first — the recruiter picks the best fit before compliance runs.")
    carrier = await find_carrier_by_id(carrier_sel["carrierId"])
    if not carrier:
        raise error(404, "Matched carrier no longer exists.")
    body = await request.json()
    try:
        records = body.get("records") or {}
        if body.get("pull"):
            consent = body.get("consent") or p.get("consent") or {}
            types = body.get("types") or [t for t in ("mvr", "psp", "clearinghouse") if consent.get(t)]
            if not types:
                raise error(403, "No driver consent on file — capture consent before pulling records.", missingConsent=["mvr", "psp", "clearinghouse"])
            pulled = await anna.pull_compliance(driver=p["driver"], consent=consent, types=types, queue=None, opts=await _anna_opts())
            records = {**pulled["records"], **records}
            p["consent"] = pulled["consent"]
            p["complianceSources"] = pulled["sources"]
        compliance = await anna.write_compliance(
            carrier={"id": carrier["id"], "name": carrier["name"], "requirements": carrier.get("structuredRequirements") or {}},
            driver=p["driver"],
            records=records,
            opts={**(await _anna_opts()), "narrate": bool(config.ANTHROPIC_API_KEY)},
        )
        p["compliance"] = compliance
        src_label = ", ".join(f"{sx['type']}:{'sim' if sx.get('simulated') else 'live'}" for sx in (p.get("complianceSources") or []))
        _audit_log(p, "compliance_check",
                   f"Compliance {('pulled (' + (src_label or 'no sources') + ')') if body.get('pull') else 'evaluated from entered records'} for {compliance['carrierName']} → verdict: {compliance['flag'].upper()}.",
                   "Anna" if body.get("pull") else "Recruiter")
        p["driver"] = anna.merge_records(p["driver"], records)
        await upsert_portfolio(p)
        return {**compliance, "sources": p.get("complianceSources")}
    except HTTPException:
        raise
    except anna.ConsentError as e:
        raise error(403, str(e), missingConsent=e.missing)
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.post("/api/anna/portfolios/{pid}/decision")
async def anna_decision(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    decision = body.get("decision")
    if decision not in ("approved", "rejected"):
        raise error(400, 'decision must be "approved" or "rejected".')
    who = body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter"
    reason = body.get("reason") or ""
    p["review"] = {**(p.get("review") or {}), "status": decision, "decidedBy": who, "decidedAt": _now(), "decisionReason": reason}
    _audit_log(p, "approved" if decision == "approved" else "rejected",
               f"{'Approved & advanced' if decision == 'approved' else 'Rejected'}{(' — ' + reason) if reason else ''}.", who)
    await upsert_portfolio(p)
    rematch = None
    if decision == "rejected":
        try:
            rematch = anna.suggest_rematch(p["driver"], await _anna_carriers(), {"excludeCarrierIds": [cid for cid in [(p.get("carrier") or {}).get("carrierId")] if cid]})
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True, "review": p["review"], "rematch": rematch}


# ── Printable compliance packet (self-contained HTML) ────────────────────────
def _esc(s) -> str:
    return str("" if s is None else s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _render_packet_html(k: dict, pid: str) -> str:
    def row(label, val):
        return f"<tr><th>{_esc(label)}</th><td>{_esc(val)}</td></tr>"

    d = k.get("driver") or {}
    cmp_ = k.get("compliance")
    cats = "".join(
        f"<li><b>{_esc(c.get('key'))}:</b> {'✓' if c.get('pass') else '✗'} {_esc(c.get('reason'))}</li>"
        for c in (cmp_.get("categories") or [])
    ) if cmp_ else "<li>No compliance check on file.</li>"
    audit = "".join(
        f"<tr><td>{_esc(a.get('at'))}</td><td>{_esc(a.get('actor'))}</td><td>{_esc(a.get('event'))}</td><td>{_esc(a.get('detail'))}</td></tr>"
        for a in (k.get("auditTrail") or [])
    ) or '<tr><td colspan="4">No events.</td></tr>'
    src = ", ".join(f"{_esc(s.get('type'))} ({'simulated' if s.get('simulated') else 'live'})" for s in (k.get("complianceSources") or [])) or "—"

    cdl = d.get("cdl")
    mvr = d.get("mvr")
    psp = d.get("psp")
    cdl_txt = f"Class {cdl.get('class') or '—'}, {cdl.get('experienceYears') if cdl.get('experienceYears') is not None else '—'} yrs, endorsements {', '.join(cdl.get('endorsements') or []) or 'none'}" if cdl else "—"
    mvr_txt = f"{mvr.get('movingViolations') if mvr.get('movingViolations') is not None else '—'} viol, {mvr.get('accidents') if mvr.get('accidents') is not None else '—'} acc, {mvr.get('dui') if mvr.get('dui') is not None else '—'} DUI" if mvr else "—"
    psp_txt = f"{psp.get('crashes') if psp.get('crashes') is not None else '—'} crashes, {psp.get('oosInspections') if psp.get('oosInspections') is not None else '—'} OOS" if psp else "—"

    sel = k.get("selectedCarrier")
    consent = k.get("consent")
    consent_auth = (", ".join(t for t in ("mvr", "psp", "clearinghouse") if consent.get(t)).upper() or "none") if consent else "none on file"
    decision = k.get("decision") or {}

    if cmp_:
        verdict = (
            f'<p><span class="verdict {_esc(cmp_.get("flag"))}">{_esc(str(cmp_.get("flag", "")).upper())}</span> '
            f'&nbsp;<span class="meta">sources: {src} · checked {_esc(cmp_.get("checkedAt"))}</span></p>'
            f'<p>{_esc(cmp_.get("summary"))}</p><ul>{cats}</ul>'
        )
    else:
        verdict = '<p class="meta">No compliance check on file.</p>'

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Compliance Packet — {_esc(d.get('name') or pid)}</title>
<style>body{{font-family:Inter,Arial,sans-serif;color:#111;max-width:820px;margin:24px auto;padding:0 20px;line-height:1.5}}
h1{{font-size:20px;margin:0}} h2{{font-size:14px;text-transform:uppercase;color:#666;border-bottom:1px solid #eee;padding-bottom:4px;margin-top:28px}}
table{{border-collapse:collapse;width:100%;font-size:13px}} th{{text-align:left;width:200px;color:#555;vertical-align:top;padding:4px 8px}}
td{{padding:4px 8px}} .meta{{color:#888;font-size:12px}} .verdict{{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px}}
.approve{{background:#dcfce7;color:#16a34a}}.reject{{background:#fee2e2;color:#dc2626}}.review{{background:#fef3c7;color:#b45309}}
.audit td,.audit th{{border-bottom:1px solid #f0f0f0;font-size:12px}} ul{{margin:6px 0;padding-left:18px}} @media print{{body{{margin:0}}}}</style></head>
<body>
<h1>Driver Compliance Packet</h1>
<div class="meta">{_esc(k.get('company'))} · Generated {_esc(k.get('generatedAt'))} · Portfolio {_esc(pid)}</div>

<h2>Driver</h2>
<table>{row('Name', d.get('name'))}{row('Age', d.get('age'))}{row('CDL', cdl_txt)}{row('MVR', mvr_txt)}{row('PSP', psp_txt)}</table>

<h2>Selected Carrier</h2>
<table>{row('Carrier', (sel or {}).get('carrierName') or 'Not selected')}{row('Fit score', (str((sel or {}).get('fitScore')) + '%') if sel else '—')}{row('Selected by', decision.get('carrierSelectedBy') or '—')}</table>

<h2>Consent</h2>
<table>{row('Authorized', consent_auth)}{row('Signed by', (consent or {}).get('by') or '—')}{row('Signed at', (consent or {}).get('signedAt') or (consent or {}).get('capturedAt') or '—')}</table>

<h2>Compliance Verdict</h2>
{verdict}

<h2>Recruiter Decision</h2>
<table>{row('Status', str(decision.get('status') or 'pending').upper())}{row('Decided by', decision.get('decidedBy') or '—')}{row('Decided at', decision.get('decidedAt') or '—')}{row('Reason', decision.get('reason') or '—')}</table>

<h2>Audit Trail</h2>
<table class="audit"><tr><th>When</th><th>Actor</th><th>Event</th><th>Detail</th></tr>{audit}</table>
</body></html>"""
