"""Carrier-spec compiler: operators, path lookup, gate compilation, weights."""
from app.anna.spec import (
    DEFAULT_WEIGHTS,
    OPS,
    _normalize_weights,
    compile_spec,
    get_path,
)


def test_ops_gte_lte_coerce_strings():
    assert OPS["gte"]("5", 3) is True
    assert OPS["gte"](2, 3) is False
    assert OPS["lte"](3, "3") is True


def test_ops_numeric_ops_reject_non_numbers():
    assert OPS["gte"](None, 3) is False
    assert OPS["lte"]("abc", 3) is False


def test_ops_cdl_rank_is_case_insensitive():
    assert OPS["cdlRankGte"]("A", "B") is True   # A(3) >= B(2)
    assert OPS["cdlRankGte"]("C", "B") is False  # C(1) < B(2)
    assert OPS["cdlRankGte"]("a", "A") is True
    assert OPS["cdlRankGte"](None, "A") is False


def test_ops_includes_all():
    assert OPS["includesAll"](["H", "N", "T"], ["H", "T"]) is True
    assert OPS["includesAll"](["H"], ["H", "T"]) is False
    assert OPS["includesAll"](None, ["H"]) is False
    assert OPS["includesAll"](["H"], []) is True       # vacuously true
    assert OPS["includesAll"](["H"], "H") is False      # required value not a list


def test_ops_not_owner_operator():
    assert OPS["notOwnerOperator"]("company") is True
    assert OPS["notOwnerOperator"]("owner-operator") is False


def test_get_path_nested_and_missing():
    obj = {"cdl": {"class": "A"}, "age": 5}
    assert get_path(obj, "cdl.class") == "A"
    assert get_path(obj, "age") == 5
    assert get_path(obj, "cdl.missing") is None
    assert get_path(obj, "missing.deep") is None


def test_compile_spec_drops_empty_and_zero_length_requirements():
    spec = compile_spec({
        "name": "Acme",
        "requirements": {"cdl": {"class": "A", "endorsements": []}},
    })
    ids = [g["id"] for g in spec["hardGates"]]
    assert "cdl.class" in ids
    assert "cdl.endorsements" not in ids     # empty list filtered out
    assert "cdl.minExperienceYears" not in ids  # None value filtered out
    assert spec["carrierName"] == "Acme"


def test_compile_spec_owner_operator_gate_only_when_disallowed():
    allowed = compile_spec({"requirements": {"cdl": {"allowOwnerOperator": True}}})
    assert "cdl.noOwnerOperator" not in [g["id"] for g in allowed["hardGates"]]
    disallowed = compile_spec({"requirements": {"cdl": {"allowOwnerOperator": False}}})
    assert "cdl.noOwnerOperator" in [g["id"] for g in disallowed["hardGates"]]


def test_compile_spec_cargo_gate_only_when_required():
    no_cargo = compile_spec({"requirements": {"insurance": {"minAutoLiability": 1000000}}})
    assert "insurance.minCargo" not in [g["id"] for g in no_cargo["hardGates"]]
    with_cargo = compile_spec({"requirements": {"insurance": {"cargoRequired": True, "minCargo": 100000}}})
    assert "insurance.minCargo" in [g["id"] for g in with_cargo["hardGates"]]


def test_normalize_weights_sum_to_one():
    w = _normalize_weights(None)
    assert abs(sum(w.values()) - 1.0) < 1e-9
    assert set(w.keys()) == set(DEFAULT_WEIGHTS.keys())


def test_normalize_weights_all_zero_does_not_divide_by_zero():
    w = _normalize_weights({k: 0 for k in DEFAULT_WEIGHTS})
    assert all(v == 0 for v in w.values())  # total falls back to 1
