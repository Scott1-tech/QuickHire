"""/api/anna/* — Anna driver-qualification agent routes."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from .. import anna, config

from ..anna_settings import PROVIDERS, clear_settings, effective_key, key_source, mask_key, model as anna_model, provider as anna_provider, set_settings

from ..anna_settings import (
    anthropic_key,
    clear_settings,
    effective_key,
    effective_model,
    effective_provider,
    key_source,
    mask_key,
    set_settings,
)

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

    return {"provider": await anna_provider(), "apiKey": await effective_key(), "model": await anna_model()}

    # Anthropic-only flows (carrier-spec extraction, normalization, compliance
    # narration, document scanning) always use an Anthropic key.
    return {"apiKey": await anthropic_key()}


async def _chat_opts() -> dict:
    # The free-form assistant runs on whichever provider the team selected.
    return {"apiKey": await effective_key(), "provider": await effective_provider(), "model": await effective_model()}



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
        "outcome": (p.get("outcome") or {}).get("status"),
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


# ── Outcome-based learning, stored per-carrier in the KV table ───────────────
def _learning_key(carrier_id: str) -> str:
    return f"anna.learning.{carrier_id}"


async def _learning_for(carrier_id: str) -> dict:
    raw = await kv_get(_learning_key(carrier_id))
    try:
        return json.loads(raw) if raw else {}
    except Exception:  # noqa: BLE001
        return {}


async def _save_learning(carrier_id: str, data: dict) -> None:
    await kv_set(_learning_key(carrier_id), json.dumps(data))


# ── Anna settings (Anthropic API key) ────────────────────────────────────────
@router.get("/api/anna/settings")
async def anna_get_settings():
    eff = await effective_key()
    prov = await anna_provider()
    return {
        "configured": bool(eff),
        "provider": prov,
        "providers": PROVIDERS,
        "source": await key_source(),
        "keyHint": mask_key(eff),
        "model": (await anna_model()) or anna.provider_model(prov, "fast"),

# ── Anna settings (AI provider + API key) ────────────────────────────────────
# Supports Claude (Anthropic, default) or OpenAI. The key is stored server-side
# and never returned to the client (only a masked hint).
@router.get("/api/anna/settings")
async def anna_get_settings():
    eff = await effective_key()
    provider = await effective_provider()
    return {
        "configured": bool(eff),
        "provider": provider,
        "providers": anna.PROVIDERS,
        "source": await key_source(),
        "keyHint": mask_key(eff),
        "model": (await effective_model()) or anna.provider_model(provider, "fast"),

        "integrations": anna.integration_status(),
    }


@router.post("/api/anna/settings")
async def anna_set_settings(request: Request):
    body = await request.json()

    prov = str(body.get("provider") or "anthropic").lower()
    api_key = str(body.get("apiKey") or "").strip()
    model_override = str(body.get("model") or "").strip()
    if prov not in PROVIDERS:
        raise error(400, f"provider must be one of: {', '.join(PROVIDERS)}.")

    provider = str(body.get("provider") or "anthropic").lower()
    api_key = str(body.get("apiKey") or "").strip()
    model = str(body.get("model") or "").strip()
    if provider not in anna.PROVIDERS:
        raise error(400, f"provider must be one of: {', '.join(anna.PROVIDERS)}.")

    if not api_key:
        raise error(400, "apiKey is required.")
    if not re.match(r"^sk-", api_key):
        raise error(400, 'That does not look like an API key (Anthropic and OpenAI keys start with "sk-").')

    await set_settings(prov, api_key, model_override or None)
    return {"ok": True, "configured": True, "provider": prov, "source": "ui", "keyHint": mask_key(api_key)}

    await set_settings(provider=provider, api_key=api_key, model=model or None)
    return {"ok": True, "configured": True, "provider": provider, "source": "ui", "keyHint": mask_key(api_key)}



@router.delete("/api/anna/settings")
async def anna_delete_settings():
    await clear_settings()

    return {"ok": True, "configured": bool(await effective_key()), "provider": await anna_provider(),
            "source": await key_source(), "keyHint": mask_key(await effective_key())}

    return {"ok": True, "configured": bool(await effective_key()), "provider": await effective_provider(), "source": await key_source(), "keyHint": mask_key(await effective_key())}



@router.post("/api/anna/settings/test")
async def anna_test_settings(request: Request):
    body = await request.json()

    prov = str(body.get("provider") or await anna_provider()).lower()

    provider = str(body.get("provider") or await effective_provider()).lower()
      ]
    api_key = str(body.get("apiKey") or "").strip() or await effective_key()
    if not api_key:
        raise error(400, "No API key configured.")
    try:

        await anna.llm_complete(provider=prov, api_key=api_key, max_tokens=8,
                                messages=[{"role": "user", "content": "Reply with the word OK."}])
        return {"ok": True, "message": f"Connection successful — Anna is live on {prov}."}

        await anna.llm_complete(provider=provider, api_key=api_key, max_tokens=8, messages=[{"role": "user", "content": "Reply with the word OK."}])
        return {"ok": True, "message": f"Connection successful — Anna is live on {provider}."}

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
            result["portfolio"]["leadSource"] = str(body.get("leadSource") or lead.get("source") or lead.get("leadSource") or "unknown").lower()
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



# ── Metrics — the ROI view (all derived from portfolios + outcomes) ───────────
_GOOD_OUTCOMES = ["hired", "started", "retained_90d"]
_BAD_OUTCOMES = ["washed_out", "rejected", "declined_by_driver"]
_MINUTES_SAVED_PER_LEAD = 25  # est. manual screen+match+summarize time Anna replaces


def _hours_between(a, b):
    if not a or not b:
        return None
    try:
        ta = datetime.fromisoformat(str(a).replace("Z", "+00:00"))
        tb = datetime.fromisoformat(str(b).replace("Z", "+00:00"))
        return (tb - ta).total_seconds() / 3600
    except Exception:  # noqa: BLE001
        return None


def _avg(arr):
    arr = [x for x in arr if x is not None and x >= 0]
    return round(sum(arr) / len(arr), 1) if arr else None


@router.get("/api/anna/metrics")
async def anna_metrics():
    ps = await read_portfolios()
    leads = len(ps)

    def status_count(st):
        return len([p for p in ps if ((p.get("review") or {}).get("status") or "awaiting_carrier") == st])

    matched = len([p for p in ps if any(r.get("status") == "ELIGIBLE" for r in (p.get("recommendations") or []))])
    with_sel = [p for p in ps if (p.get("carrier") or {}).get("carrierId")]

    compliance = {"approve": 0, "reject": 0, "review": 0}
    for p in ps:
        flag = (p.get("compliance") or {}).get("flag")
        if flag:
            compliance[flag] = compliance.get(flag, 0) + 1

    outcome_counts: dict = {}
    good = bad = 0
    for p in ps:
        o = (p.get("outcome") or {}).get("status")
        if not o:
            continue
        outcome_counts[o] = outcome_counts.get(o, 0) + 1
        if o in _GOOD_OUTCOMES:
            good += 1
        elif o in _BAD_OUTCOMES:
            bad += 1

    pc: dict = {}
    for p in ps:
        c = p.get("carrier") or {}
        cid = c.get("carrierId")
        if not cid:
            continue
        entry = pc.setdefault(cid, {"name": c.get("carrierName"), "selections": 0, "good": 0, "bad": 0})
        entry["selections"] += 1
        o = (p.get("outcome") or {}).get("status")
        if o in _GOOD_OUTCOMES:
            entry["good"] += 1
        elif o in _BAD_OUTCOMES:
            entry["bad"] += 1
    per_carrier = sorted(
        ({**c, "successRate": round(c["good"] / (c["good"] + c["bad"]) * 100) if (c["good"] + c["bad"]) else None} for c in pc.values()),
        key=lambda c: c["selections"], reverse=True,
    )

    # Source ROI: which lead source actually yields hires (not just leads).
    src: dict = {}
    for p in ps:
        s = p.get("leadSource") or "unknown"
        e = src.setdefault(s, {"source": s, "leads": 0, "hired": 0, "rejected": 0})
        e["leads"] += 1
        o = (p.get("outcome") or {}).get("status")
        if o in _GOOD_OUTCOMES:
            e["hired"] += 1
        elif o in _BAD_OUTCOMES:
            e["rejected"] += 1
    by_source = sorted(
        ({**e, "hireRate": round(e["hired"] / e["leads"] * 100) if e["leads"] else None} for e in src.values()),
        key=lambda e: e["leads"], reverse=True,
    )

    return {
        "generatedAt": _now(),
        "leads": leads,
        "matched": matched,
        "matchRate": round(matched / leads * 100) if leads else None,
        "pipeline": {
            "awaiting_carrier": status_count("awaiting_carrier"), "pending": status_count("pending"),
            "approved": status_count("approved"), "rejected": status_count("rejected"),
        },
        "offersSelected": len(with_sel),
        "avgHoursToSelect": _avg([_hours_between(p.get("createdAt"), (p.get("review") or {}).get("carrierSelectedAt")) for p in with_sel]),
        "avgHoursToDecision": _avg([_hours_between(p.get("createdAt"), (p.get("review") or {}).get("decidedAt")) for p in ps]),
        "compliance": compliance,
        "outcomes": {"counts": outcome_counts, "good": good, "bad": bad, "successRate": round(good / (good + bad) * 100) if (good + bad) else None},
        "recruiterHoursSaved": round(leads * _MINUTES_SAVED_PER_LEAD / 60, 1),
        "perCarrier": per_carrier,
        "bySource": by_source,
    }


# ── SLA nudges: what's stalled in the pipeline and needs a human ──────────────
@router.get("/api/anna/nudges")
async def anna_nudges():
    return anna.compute_nudges(await read_portfolios())


# ── Cross-source truth check: flag contradictions across application/records/docs
@router.post("/api/anna/portfolios/{pid}/truth-check")
async def anna_truth_check(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    truth = anna.check_consistency(driver=p.get("driver") or {}, records=body.get("records") or {}, documents=p.get("documents") or {})
    p["truthFlags"] = truth
    await upsert_portfolio(p)
    return truth


# ── Carrier re-screen: when requirements change, who flips eligibility? ────────
@router.post("/api/anna/carriers/{cid}/rescreen")
async def anna_rescreen(cid: str):
    carrier = await find_carrier_by_id(cid)
    if not carrier:
        raise error(404, "Carrier not found")
    res = await anna.extract_carrier_spec(carrier.get("requirements") or {}, await _anna_opts())
    spec = anna.compile_spec({"id": cid, "name": carrier.get("name"), "requirements": res["requirements"]})
    changes = []
    for p in await read_portfolios():
        ev = anna.evaluate_gates(spec, p.get("driver") or {})
        prior = next((r for r in (p.get("recommendations") or []) if r.get("carrierId") == cid), None)
        old_status = prior["status"] if prior else None
        if old_status != ev["status"]:
            changes.append({"portfolioId": p.get("id"), "driver": (p.get("driver") or {}).get("name") or "—",
                            "was": old_status, "now": ev["status"],
                            "reasons": [r["reason"] for r in ev["failed"] + ev["unknown"]][:3]})
    return {"carrier": carrier.get("name"), "changed": len(changes),
            "newlyEligible": [c for c in changes if c["now"] == "ELIGIBLE"],
            "nowIneligible": [c for c in changes if c["was"] == "ELIGIBLE" and c["now"] != "ELIGIBLE"],
            "all": changes}


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

        "outcome": p.get("outcome"),
        "truthFlags": p.get("truthFlags"),

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
                   f"Compliance {('pulled (' + (src_label or 'no sources') + ')') if body.get('pull') else 'evaluated from entered records'} for {compliance['carrierName']} → verdict: {compliance['flag']}.",
                   "Anna" if body.get("pull") else "Recruiter")
        # Cross-source truth check: self-reported (pre-merge) vs pulled records + scanned docs.
        truth = anna.check_consistency(driver=p["driver"], records=records, documents=p.get("documents") or {})
        p["truthFlags"] = truth
        if truth["counts"]["high"]:
            _audit_log(p, "truth_flags",
                       f"Cross-source check: {truth['counts']['high']} high-risk discrepancy(ies) — "
                       + "; ".join(f["message"] for f in truth["flags"] if f["severity"] == "high")[:300], "Anna")
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
    cdl_txt = f"Class {cdl.get('class') or '—'}, {cdl.get('experienceYears') if cdl.get('experienceYears') is not None else '—'} yrs, endorsements {', '.join(cdl.get('endorsements') or []) or '—'}" if cdl else "—"
    mvr_txt = f"{mvr.get('movingViolations') if mvr.get('movingViolations') is not None else '—'} viol, {mvr.get('accidents') if mvr.get('accidents') is not None else '—'} acc, {mvr.get('dui', 0)} DUIs" if mvr else "—"
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
<table>{row('Carrier', (sel or {}).get('carrierName') or 'Not selected')}{row('Fit score', (str((sel or {}).get('fitScore')) + '%') if sel else '—')}{row('Selected by', decision.get('carrierSelectedBy') or '—')}{row('Selected at', decision.get('carrierSelectedAt') or '—')}</table>

<h2>Consent</h2>
<table>{row('Authorized', consent_auth)}{row('Signed by', (consent or {}).get('by') or '—')}{row('Signed at', (consent or {}).get('signedAt') or (consent or {}).get('capturedAt') or '—')}</table>

<h2>Compliance Verdict</h2>
{verdict}

<h2>Recruiter Decision</h2>
<table>{row('Status', str(decision.get('status') or 'pending').upper())}{row('Decided by', decision.get('decidedBy') or '—')}{row('Decided at', decision.get('decidedAt') or '—')}{row('Reason', decision.get('reason') or '—')}</table>

<h2>Audit Trail</h2>
<table class="audit"><tr><th>When</th><th>Actor</th><th>Event</th><th>Detail</th></tr>{audit}</table>
</body></html>"""



# ── Outcome capture + learning ───────────────────────────────────────────────
@router.post("/api/anna/portfolios/{pid}/outcome")
async def anna_outcome(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    outcome = body.get("outcome")
    if outcome not in anna.OUTCOME_KINDS:
        raise error(400, f"outcome must be one of: {', '.join(anna.OUTCOME_KINDS)}.")
    who = body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter"
    p["outcome"] = {"status": outcome, "note": body.get("note") or "", "by": who, "at": _now()}
    _audit_log(p, "outcome", f"Outcome recorded: {outcome}{(' — ' + body['note']) if body.get('note') else ''}.", who)

    learning = None
    carrier_id = (p.get("carrier") or {}).get("carrierId")
    carrier = await find_carrier_by_id(carrier_id) if carrier_id else None
    if carrier:
        base = anna.compile_spec({})["softWeights"]
        prior = await _learning_for(carrier_id)
        updated = anna.record_outcome(prior, outcome=outcome,
                                      breakdown=(p.get("carrier") or {}).get("scoreBreakdown") or {}, base_weights=base)
        await _save_learning(carrier_id, {"samples": updated["samples"], "weights": updated["weights"], "stats": updated["stats"]})
        learning = {"carrier": carrier.get("name"), **updated["stats"], "tuned": bool(updated["weights"])}
        if updated["weights"]:
            _audit_log(p, "learning", f"Anna re-tuned {carrier.get('name')}'s match weights from "
                       f"{updated['stats']['total']} placements ({updated['stats']['successRate']}% success).")
    await upsert_portfolio(p)
    return {"ok": True, "outcome": p["outcome"], "learning": learning}


# ── Metrics (ROI view) ───────────────────────────────────────────────────────
@router.get("/api/anna/metrics")
async def anna_metrics():
    return anna.compute_metrics(await read_portfolios())


# ── SLA nudges: what's stalled and needs a human ─────────────────────────────
@router.get("/api/anna/nudges")
async def anna_nudges():
    return anna.compute_nudges(await read_portfolios())


# ── Cross-source truth check: recompute discrepancies on demand ──────────────
@router.post("/api/anna/portfolios/{pid}/truth-check")
async def anna_truth_check(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    truth = anna.check_consistency(driver=p.get("driver") or {}, records=body.get("records") or {}, documents=p.get("documents") or {})
    p["truthFlags"] = truth
    await upsert_portfolio(p)
    return truth


# ── Carrier re-screen: when requirements change, who flips eligibility? ───────
@router.post("/api/anna/carriers/{cid}/rescreen")
async def anna_rescreen(cid: str):
    carrier = await find_carrier_by_id(cid)
    if not carrier:
        raise error(404, "Carrier not found")
    res = await anna.extract_carrier_spec(carrier.get("requirements") or {}, await _anna_opts())
    spec = anna.compile_spec({"id": cid, "name": carrier.get("name"), "requirements": res["requirements"]})
    changes = []
    for p in await read_portfolios():
        ev = anna.evaluate_gates(spec, p.get("driver") or {})
        prior = next((r for r in (p.get("recommendations") or []) if r.get("carrierId") == cid), None)
        old_status = prior["status"] if prior else None
        if old_status != ev["status"]:
            changes.append({"portfolioId": p.get("id"), "driver": (p.get("driver") or {}).get("name") or "—",
                            "was": old_status, "now": ev["status"],
                            "reasons": [r["reason"] for r in ev["failed"] + ev["unknown"]][:3]})
    return {"carrier": carrier.get("name"), "changed": len(changes),
            "newlyEligible": [c for c in changes if c["now"] == "ELIGIBLE"],
            "nowIneligible": [c for c in changes if c["was"] == "ELIGIBLE" and c["now"] != "ELIGIBLE"],
            "all": changes}

