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

    # Source ROI: which lead source actually yields hires (not just leads).
    src = {}
    for p in ps:
        s = (p.get("leadSource") or "unknown")
        e = src.setdefault(s, {"source": s, "leads": 0, "hired": 0, "rejected": 0})
        e["leads"] += 1
        o = (p.get("outcome") or {}).get("status")
        if o in GOOD:
            e["hired"] += 1
        elif o in BAD:
            e["rejected"] += 1
    by_source = sorted(
        [{**e, "hireRate": (round(e["hired"] / e["leads"] * 100) if e["leads"] else None)} for e in src.values()],
        key=lambda x: -x["leads"])

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
        "bySource": by_source,
    }


# ── SLA nudges: what's stalled and needs a human, computed from portfolios ───
# Thresholds (hours) after which an open step is "overdue".
SLA = {"select": 24, "consent": 24, "compliance": 24, "decision": 48, "outcome": 24 * 14}


def compute_nudges(portfolios, now=None):
    now = now or datetime.now(timezone.utc)

    def age_h(ts):
        if not ts:
            return 0
        try:
            return (now - datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 3600
        except Exception:
            return 0

    nudges = []

    def add(p, kind, message, since_ts, threshold):
        age = age_h(since_ts)
        nudges.append({
            "portfolioId": p.get("id"), "driver": (p.get("driver") or {}).get("name") or "—",
            "kind": kind, "message": message, "ageHours": round(age, 1),
            "overdue": age >= threshold,
            "severity": "high" if age >= threshold * 2 else ("medium" if age >= threshold else "low"),
        })

    for p in portfolios or []:
        review = p.get("review") or {}
        rstatus = review.get("status") or "awaiting_carrier"
        consent = p.get("consent") or {}
        has_consent = any(consent.get(t) for t in ("mvr", "psp", "clearinghouse"))
        if rstatus in ("approved", "rejected"):
            if rstatus == "approved" and not p.get("outcome"):
                add(p, "record_outcome", f"Approved — record the outcome for {(p.get('driver') or {}).get('name')}.", review.get("decidedAt"), SLA["outcome"])
            continue
        if not p.get("carrier"):
            add(p, "select_carrier", f"Pick a carrier for {(p.get('driver') or {}).get('name')} from Anna's ranked offers.", p.get("createdAt"), SLA["select"])
        elif not has_consent:
            add(p, "capture_consent", f"Capture driver consent for {(p.get('driver') or {}).get('name')} before compliance.", review.get("carrierSelectedAt"), SLA["consent"])
        elif not p.get("compliance"):
            add(p, "run_compliance", f"Run MVR/PSP/Clearinghouse for {(p.get('driver') or {}).get('name')}.", review.get("carrierSelectedAt"), SLA["compliance"])
        else:
            add(p, "make_decision", f"Approve or reject {(p.get('driver') or {}).get('name')} ({p['compliance'].get('flag')}).", (p.get("compliance") or {}).get("checkedAt"), SLA["decision"])

    sev = {"high": 0, "medium": 1, "low": 2}
    nudges.sort(key=lambda n: (sev[n["severity"]], -n["ageHours"]))
    return {
        "generatedAt": now.isoformat(),
        "total": len(nudges),
        "overdue": len([n for n in nudges if n["overdue"]]),
        "nudges": nudges,
    }
