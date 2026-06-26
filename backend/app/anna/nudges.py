"""SLA nudges — what's stalled in the pipeline and needs a human, computed
purely from portfolios. Each open step past its threshold becomes an actionable
nudge with an age, an overdue flag, and a severity. Ported from the nifty branch.
"""
from __future__ import annotations

from datetime import datetime, timezone

# Thresholds (hours) after which an open step is "overdue".
SLA = {"select": 24, "consent": 24, "compliance": 24, "decision": 48, "outcome": 24 * 14}


def compute_nudges(portfolios, now=None):
    now = now or datetime.now(timezone.utc)

    def age_h(ts):
        if not ts:
            return 0
        try:
            return (now - datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 3600
        except Exception:  # noqa: BLE001
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
