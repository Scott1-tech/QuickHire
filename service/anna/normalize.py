"""Lead normalization — Python port of anna/normalize.js (heuristic + optional LLM)."""
from __future__ import annotations

DRIVER_SHAPE = {
    "name": "string", "age": "number", "phone": "string", "email": "string",
    "cdl": {"class": "A|B|C", "endorsements": ["H", "N", "T", "X", "P", "S"],
            "experienceYears": "number", "type": "company|owner-operator", "expiresInDays": "number"},
    "mvr": {"movingViolations": "number", "accidents": "number", "dui": "number"},
    "psp": {"crashes": "number", "oosInspections": "number"},
    "insurance": {"autoLiability": "number", "hasCargo": "boolean", "cargo": "number"},
}


def _num(x):
    try:
        if x is None or x == "":
            return None
        f = float(x)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return None


def _clean(o):
    return {k: v for k, v in o.items() if v not in (None, "")}


def _coerce(p):
    p = p or {}
    out = dict(p)
    if p.get("age") is not None:
        out["age"] = _num(p.get("age"))
    cdl = p.get("cdl") or {}
    out["cdl"] = _clean({**cdl, "experienceYears": _num(cdl.get("experienceYears")),
                         "expiresInDays": _num(cdl.get("expiresInDays")),
                         "class": str(cdl["class"]).upper() if cdl.get("class") else None})
    mvr = p.get("mvr") or {}
    out["mvr"] = _clean({"movingViolations": _num(mvr.get("movingViolations")),
                         "accidents": _num(mvr.get("accidents")), "dui": _num(mvr.get("dui"))})
    psp = p.get("psp") or {}
    out["psp"] = _clean({"crashes": _num(psp.get("crashes")), "oosInspections": _num(psp.get("oosInspections"))})
    ins = p.get("insurance") or {}
    out["insurance"] = _clean({"autoLiability": _num(ins.get("autoLiability")),
                               "hasCargo": ins.get("hasCargo"), "cargo": _num(ins.get("cargo"))})
    return out


def _deterministic_map(lead):
    if any(lead.get(k) for k in ("cdl", "mvr", "psp", "insurance")):
        return _coerce(lead)
    return _coerce({
        "name": lead.get("name"), "age": lead.get("age"), "phone": lead.get("phone"), "email": lead.get("email"),
        "cdl": {"class": lead.get("cdlClass"), "endorsements": lead.get("endorsements"),
                "experienceYears": lead.get("experienceYears"), "type": lead.get("driverType"),
                "expiresInDays": lead.get("cdlExpiresInDays")},
        "mvr": {"movingViolations": lead.get("movingViolations"), "accidents": lead.get("accidents"), "dui": lead.get("dui")},
        "psp": {"crashes": lead.get("crashes"), "oosInspections": lead.get("oosInspections")},
        "insurance": {"autoLiability": lead.get("autoLiability"), "hasCargo": lead.get("hasCargo"), "cargo": lead.get("cargo")},
    })


async def normalize_driver(lead=None, opts=None):
    lead, opts = lead or {}, opts or {}
    if opts.get("apiKey"):
        try:
            from .llm import llm_json
            out = await llm_json(
                provider=opts.get("provider"), apiKey=opts.get("apiKey"), model=opts.get("model"), maxTokens=1024,
                system=("You normalize raw truck-driver lead data into a strict JSON DriverProfile for an FMCSA "
                        'driver-qualification system. Infer numeric fields from free text (e.g. "drove for Swift '
                        '2018-2021" => experienceYears 3). Never invent data; omit unknown fields. Return ONLY JSON.'),
                messages=[{"role": "user", "content":
                           f"Raw lead:\n{lead}\n\nReturn JSON: {{\"profile\": <DriverProfile>, "
                           f"\"confidence\": {{\"<dot.path>\": 0..1}} }}. Shape: {DRIVER_SHAPE}."}],
            )
            return {"profile": _coerce(out.get("profile") or {}), "confidence": out.get("confidence") or {}, "source": "ai"}
        except Exception:
            pass
    return {"profile": _deterministic_map(lead), "confidence": {}, "source": "heuristic"}
