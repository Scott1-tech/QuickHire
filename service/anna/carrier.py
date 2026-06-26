"""Carrier Spec Intake — Python port of anna/carrier.js.

Parses a carrier's free-text requirements into the structured shape compile_spec
needs. Deterministic parser by default; optional LLM path via llm.llm_json.
"""
from __future__ import annotations
import re


def _first_int(s):
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else None


def _parse_max(text):
    if text is None or str(text).strip() == "":
        return None
    stripped = re.sub(r"past\s+\d+", " ", str(text).lower())
    stripped = re.sub(r"\d+\s*(?:to\s*\d+\s*)?[-–]?\s*(?:year|yr|month|mo|day|week|wk)s?", " ", stripped)
    n = _first_int(stripped)
    if n is not None:
        return n
    if re.search(r"\b(no|none|zero|never)\b", stripped):
        return 0
    return None


def _is_yes(s):
    s = str(s or "")
    return bool(re.search(r"\b(yes|required|y)\b", s, re.I)) and not re.search(r"\bno\b", s, re.I)


def parse_deterministic(form):
    form = form or {}
    reqs: dict = {}

    def setv(obj, key, val):
        if val is not None:
            reqs.setdefault(obj, {})[key] = val

    setv("eligibility", "minAge", _first_int(form.get("minimumAge")))
    setv("cdl", "minExperienceYears", _first_int(form.get("minimumExperience")))
    setv("mvr", "maxMovingViolations", _parse_max(form.get("maxMovingViolations")))
    setv("mvr", "maxAccidents", _parse_max(form.get("dotRecordableAccidents")))
    setv("mvr", "maxDUI", _parse_max(form.get("duiDwiPolicy")))

    endorsements = []
    if _is_yes(form.get("hazmatRequired")):
        endorsements.append("H")
    other = str(form.get("otherEndorsements") or "").lower()
    if "tank" in other:
        endorsements.append("N")
    if "double" in other or "triple" in other:
        endorsements.append("T")
    if "passenger" in other:
        endorsements.append("P")
    if "school" in other and "bus" in other:
        endorsements.append("S")
    if endorsements:
        setv("cdl", "endorsements", list(dict.fromkeys(endorsements)))
    return reqs


async def extract_carrier_spec(form, opts=None):
    opts = opts or {}
    if opts.get("ai") and opts.get("apiKey"):
        try:
            from .llm import llm_json
            out = await llm_json(
                provider=opts.get("provider"), apiKey=opts.get("apiKey"), model=opts.get("model"),
                maxTokens=700,
                system=("You convert a trucking carrier's free-text hiring requirements into strict structured JSON. "
                        'Interpret "no more than 1 in the past 3 years" => 1, "none in a lifetime" => 0, '
                        '"at least 23 years of age" => 23. Omit anything not stated. Return ONLY JSON.'),
                messages=[{"role": "user", "content":
                           f"Carrier requirements (free text):\n{form}\n\nReturn JSON with eligibility.minAge, "
                           "cdl.class, cdl.endorsements, cdl.minExperienceYears, mvr.maxMovingViolations, "
                           "mvr.maxAccidents, mvr.maxDUI (omit unknowns)."}],
            )
            return {"requirements": out, "source": "ai"}
        except Exception:
            pass
    return {"requirements": parse_deterministic(form), "source": "heuristic"}
