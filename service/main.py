"""Anna — FastAPI backend. Owns the /api/anna/* API (full Python backend).

The Node app continues to serve the web UI and the non-Anna APIs; this service
owns everything Anna. Point the UI's Anna API base at this service (CORS is open).
Run: uvicorn main:app --port 8000   (or ./run.sh)
"""
from __future__ import annotations
import os
import time
from datetime import datetime, timezone
from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse

import anna
from anna import store

app = FastAPI(title="Anna — Driver Qualification AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
COMPANY_NAME = os.environ.get("COMPANY_NAME", "National Carrier Xpress Corp")
SPEC_VERSION = 1


def require_admin(x_admin_token: str | None):
    if ADMIN_PASSWORD and x_admin_token != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── settings / provider ──
def anna_provider():
    return store.read_settings().get("provider") or "anthropic"


def anna_api_key():
    s = store.read_settings()
    if s.get("apiKey"):
        return s["apiKey"]
    return ANTHROPIC_API_KEY if anna_provider() == "anthropic" else ""


def anna_key_source():
    if store.read_settings().get("apiKey"):
        return "ui"
    return "env" if anna_provider() == "anthropic" and ANTHROPIC_API_KEY else None


def mask(k):
    return f"{k[:6]}…{k[-4:]}" if k and len(k) > 12 else ("••••" if k else None)


def anna_opts():
    return {"provider": anna_provider(), "apiKey": anna_api_key(), "model": store.read_settings().get("model") or None}


# ── carriers with learned weights ──
async def anna_carriers():
    learning = store.read_learning()
    out = []
    for c in store.read_carriers():
        if not c.get("requirements"):
            continue
        spec = await anna.extract_carrier_spec(c["requirements"], anna_opts())
        reqs = spec["requirements"]
        learned = (learning.get(c["id"]) or {}).get("weights")
        if learned:
            reqs = {**reqs, "softWeights": learned}
        out.append({"id": c["id"], "name": c.get("name"), "requirements": reqs, "specVersion": SPEC_VERSION})
    return out


# ── audit + summary + packet ──
def audit(p, event, detail="", actor="Anna"):
    p.setdefault("audit", []).append({"at": _now(), "actor": actor, "event": event, "detail": detail})


def portfolio_summary(p):
    elig = len([r for r in (p.get("recommendations") or []) if r.get("status") == "ELIGIBLE"])
    return {
        "id": p["id"], "createdAt": p["createdAt"], "driverName": (p.get("driver") or {}).get("name") or "—",
        "carrierName": (p.get("carrier") or {}).get("carrierName"),
        "fitScore": (p.get("carrier") or {}).get("fitScore"),
        "recommendationCount": elig, "reviewStatus": (p.get("review") or {}).get("status") or "pending",
        "recruiter": (p.get("review") or {}).get("assignedRecruiter"),
        "complianceFlag": (p.get("compliance") or {}).get("flag"),
        "outcome": (p.get("outcome") or {}).get("status"),
    }


# ── routes: settings ──
@app.get("/api/anna/health")
def health():
    return {"ok": True, "service": "anna-python", "configured": bool(anna_api_key()), "provider": anna_provider()}


@app.get("/api/anna/settings")
def get_settings(x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    return {"configured": bool(anna_api_key()), "provider": anna_provider(), "providers": anna.PROVIDERS,
            "source": anna_key_source(), "keyHint": mask(anna_api_key()),
            "model": store.read_settings().get("model") or anna.provider_model(anna_provider(), "fast"),
            "integrations": anna.integration_status()}


@app.post("/api/anna/settings")
async def set_settings(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    provider = str(body.get("provider") or "anthropic").lower()
    api_key = str(body.get("apiKey") or "").strip()
    model = str(body.get("model") or "").strip()
    if provider not in anna.PROVIDERS:
        raise HTTPException(400, f"provider must be one of: {', '.join(anna.PROVIDERS)}.")
    if not api_key:
        raise HTTPException(400, "apiKey is required.")
    if not api_key.startswith("sk-"):
        raise HTTPException(400, 'That does not look like an API key (Anthropic/OpenAI keys start with "sk-").')
    store.write_settings({**store.read_settings(), "provider": provider, "apiKey": api_key, "model": model or None})
    return {"ok": True, "configured": True, "provider": provider, "source": "ui", "keyHint": mask(api_key)}


@app.delete("/api/anna/settings")
def del_settings(x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    cur = store.read_settings()
    for k in ("apiKey", "provider", "model"):
        cur.pop(k, None)
    store.write_settings(cur)
    return {"ok": True, "configured": bool(anna_api_key()), "provider": anna_provider(),
            "source": anna_key_source(), "keyHint": mask(anna_api_key())}


@app.post("/api/anna/settings/test")
async def test_settings(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    provider = str(body.get("provider") or anna_provider()).lower()
    api_key = str(body.get("apiKey") or "").strip() or anna_api_key()
    if not api_key:
        return JSONResponse({"ok": False, "error": "No API key configured."}, status_code=400)
    try:
        await anna.llm_complete(provider=provider, apiKey=api_key, maxTokens=8,
                                messages=[{"role": "user", "content": "Reply with the word OK."}])
        return {"ok": True, "message": f"Connection successful — Anna is live on {provider}."}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)


# ── routes: chat / scan / match ──
@app.post("/api/anna/chat")
async def chat_route(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    if not isinstance(body.get("messages"), list) or not body["messages"]:
        raise HTTPException(400, "messages[] is required.")
    try:
        return await anna.chat(messages=body["messages"], context=body.get("context") or {}, opts=anna_opts())
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/api/anna/match")
async def match_route(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    if not body.get("driver") and not body.get("lead"):
        raise HTTPException(400, "driver or lead is required.")
    try:
        nd = await anna.normalize_driver(body.get("driver") or body.get("lead"), anna_opts())
        match = anna.match_driver(nd["profile"], await anna_carriers(), {"minScore": body.get("minScore") or 0})
        return {"profile": nd["profile"], "match": match}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/api/anna/leads")
async def leads_route(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    if not body.get("lead"):
        raise HTTPException(400, "lead is required.")
    try:
        nd = await anna.normalize_driver(body["lead"], anna_opts())
        match = anna.match_driver(nd["profile"], await anna_carriers(), {"minScore": body.get("minScore") or 0})
        p = anna.build_portfolio(nd["profile"], match, recruiter_pool=body.get("recruiterPool") or [])
        consent = anna.normalize_consent(body.get("consent") or body["lead"])
        if consent["mvr"] or consent["psp"] or consent["clearinghouse"]:
            p["consent"] = consent
        elig = (match.get("summary") or {}).get("eligible", 0)
        audit(p, "lead_received", f"Lead intake (source: {nd['source']}). Anna ranked {len(p['recommendations'])} carriers; {elig} eligible.")
        if consent["mvr"] or consent["psp"] or consent["clearinghouse"]:
            audit(p, "consent_intake", "Consent captured at intake for " +
                  ", ".join(t for t in ("mvr", "psp", "clearinghouse") if consent[t]) + ".", "Driver")
        store.upsert_portfolio(p)
        return {"profile": nd["profile"], "match": match, "source": nd["source"], "portfolio": p}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/api/anna/rematch")
async def rematch_route(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    if not body.get("driver"):
        raise HTTPException(400, "driver is required.")
    nd = await anna.normalize_driver(body["driver"], anna_opts())
    return anna.suggest_rematch(nd["profile"], await anna_carriers(), body.get("excludeCarrierIds") or [])


# ── routes: portfolios ──
@app.get("/api/anna/portfolios")
def list_portfolios(x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    return [portfolio_summary(p) for p in store.read_portfolios()]


@app.get("/api/anna/portfolios/{pid}")
def get_portfolio(pid: str, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    return p


@app.post("/api/anna/portfolios/{pid}/select-carrier")
def select_carrier_route(pid: str, body: dict, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    if not body.get("carrierId"):
        raise HTTPException(400, "carrierId is required.")
    who = body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter"
    try:
        anna.select_carrier(p, body["carrierId"], who)
    except ValueError as e:
        raise HTTPException(400, str(e))
    audit(p, "carrier_selected", f"Carrier \"{p['carrier']['carrierName']}\" selected ({p['carrier']['fitScore']}% fit).", who)
    store.upsert_portfolio(p)
    return {"ok": True, "carrier": p["carrier"], "review": p["review"]}


@app.post("/api/anna/portfolios/{pid}/consent")
async def consent_route(pid: str, request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    body = await request.json()
    consent = anna.normalize_consent(body)
    consent["capturedAt"] = _now()
    p["consent"] = consent
    types = [t for t in ("mvr", "psp", "clearinghouse") if consent[t]]
    audit(p, "consent_recorded", f"Driver consent recorded for {', '.join(types) or 'none'}" +
          (f" (signed by {consent['by']})" if consent.get("by") else "") + ".", body.get("by") or "Recruiter")
    store.upsert_portfolio(p)
    return {"ok": True, "consent": consent}


@app.post("/api/anna/portfolios/{pid}/compliance")
async def compliance_route(pid: str, request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    if not (p.get("carrier") or {}).get("carrierId"):
        raise HTTPException(400, "Select a carrier first — the recruiter picks the best fit before compliance runs.")
    carrier = store.find_carrier(p["carrier"]["carrierId"])
    if not carrier:
        raise HTTPException(404, "Matched carrier no longer exists.")
    body = await request.json()
    records = body.get("records") or {}
    try:
        if body.get("pull"):
            consent = body.get("consent") or p.get("consent") or {}
            types = body.get("types") or [t for t in ("mvr", "psp", "clearinghouse") if consent.get(t)]
            if not types:
                return JSONResponse({"error": "No driver consent on file — capture consent before pulling records.",
                                     "missingConsent": ["mvr", "psp", "clearinghouse"]}, status_code=403)
            pulled = await anna.pull_compliance(p["driver"], consent, types, anna_opts())
            records = {**pulled["records"], **records}
            p["consent"] = pulled["consent"]
            p["complianceSources"] = pulled["sources"]
        cspec = {"id": carrier["id"], "name": carrier.get("name"),
                 "requirements": (await anna.extract_carrier_spec(carrier.get("requirements") or {}, anna_opts()))["requirements"]}
        compliance = await anna.write_compliance(cspec, p["driver"], records,
                                                 {**anna_opts(), "narrate": bool(anna_api_key())})
        p["compliance"] = compliance
        src = ", ".join(f"{s['type']}:{'sim' if s['simulated'] else 'live'}" for s in (p.get("complianceSources") or []))
        audit(p, "compliance_check", f"Compliance {'pulled (' + (src or 'no sources') + ')' if body.get('pull') else 'evaluated from entered records'} "
              f"for {compliance['carrierName']} → verdict: {compliance['flag'].upper()}.", "Anna" if body.get("pull") else "Recruiter")
        p["driver"] = anna.merge_records(p["driver"], records)
        store.upsert_portfolio(p)
        return {**compliance, "sources": p.get("complianceSources")}
    except anna.ConsentError as e:
        return JSONResponse({"error": str(e), "missingConsent": e.missing}, status_code=403)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/api/anna/portfolios/{pid}/outcome")
def outcome_route(pid: str, body: dict, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    outcome = body.get("outcome")
    if outcome not in anna.OUTCOME_KINDS:
        raise HTTPException(400, f"outcome must be one of: {', '.join(anna.OUTCOME_KINDS)}.")
    who = body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter"
    p["outcome"] = {"status": outcome, "note": body.get("note") or "", "by": who, "at": _now()}
    audit(p, "outcome", f"Outcome recorded: {outcome}" + (f" — {body.get('note')}" if body.get("note") else "") + ".", who)
    learning_info = None
    carrier = store.find_carrier((p.get("carrier") or {}).get("carrierId")) if (p.get("carrier") or {}).get("carrierId") else None
    if carrier:
        base = anna.compile_spec({})["softWeights"]
        lstore = store.read_learning()
        prior = lstore.get(carrier["id"]) or {}
        updated = anna.record_outcome(prior, outcome, (p.get("carrier") or {}).get("scoreBreakdown") or {}, base)
        lstore[carrier["id"]] = {"samples": updated["samples"], "weights": updated["weights"], "stats": updated["stats"]}
        store.write_learning(lstore)
        learning_info = {"carrier": carrier.get("name"), **updated["stats"], "tuned": bool(updated["weights"])}
        if updated["weights"]:
            audit(p, "learning", f"Anna re-tuned {carrier.get('name')}'s match weights from {updated['stats']['total']} placements ({updated['stats']['successRate']}% success).")
    store.upsert_portfolio(p)
    return {"ok": True, "outcome": p["outcome"], "learning": learning_info}


@app.post("/api/anna/portfolios/{pid}/decision")
async def decision_route(pid: str, body: dict, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    decision = body.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(400, 'decision must be "approved" or "rejected".')
    who = body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter"
    p["review"] = {**(p.get("review") or {}), "status": decision, "decidedBy": who, "decidedAt": _now(),
                   "decisionReason": body.get("reason") or ""}
    audit(p, decision, ("Approved & advanced" if decision == "approved" else "Rejected") +
          (f" — {body.get('reason')}" if body.get("reason") else "") + ".", who)
    store.upsert_portfolio(p)
    rematch = None
    if decision == "rejected":
        try:
            rematch = anna.suggest_rematch(p["driver"], await anna_carriers(),
                                           [(p.get("carrier") or {}).get("carrierId")] if (p.get("carrier") or {}).get("carrierId") else [])
        except Exception:
            pass
    return {"ok": True, "review": p["review"], "rematch": rematch}


@app.get("/api/anna/metrics")
def metrics_route(x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    return anna.compute_metrics(store.read_portfolios())


@app.get("/api/anna/portfolios/{pid}/packet")
def packet_route(pid: str, format: str = "", x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    p = store.find_portfolio(pid)
    if not p:
        raise HTTPException(404, "Not found")
    k = {"generatedAt": _now(), "company": COMPANY_NAME, "driver": p.get("driver"),
         "selectedCarrier": p.get("carrier"), "recommendations": p.get("recommendations"),
         "consent": p.get("consent"), "complianceSources": p.get("complianceSources"),
         "compliance": p.get("compliance"),
         "decision": {"status": (p.get("review") or {}).get("status"), "decidedBy": (p.get("review") or {}).get("decidedBy"),
                      "decidedAt": (p.get("review") or {}).get("decidedAt"), "reason": (p.get("review") or {}).get("decisionReason"),
                      "carrierSelectedBy": (p.get("review") or {}).get("carrierSelectedBy")},
         "outcome": p.get("outcome"), "auditTrail": p.get("audit") or []}
    if format == "html":
        return HTMLResponse(_packet_html(k, pid))
    return k


def _packet_html(k, pid):
    esc = lambda s: str(s if s is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    d = k.get("driver") or {}
    cmp = k.get("compliance")
    rows = "".join(f"<tr><td>{esc(a['at'])}</td><td>{esc(a['actor'])}</td><td>{esc(a['event'])}</td><td>{esc(a['detail'])}</td></tr>"
                   for a in (k.get("auditTrail") or [])) or "<tr><td colspan=4>No events.</td></tr>"
    cats = "".join(f"<li><b>{esc(c['key'])}:</b> {'OK' if c['pass'] else 'X'} {esc(c['reason'])}</li>"
                   for c in (cmp.get("categories") if cmp else [])) or "<li>No compliance check.</li>"
    return f"""<!DOCTYPE html><html><head><meta charset=utf-8><title>Compliance Packet — {esc(d.get('name') or pid)}</title>
<style>body{{font-family:Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 20px}}h2{{font-size:14px;text-transform:uppercase;color:#666;border-bottom:1px solid #eee}}table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{padding:4px 8px;text-align:left}}</style></head>
<body><h1>Driver Compliance Packet</h1><div style="color:#888;font-size:12px">{esc(k['company'])} · {esc(k['generatedAt'])} · {esc(pid)}</div>
<h2>Driver</h2><div>{esc(d.get('name'))} — age {esc(d.get('age'))}, CDL {esc((d.get('cdl') or {}).get('class'))}, {esc((d.get('cdl') or {}).get('experienceYears'))} yrs</div>
<h2>Selected carrier</h2><div>{esc((k.get('selectedCarrier') or {}).get('carrierName') or 'Not selected')}</div>
<h2>Compliance</h2>{('<b>'+esc(cmp['flag'].upper())+'</b><p>'+esc(cmp['summary'])+'</p><ul>'+cats+'</ul>') if cmp else '<p>No compliance check.</p>'}
<h2>Decision</h2><div>{esc((k.get('decision') or {}).get('status'))} by {esc((k.get('decision') or {}).get('decidedBy'))}; outcome: {esc((k.get('outcome') or {}).get('status') or '—')}</div>
<h2>Audit trail</h2><table><tr><th>When</th><th>Actor</th><th>Event</th><th>Detail</th></tr>{rows}</table></body></html>"""


@app.post("/api/anna/scan")
async def scan_route(request: Request, x_admin_token: str | None = Header(None)):
    require_admin(x_admin_token)
    body = await request.json()
    if not body.get("dataUrl"):
        raise HTTPException(400, "dataUrl is required.")
    key = anna_api_key() if anna_provider() == "anthropic" else ANTHROPIC_API_KEY
    if not key:
        raise HTTPException(503, "Document scanning requires an Anthropic (Claude) key.")
    m = __import__("re").match(r"^data:(.+?);base64,(.*)$", body["dataUrl"])
    if not m:
        raise HTTPException(400, "Invalid dataUrl.")
    media, data = m.group(1), m.group(2)
    block = ({"type": "document", "source": {"type": "base64", "media_type": media, "data": data}}
             if media == "application/pdf" else
             {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}})
    try:
        out = await anna.llm_json(provider="anthropic", apiKey=key, maxTokens=1024,
            system="You read US commercial driver documents and extract fields. Report confidence 0..1 per field. Return ONLY JSON.",
            messages=[{"role": "user", "content": [block, {"type": "text", "text":
                       f"This is a \"{body.get('docType') or 'document'}\". Extract relevant fields. "
                       'Return {"fields":{...},"confidence":{...},"warnings":[...]}.'}]}])
        return out
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
