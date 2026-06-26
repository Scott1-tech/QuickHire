"""Deterministic core tests for the Python Anna backend. Run: python3 test_core.py"""
import asyncio
from anna import (compile_spec, match_driver, evaluate_gates, score_soft, suggest_rematch, STATUS,
                  normalize_driver, build_portfolio, select_carrier, write_compliance, extract_carrier_spec,
                  check_consent, normalize_consent, pull_compliance, ConsentError, integration_status,
                  record_outcome, tune_weights, outcome_stats, compute_metrics)

passed = failed = 0


def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("  x", msg)


def section(s):
    print("\n" + s)


carrierA = {"id": "A", "name": "Acme Freight", "requirements": {
    "eligibility": {"minAge": 23},
    "cdl": {"class": "A", "endorsements": ["H"], "minExperienceYears": 2, "minValidityDays": 30},
    "mvr": {"maxMovingViolations": 2, "maxAccidents": 1, "maxDUI": 0},
    "psp": {"maxCrashes": 1, "maxOOSInspections": 2}, "insurance": {"minAutoLiability": 1000000}}}
carrierB = {"id": "B", "name": "Budget Lanes", "requirements": {
    "eligibility": {"minAge": 21}, "cdl": {"class": "A", "minExperienceYears": 1},
    "mvr": {"maxMovingViolations": 4, "maxAccidents": 2, "maxDUI": 1}}}
carrierC = {"id": "C", "name": "Hazmat Express", "requirements": {
    "cdl": {"class": "A", "endorsements": ["H", "N"], "minExperienceYears": 5},
    "mvr": {"maxMovingViolations": 0, "maxAccidents": 0, "maxDUI": 0}}}
good = {"name": "Pat", "age": 30, "cdl": {"class": "A", "endorsements": ["H", "N"], "experienceYears": 6, "expiresInDays": 400},
        "mvr": {"movingViolations": 0, "accidents": 0, "dui": 0}, "psp": {"crashes": 0, "oosInspections": 0},
        "insurance": {"autoLiability": 1000000}}


async def main():
    section("spec + gates")
    ok(len(compile_spec(carrierA)["hardGates"]) >= 8, "compiles gates")
    ok(evaluate_gates(compile_spec(carrierA), good)["status"] == STATUS["ELIGIBLE"], "clean driver eligible")
    dui = {**good, "mvr": {**good["mvr"], "dui": 1}}
    r = evaluate_gates(compile_spec(carrierA), dui)
    ok(r["status"] == STATUS["INELIGIBLE"] and any(f["id"] == "mvr.maxDUI" for f in r["failed"]), "DUI fails")
    no_age = {**good}; del no_age["age"]
    ok(evaluate_gates(compile_spec(carrierA), no_age)["status"] == STATUS["NEEDS_DATA"], "missing age => needs data")

    section("score + match")
    ok(score_soft(compile_spec(carrierA), good)["score"] >= 90, "excellent scores high")
    res = match_driver(good, [carrierA, carrierB, carrierC])
    ok(len(res["matches"]) == 3 and res["top"]["status"] == STATUS["ELIGIBLE"], "ranks all, top eligible")
    ok(all(isinstance(m["fitSummary"], str) for m in res["matches"] if m["status"] == "ELIGIBLE"), "eligible carry fitSummary")
    one = {**good, "mvr": {"movingViolations": 1, "accidents": 0, "dui": 0}}
    hz = next(m for m in match_driver(one, [carrierA, carrierC])["matches"] if m["carrierId"] == "C")
    ok(hz["status"] == STATUS["INELIGIBLE"] and hz["nearMiss"], "hazmat near-miss")

    section("rematch")
    rej = {**good, "mvr": {"movingViolations": 3, "accidents": 0, "dui": 0}}
    elig = suggest_rematch(rej, [carrierA, carrierB, carrierC], ["A"])["eligible"]
    ok(any(m["carrierId"] == "B" for m in elig) and not any(m["carrierId"] == "A" for m in elig), "suggests B not A")

    section("normalize (heuristic)")
    nd = await normalize_driver({"name": "Jo", "age": "27", "cdlClass": "a", "experienceYears": "4", "dui": "0", "movingViolations": "1"})
    ok(nd["source"] == "heuristic" and nd["profile"]["age"] == 27 and nd["profile"]["cdl"]["class"] == "A", "coerces + uppercases")

    section("carrier free-text parse")
    cp = await extract_carrier_spec({"minimumAge": "At least 23 years of age",
                                     "minimumExperience": "At least 2 yrs in the last 3 yrs",
                                     "maxMovingViolations": "No more than 1 in the past 3 years",
                                     "dotRecordableAccidents": "No accidents in the past 3 years",
                                     "duiDwiPolicy": "None in a lifetime", "hazmatRequired": "Yes"})
    reqs = cp["requirements"]
    ok(reqs["eligibility"]["minAge"] == 23 and reqs["cdl"]["minExperienceYears"] == 2, "age + exp")
    ok(reqs["mvr"]["maxMovingViolations"] == 1 and reqs["mvr"]["maxAccidents"] == 0 and reqs["mvr"]["maxDUI"] == 0, "caps")
    ok("H" in reqs["cdl"]["endorsements"], "hazmat => H")

    section("portfolio recommend + select")
    fm = match_driver(good, [carrierA, carrierB])
    p = build_portfolio(good, fm, recruiter_pool=["Jenna"])
    ok(p["carrier"] is None and p["review"]["status"] == "awaiting_carrier" and len(p["recommendations"]) == 2, "no auto-select")
    select_carrier(p, fm["matches"][1]["carrierId"], "Jenna")
    ok(p["carrier"]["carrierId"] == fm["matches"][1]["carrierId"] and p["review"]["status"] == "pending", "recruiter picks")

    section("compliance")
    clean = await write_compliance(carrierA, good)
    ok(clean["flag"] == "approve", "clean => approve")
    bad = await write_compliance(carrierA, good, {"mvr": {"dui": 2}})
    ok(bad["flag"] == "reject", "pulled DUIs => reject")

    section("consent gate")
    threw = None
    try:
        check_consent({"mvr": True}, ["mvr", "psp"])
    except ConsentError as e:
        threw = e
    ok(threw and "psp" in threw.missing, "consent gate names missing")
    nc = normalize_consent({"consentMvr": True, "consentEmployment": True})
    ok(nc["mvr"] and nc["clearinghouse"], "app consent maps")
    pulled = await pull_compliance(good, {"mvr": True, "psp": True}, ["mvr", "psp"])
    ok(all(s["simulated"] for s in pulled["sources"]), "unconfigured => simulated")
    ok(integration_status()["mvr"] == "simulated", "integration status")

    section("learning")
    base = {"experienceMargin": 0.4, "cleanRecordMargin": 0.4, "endorsementsMatch": 0.2}
    ok(tune_weights([{"signal": "good", "breakdown": {"experienceMargin": 90}}], base) is None, "insufficient => none")
    samples = ([{"signal": "good", "breakdown": {"experienceMargin": 90, "cleanRecordMargin": 50, "endorsementsMatch": 50}}] * 3 +
               [{"signal": "bad", "breakdown": {"experienceMargin": 15, "cleanRecordMargin": 50, "endorsementsMatch": 50}}] * 2)
    tuned = tune_weights(samples, base)
    ok(tuned and tuned["experienceMargin"] > base["experienceMargin"], "experience weight rises")
    ok(outcome_stats(samples)["successRate"] == 60, "success rate 60%")

    section("metrics")
    m = compute_metrics([{"createdAt": "2026-01-01T00:00:00Z", "recommendations": [{"status": "ELIGIBLE"}],
                          "carrier": {"carrierId": "A", "carrierName": "Acme"}, "compliance": {"flag": "approve"},
                          "review": {"status": "approved"}, "outcome": {"status": "hired"}}])
    ok(m["leads"] == 1 and m["matchRate"] == 100 and m["outcomes"]["successRate"] == 100, "metrics aggregate")

    print(f"\n{'OK' if not failed else 'FAIL'} {passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)


asyncio.run(main())
