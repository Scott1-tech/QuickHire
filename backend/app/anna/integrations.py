"""Compliance integrations: MVR · PSP · Clearinghouse (consent-gated, pluggable)."""
import asyncio
import os
from datetime import datetime, timezone

import httpx


class ConsentError(Exception):
    def __init__(self, missing):
        super().__init__(f"Missing driver consent for: {', '.join(missing)}. Capture consent before pulling these records.")
        self.missing = missing
        self.code = "CONSENT_REQUIRED"


def check_consent(consent: dict | None = None, types: list | None = None) -> bool:
    consent = consent or {}
    types = types or []
    missing = [t for t in types if not consent.get(t)]
    if missing:
        raise ConsentError(missing)
    return True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_consent(input_: dict | None = None) -> dict:
    input_ = input_ or {}

    def b(v):
        return v is True or v in ("true", "on", 1)

    mvr = b(input_.get("mvr")) or b(input_.get("consentMvr"))
    psp = b(input_.get("psp")) or b(input_.get("consentPsp"))
    clearinghouse = b(input_.get("clearinghouse")) or b(input_.get("consentClearinghouse")) or b(input_.get("consentEmployment"))
    any_ = mvr or psp or clearinghouse
    return {
        "mvr": mvr, "psp": psp, "clearinghouse": clearinghouse,
        "signedAt": input_.get("signedAt") or input_.get("consentCompletedAt") or (_now() if any_ else None),
        "signature": input_.get("signature"),
        "by": input_.get("by"),
    }


def _num_fields(o, keys):
    out = {}
    for k in keys:
        if o and o.get(k) is not None and o.get(k) != "":
            try:
                out[k] = float(o[k]) if not float(o[k]).is_integer() else int(float(o[k]))
            except (TypeError, ValueError):
                pass
    return out


class _Adapter:
    def __init__(self, name, env_prefix, map_response):
        self.name = name
        self.type = env_prefix.lower()
        self.env_prefix = env_prefix
        self.map_response = map_response

    def configured(self) -> bool:
        return bool(os.environ.get(f"{self.env_prefix}_API_URL") and os.environ.get(f"{self.env_prefix}_API_KEY"))

    async def pull(self, driver: dict | None = None, opts: dict | None = None) -> dict:
        driver = driver or {}
        opts = opts or {}
        if self.configured():
            cdl = driver.get("cdl") or {}
            async with httpx.AsyncClient(timeout=60) as client:
                res = await client.post(
                    os.environ[f"{self.env_prefix}_API_URL"],
                    headers={"content-type": "application/json", "authorization": f"Bearer {os.environ[f'{self.env_prefix}_API_KEY']}"},
                    json={
                        "licenseNumber": cdl.get("licenseNumber"),
                        "state": cdl.get("state"),
                        "firstName": driver.get("firstName"), "lastName": driver.get("lastName"), "name": driver.get("name"),
                        "dob": driver.get("dob"),
                    },
                )
            if not res.is_success:
                raise RuntimeError(f"{self.name} provider error {res.status_code}")
            return {"provider": self.name, "simulated": False, "pulledAt": _now(), "data": self.map_response(res.json())}
        seed = (opts.get("simulatedData") or {}).get(self.type)
        return {
            "provider": "simulated", "simulated": True, "pulledAt": _now(),
            "note": f"{self.name} provider not configured — simulated pull (no records).",
            "data": self.map_response(seed) if seed else {},
        }


INTEGRATIONS = {
    "mvr": _Adapter("MVR", "MVR", lambda r: _num_fields(r, ["movingViolations", "accidents", "dui"])),
    "psp": _Adapter("PSP", "PSP", lambda r: _num_fields(r, ["crashes", "oosInspections"])),
    "clearinghouse": _Adapter("Clearinghouse", "CLEARINGHOUSE", lambda r: {"prohibited": bool((r or {}).get("prohibited"))}),
}


async def pull_compliance(*, driver: dict, consent: dict, types: list | None = None, queue=None, opts: dict | None = None) -> dict:
    types = types or ["mvr", "psp", "clearinghouse"]
    opts = opts or {}
    check_consent(consent, types)

    async def run(t):
        return await INTEGRATIONS[t].pull(driver, opts)

    if queue:
        results = await asyncio.gather(*[queue.push(lambda t=t: run(t), f"pull:{t}") for t in types])
    else:
        results = await asyncio.gather(*[run(t) for t in types])

    records = {}
    sources = []
    for t, r in zip(types, results):
        records[t] = r["data"]
        sources.append({"type": t, "provider": r["provider"], "simulated": r["simulated"], "pulledAt": r["pulledAt"], "note": r.get("note")})
    return {"records": records, "sources": sources, "consent": {**consent, "verifiedAt": _now()}}


def integration_status() -> dict:
    return {k: ("live" if a.configured() else "simulated") for k, a in INTEGRATIONS.items()}
