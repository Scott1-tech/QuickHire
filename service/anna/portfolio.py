"""Portfolio build / carrier selection / compliance verdict — port of anna/portfolio.js."""
from __future__ import annotations
import time
from datetime import datetime, timezone
from .spec import compile_spec
from .matcher import evaluate_gates, STATUS

_seq = 0


def _now():
    return datetime.now(timezone.utc).isoformat()


def _id(prefix):
    global _seq
    _seq += 1
    return f"{prefix}_{int(time.time()*1000):x}{_seq:x}"


_rr = 0


def _pick_recruiter(pool):
    global _rr
    if not pool:
        return None
    r = pool[_rr % len(pool)]
    _rr += 1
    return r


def build_portfolio(driver, match, documents=None, recruiter=None, recruiter_pool=None):
    documents = documents or {}
    assigned = recruiter or _pick_recruiter(recruiter_pool or [])
    matches = (match or {}).get("matches") or []
    recommendations = [{
        "carrierId": m["carrierId"], "carrierName": m["carrierName"], "status": m["status"],
        "fitScore": m["fitScore"], "scoreBreakdown": m.get("scoreBreakdown") or {},
        "fitSummary": m.get("fitSummary"), "nearMiss": m.get("nearMiss"),
        "topReason": (m.get("reasons") or [None])[0],
    } for m in matches]
    doc_warnings = [f"{t}: {w}" for t, d in documents.items() for w in (d.get("warnings") or [])]
    return {
        "id": _id("portfolio"), "createdAt": _now(), "driver": driver,
        "recommendations": recommendations,
        "suggestedTop": ((match or {}).get("top") or {}).get("carrierId"),
        "carrier": None, "documents": documents, "documentWarnings": doc_warnings,
        "compliance": None,
        "review": {
            "assignedRecruiter": assigned,
            "task": f"{assigned}, please review this driver and pick the best-fit carrier." if assigned else "Unassigned — needs a recruiter.",
            "status": "awaiting_carrier",
            "carrierSelectedBy": None, "carrierSelectedAt": None,
            "decidedBy": None, "decidedAt": None, "decisionReason": None,
        },
    }


def select_carrier(portfolio, carrier_id, by="Recruiter"):
    rec = next((r for r in (portfolio.get("recommendations") or []) if r["carrierId"] == carrier_id), None)
    if not rec:
        raise ValueError("That carrier is not in this driver's recommendation list.")
    portfolio["carrier"] = {"carrierId": rec["carrierId"], "carrierName": rec["carrierName"],
                            "fitScore": rec["fitScore"], "status": rec["status"],
                            "scoreBreakdown": rec.get("scoreBreakdown") or {}}
    r = portfolio["review"]
    r["status"] = "pending" if r["status"] == "awaiting_carrier" else r["status"]
    r["carrierSelectedBy"] = by
    r["carrierSelectedAt"] = _now()
    return portfolio


def merge_records(driver, records):
    records = records or {}
    out = {**driver}
    out["mvr"] = {**(driver.get("mvr") or {}), **(records.get("mvr") or {})}
    out["psp"] = {**(driver.get("psp") or {}), **(records.get("psp") or {})}
    if (records.get("clearinghouse") or {}).get("prohibited"):
        out["mvr"] = {**out["mvr"], "dui": max((driver.get("mvr") or {}).get("dui") or 0, 1)}
    return out


def _group_by_category(gate_results):
    m = {}
    for r in gate_results:
        cat = m.setdefault(r["category"], {"pass": True, "reasons": []})
        if r["status"] != "PASS":
            cat["pass"] = False
            cat["reasons"].append(r["reason"])
    return [{"key": k, "pass": v["pass"], "reason": " ".join(v["reasons"]) or f"{k} meets requirements."}
            for k, v in m.items()]


def _build_summary(flag, failed, unknown, carrier_name):
    if flag == "approve":
        return f"Driver meets all of {carrier_name}'s stated requirements and is recommended for approval."
    if flag == "reject":
        return f"Driver does not meet {carrier_name}'s requirements: " + " ".join(f["reason"] for f in failed)
    return f"Cannot finalize for {carrier_name} — missing data: " + " ".join(u["reason"] for u in unknown)


async def write_compliance(carrier, driver, records=None, opts=None):
    records, opts = records or {}, opts or {}
    spec = carrier if carrier.get("hardGates") else compile_spec(carrier)
    merged = merge_records(driver, records)
    ev = evaluate_gates(spec, merged)
    flag = "approve" if ev["status"] == STATUS["ELIGIBLE"] else ("review" if ev["status"] == STATUS["NEEDS_DATA"] else "reject")
    summary = _build_summary(flag, ev["failed"], ev["unknown"], spec["carrierName"])
    if opts.get("narrate") and opts.get("apiKey"):
        try:
            from .llm import llm_complete
            res = await llm_complete(
                provider=opts.get("provider"), apiKey=opts.get("apiKey"), model=opts.get("model"), maxTokens=400,
                system=("You are Anna, an FMCSA driver-qualification compliance assistant. Write a concise, factual "
                        "2-3 sentence summary for a recruiter. Do not change the provided verdict. Cite specifics."),
                messages=[{"role": "user", "content":
                           f"Verdict: {flag.upper()} for {spec['carrierName']}.\nGate results:\n{ev['gateResults']}\n\nWrite the summary."}],
            )
            if (res.get("text") or "").strip():
                summary = res["text"].strip()
        except Exception:
            pass
    return {
        "flag": flag, "status": ev["status"], "carrierId": spec["carrierId"], "carrierName": spec["carrierName"],
        "categories": _group_by_category(ev["gateResults"]),
        "reasons": [r["reason"] for r in ev["failed"] + ev["unknown"]],
        "summary": summary, "checkedAt": _now(),
    }
