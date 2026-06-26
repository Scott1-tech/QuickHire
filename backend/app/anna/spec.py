"""Carrier Spec compiler — turns requirements into hard gates + soft weights."""

CDL_RANK = {"A": 3, "B": 2, "C": 1}


def _num(x):
    try:
        n = float(x)
        return n if n == n else None
    except (TypeError, ValueError):
        return None


def _includes_all(d, v):
    if not isinstance(v, list):
        return False
    dl = d if isinstance(d, list) else []
    return all(x in dl for x in v)


OPS = {
    "gte": lambda d, v: (_num(d) is not None and _num(v) is not None and _num(d) >= _num(v)),
    "lte": lambda d, v: (_num(d) is not None and _num(v) is not None and _num(d) <= _num(v)),
    "eq": lambda d, v: d == v,
    "cdlRankGte": lambda d, v: CDL_RANK.get(str(d or "").upper(), 0) >= CDL_RANK.get(str(v or "").upper(), 0),
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


def _fmt(n):
    try:
        return f"{int(n):,}"
    except (TypeError, ValueError):
        return n


def compile_spec(carrier: dict | None = None) -> dict:
    carrier = carrier or {}
    reqs = carrier.get("requirements") or carrier or {}
    gates = []

    def push(g):
        v = g["value"]
        if v is not None and v != "" and not (isinstance(v, list) and len(v) == 0):
            gates.append(g)

    elig = reqs.get("eligibility") or {}
    push({"id": "eligibility.minAge", "label": f"Minimum age {elig.get('minAge')}", "field": "age", "op": "gte", "value": _num(elig.get("minAge")), "category": "Eligibility"})

    cdl = reqs.get("cdl") or {}
    push({"id": "cdl.class", "label": f"CDL Class {cdl.get('class')} or higher", "field": "cdl.class", "op": "cdlRankGte", "value": cdl.get("class"), "category": "CDL"})
    push({"id": "cdl.endorsements", "label": f"Endorsements: {', '.join(cdl.get('endorsements') or [])}", "field": "cdl.endorsements", "op": "includesAll", "value": cdl.get("endorsements"), "category": "CDL"})
    push({"id": "cdl.minExperienceYears", "label": f"Min {cdl.get('minExperienceYears')} yr(s) experience", "field": "cdl.experienceYears", "op": "gte", "value": _num(cdl.get("minExperienceYears")), "category": "CDL"})
    push({"id": "cdl.minValidityDays", "label": f"CDL valid {cdl.get('minValidityDays')}+ days", "field": "cdl.expiresInDays", "op": "gte", "value": _num(cdl.get("minValidityDays")), "category": "CDL"})
    if cdl.get("allowOwnerOperator") is False:
        push({"id": "cdl.noOwnerOperator", "label": "No owner-operators", "field": "cdl.type", "op": "notOwnerOperator", "value": False, "category": "CDL"})

    mvr = reqs.get("mvr") or {}
    push({"id": "mvr.maxMovingViolations", "label": f"Max {mvr.get('maxMovingViolations')} moving violation(s)", "field": "mvr.movingViolations", "op": "lte", "value": _num(mvr.get("maxMovingViolations")), "category": "MVR"})
    push({"id": "mvr.maxAccidents", "label": f"Max {mvr.get('maxAccidents')} accident(s)", "field": "mvr.accidents", "op": "lte", "value": _num(mvr.get("maxAccidents")), "category": "MVR"})
    push({"id": "mvr.maxDUI", "label": f"Max {mvr.get('maxDUI')} DUI/DWI", "field": "mvr.dui", "op": "lte", "value": _num(mvr.get("maxDUI")), "category": "MVR"})

    psp = reqs.get("psp") or {}
    push({"id": "psp.maxCrashes", "label": f"Max {psp.get('maxCrashes')} PSP crash(es)", "field": "psp.crashes", "op": "lte", "value": _num(psp.get("maxCrashes")), "category": "PSP"})
    push({"id": "psp.maxOOSInspections", "label": f"Max {psp.get('maxOOSInspections')} OOS inspection(s)", "field": "psp.oosInspections", "op": "lte", "value": _num(psp.get("maxOOSInspections")), "category": "PSP"})

    ins = reqs.get("insurance") or {}
    minliab = _num(ins.get("minAutoLiability"))
    push({"id": "insurance.minAutoLiability", "label": f"Min ${_fmt(minliab) if minliab is not None else ins.get('minAutoLiability')} auto liability", "field": "insurance.autoLiability", "op": "gte", "value": minliab, "category": "Insurance"})
    if ins.get("cargoRequired"):
        mincargo = _num(ins.get("minCargo"))
        push({"id": "insurance.minCargo", "label": f"Min ${_fmt(mincargo) if mincargo is not None else ins.get('minCargo')} cargo", "field": "insurance.cargo", "op": "gte", "value": mincargo, "category": "Insurance"})

    return {
        "carrierId": carrier.get("id") or reqs.get("id"),
        "carrierName": carrier.get("name") or reqs.get("name") or "Unknown carrier",
        "version": carrier.get("specVersion") or carrier.get("version") or 1,
        "hardGates": gates,
        "softWeights": _normalize_weights(reqs.get("softWeights")),
        "raw": reqs,
    }


DEFAULT_WEIGHTS = {
    "experienceMargin": 0.35,
    "cleanRecordMargin": 0.30,
    "endorsementsMatch": 0.20,
    "cdlValidityMargin": 0.15,
}


def _normalize_weights(overrides):
    w = {**DEFAULT_WEIGHTS, **(overrides or {})}
    total = sum((_num(x) or 0) for x in w.values()) or 1
    return {k: (_num(v) or 0) / total for k, v in w.items()}
