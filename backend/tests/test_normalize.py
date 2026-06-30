"""Lead normalization: numeric coercion, deterministic mapping, confidence."""
from app.anna import normalize
from app.anna.normalize import (
    _coerce,
    _deterministic_map,
    low_confidence_fields,
    normalize_driver,
)


def test_coerce_numbers_and_uppercases_class():
    out = _coerce({"age": "30", "cdl": {"class": "a", "experienceYears": "5", "expiresInDays": "200.0"}})
    assert out["age"] == 30
    assert out["cdl"]["class"] == "A"
    assert out["cdl"]["experienceYears"] == 5
    assert out["cdl"]["expiresInDays"] == 200


def test_coerce_drops_empty_values():
    out = _coerce({"cdl": {"class": None, "experienceYears": ""}})
    assert "class" not in out["cdl"]
    assert "experienceYears" not in out["cdl"]


def test_deterministic_map_flat_lead():
    out = _deterministic_map({"name": "Jo", "cdlClass": "a", "experienceYears": "4", "movingViolations": "1"})
    assert out["cdl"]["class"] == "A"
    assert out["cdl"]["experienceYears"] == 4
    assert out["mvr"]["movingViolations"] == 1


def test_deterministic_map_passes_through_nested_lead():
    out = _deterministic_map({"cdl": {"class": "B"}, "mvr": {"accidents": 2}})
    assert out["cdl"]["class"] == "B"
    assert out["mvr"]["accidents"] == 2


def test_low_confidence_fields_below_threshold():
    conf = {"a": 0.9, "b": 0.5, "c": "0.7"}
    assert set(low_confidence_fields(conf, 0.75)) == {"b", "c"}
    assert low_confidence_fields({}, 0.75) == []


async def test_normalize_driver_uses_heuristic_when_not_configured(monkeypatch):
    monkeypatch.setattr(normalize, "anna_configured", lambda *a, **k: False)
    out = await normalize_driver({"name": "X", "cdlClass": "a"}, {"apiKey": None})
    assert out["source"] == "heuristic"
    assert out["profile"]["cdl"]["class"] == "A"
