"""Cross-source truth check — flag contradictions across the driver's
self-reported application, the official pulled records (MVR/PSP/Clearinghouse),
and the scanned CDL/medical-card document.

Pure logic over data Anna already has. Catches misrepresentation (understated
violations, inflated experience), identity mismatches, and expired documents
*before* a carrier does. Returns flags with severity + an overall risk level.
"""
from __future__ import annotations
from datetime import datetime, timezone


def _num(x):
    try:
        return None if x is None or x == "" else float(x)
    except (TypeError, ValueError):
        return None


def _years_since(date_str, now):
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d", "%m-%d-%Y"):
        try:
            d = datetime.strptime(str(date_str)[:10], fmt)
            return (now - d.replace(tzinfo=timezone.utc)).days / 365.25
        except ValueError:
            continue
    return None


def _parse_date(date_str):
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(str(date_str)[:10], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _norm_name(n):
    return " ".join(str(n or "").lower().split())


def check_consistency(driver=None, records=None, documents=None, now=None):
    """driver = self-reported profile; records = pulled {mvr,psp,clearinghouse};
    documents = {docType: {fields, confidence, warnings}}. Returns {flags, risk}."""
    driver = driver or {}
    records = records or {}
    documents = documents or {}
    now = now or datetime.now(timezone.utc)
    flags = []

    def flag(field, severity, message):
        flags.append({"field": field, "severity": severity, "message": message})

    s_mvr = driver.get("mvr") or {}
    p_mvr = records.get("mvr") or {}
    # Self-reported vs official MVR — understating violations is the red flag.
    for key, label in (("dui", "DUI/DWI"), ("movingViolations", "moving violations"), ("accidents", "accidents")):
        s, p = _num(s_mvr.get(key)), _num(p_mvr.get(key))
        if s is not None and p is not None and p > s:
            flag(f"mvr.{key}", "high" if key == "dui" else "medium",
                 f"Understated {label}: applicant reported {int(s)}, MVR shows {int(p)}.")

    # PSP
    s_psp, p_psp = driver.get("psp") or {}, records.get("psp") or {}
    for key, label in (("crashes", "PSP crashes"), ("oosInspections", "out-of-service inspections")):
        s, p = _num(s_psp.get(key)), _num(p_psp.get(key))
        if s is not None and p is not None and p > s:
            flag(f"psp.{key}", "medium", f"Understated {label}: reported {int(s)}, PSP shows {int(p)}.")

    # Clearinghouse prohibited but applicant implied clean
    if (records.get("clearinghouse") or {}).get("prohibited"):
        flag("clearinghouse", "high", "FMCSA Clearinghouse shows a prohibited status (positive/incomplete).")

    # Experience vs CDL issue date (from the scanned doc)
    claimed_exp = _num((driver.get("cdl") or {}).get("experienceYears"))
    cdl_doc = (documents.get("cdlFront") or documents.get("cdl") or {}).get("fields") or {}
    lic_age = _years_since(cdl_doc.get("issueDate"), now)
    if claimed_exp is not None and lic_age is not None and claimed_exp > lic_age + 1:
        flag("cdl.experienceYears", "high",
             f"Claims {int(claimed_exp)} yrs experience, but the CDL was issued only ~{lic_age:.1f} yrs ago.")

    # CDL class: application vs scanned document
    app_class = str((driver.get("cdl") or {}).get("class") or "").upper()
    doc_class = str(cdl_doc.get("class") or "").upper()
    if app_class and doc_class and app_class != doc_class:
        flag("cdl.class", "medium", f"CDL class mismatch: application says {app_class}, document shows {doc_class}.")

    # Name mismatch between application and document
    app_name = _norm_name(driver.get("name"))
    doc_name = _norm_name(cdl_doc.get("fullName") or cdl_doc.get("name"))
    if app_name and doc_name and app_name != doc_name and not (app_name in doc_name or doc_name in app_name):
        flag("name", "high", f"Name mismatch: application \"{driver.get('name')}\" vs document \"{cdl_doc.get('fullName') or cdl_doc.get('name')}\".")

    # Expired documents
    for dt, d in documents.items():
        exp = _parse_date((d.get("fields") or {}).get("expirationDate"))
        if exp and exp < now:
            flag(f"{dt}.expiration", "high", f"{dt} appears expired (expiration {(d.get('fields') or {}).get('expirationDate')}).")
        for w in (d.get("warnings") or []):
            flag(f"{dt}.scan", "low", f"Document scan note ({dt}): {w}")

    sev_rank = {"high": 3, "medium": 2, "low": 1}
    risk = "clear" if not flags else max((f["severity"] for f in flags), key=lambda s: sev_rank[s])
    return {"flags": flags, "risk": risk,
            "checkedAt": now.isoformat(),
            "counts": {s: len([f for f in flags if f["severity"] == s]) for s in ("high", "medium", "low")}}
