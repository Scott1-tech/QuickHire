"""Compliance integrations + consent gate — Python port of anna/integrations.js."""
from __future__ import annotations
import os
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc).isoformat()


class ConsentError(Exception):
    def __init__(self, missing):
        super().__init__(f"Missing driver consent for: {', '.join(missing)}. "
                         "Capture consent before pulling these records.")
        self.missing = missing
        self.code = "CONSENT_REQUIRED"


def check_consent(consent, types):
    missing = [t for t in (types or []) if not (consent or {}).get(t)]
    if missing:
        raise ConsentError(missing)
    return True


def _b(v):
    return v in (True, "true", "on", 1)


def normalize_consent(inp=None):
    inp = inp or {}
    mvr = _b(inp.get("mvr")) or _b(inp.get("consentMvr"))
    psp = _b(inp.get("psp")) or _b(inp.get("consentPsp"))
    clr = _b(inp.get("clearinghouse")) or _b(inp.get("consentClearinghouse")) or _b(inp.get("consentEmployment"))
    any_ = mvr or psp or clr
    return {
        "mvr": mvr, "psp": psp, "clearinghouse": clr,
        "signedAt": inp.get("signedAt") or inp.get("consentCompletedAt") or (_now() if any_ else None),
        "signature": inp.get("signature"), "by": inp.get("by"),
    }


def _num_fields(r, keys):
    out = {}
    for k in keys:
        if r and r.get(k) not in (None, ""):
            out[k] = float(r[k])
    return out


def _adapter(name, env_prefix, mapper):
    def configured():
        return bool(os.environ.get(f"{env_prefix}_API_URL") and os.environ.get(f"{env_prefix}_API_KEY"))

    async def pull(driver=None, opts=None):
        opts = opts or {}
        if configured():
            # Real provider call (integration seam) — left as a stub; raise so callers
            # fall back. Wire to your provider's contract here.
            raise RuntimeError(f"{name} provider call not implemented")
        seed = (opts.get("simulatedData") or {}).get(env_prefix.lower())
        return {"provider": "simulated", "simulated": True, "pulledAt": _now(),
                "note": f"{name} provider not configured — simulated pull (no records).",
                "data": mapper(seed) if seed else {}}

    return {"name": name, "type": env_prefix.lower(), "configured": configured, "pull": pull}


INTEGRATIONS = {
    "mvr": _adapter("MVR", "MVR", lambda r: _num_fields(r, ["movingViolations", "accidents", "dui"])),
    "psp": _adapter("PSP", "PSP", lambda r: _num_fields(r, ["crashes", "oosInspections"])),
    "clearinghouse": _adapter("Clearinghouse", "CLEARINGHOUSE", lambda r: {"prohibited": bool((r or {}).get("prohibited"))}),
}


async def pull_compliance(driver, consent, types=None, opts=None):
    types = types or ["mvr", "psp", "clearinghouse"]
    check_consent(consent, types)
    records, sources = {}, []
    for t in types:
        res = await INTEGRATIONS[t]["pull"](driver, opts or {})
        records[t] = res["data"]
        sources.append({"type": t, "provider": res["provider"], "simulated": res["simulated"],
                        "pulledAt": res["pulledAt"], "note": res.get("note")})
    return {"records": records, "sources": sources, "consent": {**(consent or {}), "verifiedAt": _now()}}


def integration_status():
    return {k: ("live" if a["configured"]() else "simulated") for k, a in INTEGRATIONS.items()}
