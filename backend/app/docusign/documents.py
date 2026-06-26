"""Pure builders for envelope contents: documents (HTML), signer tabs, catalog."""
import base64
import os

COMPANY = os.environ.get("COMPANY_NAME", "National Carrier Xpress Corp")

_ESC = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}


def esc(s) -> str:
    return "".join(_ESC.get(c, c) for c in str("" if s is None else s))


def anchor(tok: str) -> str:
    return f'<span style="color:#fffffe;font-size:1px">{tok}</span>'


DATA_FIELDS = [
    # Driver personal
    {"key": "fullName", "label": "Full Legal Name", "anchor": "/f_name/", "required": True},
    {"key": "dob", "label": "Date of Birth", "anchor": "/f_dob/"},
    {"key": "ssn", "label": "SSN", "anchor": "/f_ssn/"},
    {"key": "address", "label": "Street Address", "anchor": "/f_addr/"},
    {"key": "city", "label": "City", "anchor": "/f_city/"},
    {"key": "state", "label": "State", "anchor": "/f_state/"},
    {"key": "zip", "label": "ZIP", "anchor": "/f_zip/"},
    {"key": "phone", "label": "Phone", "anchor": "/f_phone/"},
    {"key": "email", "label": "Email", "anchor": "/f_email/"},
    # CDL
    {"key": "cdlNumber", "label": "CDL Number", "anchor": "/f_cdln/", "required": True},
    {"key": "cdlState", "label": "CDL State", "anchor": "/f_cdls/"},
    {"key": "cdlClass", "label": "CDL Class", "anchor": "/f_cdlc/"},
    {"key": "cdlExp", "label": "CDL Expiration", "anchor": "/f_cdle/"},
    {"key": "medCardExp", "label": "Medical Card Expiration", "anchor": "/f_mce/"},
    {"key": "endorsements", "label": "Endorsements", "anchor": "/f_end/"},
    {"key": "positionType", "label": "Position Type", "anchor": "/f_pos/"},
    {"key": "prevEmployers", "label": "Previous Employers", "anchor": "/f_prev/"},
    # Carrier / offer fields
    {"key": "carrierName", "label": "Carrier Name", "anchor": "/f_carr/"},
    {"key": "dotNumber", "label": "DOT Number", "anchor": "/f_dot/"},
    {"key": "mcNumber", "label": "MC Number", "anchor": "/f_mc/"},
    {"key": "recruiterName", "label": "Recruiter Name", "anchor": "/f_rec/"},
    {"key": "payRate", "label": "Pay Rate", "anchor": "/f_pay/"},
    {"key": "startDate", "label": "Start Date", "anchor": "/f_start/"},
    {"key": "truckUnit", "label": "Truck / Unit #", "anchor": "/f_truck/"},
    {"key": "employmentType", "label": "Employment Type", "anchor": "/f_emptype/"},
]

# Fields that must be present before sending (driver vs carrier buckets)
REQUIRED_DRIVER_FIELDS = {"fullName", "email", "cdlNumber"}
REQUIRED_CARRIER_FIELDS: set = set()

# Document packages: each package is a list of doc types sent as one envelope
DOC_PACKAGES = {
    "company_driver": {
        "label": "Company Driver Package",
        "description": "Offer Letter + MVR Consent + PSP Consent + Clearinghouse Consent + Drug Testing Consent",
        "docs": ["offer_letter", "mvr_consent", "psp_consent", "clearinghouse_consent", "drug_test_consent"],
    },
    "owner_operator": {
        "label": "Owner-Operator Package",
        "description": "Owner-Operator Agreement + Equipment Lease + MVR + PSP + Clearinghouse",
        "docs": ["owner_operator_agreement", "lease_agreement", "mvr_consent", "psp_consent", "clearinghouse_consent"],
    },
}


def driver_profile(candidate: dict | None = None, carrier: dict | None = None, extra_fields: dict | None = None) -> dict:
    candidate = candidate or {}
    carrier = carrier or {}
    a = candidate.get("application") or {}
    extra = extra_fields or {}
    name = candidate.get("name") or " ".join(x for x in [a.get("firstName"), a.get("lastName")] if x).strip()
    emps = a.get("employers") or []
    prev_str = "; ".join(e.get("companyName") or e.get("name") or "" for e in emps if e.get("companyName") or e.get("name"))
    return {
        "fullName": extra.get("fullName") or name or "",
        "dob": extra.get("dob") or a.get("dateOfBirth") or a.get("dob") or "",
        "ssn": extra.get("ssn") or a.get("ssn") or a.get("socialSecurityNumber") or "",
        "address": extra.get("address") or a.get("address") or a.get("street") or "",
        "city": extra.get("city") or a.get("city") or "",
        "state": extra.get("state") or a.get("state") or "",
        "zip": extra.get("zip") or a.get("zipcode") or a.get("zip") or a.get("postalCode") or "",
        "phone": extra.get("phone") or candidate.get("phone") or a.get("phone") or "",
        "email": extra.get("email") or candidate.get("email") or a.get("email") or "",
        "cdlNumber": extra.get("cdlNumber") or a.get("cdlNumber") or "",
        "cdlState": extra.get("cdlState") or a.get("cdlState") or "",
        "cdlClass": extra.get("cdlClass") or a.get("cdlClass") or "",
        "cdlExp": extra.get("cdlExp") or a.get("cdlExpirationDate") or a.get("cdlExp") or "",
        "medCardExp": extra.get("medCardExp") or a.get("medCardExpiration") or a.get("medCardExp") or "",
        "endorsements": extra.get("endorsements") or (
            ", ".join(a.get("endorsements") or []) if isinstance(a.get("endorsements"), list) else (a.get("endorsements") or "")
        ),
        "positionType": extra.get("positionType") or a.get("position") or a.get("positionType") or "",
        "prevEmployers": extra.get("prevEmployers") or prev_str or "",
        # Carrier fields
        "carrierName": extra.get("carrierName") or carrier.get("name") or os.environ.get("COMPANY_NAME", COMPANY),
        "dotNumber": extra.get("dotNumber") or carrier.get("requirements", {}).get("dotNumber") or carrier.get("dotNumber") or "",
        "mcNumber": extra.get("mcNumber") or carrier.get("requirements", {}).get("mcNumber") or carrier.get("mcNumber") or "",
        "recruiterName": extra.get("recruiterName") or candidate.get("recruiter") or "",
        "payRate": extra.get("payRate") or "",
        "startDate": extra.get("startDate") or "",
        "truckUnit": extra.get("truckUnit") or "",
        "employmentType": extra.get("employmentType") or a.get("position") or "",
    }


def missing_fields(profile: dict) -> list:
    return [f["label"] for f in DATA_FIELDS if not str(profile.get(f["key"]) or "").strip()]


def missing_required_fields(profile: dict) -> list[dict]:
    """Return only required-field gaps categorized as driver vs carrier."""
    gaps = []
    for f in DATA_FIELDS:
        val = str(profile.get(f["key"]) or "").strip()
        if not val:
            bucket = "carrier" if f["key"] in ("carrierName", "dotNumber", "mcNumber", "recruiterName", "payRate", "startDate", "truckUnit", "employmentType") else "driver"
            gaps.append({"key": f["key"], "label": f["label"], "bucket": bucket})
    return gaps


def package_catalog() -> list:
    return [{"type": t, "label": v["label"], "description": v["description"], "docs": v["docs"]} for t, v in DOC_PACKAGES.items()]


def _page(title: str, inner: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{{font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.55;max-width:720px;margin:0 auto;padding:32px}}
  h1{{color:#b01d30;font-size:22px;margin:0 0 4px}}
  h2{{font-size:15px;margin:24px 0 6px}}
  .muted{{color:#6b7280;font-size:12px;font-weight:400}}
  .sigline{{margin-top:44px;border-top:1px solid #9ca3af;width:280px;padding-top:6px;font-size:13px;color:#6b7280}}
  table{{border-collapse:collapse;width:100%;margin:10px 0}}
  td{{padding:7px 9px;border:1px solid #e5e7eb;font-size:14px;vertical-align:top}}
  td.k{{background:#f9fafb;font-weight:600;width:38%}}
  .blank{{display:inline-block;min-width:200px;border-bottom:1px solid #cbd5e1}}
  .review-note{{background:#fef2f4;border:1px solid #f7c4cc;color:#8f1727;border-radius:8px;padding:10px 12px;font-size:12.5px;margin:8px 0}}
</style></head><body>
  <h1>{esc(COMPANY)}</h1>
  <div class="muted">{esc(title)}</div>
  {inner}
  <div class="sigline">Signature: {anchor('/sn1/')}</div>
  <div class="muted" style="margin-top:8px">Name: {anchor('/fn1/')} &nbsp;&nbsp; Date: {anchor('/ds1/')}</div>
</body></html>"""


def _kv(rows) -> str:
    cells = "".join(f"<tr><td class=\"k\">{esc(k)}</td><td>{esc(v)}</td></tr>" for k, v in rows if k)
    return f"<table>{cells}</table>"


def _review_block(profile: dict, simulated: bool) -> str:
    rows = ""
    for f in DATA_FIELDS:
        val = profile.get(f["key"]) or ""
        if simulated:
            cell = f"<strong>{esc(val)}</strong>" if val else '<span style="color:#b91c1c">— please complete —</span>'
        else:
            cell = f'<span class="blank">{anchor(f["anchor"])}</span>'
        rows += f'<tr><td class="k">{esc(f["label"])}</td><td>{cell}</td></tr>'
    return (
        '<h2>Driver Information <span class="muted">(auto-filled from your application — review &amp; correct anything that\'s wrong)</span></h2>'
        '<div class="review-note">These details were filled in from the information you already gave us. Please confirm each one is correct; tap any field to edit it before signing.</div>'
        f"<table>{rows}</table>"
    )


# build(candidate, fields, review) functions per document type.
def _offer_letter(c, f, review):
    f = f or {}
    profile = driver_profile(c, extra_fields=f)
    return _page("Offer of Employment — Professional Driver", f"""
      <p>Dear {esc(c.get('name'))},</p>
      <p>We are pleased to offer you a position as a <strong>{esc(f.get('positionType') or f.get('position') or profile.get('positionType') or 'Company Driver (CDL-A)')}</strong>
         with {esc(profile.get('carrierName') or COMPANY)}. We were impressed with your qualifications and look forward to having you on the team.</p>
      {_kv([
        ('Position', f.get('positionType') or f.get('position') or profile.get('positionType') or 'Company Driver (CDL-A)'),
        ('Compensation', f.get('payRate') or profile.get('payRate') or anchor('/f_pay/') or 'Per company pay schedule'),
        ('Start / Orientation Date', f.get('startDate') or profile.get('startDate') or anchor('/f_start/') or 'To be scheduled'),
        ('Truck / Unit #', f.get('truckUnit') or profile.get('truckUnit') or anchor('/f_truck/') or 'TBD'),
        ('Employment Type', f.get('employmentType') or profile.get('employmentType') or 'Full-time'),
        ('Recruiter', f.get('recruiterName') or profile.get('recruiterName') or ''),
      ])}
      {review}
      <h2>Acceptance</h2>
      <p>This offer is contingent on successful completion of DOT pre-employment requirements
         (MVR, PSP, Clearinghouse query, drug screen, and background check). By signing below,
         you accept this offer and confirm the information above is accurate.</p>""")


def _mvr_consent(c, f, review):
    return _page("Motor Vehicle Record (MVR) Consent & Authorization", f"""
      <p>I authorize {esc(COMPANY)} to obtain my Motor Vehicle Record (MVR) from any state
         Department of Motor Vehicles to evaluate my qualifications for employment as a commercial
         driver, in accordance with 49 CFR Part 391.</p>
      {review}
      <p>I understand this authorization remains valid throughout my employment for ongoing
         driver-qualification monitoring.</p>""")


def _psp_consent(c, f, review):
    return _page("PSP Disclosure & Authorization (FMCSA)", f"""
      <p>In connection with my application with {esc(COMPANY)}, I authorize the company to access
         my FMCSA Pre-Employment Screening Program (PSP) report, which contains my federal crash
         and roadside-inspection history.</p>
      {review}
      <p>I have read and understand this disclosure and authorize the release of the PSP report.</p>""")


def _drug_test_consent(c, f, review):
    return _page("DOT Drug & Alcohol Testing Consent", f"""
      <p>I consent to pre-employment, random, post-accident, reasonable-suspicion, and
         return-to-duty drug and alcohol testing as required under 49 CFR Part 382, as a condition
         of employment with {esc(COMPANY)}.</p>
      {review}""")


def _employment_application(c, f, review):
    return _page("Driver Application for Employment — Certification", f"""
      <p>I certify that the information below and in my Driver Application for Employment is true and
         complete to the best of my knowledge, and that any misrepresentation or omission may be
         grounds for rejection or termination.</p>
      {review}""")


def _clearinghouse_consent(c, f, review):
    return _page("FMCSA Clearinghouse — Query Consent", f"""
      <p>I give {esc(COMPANY)} consent to query the FMCSA Drug & Alcohol Clearinghouse to determine
         whether drug or alcohol violation information exists about me, as required by 49 CFR Part 382,
         Subpart G.</p>
      {review}""")


def _owner_operator_agreement(c, f, review):
    f = f or {}
    return _page("Independent Contractor Agreement — Owner-Operator", f"""
      <p>This Independent Contractor Agreement is entered into between {esc(COMPANY)} ("Carrier") and the
         contractor identified below ("Contractor") for the lease of equipment and provision of
         transportation services under the Carrier's operating authority.</p>
      {_kv([
        ('Settlement / Pay', f.get('payRate') or 'Percentage of line-haul per settlement schedule'),
        ('Equipment', f.get('equipment') or 'Contractor-provided tractor'),
        ('Term', f.get('term') or 'At-will, 30-day written termination'),
      ])}
      {review}
      <h2>Agreement</h2>
      <p>By signing, the Contractor agrees to operate as an independent contractor under 49 CFR Part 376,
         maintain required insurance and qualifications, and confirms the information above is accurate.</p>""")


def _company_driver_agreement(c, f, review):
    f = f or {}
    return _page("Company Driver Agreement", f"""
      <p>This agreement sets the terms of employment between {esc(COMPANY)} and the driver named below as a
         company (W-2) commercial driver.</p>
      {_kv([
        ('Pay', f.get('payRate') or 'Per company pay schedule'),
        ('Run Type', f.get('runType') or 'OTR'),
        ('Start Date', f.get('startDate') or 'To be scheduled'),
      ])}
      {review}
      <h2>Acceptance</h2>
      <p>By signing, the driver accepts employment on the terms above, agrees to company safety and DOT
         policies, and confirms the information is accurate.</p>""")


def _lease_agreement(c, f, review):
    f = f or {}
    return _page("Equipment Lease Agreement", f"""
      <p>{esc(COMPANY)} agrees to lease the equipment described below to the lessee named herein, subject to
         the terms of this agreement and 49 CFR Part 376.</p>
      {_kv([
        ('Equipment', f.get('equipment') or 'Tractor (unit # to be assigned)'),
        ('Lease Rate', f.get('payRate') or 'Per lease schedule'),
        ('Term', f.get('term') or 'Month-to-month'),
      ])}
      {review}""")


def w9_form(c, f, review):
    return _page("W-9 Request for Taxpayer Identification", f"""
      <p>Under penalties of perjury, I certify that the information below is true, correct, and complete.</p>
      {review}
      <p>Federal tax classification: <strong>Individual/sole proprietor</strong></p>""")


DOC_TEMPLATES = {
    "offer_letter": {"label": "Offer Letter", "description": "Formal offer of employment for the driver to review, correct and sign.", "build": _offer_letter},
    "mvr_consent": {"label": "MVR Consent Form", "description": "Driver authorization to pull the Motor Vehicle Record.", "build": _mvr_consent},
    "psp_consent": {"label": "PSP Consent Form", "description": "FMCSA Pre-Employment Screening Program disclosure & authorization.", "build": _psp_consent},
    "drug_test_consent": {"label": "Drug & Alcohol Testing Consent", "description": "Consent to DOT pre-employment and ongoing drug & alcohol testing.", "build": _drug_test_consent},
    "employment_application": {"label": "Driver Application for Employment", "description": "Certification of the Driver Application for Employment (49 CFR 391.21).", "build": _employment_application},
    "clearinghouse_consent": {"label": "Clearinghouse Query Consent", "description": "Consent for an FMCSA Drug & Alcohol Clearinghouse query.", "build": _clearinghouse_consent},
    "owner_operator_agreement": {"label": "Owner-Operator Agreement", "description": "Independent Contractor (owner-operator) lease & operating agreement.", "build": _owner_operator_agreement},
    "company_driver_agreement": {"label": "Company Driver Agreement", "description": "Employment agreement for a company (W-2) CDL driver.", "build": _company_driver_agreement},
    "lease_agreement": {"label": "Equipment Lease Agreement", "description": "Lease of a tractor/trailer between the carrier and driver.", "build": _lease_agreement},
    "w9_form": {"label": "W-9 Tax Form", "description": "IRS W-9 Request for Taxpayer Identification Number.", "build": w9_form},
}


def document_catalog() -> list:
    return [{"type": t, "label": v["label"], "description": v["description"]} for t, v in DOC_TEMPLATES.items()]


def build_document_html(doc_type: str, candidate: dict | None, fields: dict | None = None, simulated: bool = True) -> str:
    tpl = DOC_TEMPLATES.get(doc_type)
    if not tpl:
        raise ValueError(f"Unknown DocuSign document type: {doc_type}")
    profile = driver_profile(candidate)
    return tpl["build"](candidate or {}, fields or {}, _review_block(profile, simulated))


def html_document(name: str, html: str, document_id: str = "1") -> dict:
    return {
        "documentBase64": base64.b64encode(html.encode("utf-8")).decode("ascii"),
        "name": name,
        "fileExtension": "html",
        "documentId": str(document_id),
    }


def build_signer_tabs(profile: dict | None = None) -> dict:
    profile = profile or {}

    def at(anchor_string, **extra):
        return {"anchorString": anchor_string, "anchorUnits": "pixels", "anchorXOffset": "0", "anchorYOffset": "-6", **extra}

    return {
        "signHereTabs": [at("/sn1/")],
        "fullNameTabs": [at("/fn1/")],
        "dateSignedTabs": [at("/ds1/")],
        "textTabs": [at(f["anchor"], tabLabel=f["key"], value=profile.get(f["key"]) or "", width=210, locked="false",
                        required="true" if f.get("required") else "false", font="arial", fontSize="size10",
                        anchorXOffset="2", anchorYOffset="-9") for f in DATA_FIELDS],
    }


FIELD_TAB_GROUP = {
    "signature": "signHereTabs", "initial": "initialHereTabs", "date": "dateSignedTabs",
    "name": "fullNameTabs", "title": "titleTabs", "company": "companyTabs",
    "email": "textTabs", "text": "textTabs", "number": "numberTabs", "checkbox": "checkboxTabs",
}
VALIDATION_PATTERNS = {
    "SSN": r"\d{3}-\d{2}-\d{4}", "Email": r"[^@]+@[^.]+\..+", "Numbers": r"\d+", "Letters": r"[A-Za-z]+",
    "Date": r"\d{1,2}/\d{1,2}/\d{4}", "ZIP+4": r"\d{5}-\d{4}", "ZIP": r"\d{5}",
}


def placed_fields_to_tabs(placed: list | None = None, page_w: int = 612, page_h: int = 792) -> dict:
    placed = placed or []
    tabs: dict = {}
    for f in placed:
        group = FIELD_TAB_GROUP.get(f.get("type")) or "textTabs"
        tab = {
            "xPosition": str(round((f.get("xPct") or 0) * page_w)),
            "yPosition": str(round((f.get("yPct") or 0) * page_h)),
            "pageNumber": str(f.get("page") or 1),
            "documentId": "1",
            "tabLabel": f.get("label") or f.get("type"),
        }
        if f.get("required"):
            tab["required"] = "true"
        if f.get("readOnly"):
            tab["locked"] = "true"
        if f.get("value"):
            tab["value"] = str(f["value"])
        if f.get("font"):
            tab["font"] = str(f["font"]).replace(" ", "")
        if f.get("fontSize"):
            tab["fontSize"] = f"size{f['fontSize']}"
        if f.get("color"):
            tab["fontColor"] = f["color"]
        if f.get("bold"):
            tab["bold"] = "true"
        if f.get("italic"):
            tab["italic"] = "true"
        if f.get("underline"):
            tab["underline"] = "true"
        if f.get("hideAsterisks"):
            tab["concealValueOnDocument"] = "true"
        if group == "textTabs":
            pat = f.get("customPattern") if f.get("validation") == "Custom" else VALIDATION_PATTERNS.get(f.get("validation"))
            if pat:
                tab["validationPattern"] = pat
                if f.get("errorMessage"):
                    tab["validationMessage"] = f["errorMessage"]
        tabs.setdefault(group, []).append(tab)
    return tabs


def merge_tabs(a: dict | None = None, b: dict | None = None) -> dict:
    out = {**(a or {})}
    for k, v in (b or {}).items():
        out[k] = [*(out.get(k) or []), *v]
    return out


def simple_pdf(title: str, lines: list | None = None) -> bytes:
    lines = lines or []

    def escp(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    parts = [f"BT /F1 18 Tf 72 730 Td ({escp(title)}) Tj ET"]
    y = 700
    for line in lines:
        parts.append(f"BT /F1 11 Tf 72 {y} Td ({escp(line)}) Tj ET")
        y -= 18
    stream = "\n".join(parts)
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(stream.encode('latin-1', 'replace'))} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    pdf = "%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects):
        offsets.append(len(pdf))
        pdf += f"{i + 1} 0 obj\n{obj}\nendobj\n"
    xref_start = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{str(off).zfill(10)} 00000 n \n"
    pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF"
    return pdf.encode("latin-1", "replace")
