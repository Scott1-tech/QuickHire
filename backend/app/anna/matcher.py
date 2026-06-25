"""The deterministic, explainable matching algorithm (hard gates + soft score)."""
from .spec import NUMERIC_OPS, OPS, compile_spec, get_path

STATUS = {"ELIGIBLE": "ELIGIBLE", "NEEDS_DATA": "NEEDS_DATA", "INELIGIBLE": "INELIGIBLE"}
GATE = {"PASS": "PASS", "FAIL": "FAIL", "UNKNOWN": "UNKNOWN"}


def _num(x):
    try:
        n = float(x)
        return n if n == n else None
    except (TypeError, ValueError):
        return None


def _clamp01(x):
    return max(0.0, min(1.0, x))


def _explain_fail(g, dv):
    if dv is None or dv == "":
        have = "none on file"
    elif isinstance(dv, list):
        have = ", ".join(str(x) for x in dv) or "none"
    else:
        have = dv
    op = g["op"]
    if op == "lte":
        return f"{g['label']}: has {have}, exceeds the limit of {g['value']}."
    if op == "gte":
        return f"{g['label']}: has {have}, below the required {g['value']}."
    if op == "cdlRankGte":
        return f"{g['label']}: holds {('Class ' + str(have)) if have else 'no class'}."
    if op == "includesAll":
        dl = dv if isinstance(dv, list) else []
        missing = [x for x in (g["value"] or []) if x not in dl]
        return f"{g['label']}: missing {', '.join(missing)}."
    if op == "notOwnerOperator":
        return f"{g['label']}: applicant is an owner-operator."
    return f"{g['label']}: does not meet requirement ({have})."


def evaluate_gates(spec: dict, driver: dict) -> dict:
    gate_results = []
    for g in spec["hardGates"]:
        dv = get_path(driver, g["field"])
        if (dv is None or dv == "") and g["op"] in NUMERIC_OPS:
            gate_results.append({"id": g["id"], "category": g["category"], "status": GATE["UNKNOWN"], "reason": f"{g['label']}: no data on file yet."})
            continue
        fn = OPS.get(g["op"])
        passed = fn(dv, g["value"]) if fn else True
        gate_results.append({
            "id": g["id"], "category": g["category"],
            "status": GATE["PASS"] if passed else GATE["FAIL"],
            "reason": f"{g['label']}: OK." if passed else _explain_fail(g, dv),
        })

    failed = [r for r in gate_results if r["status"] == GATE["FAIL"]]
    unknown = [r for r in gate_results if r["status"] == GATE["UNKNOWN"]]
    status = STATUS["ELIGIBLE"]
    if failed:
        status = STATUS["INELIGIBLE"]
    elif unknown:
        status = STATUS["NEEDS_DATA"]
    return {"status": status, "gateResults": gate_results, "failed": failed, "unknown": unknown}


def _margin(actual, cap):
    a, c = _num(actual), _num(cap)
    if a is None or c is None:
        return None
    if c <= 0:
        return 1.0 if a <= 0 else 0.0
    return _clamp01((c - a) / c)


def score_soft(spec: dict, driver: dict) -> dict:
    reqs = spec.get("raw") or {}
    w = spec["softWeights"]
    factors = {}

    min_exp = _num((reqs.get("cdl") or {}).get("minExperienceYears"))
    exp = _num((driver.get("cdl") or {}).get("experienceYears"))
    if min_exp is not None and exp is not None:
        factors["experienceMargin"] = {"weight": w["experienceMargin"], "value": _clamp01((exp - min_exp) / 5)}

    mvr_d, psp_d = driver.get("mvr") or {}, driver.get("psp") or {}
    mvr_r, psp_r = reqs.get("mvr") or {}, reqs.get("psp") or {}
    headrooms = [m for m in [
        _margin(mvr_d.get("movingViolations"), mvr_r.get("maxMovingViolations")),
        _margin(mvr_d.get("accidents"), mvr_r.get("maxAccidents")),
        _margin(mvr_d.get("dui"), mvr_r.get("maxDUI")),
        _margin(psp_d.get("crashes"), psp_r.get("maxCrashes")),
        _margin(psp_d.get("oosInspections"), psp_r.get("maxOOSInspections")),
    ] if m is not None]
    if headrooms:
        factors["cleanRecordMargin"] = {"weight": w["cleanRecordMargin"], "value": sum(headrooms) / len(headrooms)}

    wanted = (reqs.get("cdl") or {}).get("endorsements") or []
    if wanted:
        have = (driver.get("cdl") or {}).get("endorsements") or []
        factors["endorsementsMatch"] = {"weight": w["endorsementsMatch"], "value": _clamp01(len([e for e in wanted if e in have]) / len(wanted))}

    min_valid = _num((reqs.get("cdl") or {}).get("minValidityDays"))
    expires_in = _num((driver.get("cdl") or {}).get("expiresInDays"))
    if min_valid is not None and expires_in is not None:
        factors["cdlValidityMargin"] = {"weight": w["cdlValidityMargin"], "value": _clamp01((expires_in - min_valid) / 365)}

    ids = list(factors.keys())
    if not ids:
        return {"score": 0, "breakdown": {}}
    wsum = sum(factors[i]["weight"] for i in ids) or 1
    score = 0.0
    breakdown = {}
    for i in ids:
        score += (factors[i]["weight"] / wsum) * factors[i]["value"]
        breakdown[i] = round(factors[i]["value"] * 100)
    return {"score": round(score * 100), "breakdown": breakdown}


def build_fit_summary(spec, driver, status, score):
    if status == STATUS["INELIGIBLE"]:
        return None
    reqs = spec.get("raw") or {}
    cdl_d = driver.get("cdl") or {}
    cdl_r = reqs.get("cdl") or {}
    pts = []

    exp, min_exp = _num(cdl_d.get("experienceYears")), _num(cdl_r.get("minExperienceYears"))
    if exp is not None and min_exp is not None:
        pts.append(f"{int(exp) if exp == int(exp) else exp} yr{'' if exp == 1 else 's'} experience vs {int(min_exp) if min_exp == int(min_exp) else min_exp} required")
    elif exp is not None:
        pts.append(f"{int(exp) if exp == int(exp) else exp} yr{'' if exp == 1 else 's'} experience")

    mvr_d, psp_d = driver.get("mvr") or {}, driver.get("psp") or {}
    incidents = [x for x in [mvr_d.get("movingViolations"), mvr_d.get("accidents"), mvr_d.get("dui"), psp_d.get("crashes"), psp_d.get("oosInspections")] if x is not None]
    if incidents and all(_num(x) == 0 for x in incidents):
        pts.append("clean driving & safety record")
    elif incidents:
        pts.append("violations within this carrier's limits")

    wanted = cdl_r.get("endorsements") or []
    if wanted:
        have = cdl_d.get("endorsements") or []
        if all(e in have for e in wanted):
            pts.append(f"holds required endorsement{'s' if len(wanted) > 1 else ''} ({', '.join(wanted)})")
    if _num(cdl_d.get("expiresInDays")) is not None and _num(cdl_r.get("minValidityDays")) is not None:
        pts.append(f"CDL valid {cdl_d.get('expiresInDays')} days")
    if _num(driver.get("age")) is not None and _num((reqs.get("eligibility") or {}).get("minAge")) is not None:
        pts.append(f"meets the {reqs['eligibility']['minAge']}+ age requirement")

    lead = ("Strong fit" if score >= 80 else "Qualifies") if status == STATUS["ELIGIBLE"] else "Likely fit, pending records"
    tail = " MVR/PSP/Clearinghouse not pulled yet." if status == STATUS["NEEDS_DATA"] else ""
    if pts:
        return f"{lead} for {spec['carrierName']} — {', '.join(pts)}.{tail}"
    return f"{lead} for {spec['carrierName']}.{tail}"


def _count_unknown(m):
    return len([r for r in m["gateResults"] if r["status"] == "UNKNOWN"])


def match_driver(driver: dict, carriers: list | None = None, opts: dict | None = None) -> dict:
    carriers = carriers or []
    opts = opts or {}
    specs = [c if c.get("hardGates") else compile_spec(c) for c in carriers]
    matches = []
    for spec in specs:
        ev = evaluate_gates(spec, driver)
        if ev["status"] == STATUS["INELIGIBLE"]:
            score, breakdown = 0, {}
        else:
            ss = score_soft(spec, driver)
            score, breakdown = ss["score"], ss["breakdown"]
        failed, unknown = ev["failed"], ev["unknown"]
        matches.append({
            "carrierId": spec["carrierId"],
            "carrierName": spec["carrierName"],
            "specVersion": spec["version"],
            "status": ev["status"],
            "fitScore": score,
            "scoreBreakdown": breakdown,
            "gateResults": ev["gateResults"],
            "reasons": [r["reason"] for r in (failed + unknown)],
            "fitSummary": build_fit_summary(spec, driver, ev["status"], score),
            "nearMiss": failed[0]["reason"] if ev["status"] == STATUS["INELIGIBLE"] and len(failed) == 1 else None,
        })

    order = {STATUS["ELIGIBLE"]: 0, STATUS["NEEDS_DATA"]: 1, STATUS["INELIGIBLE"]: 2}

    import functools

    def cmp(a, b):
        if order[a["status"]] != order[b["status"]]:
            return order[a["status"]] - order[b["status"]]
        if a["status"] == STATUS["ELIGIBLE"]:
            return b["fitScore"] - a["fitScore"]
        if a["status"] == STATUS["NEEDS_DATA"]:
            return _count_unknown(a) - _count_unknown(b)
        return (1 if b["nearMiss"] else 0) - (1 if a["nearMiss"] else 0)

    matches.sort(key=functools.cmp_to_key(cmp))

    min_score = _num(opts.get("minScore")) or 0
    eligible = [m for m in matches if m["status"] == STATUS["ELIGIBLE"] and m["fitScore"] >= min_score]
    top = eligible[0] if eligible else next((m for m in matches if m["status"] == STATUS["NEEDS_DATA"]), None)

    return {
        "matches": matches,
        "top": top,
        "summary": {
            "eligible": len(eligible),
            "needsData": len([m for m in matches if m["status"] == STATUS["NEEDS_DATA"]]),
            "ineligible": len([m for m in matches if m["status"] == STATUS["INELIGIBLE"]]),
            "nearMisses": [{"carrierId": m["carrierId"], "carrierName": m["carrierName"], "reason": m["nearMiss"]} for m in matches if m["nearMiss"]],
        },
    }


def suggest_rematch(driver: dict, carriers: list, opts: dict | None = None) -> dict:
    opts = opts or {}
    exclude = set(opts.get("excludeCarrierIds") or [])
    matches = match_driver(driver, carriers)["matches"]
    eligible = [m for m in matches if m["status"] == STATUS["ELIGIBLE"] and m["carrierId"] not in exclude]
    stretch = [m for m in matches if m["nearMiss"] and m["carrierId"] not in exclude]
    return {"eligible": eligible, "stretch": stretch}
