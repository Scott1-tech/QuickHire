"""Matching engine — Python port of anna/matcher.js. Deterministic + explainable."""
from __future__ import annotations
from .spec import OPS, NUMERIC_OPS, get_path, compile_spec, num

STATUS = {"ELIGIBLE": "ELIGIBLE", "NEEDS_DATA": "NEEDS_DATA", "INELIGIBLE": "INELIGIBLE"}
GATE = {"PASS": "PASS", "FAIL": "FAIL", "UNKNOWN": "UNKNOWN"}


def _clamp01(x):
    return max(0.0, min(1.0, x))


def _explain_fail(g, dv):
    have = "none on file" if dv in (None, "") else (", ".join(dv) or "none" if isinstance(dv, list) else dv)
    op = g["op"]
    if op == "lte":
        return f"{g['label']}: has {have}, exceeds the limit of {g['value']}."
    if op == "gte":
        return f"{g['label']}: has {have}, below the required {g['value']}."
    if op == "cdlRankGte":
        return f"{g['label']}: holds {('Class ' + str(have)) if have else 'no class'}."
    if op == "includesAll":
        missing = [x for x in (g["value"] or []) if x not in (dv or [])]
        return f"{g['label']}: missing {', '.join(missing)}."
    if op == "notOwnerOperator":
        return f"{g['label']}: applicant is an owner-operator."
    return f"{g['label']}: does not meet requirement ({have})."


def evaluate_gates(spec, driver):
    results = []
    for g in spec["hardGates"]:
        dv = get_path(driver, g["field"])
        if (dv is None or dv == "") and g["op"] in NUMERIC_OPS:
            results.append({"id": g["id"], "category": g["category"], "status": GATE["UNKNOWN"],
                            "reason": f"{g['label']}: no data on file yet."})
            continue
        fn = OPS.get(g["op"])
        ok = fn(dv, g["value"]) if fn else True
        results.append({"id": g["id"], "category": g["category"],
                        "status": GATE["PASS"] if ok else GATE["FAIL"],
                        "reason": f"{g['label']}: OK." if ok else _explain_fail(g, dv)})
    failed = [r for r in results if r["status"] == GATE["FAIL"]]
    unknown = [r for r in results if r["status"] == GATE["UNKNOWN"]]
    status = STATUS["ELIGIBLE"]
    if failed:
        status = STATUS["INELIGIBLE"]
    elif unknown:
        status = STATUS["NEEDS_DATA"]
    return {"status": status, "gateResults": results, "failed": failed, "unknown": unknown}


def _margin(actual, cap):
    a, c = num(actual), num(cap)
    if a is None or c is None:
        return None
    if c <= 0:
        return 1.0 if a <= 0 else 0.0
    return _clamp01((c - a) / c)


def score_soft(spec, driver):
    reqs = spec.get("raw") or {}
    w = spec["softWeights"]
    factors = {}
    cdl, mvr, psp = driver.get("cdl") or {}, driver.get("mvr") or {}, driver.get("psp") or {}

    min_exp, exp = num((reqs.get("cdl") or {}).get("minExperienceYears")), num(cdl.get("experienceYears"))
    if min_exp is not None and exp is not None:
        factors["experienceMargin"] = (w["experienceMargin"], _clamp01((exp - min_exp) / 5))

    rmvr, rpsp = reqs.get("mvr") or {}, reqs.get("psp") or {}
    headrooms = [m for m in [
        _margin(mvr.get("movingViolations"), rmvr.get("maxMovingViolations")),
        _margin(mvr.get("accidents"), rmvr.get("maxAccidents")),
        _margin(mvr.get("dui"), rmvr.get("maxDUI")),
        _margin(psp.get("crashes"), rpsp.get("maxCrashes")),
        _margin(psp.get("oosInspections"), rpsp.get("maxOOSInspections")),
    ] if m is not None]
    if headrooms:
        factors["cleanRecordMargin"] = (w["cleanRecordMargin"], sum(headrooms) / len(headrooms))

    wanted = (reqs.get("cdl") or {}).get("endorsements") or []
    if wanted:
        have = cdl.get("endorsements") or []
        factors["endorsementsMatch"] = (w["endorsementsMatch"], _clamp01(len([e for e in wanted if e in have]) / len(wanted)))

    min_valid, expires = num((reqs.get("cdl") or {}).get("minValidityDays")), num(cdl.get("expiresInDays"))
    if min_valid is not None and expires is not None:
        factors["cdlValidityMargin"] = (w["cdlValidityMargin"], _clamp01((expires - min_valid) / 365))

    if not factors:
        return {"score": 0, "breakdown": {}}
    wsum = sum(wt for wt, _ in factors.values()) or 1
    score = 0.0
    breakdown = {}
    for fid, (wt, val) in factors.items():
        score += (wt / wsum) * val
        breakdown[fid] = round(val * 100)
    return {"score": round(score * 100), "breakdown": breakdown}


def build_fit_summary(spec, driver, status, score):
    if status == STATUS["INELIGIBLE"]:
        return None
    reqs = spec.get("raw") or {}
    cdl, mvr, psp = driver.get("cdl") or {}, driver.get("mvr") or {}, driver.get("psp") or {}
    pts = []
    exp, min_exp = num(cdl.get("experienceYears")), num((reqs.get("cdl") or {}).get("minExperienceYears"))
    if exp is not None and min_exp is not None:
        pts.append(f"{int(exp)} yr{'' if exp == 1 else 's'} experience vs {int(min_exp)} required")
    elif exp is not None:
        pts.append(f"{int(exp)} yr{'' if exp == 1 else 's'} experience")
    incidents = [x for x in [mvr.get("movingViolations"), mvr.get("accidents"), mvr.get("dui"),
                             psp.get("crashes"), psp.get("oosInspections")] if x is not None]
    if incidents and all(num(x) == 0 for x in incidents):
        pts.append("clean driving & safety record")
    elif incidents:
        pts.append("violations within this carrier's limits")
    wanted = (reqs.get("cdl") or {}).get("endorsements") or []
    if wanted and all(e in (cdl.get("endorsements") or []) for e in wanted):
        pts.append(f"holds required endorsement{'s' if len(wanted) > 1 else ''} ({', '.join(wanted)})")
    if num(cdl.get("expiresInDays")) is not None and num((reqs.get("cdl") or {}).get("minValidityDays")) is not None:
        pts.append(f"CDL valid {int(num(cdl.get('expiresInDays')))} days")
    if num(driver.get("age")) is not None and num((reqs.get("eligibility") or {}).get("minAge")) is not None:
        pts.append(f"meets the {int(num((reqs.get('eligibility') or {}).get('minAge')))}+ age requirement")
    lead = ("Strong fit" if score >= 80 else "Qualifies") if status == STATUS["ELIGIBLE"] else "Likely fit, pending records"
    tail = " MVR/PSP/Clearinghouse not pulled yet." if status == STATUS["NEEDS_DATA"] else ""
    name = spec["carrierName"]
    return f"{lead} for {name} — {', '.join(pts)}.{tail}" if pts else f"{lead} for {name}.{tail}"


def match_driver(driver, carriers, opts=None):
    opts = opts or {}
    specs = [c if c.get("hardGates") else compile_spec(c) for c in carriers]
    matches = []
    for spec in specs:
        ev = evaluate_gates(spec, driver)
        sc = {"score": 0, "breakdown": {}} if ev["status"] == STATUS["INELIGIBLE"] else score_soft(spec, driver)
        matches.append({
            "carrierId": spec["carrierId"], "carrierName": spec["carrierName"], "specVersion": spec["version"],
            "status": ev["status"], "fitScore": sc["score"], "scoreBreakdown": sc["breakdown"],
            "gateResults": ev["gateResults"],
            "reasons": [r["reason"] for r in ev["failed"] + ev["unknown"]],
            "fitSummary": build_fit_summary(spec, driver, ev["status"], sc["score"]),
            "nearMiss": ev["failed"][0]["reason"] if ev["status"] == STATUS["INELIGIBLE"] and len(ev["failed"]) == 1 else None,
        })
    order = {STATUS["ELIGIBLE"]: 0, STATUS["NEEDS_DATA"]: 1, STATUS["INELIGIBLE"]: 2}

    def count_unknown(m):
        return len([r for r in m["gateResults"] if r["status"] == "UNKNOWN"])

    def sort_key(m):
        if m["status"] == STATUS["ELIGIBLE"]:
            return (order[m["status"]], -m["fitScore"])
        if m["status"] == STATUS["NEEDS_DATA"]:
            return (order[m["status"]], count_unknown(m))
        return (order[m["status"]], 0 if m["nearMiss"] else 1)

    matches.sort(key=sort_key)
    min_score = num(opts.get("minScore")) or 0
    eligible = [m for m in matches if m["status"] == STATUS["ELIGIBLE"] and m["fitScore"] >= min_score]
    top = eligible[0] if eligible else next((m for m in matches if m["status"] == STATUS["NEEDS_DATA"]), None)
    return {
        "matches": matches, "top": top,
        "summary": {
            "eligible": len(eligible),
            "needsData": len([m for m in matches if m["status"] == STATUS["NEEDS_DATA"]]),
            "ineligible": len([m for m in matches if m["status"] == STATUS["INELIGIBLE"]]),
            "nearMisses": [{"carrierId": m["carrierId"], "carrierName": m["carrierName"], "reason": m["nearMiss"]}
                           for m in matches if m["nearMiss"]],
        },
    }


def suggest_rematch(driver, carriers, exclude_carrier_ids=None):
    ex = set(exclude_carrier_ids or [])
    matches = match_driver(driver, carriers)["matches"]
    return {
        "eligible": [m for m in matches if m["status"] == STATUS["ELIGIBLE"] and m["carrierId"] not in ex],
        "stretch": [m for m in matches if m["nearMiss"] and m["carrierId"] not in ex],
    }
