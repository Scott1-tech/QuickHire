"""Carrier Spec Intake — free-text requirements → structured shape."""
import json
import re

from .claude import anna_configured, llm_json


async def extract_carrier_spec(form: dict | None = None, opts: dict | None = None) -> dict:
    form = form or {}
    opts = opts or {}
    if opts.get("ai") and anna_configured(opts.get("apiKey")):
        try:
            out = await llm_json(
                provider=opts.get("provider"),
                api_key=opts.get("apiKey"),
                model=opts.get("model"),
                max_tokens=700,
                system=(
                    "You convert a trucking carrier's free-text hiring requirements into strict structured JSON for a driver-matching engine. "
                    'Interpret phrases like "no more than 1 in the past 3 years" => 1, "none in a lifetime" => 0, "at least 23 years of age" => 23. '
                    "Omit anything not stated. Return ONLY JSON."
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Carrier requirements (free text):\n{json.dumps(form, indent=2)}\n\n"
                        "Return JSON with this shape (omit unknown fields):\n"
                        '{ "eligibility": { "minAge": n }, "cdl": { "class":"A|B|C", "endorsements":["H","N","T","X","P","S"], "minExperienceYears": n }, '
                        '"mvr": { "maxMovingViolations": n, "maxAccidents": n, "maxDUI": n } }'
                    ),
                }],
            )
            return {"requirements": out, "source": "ai"}
        except Exception:  # noqa: BLE001
            pass
    return {"requirements": _parse_deterministic(form), "source": "heuristic"}


def _first_int(s):
    m = re.search(r"\d+", str(s or ""))
    return int(m.group(0)) if m else None


def _parse_max(text):
    if text is None or str(text).strip() == "":
        return None
    stripped = re.sub(r"\d+\s*(?:to\s*\d+\s*)?[-–]?\s*(?:year|yr|month|mo|day|week|wk)s?", " ",
                      re.sub(r"past\s+\d+", " ", str(text).lower()))
    n = _first_int(stripped)
    if n is not None:
        return n
    if re.search(r"\b(no|none|zero|never)\b", stripped):
        return 0
    return None


def _is_yes(s):
    s = str(s or "")
    return bool(re.search(r"\b(yes|required|y)\b", s, re.I)) and not re.search(r"\bno\b", s, re.I)


def _parse_deterministic(form: dict | None = None) -> dict:
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
    if re.search(r"tank", other):
        endorsements.append("N")
    if re.search(r"double|triple", other):
        endorsements.append("T")
    if re.search(r"passenger", other):
        endorsements.append("P")
    if re.search(r"school\s*bus", other):
        endorsements.append("S")
    if endorsements:
        setv("cdl", "endorsements", list(dict.fromkeys(endorsements)))

    return reqs
