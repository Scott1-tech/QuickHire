"""Molly checklist summaries + driver screening (AI with rule-engine fallback).

Ported from the Molly + screening sections of server.js.
"""
import json
import re

import httpx

from . import config

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_JSON_RE = re.compile(r"\{[\s\S]*\}")


async def _anthropic(model: str, max_tokens: int, messages: list, system: str | None = None) -> str:
    body = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        body["system"] = system
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            _ANTHROPIC_URL,
            headers={"x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
            json=body,
        )
    if not res.is_success:
        raise RuntimeError(f"Anthropic API error {res.status_code}")
    data = res.json()
    content = data.get("content") or []
    return content[0]["text"] if content and content[0].get("text") else ""


async def call_molly(step_def: dict, step_state: dict, candidate_name: str) -> dict:
    if not config.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")
    prompt = (
        "You are Molly, an AI hiring compliance assistant for a CDL trucking company.\n"
        f"A recruiter has completed the following compliance check for driver {candidate_name}:\n\n"
        f"Step: {step_def.get('label')}\n"
        f"Result: {step_state.get('result') or 'Not specified'}\n"
        f"Notes: {step_state.get('notes') or 'None'}\n"
        f"Status: {step_state.get('status')}\n\n"
        "Write a concise compliance summary as Molly. Return ONLY valid JSON matching this schema exactly:\n"
        '{\n  "oneLine": "one sentence summary",\n  "badge": "Pass" or "Fail" or "Pending",\n  "bullets": ["bullet 1", "bullet 2", "bullet 3"]\n}'
    )
    text = await _anthropic("claude-haiku-4-5-20251001", 400, [{"role": "user", "content": prompt}])
    m = _JSON_RE.search(text)
    if not m:
        raise RuntimeError("Could not parse Molly response")
    return json.loads(m.group(0))


SCREEN_SYSTEM = (
    "You are an FMCSA-compliant driver-qualification assistant for a CDL trucking carrier. "
    "You evaluate a single applicant strictly against the carrier's stated hiring requirements "
    "across four areas: CDL, MVR (motor vehicle record), PSP (FMCSA Pre-Employment Screening), and Insurance. "
    "Judge ONLY against the provided requirements and data. Never consider age, race, sex, religion, "
    "national origin, disability, or any other protected characteristic. Cite specific numbers in every reason. "
    "If data needed for a category is missing, mark that category as needing review rather than guessing."
)


def normalize_screen(p: dict | None) -> dict:
    p = p or {}
    decision = p.get("decision") if p.get("decision") in ("approved", "rejected", "review") else "review"
    cats = p.get("categories")
    categories = (
        [{"key": str(c.get("key", "")), "pass": bool(c.get("pass")), "reason": str(c.get("reason", ""))} for c in cats]
        if isinstance(cats, list) else []
    )
    return {"decision": decision, "categories": categories, "summary": str(p.get("summary", ""))}


async def screen_with_ai(requirements: dict, driver: dict) -> dict:
    user_prompt = (
        f"Carrier requirements:\n{json.dumps(requirements, indent=2)}\n\n"
        f"Driver applicant:\n{json.dumps(driver, indent=2)}\n\n"
        "Evaluate each of the four categories (CDL, MVR, PSP, Insurance) against the requirements. "
        "Return ONLY valid JSON matching this schema exactly:\n"
        "{\n"
        '  "decision": "approved" | "rejected" | "review",\n'
        '  "categories": [ { "key": "CDL" | "MVR" | "PSP" | "Insurance", "pass": true | false, "reason": "one concise sentence citing specifics" } ],\n'
        '  "summary": "one or two sentence overall recommendation"\n'
        "}\n"
        'Approve only if every category passes. Reject if any hard requirement fails. Use "review" only when required data is missing.'
    )
    text = await _anthropic(config.SCREENING_MODEL, 1024, [{"role": "user", "content": user_prompt}], SCREEN_SYSTEM)
    m = _JSON_RE.search(text)
    if not m:
        raise RuntimeError("Could not parse screening response")
    return normalize_screen(json.loads(m.group(0)))


def _num(v) -> float:
    try:
        n = float(v)
        return n if n == n else 0.0  # NaN guard
    except (TypeError, ValueError):
        return 0.0


def screen_heuristic(reqs: dict | None, driver: dict | None) -> dict:
    reqs = reqs or {}
    driver = driver or {}
    rank = {"A": 3, "B": 2, "C": 1}
    categories = []

    # CDL
    r = reqs.get("cdl") or {}
    d = driver.get("cdl") or {}
    fails = []
    if r.get("class") and rank.get(str(d.get("class") or "").upper(), 0) < rank.get(str(r["class"]).upper(), 0):
        fails.append(f"Requires a Class {r['class']} CDL; applicant holds {'Class ' + d['class'] if d.get('class') else 'no class on file'}.")
    missing = [e for e in (r.get("endorsements") or []) if e not in (d.get("endorsements") or [])]
    if missing:
        fails.append(f"Missing required endorsement(s): {', '.join(missing)}.")
    if _num(d.get("experienceYears")) < _num(r.get("minExperienceYears")):
        fails.append(f"Requires {int(_num(r.get('minExperienceYears')))} yr(s) experience; applicant has {int(_num(d.get('experienceYears')))}.")
    if r.get("allowOwnerOperator") is False and d.get("type") == "owner-operator":
        fails.append("Owner-operators are not accepted for this requirement.")
    if _num(r.get("minValidityDays")) > 0 and _num(d.get("expiresInDays")) < _num(r.get("minValidityDays")):
        fails.append(f"CDL must be valid {int(_num(r.get('minValidityDays')))}+ days; expires in {int(_num(d.get('expiresInDays')))} day(s).")
    categories.append({"key": "CDL", "pass": not fails, "reason": " ".join(fails) if fails else f"Class {d.get('class') or '—'} CDL meets class, endorsement, experience, and validity requirements."})

    # MVR
    r = reqs.get("mvr") or {}
    d = driver.get("mvr") or {}
    fails = []
    if _num(d.get("movingViolations")) > _num(r.get("maxMovingViolations")):
        fails.append(f"{int(_num(d.get('movingViolations')))} moving violation(s) exceeds the limit of {int(_num(r.get('maxMovingViolations')))}.")
    if _num(d.get("accidents")) > _num(r.get("maxAccidents")):
        fails.append(f"{int(_num(d.get('accidents')))} accident(s) exceeds the limit of {int(_num(r.get('maxAccidents')))}.")
    if _num(d.get("dui")) > _num(r.get("maxDUI")):
        fails.append(f"{int(_num(d.get('dui')))} DUI/DWI exceeds the limit of {int(_num(r.get('maxDUI')))}.")
    categories.append({"key": "MVR", "pass": not fails, "reason": " ".join(fails) if fails else f"Driving record is within limits over the last {int(_num(r.get('lookbackYears'))) or 3} years."})

    # PSP
    r = reqs.get("psp") or {}
    d = driver.get("psp") or {}
    fails = []
    if _num(d.get("crashes")) > _num(r.get("maxCrashes")):
        fails.append(f"{int(_num(d.get('crashes')))} PSP crash(es) exceeds the limit of {int(_num(r.get('maxCrashes')))}.")
    if _num(d.get("oosInspections")) > _num(r.get("maxOOSInspections")):
        fails.append(f"{int(_num(d.get('oosInspections')))} out-of-service inspection(s) exceeds the limit of {int(_num(r.get('maxOOSInspections')))}.")
    categories.append({"key": "PSP", "pass": not fails, "reason": " ".join(fails) if fails else "PSP crash and inspection history is within limits."})

    # Insurance
    r = reqs.get("insurance") or {}
    d = driver.get("insurance") or {}
    fails = []
    if _num(d.get("autoLiability")) < _num(r.get("minAutoLiability")):
        fails.append(f"Auto liability ${int(_num(d.get('autoLiability'))):,} is below the required ${int(_num(r.get('minAutoLiability'))):,}.")
    if r.get("cargoRequired") and not d.get("hasCargo"):
        fails.append("Cargo insurance is required but none is on file.")
    if r.get("cargoRequired") and d.get("hasCargo") and _num(d.get("cargo")) < _num(r.get("minCargo")):
        fails.append(f"Cargo coverage ${int(_num(d.get('cargo'))):,} is below the required ${int(_num(r.get('minCargo'))):,}.")
    categories.append({"key": "Insurance", "pass": not fails, "reason": " ".join(fails) if fails else "Insurance coverage meets the stated minimums."})

    all_pass = all(c["pass"] for c in categories)
    failed = [c["key"] for c in categories if not c["pass"]]
    return {
        "decision": "approved" if all_pass else "rejected",
        "categories": categories,
        "summary": (
            "Applicant meets all stated CDL, MVR, PSP, and insurance requirements and is recommended for approval."
            if all_pass else
            f"Applicant does not meet requirements in: {', '.join(failed)}. See category notes for specifics."
        ),
    }
