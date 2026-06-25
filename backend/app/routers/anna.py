"""/api/anna/* — Anna driver-qualification agent routes."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import anna, config
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


def _anna_opts() -> dict:
    return {"apiKey": config.ANTHROPIC_API_KEY}


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
            res = await anna.extract_carrier_spec(c["requirements"], _anna_opts())
            c["structuredRequirements"] = res["requirements"]
            c["structuredSpecVersion"] = SPEC_PARSE_VERSION
            await upsert_carrier(c)
        out.append({"id": c["id"], "name": c["name"], "requirements": c["structuredRequirements"], "specVersion": SPEC_PARSE_VERSION})
    return out


@router.post("/api/anna/chat")
async def anna_chat(request: Request):
    body = await request.json()
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise error(400, "messages[] is required.")
    try:
        return await anna.chat(messages=messages, context=body.get("context") or {}, opts=_anna_opts())
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
        norm = await anna.normalize_driver(driver or lead, _anna_opts())
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
            opts={**_anna_opts(), "recruiterPool": body.get("recruiterPool") or [], "minScore": float(body.get("minScore") or 0)},
        )
        if result.get("portfolio"):
            consent_input = body.get("consent") or lead
            consent = anna.normalize_consent(consent_input)
            if consent.get("mvr") or consent.get("psp") or consent.get("clearinghouse"):
                result["portfolio"]["consent"] = consent
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
        norm = await anna.normalize_driver(driver, _anna_opts())
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
        anna.select_carrier(p, carrier_id, body.get("by") or (p.get("review") or {}).get("assignedRecruiter") or "Recruiter")
        await upsert_portfolio(p)
        return {"ok": True, "carrier": p.get("carrier"), "review": p.get("review")}
    except Exception as e:  # noqa: BLE001
        raise error(400, str(e))


@router.post("/api/anna/portfolios/{pid}/consent")
async def anna_consent(pid: str, request: Request):
    p = await find_portfolio(pid)
    if not p:
        raise error(404, "Not found")
    body = await request.json()
    consent = anna.normalize_consent(body or {})
    consent["capturedAt"] = datetime.now(timezone.utc).isoformat()
    consent["ip"] = request.client.host if request.client else None
    p["consent"] = consent
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
            pulled = await anna.pull_compliance(driver=p["driver"], consent=consent, types=types, queue=None, opts=_anna_opts())
            records = {**pulled["records"], **records}
            p["consent"] = pulled["consent"]
            p["complianceSources"] = pulled["sources"]
        compliance = await anna.write_compliance(
            carrier={"id": carrier["id"], "name": carrier["name"], "requirements": carrier.get("structuredRequirements") or {}},
            driver=p["driver"],
            records=records,
            opts={**_anna_opts(), "narrate": bool(config.ANTHROPIC_API_KEY)},
        )
        p["compliance"] = compliance
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
    p["review"] = {
        **(p.get("review") or {}),
        "status": decision,
        "decidedBy": body.get("by") or "Recruiter",
        "decidedAt": datetime.now(timezone.utc).isoformat(),
        "decisionReason": body.get("reason") or "",
    }
    await upsert_portfolio(p)
    rematch = None
    if decision == "rejected":
        try:
            rematch = anna.suggest_rematch(p["driver"], await _anna_carriers(), {"excludeCarrierIds": [cid for cid in [(p.get("carrier") or {}).get("carrierId")] if cid]})
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True, "review": p["review"], "rematch": rematch}
