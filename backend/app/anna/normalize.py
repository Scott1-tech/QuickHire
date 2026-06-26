"""Turning messy input into a structured DriverProfile (Claude + fallback)."""
import json

from .claude import MODELS, anna_configured, call_claude_json, document_block

DRIVER_SHAPE = {
    "name": "string", "age": "number", "phone": "string", "email": "string",
    "cdl": {"class": "A|B|C", "endorsements": ["H", "N", "T", "X", "P", "S"], "experienceYears": "number", "type": "company|owner-operator", "expiresInDays": "number"},
    "mvr": {"movingViolations": "number", "accidents": "number", "dui": "number"},
    "psp": {"crashes": "number", "oosInspections": "number"},
    "insurance": {"autoLiability": "number", "hasCargo": "boolean", "cargo": "number"},
}


def _num(x):
    try:
        n = float(x)
        if n != n:
            return None
        return int(n) if n == int(n) else n
    except (TypeError, ValueError):
        return None


async def normalize_driver(lead: dict | None = None, opts: dict | None = None) -> dict:
    lead = lead or {}
    opts = opts or {}
    if anna_configured(opts.get("apiKey")):
        try:
            out = await call_claude_json(
                api_key=opts.get("apiKey"),
                model=opts.get("model") or MODELS["fast"],
                max_tokens=1024,
                system=(
                    "You normalize raw truck-driver lead data into a strict JSON DriverProfile for an FMCSA driver-qualification system. "
                    'Infer numeric fields from free text (e.g. "drove for Swift 2018-2021" => experienceYears 3). '
                    "Never invent data: if a field is unknown, omit it. Return ONLY JSON."
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Raw lead:\n{json.dumps(lead, indent=2)}\n\n"
                        'Return JSON: { "profile": <DriverProfile>, "confidence": { "<dot.path>": 0..1 } }. '
                        f"DriverProfile shape: {json.dumps(DRIVER_SHAPE)}."
                    ),
                }],
            )
            return {"profile": _coerce(out.get("profile") or {}), "confidence": out.get("confidence") or {}, "source": "ai"}
        except Exception:  # noqa: BLE001
            pass
    return {"profile": _deterministic_map(lead), "confidence": {}, "source": "heuristic"}


async def extract_from_document(p: dict | None = None) -> dict:
    p = p or {}
    if not anna_configured(p.get("apiKey")):
        raise RuntimeError("Document scanning requires ANTHROPIC_API_KEY")
    doc_type = p.get("docType") or "document"
    out = await call_claude_json(
        api_key=p.get("apiKey"),
        model=p.get("model") or MODELS["fast"],
        max_tokens=1024,
        system=(
            "You read US commercial driver documents (CDL, DOT medical card, certificates) and extract fields for an application. "
            'Report a confidence 0..1 per field. Flag expired documents and unreadable fields in "warnings". Return ONLY JSON.'
        ),
        messages=[{
            "role": "user",
            "content": [
                document_block(data_url=p.get("dataUrl"), base64_data=p.get("base64"), media_type=p.get("mediaType")),
                {"type": "text", "text": (
                    f'This is a "{doc_type}". Extract relevant fields (e.g. for a CDL: fullName, licenseNumber, state, class, endorsements[], issueDate, expirationDate). '
                    'Return JSON: { "fields": {...}, "confidence": {"<field>":0..1}, "warnings": ["..."] }.'
                )},
            ],
        }],
    )
    return {"fields": out.get("fields") or {}, "confidence": out.get("confidence") or {}, "warnings": out.get("warnings") or []}


def low_confidence_fields(confidence: dict | None = None, threshold: float = 0.75) -> list:
    confidence = confidence or {}
    return [k for k, c in confidence.items() if (_num(c) or 0) < threshold]


def _deterministic_map(lead: dict) -> dict:
    if lead.get("cdl") or lead.get("mvr") or lead.get("psp") or lead.get("insurance"):
        return _coerce(lead)
    return _coerce({
        "name": lead.get("name"), "age": lead.get("age"), "phone": lead.get("phone"), "email": lead.get("email"),
        "cdl": {"class": lead.get("cdlClass"), "endorsements": lead.get("endorsements"), "experienceYears": lead.get("experienceYears"), "type": lead.get("driverType"), "expiresInDays": lead.get("cdlExpiresInDays")},
        "mvr": {"movingViolations": lead.get("movingViolations"), "accidents": lead.get("accidents"), "dui": lead.get("dui")},
        "psp": {"crashes": lead.get("crashes"), "oosInspections": lead.get("oosInspections")},
        "insurance": {"autoLiability": lead.get("autoLiability"), "hasCargo": lead.get("hasCargo"), "cargo": lead.get("cargo")},
    })


def _clean(o: dict) -> dict:
    return {k: v for k, v in o.items() if v is not None and v != ""}


def _coerce(p: dict | None = None) -> dict:
    p = p or {}
    out = {**p}
    if p.get("age") is not None:
        out["age"] = _num(p.get("age"))
    cdl = p.get("cdl") or {}
    out["cdl"] = _clean({
        **cdl,
        "experienceYears": _num(cdl.get("experienceYears")),
        "expiresInDays": _num(cdl.get("expiresInDays")),
        "class": str(cdl.get("class")).upper() if cdl.get("class") else None,
    })
    mvr = p.get("mvr") or {}
    out["mvr"] = _clean({"movingViolations": _num(mvr.get("movingViolations")), "accidents": _num(mvr.get("accidents")), "dui": _num(mvr.get("dui"))})
    psp = p.get("psp") or {}
    out["psp"] = _clean({"crashes": _num(psp.get("crashes")), "oosInspections": _num(psp.get("oosInspections"))})
    ins = p.get("insurance") or {}
    out["insurance"] = _clean({"autoLiability": _num(ins.get("autoLiability")), "hasCargo": ins.get("hasCargo"), "cargo": _num(ins.get("cargo"))})
    return out
