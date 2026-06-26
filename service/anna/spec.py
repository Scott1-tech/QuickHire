"""Carrier Spec compiler — Python port of anna/spec.js.

Turns a carrier's stored requirements into Anna's two-layer matching spec:
hard gates (pass/fail disqualifiers) + soft weights (ranking). Gates are data,
not code, so the result is auditable and testable.
"""
from __future__ import annotations
from typing import Any

CDL_RANK = {"A": 3, "B": 2, "C": 1}


def num(x: Any):
    try:
        if x is None or x == "":
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def _gte(d, v):
    dv, vv = num(d), num(v)
    return dv is not None and vv is not None and dv >= vv


def _lte(d, v):
    dv, vv = num(d), num(v)
    return dv is not None and vv is not None and dv <= vv


def _cdl_rank_gte(d, v):
    return CDL_RANK.get(str(d or "").upper(), 0) >= CDL_RANK.get(str(v or "").upper(), 0)


def _includes_all(d, v):
    d = d or []
    return isinstance(v, list) and all(x in d for x in v)


OPS = {
    "gte": _gte,
    "lte": _lte,
    "eq": lambda d, v: d == v,
    "cdlRankGte": _cdl_rank_gte,
    "includesAll": _includes_all,
    "notOwnerOperator": lambda d, v=None: d != "owner-operator",
}

NUMERIC_OPS = {"gte", "lte"}


def get_path(obj, path):
    cur = obj
    for k in str(path).split("."):
        if cur is None:
            return None
        cur = cur.get(k) if isinstance(cur, dict) else None
    return cur


DEFAULT_WEIGHTS = {
    "experienceMargin": 0.35,
    "cleanRecordMargin": 0.30,
    "endorsementsMatch": 0.20,
    "cdlValidityMargin": 0.15,
}


def normalize_weights(overrides):
    w = {**DEFAULT_WEIGHTS, **(overrides or {})}
    total = sum(float(v or 0) for v in w.values()) or 1
    return {k: float(v or 0) / total for k, v in w.items()}


def _blank(v):
    return v is None or v == "" or (isinstance(v, list) and len(v) == 0)


def compile_spec(carrier: dict | None = None) -> dict:
    carrier = carrier or {}
    reqs = carrier.get("requirements") or carrier or {}
    gates: list[dict] = []

    def push(g):
        if not _blank(g.get("value")):
            gates.append(g)

    elig = reqs.get("eligibility") or {}
    push({"id": "eligibility.minAge", "label": f"Minimum age {elig.get('minAge')}",
          "field": "age", "op": "gte", "value": num(elig.get("minAge")), "category": "Eligibility"})

    cdl = reqs.get("cdl") or {}
    push({"id": "cdl.class", "label": f"CDL Class {cdl.get('class')} or higher",
          "field": "cdl.class", "op": "cdlRankGte", "value": cdl.get("class"), "category": "CDL"})
    push({"id": "cdl.endorsements", "label": f"Endorsements: {', '.join(cdl.get('endorsements') or [])}",
          "field": "cdl.endorsements", "op": "includesAll", "value": cdl.get("endorsements"), "category": "CDL"})
    push({"id": "cdl.minExperienceYears", "label": f"Min {cdl.get('minExperienceYears')} yr(s) experience",
          "field": "cdl.experienceYears", "op": "gte", "value": num(cdl.get("minExperienceYears")), "category": "CDL"})
    push({"id": "cdl.minValidityDays", "label": f"CDL valid {cdl.get('minValidityDays')}+ days",
          "field": "cdl.expiresInDays", "op": "gte", "value": num(cdl.get("minValidityDays")), "category": "CDL"})
    if cdl.get("allowOwnerOperator") is False:
        push({"id": "cdl.noOwnerOperator", "label": "No owner-operators",
              "field": "cdl.type", "op": "notOwnerOperator", "value": True, "category": "CDL"})

    mvr = reqs.get("mvr") or {}
    push({"id": "mvr.maxMovingViolations", "label": f"Max {mvr.get('maxMovingViolations')} moving violation(s)",
          "field": "mvr.movingViolations", "op": "lte", "value": num(mvr.get("maxMovingViolations")), "category": "MVR"})
    push({"id": "mvr.maxAccidents", "label": f"Max {mvr.get('maxAccidents')} accident(s)",
          "field": "mvr.accidents", "op": "lte", "value": num(mvr.get("maxAccidents")), "category": "MVR"})
    push({"id": "mvr.maxDUI", "label": f"Max {mvr.get('maxDUI')} DUI/DWI",
          "field": "mvr.dui", "op": "lte", "value": num(mvr.get("maxDUI")), "category": "MVR"})

    psp = reqs.get("psp") or {}
    push({"id": "psp.maxCrashes", "label": f"Max {psp.get('maxCrashes')} PSP crash(es)",
          "field": "psp.crashes", "op": "lte", "value": num(psp.get("maxCrashes")), "category": "PSP"})
    push({"id": "psp.maxOOSInspections", "label": f"Max {psp.get('maxOOSInspections')} OOS inspection(s)",
          "field": "psp.oosInspections", "op": "lte", "value": num(psp.get("maxOOSInspections")), "category": "PSP"})

    ins = reqs.get("insurance") or {}
    push({"id": "insurance.minAutoLiability", "label": f"Min ${ins.get('minAutoLiability')} auto liability",
          "field": "insurance.autoLiability", "op": "gte", "value": num(ins.get("minAutoLiability")), "category": "Insurance"})
    if ins.get("cargoRequired"):
        push({"id": "insurance.minCargo", "label": f"Min ${ins.get('minCargo')} cargo",
              "field": "insurance.cargo", "op": "gte", "value": num(ins.get("minCargo")), "category": "Insurance"})

    return {
        "carrierId": carrier.get("id") or reqs.get("id"),
        "carrierName": carrier.get("name") or reqs.get("name") or "Unknown carrier",
        "version": carrier.get("specVersion") or carrier.get("version") or 1,
        "hardGates": gates,
        "softWeights": normalize_weights(reqs.get("softWeights")),
        "raw": reqs,
    }
