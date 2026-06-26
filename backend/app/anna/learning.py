
"""Outcome-based learning — Python port of anna/learning.js."""
from __future__ import annotations
from datetime import datetime, timezone


"""Outcome-based learning: tune each carrier's soft-match weights from real
hiring outcomes, so the more drivers Anna places, the better its ranking gets.

Python port of anna/learning.js. Conservative + explainable by design: weights
only move once there is enough signal (min_samples), and only toward factors
where *successful* drivers scored higher than *unsuccessful* ones. Hard gates are
never touched — learning only re-weights the soft ranking among already-eligible
carriers.
"""
from datetime import datetime, timezone

# Outcome → signal. "good" = a placement that worked out; "bad" = it didn't.

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

def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_outcome(learning: dict | None = None, *, outcome: str, breakdown: dict | None = None,
                   base_weights: dict | None = None, opts: dict | None = None) -> dict:
    """Record an outcome sample and recompute tuned weights for one carrier.

    Returns ``{"samples", "weights", "stats"}`` where ``weights`` is ``None``
    until there is enough signal (caller then keeps the carrier's base weights).
    """
    learning = learning or {}
    breakdown = breakdown or {}
    base_weights = base_weights or {}
    opts = opts or {}
    signal = OUTCOME_SIGNAL.get(outcome)
    samples = list(learning.get("samples") or [])
    if signal in ("good", "bad"):
        samples.append({"at": _now(), "signal": signal, "breakdown": breakdown})
    weights = tune_weights(samples, base_weights, **opts)
    return {"samples": samples, "weights": weights, "stats": outcome_stats(samples)}


def tune_weights(samples: list | None = None, base_weights: dict | None = None,
                 min_samples: int = 5, k: float = 0.5) -> dict | None:
    """Compute tuned weights from samples, or ``None`` until enough signal."""
    samples = samples or []
    base_weights = base_weights or {}

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

    def avg(rows: list, f: str) -> float:
        if not rows:
            return 0.0
        return sum(float((r.get("breakdown") or {}).get(f) or 0) for r in rows) / len(rows)

    raw = {}
    for f in factors:
        delta = (avg(good, f) - avg(bad, f)) / 100  # -1..1
        # Nudge each weight up/down by at most k, never below a small floor.

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

def outcome_stats(samples: list | None = None) -> dict:
    samples = samples or []
    good = len([s for s in samples if s.get("signal") == "good"])
    bad = len([s for s in samples if s.get("signal") == "bad"])
    total = good + bad
    return {"good": good, "bad": bad, "total": total, "successRate": round(good / total * 100) if total else None}

