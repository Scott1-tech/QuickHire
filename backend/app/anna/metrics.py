"""Metrics — Python port of the /api/anna/metrics aggregation."""
from __future__ import annotations
from datetime import datetime, timezone

GOOD = ["hired", "started", "retained_90d"]
BAD = ["washed_out", "rejected", "declined_by_driver"]
MINUTES_SAVED_PER_LEAD = 25


def _hours(a, b):
    if not a or not b:
        return None
    try:
        return (datetime.fromisoformat(b.replace("Z", "+00:00")) - datetime.fromisoformat(a.replace("Z", "+00:00"))).total_seconds() / 3600
    except Exception:
        return None


def _avg(arr):
    return round(sum(arr) / len(arr), 1) if arr else None


def compute_metrics(portfolios):
    ps = portfolios or []
    leads = len(ps)
    matched = len([p for p in ps if any(r.get("status") == "ELIGIBLE" for r in (p.get("recommendations") or []))])

    def status(st):
        return len([p for p in ps if ((p.get("review") or {}).get("status") or "awaiting_carrier") == st])

    with_sel = [p for p in ps if (p.get("carrier") or {}).get("carrierId")]
    compliance = {"approve": 0, "reject": 0, "review": 0}
    for p in ps:
        flag = (p.get("compliance") or {}).get("flag")
        if flag:
            compliance[flag] = compliance.get(flag, 0) + 1

    outcome_counts, good, bad = {}, 0, 0
    for p in ps:
        o = (p.get("outcome") or {}).get("status")
        if not o:
            continue
        outcome_counts[o] = outcome_counts.get(o, 0) + 1
        if o in GOOD:
            good += 1
        elif o in BAD:
            bad += 1

    pc = {}
    for p in ps:
        c = p.get("carrier") or {}
        cid = c.get("carrierId")
        if not cid:
            continue
        e = pc.setdefault(cid, {"name": c.get("carrierName"), "selections": 0, "good": 0, "bad": 0})
        e["selections"] += 1
        o = (p.get("outcome") or {}).get("status")
        if o in GOOD:
            e["good"] += 1
        elif o in BAD:
            e["bad"] += 1
    per_carrier = sorted(
        [{**e, "successRate": (round(e["good"] / (e["good"] + e["bad"]) * 100) if (e["good"] + e["bad"]) else None)}
         for e in pc.values()],
        key=lambda x: -x["selections"])

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "leads": leads, "matched": matched,
        "matchRate": round(matched / leads * 100) if leads else None,
        "pipeline": {"awaiting_carrier": status("awaiting_carrier"), "pending": status("pending"),
                     "approved": status("approved"), "rejected": status("rejected")},
        "offersSelected": len(with_sel),
        "avgHoursToSelect": _avg([h for h in (_hours(p.get("createdAt"), (p.get("review") or {}).get("carrierSelectedAt"))
                                              for p in with_sel) if h is not None and h >= 0]),
        "avgHoursToDecision": _avg([h for h in (_hours(p.get("createdAt"), (p.get("review") or {}).get("decidedAt"))
                                                for p in ps) if h is not None and h >= 0]),
        "compliance": compliance,
        "outcomes": {"counts": outcome_counts, "good": good, "bad": bad,
                     "successRate": round(good / (good + bad) * 100) if (good + bad) else None},
        "recruiterHoursSaved": round(leads * MINUTES_SAVED_PER_LEAD / 60, 1),
        "perCarrier": per_carrier,
    }
