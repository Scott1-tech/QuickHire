"""Driver Portfolio (Stage 3) + compliance verdict writing (Stage 4)."""
import time
from datetime import datetime, timezone

from .claude import anna_configured, llm_complete, provider_model
from .matcher import STATUS, evaluate_gates
from .spec import compile_spec

_seq = [0]


def _id(p: str) -> str:
    n = _seq[0]
    _seq[0] += 1
    base36 = _to_base36(int(time.time() * 1000))
    return f"{p}_{base36}{_to_base36(n)}"


def _to_base36(num: int) -> str:
    if num == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    n = num
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_rr = [0]


def _pick_recruiter(pool: list):
    if not pool:
        return None
    r = pool[_rr[0] % len(pool)]
    _rr[0] += 1
    return r


def build_portfolio(*, driver: dict, match: dict, documents: dict | None = None, recruiter: str | None = None, recruiter_pool: list | None = None) -> dict:
    documents = documents or {}
    recruiter_pool = recruiter_pool or []
    assigned = recruiter or _pick_recruiter(recruiter_pool)
    doc_warnings = [f"{t}: {w}" for t, d in documents.items() for w in (d.get("warnings") or [])]
    matches = (match or {}).get("matches") or []
    recommendations = [{
        "carrierId": m["carrierId"],
        "carrierName": m["carrierName"],
        "status": m["status"],
        "fitScore": m["fitScore"],
        "scoreBreakdown": m.get("scoreBreakdown") or {},
        "fitSummary": m.get("fitSummary"),
        "nearMiss": m.get("nearMiss"),
        "topReason": (m.get("reasons") or [None])[0],
    } for m in matches]
    return {
        "id": _id("portfolio"),
        "createdAt": _now(),
        "driver": driver,
        "recommendations": recommendations,
        "suggestedTop": ((match or {}).get("top") or {}).get("carrierId"),
        "carrier": None,
        "documents": documents,
        "documentWarnings": doc_warnings,
        "compliance": None,
        "review": {
            "assignedRecruiter": assigned,
            "task": f"{assigned}, please review this driver and pick the best-fit carrier." if assigned else "Unassigned — needs a recruiter.",
            "status": "awaiting_carrier",
            "carrierSelectedBy": None, "carrierSelectedAt": None,
            "decidedBy": None, "decidedAt": None, "decisionReason": None,
        },
    }


def select_carrier(portfolio: dict, carrier_id: str, by: str = "Recruiter") -> dict:
    rec = next((r for r in (portfolio.get("recommendations") or []) if r["carrierId"] == carrier_id), None)
    if not rec:
        raise ValueError("That carrier is not in this driver's recommendation list.")
    portfolio["carrier"] = {"carrierId": rec["carrierId"], "carrierName": rec["carrierName"], "fitScore": rec["fitScore"], "status": rec["status"], "scoreBreakdown": rec.get("scoreBreakdown") or {}}
    review = portfolio.get("review") or {}
    portfolio["review"] = {
        **review,
        "status": "pending" if review.get("status") == "awaiting_carrier" else review.get("status"),
        "carrierSelectedBy": by,
        "carrierSelectedAt": _now(),
    }
    return portfolio


def merge_records(driver: dict, records: dict) -> dict:
    records = records or {}
    merged = {
        **driver,
        "mvr": {**(driver.get("mvr") or {}), **(records.get("mvr") or {})},
        "psp": {**(driver.get("psp") or {}), **(records.get("psp") or {})},
    }
    ch = records.get("clearinghouse") or {}
    if ch.get("prohibited"):
        merged["mvr"] = {**(driver.get("mvr") or {}), **(records.get("mvr") or {}), "dui": max((driver.get("mvr") or {}).get("dui") or 0, 1)}
    return merged


def _group_by_category(gate_results: list) -> list:
    cmap: dict = {}
    for r in gate_results:
        entry = cmap.setdefault(r["category"], {"pass": True, "reasons": []})
        if r["status"] != "PASS":
            entry["pass"] = False
            entry["reasons"].append(r["reason"])
    return [{"key": k, "pass": v["pass"], "reason": " ".join(v["reasons"]) or f"{k} meets requirements."} for k, v in cmap.items()]


def _build_summary(flag, failed, unknown, carrier_name):
    if flag == "approve":
        return f"Driver meets all of {carrier_name}'s stated CDL, MVR, PSP, and insurance requirements and is recommended for approval."
    if flag == "reject":
        return f"Driver does not meet {carrier_name}'s requirements: {' '.join(f['reason'] for f in failed)}"
    return f"Cannot finalize for {carrier_name} — missing data: {' '.join(u['reason'] for u in unknown)}"


async def write_compliance(*, carrier: dict, driver: dict, records: dict | None = None, opts: dict | None = None) -> dict:
    records = records or {}
    opts = opts or {}
    spec = carrier if carrier.get("hardGates") else compile_spec(carrier)
    merged = merge_records(driver, records)
    ev = evaluate_gates(spec, merged)
    status, gate_results, failed, unknown = ev["status"], ev["gateResults"], ev["failed"], ev["unknown"]

    flag = "approve" if status == STATUS["ELIGIBLE"] else ("review" if status == STATUS["NEEDS_DATA"] else "reject")
    by_category = _group_by_category(gate_results)
    summary = _build_summary(flag, failed, unknown, spec["carrierName"])

    if opts.get("narrate") and anna_configured(opts.get("apiKey")):
        try:
            import json
            out = await llm_complete(
                provider=opts.get("provider"),
                api_key=opts.get("apiKey"),
                model=opts.get("model") or provider_model(opts.get("provider") or "anthropic", "smart"),
                max_tokens=400,
                system="You are Anna, an FMCSA driver-qualification compliance assistant. Write a concise, factual 2-3 sentence summary for a recruiter. Do not change the provided verdict. Cite specifics.",
                messages=[{"role": "user", "content": f"Verdict: {flag.upper()} for {spec['carrierName']}.\nGate results:\n{json.dumps(gate_results, indent=2)}\n\nWrite the summary."}],
            )
            if out["text"].strip():
                summary = out["text"].strip()
        except Exception:  # noqa: BLE001
            pass

    return {
        "flag": flag,
        "status": status,
        "carrierId": spec["carrierId"],
        "carrierName": spec["carrierName"],
        "categories": by_category,
        "reasons": [r["reason"] for r in (failed + unknown)],
        "summary": summary,
        "checkedAt": _now(),
    }
