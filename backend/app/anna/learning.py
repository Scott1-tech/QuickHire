"""Outcome-based learning — Python port of anna/learning.js."""
from __future__ import annotations
from datetime import datetime, timezone

OUTCOME_SIGNAL = {
    "hired": "good", "started": "good", "retained_90d": "good",
    "washed_out": "bad", "rejected": "bad", "declined_by_driver": "bad",
}
OUTCOME_KINDS = list(OUTCOME_SIGNAL.keys())


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clamp01(x):
    return max(0.0, min(1.0, x))


def tune_weights(samples, base_weights, min_samples=5, k=0.5):
    good = [s for s in samples if s.get("signal") == "good"]
    bad = [s for s in samples if s.get("signal") == "bad"]
    if len(good) + len(bad) < min_samples or not good or not bad:
        return None
    factors = list(base_weights.keys())

    def avg(rows, f):
        return (sum(float((r.get("breakdown") or {}).get(f) or 0) for r in rows) / len(rows)) if rows else 0.0

    raw = {}
    for f in factors:
        delta = (avg(good, f) - avg(bad, f)) / 100.0
        raw[f] = max(0.02, base_weights[f] * (1 + k * delta))
    total = sum(raw.values()) or 1
    return {f: _clamp01(v / total) for f, v in raw.items()}


def outcome_stats(samples):
    good = len([s for s in samples if s.get("signal") == "good"])
    bad = len([s for s in samples if s.get("signal") == "bad"])
    total = good + bad
    return {"good": good, "bad": bad, "total": total,
            "successRate": round(good / total * 100) if total else None}


def record_outcome(learning, outcome, breakdown=None, base_weights=None, opts=None):
    opts = opts or {}
    signal = OUTCOME_SIGNAL.get(outcome)
    samples = list((learning or {}).get("samples") or [])
    if signal in ("good", "bad"):
        samples.append({"at": _now(), "signal": signal, "breakdown": breakdown or {}})
    weights = tune_weights(samples, base_weights or {}, **opts)
    return {"samples": samples, "weights": weights, "stats": outcome_stats(samples)}
