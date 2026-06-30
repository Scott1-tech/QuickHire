"""The deterministic matching engine: gates, scoring, ranking, near-misses."""
from app.anna.matcher import evaluate_gates, match_driver, suggest_rematch
from app.anna.spec import compile_spec

CARRIER = {
    "id": "c1",
    "name": "Acme Freight",
    "requirements": {
        "eligibility": {"minAge": 23},
        "cdl": {"class": "A", "endorsements": ["H"], "minExperienceYears": 2, "minValidityDays": 30},
        "mvr": {"maxMovingViolations": 2, "maxAccidents": 1, "maxDUI": 0},
        "psp": {"maxCrashes": 1, "maxOOSInspections": 2},
        "insurance": {"minAutoLiability": 1000000},
    },
}


def _driver(**over):
    d = {
        "age": 30,
        "cdl": {"class": "A", "endorsements": ["H"], "experienceYears": 5, "expiresInDays": 200, "type": "company"},
        "mvr": {"movingViolations": 0, "accidents": 0, "dui": 0},
        "psp": {"crashes": 0, "oosInspections": 0},
        "insurance": {"autoLiability": 1000000},
    }
    d.update(over)
    return d


def test_fully_qualified_driver_is_eligible():
    ev = evaluate_gates(compile_spec(CARRIER), _driver())
    assert ev["status"] == "ELIGIBLE"
    assert ev["failed"] == []
    assert ev["unknown"] == []


def test_failed_hard_gate_makes_driver_ineligible():
    d = _driver(mvr={"movingViolations": 5, "accidents": 0, "dui": 0})
    ev = evaluate_gates(compile_spec(CARRIER), d)
    assert ev["status"] == "INELIGIBLE"
    assert any(r["id"] == "mvr.maxMovingViolations" for r in ev["failed"])


def test_missing_numeric_data_yields_needs_data():
    d = _driver(age=None)
    ev = evaluate_gates(compile_spec(CARRIER), d)
    assert ev["status"] == "NEEDS_DATA"
    assert any(r["id"] == "eligibility.minAge" for r in ev["unknown"])


def test_fail_dominates_unknown():
    d = _driver(age=None, mvr={"movingViolations": 9, "accidents": 0, "dui": 0})
    ev = evaluate_gates(compile_spec(CARRIER), d)
    assert ev["status"] == "INELIGIBLE"


def test_match_driver_ranks_eligible_first_and_picks_top():
    bad = {"id": "bad", "name": "Bad Co", "requirements": {"cdl": {"minExperienceYears": 20}}}
    good = {**CARRIER, "id": "good", "name": "Good Co"}
    res = match_driver(_driver(), [bad, good])
    assert res["matches"][0]["status"] == "ELIGIBLE"
    assert res["top"]["carrierId"] == "good"
    assert res["summary"]["eligible"] >= 1


def test_near_miss_set_only_when_exactly_one_gate_fails():
    carrier = {"id": "c", "name": "OneGate", "requirements": {"cdl": {"minExperienceYears": 10}}}
    d = _driver()
    d["cdl"]["experienceYears"] = 3   # single failing gate
    res = match_driver(d, [carrier])
    m = res["matches"][0]
    assert m["status"] == "INELIGIBLE"
    assert m["nearMiss"] is not None
    assert res["summary"]["nearMisses"][0]["carrierId"] == "c"


def test_min_score_filters_out_eligible_top():
    res = match_driver(_driver(), [CARRIER], {"minScore": 999})
    assert res["top"] is None
    assert res["summary"]["eligible"] == 0


def test_suggest_rematch_splits_eligible_and_stretch_and_honours_exclude():
    good = {**CARRIER, "id": "good", "name": "Good"}
    stretch = {"id": "stretch", "name": "Stretch", "requirements": {"cdl": {"minExperienceYears": 10}}}
    d = _driver()
    d["cdl"]["experienceYears"] = 3
    out = suggest_rematch(d, [good, stretch])
    assert any(m["carrierId"] == "good" for m in out["eligible"])
    assert any(m["carrierId"] == "stretch" for m in out["stretch"])

    excluded = suggest_rematch(d, [good, stretch], {"excludeCarrierIds": ["good"]})
    assert all(m["carrierId"] != "good" for m in excluded["eligible"])
