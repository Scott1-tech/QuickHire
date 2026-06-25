"""Static definitions shipped to the frontend + small pure helpers.

Ported verbatim from server.js: CHECKLIST_STEPS, MAIN_DOCS, OTHER_DOCS and the
CARRIER_FORM questionnaire. These shapes are part of the API contract
(/api/config, /api/carrier-form) so they must match the originals exactly.
"""
from datetime import datetime, timezone

CHECKLIST_STEPS = [
    {"id": "cdlVerification", "label": "CDL Verification", "category": "Compliance & Eligibility", "description": "Verify the CDL is valid, correct class, active, and free of disqualifying violations.", "queryButtons": ["Verify CDL"]},
    {"id": "clearinghouseQuery", "label": "Clearinghouse Query", "category": "Compliance & Eligibility", "description": "Run a pre-employment full query through the FMCSA Drug & Alcohol Clearinghouse.", "queryButtons": ["Full Query", "Limited Query"]},
    {"id": "pspReport", "label": "PSP Report", "category": "Compliance & Eligibility", "description": "Obtain the Pre-Employment Screening Program (PSP) report from FMCSA.", "queryButtons": ["Order PSP Report"]},
    {"id": "mvrCheck", "label": "MVR Check", "category": "Risk Screening", "description": "Pull the Motor Vehicle Record (MVR) from the state DMV for the past 3–10 years.", "queryButtons": ["Order MVR"]},
    {"id": "backgroundCheck", "label": "Background Check", "category": "Risk Screening", "description": "Run a comprehensive criminal background check through an authorized Consumer Reporting Agency (CRA).", "queryButtons": ["Order Background Check"]},
    {"id": "drugTest", "label": "Drug Test", "category": "Health & Safety", "description": "Conduct a pre-employment DOT 5-panel drug test at a certified collection site.", "queryButtons": ["Schedule Drug Test"]},
    {"id": "offerLetter", "label": "Offer Letter Sent/Signed", "category": "Employment Setup", "description": "Send the formal offer letter and collect the driver's signed acceptance before onboarding."},
    {"id": "taxForms", "label": "I-9 / W-4 Tax Forms", "category": "Employment Setup", "description": "Complete I-9 employment eligibility verification and W-4 tax withholding forms."},
    {"id": "driverOrientation", "label": "Driver Orientation Complete", "category": "Employment Setup", "description": "Driver attends and completes company orientation including safety training and policy review."},
    {"id": "onboardingPaperwork", "label": "Onboarding Paperwork Complete", "category": "Employment Setup", "description": "All remaining onboarding documentation is signed, witnessed, and filed per company policy."},
]

STEP_IDS = [s["id"] for s in CHECKLIST_STEPS]

MAIN_DOCS = [
    {"id": "cdlFront", "label": "CDL Front"},
    {"id": "cdlBack", "label": "CDL Back"},
    {"id": "medicalCard", "label": "Medical Card"},
    {"id": "mvrReport", "label": "Pre-hire MVR Report"},
    {"id": "pspReportDoc", "label": "PSP Report"},
    {"id": "drugTestResults", "label": "Pre-employment Drug Test Results"},
    {"id": "mvrConsentForm", "label": "MVR Consent Form"},
    {"id": "pspConsentForm", "label": "PSP Consent Form"},
    {"id": "roadTestCertificate", "label": "Road Test Certificate"},
    {"id": "driverApplication", "label": "Driver Application for Employment"},
]

OTHER_DOCS = [
    {"id": "fmcsaRegistry", "label": "FMCSA National Registry"},
    {"id": "clearinghouseResult", "label": "Clearinghouse Query Result"},
    {"id": "w9TaxForm", "label": "W-9 Tax Form"},
    {"id": "preEmploymentVerification", "label": "Pre-employment Verification"},
    {"id": "contractsLeaseAgreements", "label": "Contracts / Lease Agreements"},
    {"id": "oaEnrollmentWesco", "label": "OA Enrollment Wesco"},
]

ALL_DOC_IDS = [d["id"] for d in (MAIN_DOCS + OTHER_DOCS)]

CARRIER_FORM = [
    {
        "id": "process",
        "title": "Application Process",
        "intro": "How a driver gets hired with this carrier.",
        "fields": [
            {"id": "applicationLink", "label": "Application link recruiters use", "type": "text", "placeholder": "https://intelliapp.driverapponline.com/c/…"},
            {"id": "docsForDriverManagement", "label": "Documents to enter in Driver Management (Carrier Notes)", "type": "area", "placeholder": "Copy of the driver's CDL (front & back); Medical Card"},
            {"id": "followUpProcess", "label": "Follow-up process", "type": "area", "placeholder": "Reach out to the driver within 24–48 hrs after the application if approved; let us know if not proceeding."},
            {"id": "afterApprovalProcess", "label": "After the driver is approved — what happens?", "type": "area", "placeholder": "Reach out within 24–48 hrs to schedule orientation; driver completes packet & drug test onsite during training after MVR clears."},
            {"id": "invoicingProcess", "label": "When can we invoice?", "type": "area", "placeholder": "As soon as dispatch confirms the driver has dispatched solo on a load."},
        ],
    },
    {
        "id": "prequal",
        "title": "Pre-Qualifications",
        "intro": "The minimum bar a driver must clear to qualify.",
        "fields": [
            {"id": "minimumAge", "label": "Minimum Age", "type": "text", "placeholder": "At least 23 years of age"},
            {"id": "minimumExperience", "label": "Minimum Experience (Tractor Trailer / OTR)", "type": "area", "placeholder": "At least 2 yrs verifiable regional/OTR in the last 3 yrs; 6 months flatbed in past 3 yrs."},
            {"id": "maxMovingViolations", "label": "Moving Violations (max in 3-year period)", "type": "text", "placeholder": "No more than 1 in the past 3 years"},
            {"id": "licenseSuspensionPolicy", "label": "Policy on License Suspensions", "type": "text", "placeholder": "No current suspensions"},
            {"id": "dotRecordableAccidents", "label": "DOT Recordable Accidents", "type": "text", "placeholder": "No accidents in the past 3 years"},
            {"id": "maxMajorMovingViolations", "label": "Maximum Major Moving Violations (last 3 years)", "type": "text", "placeholder": "No more than 1"},
            {"id": "maxJobsLast3Years", "label": "Max. Number of Jobs (last 3 years)", "type": "text", "placeholder": "No more than 2 jobs in the past 2 years"},
            {"id": "unemploymentPolicy", "label": "Policy Against Unemployment (even if accounted for)", "type": "text", "placeholder": "Will review all"},
            {"id": "terminatedApplicants", "label": "Terminated Applicants", "type": "area", "placeholder": "Will review; need reasons for termination."},
            {"id": "criminalConvictions", "label": "Criminal Convictions", "type": "text", "placeholder": "None in the past 5 years"},
            {"id": "duiDwiPolicy", "label": "DUI / DWI (max number & timeframe)", "type": "text", "placeholder": "None in a lifetime"},
            {"id": "hazmatRequired", "label": "Is Haz-Mat Required? Grace period to obtain it?", "type": "text", "placeholder": "No"},
            {"id": "otherEndorsements", "label": "Other Endorsements Required", "type": "text", "placeholder": "No"},
            {"id": "dotPhysicalRequirements", "label": "DOT Physical Requirements", "type": "area", "placeholder": "Physically able; not obese."},
            {"id": "longFormPhysicalUpfront", "label": "Long Form Physical Required Up Front?", "type": "yesno"},
            {"id": "drugTesting", "label": "Drug Testing", "type": "area", "placeholder": "Urine; annual DOT drug screening."},
            {"id": "otherAutomaticDQs", "label": "Other Automatic DQ's", "type": "area", "placeholder": "No SAP drivers in a lifetime."},
        ],
    },
    {
        "id": "presentation",
        "title": "Presentation",
        "intro": "What the carrier offers — pay, equipment, home time and benefits.",
        "fields": [
            {"id": "signOnBonus", "label": "Sign-On Bonus", "type": "text", "placeholder": "$500.00 Sign On Bonus"},
            {"id": "driverTypes", "label": "Driver Types", "type": "text", "placeholder": "Company Solo"},
            {"id": "typesOfRuns", "label": "Types of Runs", "type": "text", "placeholder": "OTR"},
            {"id": "typeOfFreight", "label": "Type of Freight", "type": "text", "placeholder": "Flatbed"},
            {"id": "typeOfEquipment", "label": "Type of Equipment", "type": "text", "placeholder": "Conestoga"},
            {"id": "cameras", "label": "Cameras", "type": "text", "placeholder": "No"},
            {"id": "transmissionType", "label": "Transmission Type", "type": "text", "placeholder": "Automatic; Manual"},
            {"id": "avgTractorAge", "label": "Average Age of Tractor", "type": "text", "placeholder": "4 years old"},
            {"id": "truckAssignedToDriver", "label": "Is truck permanently assigned to the driver?", "type": "text", "placeholder": "Usually, yes"},
            {"id": "truckSpeed", "label": "Truck Speed", "type": "text", "placeholder": "75 MPH"},
            {"id": "truckHomeForTimeOff", "label": "Can truck be taken home for time off?", "type": "text", "placeholder": "Yes"},
            {"id": "invertersApus", "label": "Inverters / APU's?", "type": "text", "placeholder": "Yes"},
            {"id": "pctDropAndHook", "label": "% of Drop and Hook", "type": "text", "placeholder": "5%"},
            {"id": "pctNoTouch", "label": "% of No Touch", "type": "text", "placeholder": "0%"},
            {"id": "pctHazmatLoads", "label": "% are Haz-Mat Loads", "type": "text", "placeholder": "0%"},
            {"id": "payScaleSolo", "label": "Pay Scale (Solo)", "type": "area", "placeholder": "$0.70 cpm. Drivers also get extra for additional pickups/drops (typically 4–5 per trip)."},
            {"id": "typeOfDriverPay", "label": "Type of Driver Pay", "type": "text", "placeholder": "Mileage"},
            {"id": "whenPaid", "label": "When are drivers paid?", "type": "text", "placeholder": "Bi-weekly after trip ends"},
            {"id": "howPaid", "label": "How are drivers paid?", "type": "text", "placeholder": "Direct Deposit"},
            {"id": "payIncrease", "label": "Pay Increase", "type": "text", "placeholder": "Will review"},
            {"id": "hiringAreas", "label": "Hiring Areas", "type": "text", "placeholder": "Ohio"},
            {"id": "primaryRunningAreas", "label": "Primary Running Areas", "type": "text", "placeholder": "West Coast, North West, Midwest & South"},
            {"id": "avgMilesPerWeek", "label": "Average Miles per Week", "type": "text", "placeholder": "3000 miles per week on average"},
            {"id": "avgLengthOfHaul", "label": "Average Length of Haul", "type": "text", "placeholder": "N/A"},
            {"id": "homeTimeDaysOut", "label": "Home Time / Days Out", "type": "text", "placeholder": "Home a couple of days every week"},
            {"id": "avgWeeklyPay", "label": "Average Weekly Pay", "type": "text", "placeholder": "$2,500 – $3,000 per week on average"},
            {"id": "vacationInfo", "label": "Driver Vacation Info", "type": "text", "placeholder": "1 month ahead notice"},
            {"id": "ezPass", "label": "EZ Pass Provided", "type": "text", "placeholder": "Yes"},
            {"id": "prePass", "label": "Pre-Pass Provided", "type": "text", "placeholder": "Yes"},
            {"id": "tollCards", "label": "Toll Cards Provided (which?)", "type": "text", "placeholder": "No"},
            {"id": "fuelCardType", "label": "Type of Fuel Card", "type": "text", "placeholder": "TCS Fuel Card"},
            {"id": "breakdownPay", "label": "Breakdown Pay", "type": "text", "placeholder": "No"},
            {"id": "layoverPay", "label": "Layover Pay", "type": "text", "placeholder": "$100.00 per day"},
            {"id": "dockDetentionPay", "label": "Dock Detention Pay", "type": "text", "placeholder": "After 5 hours"},
            {"id": "multiStopPay", "label": "Multi-Stop Pay", "type": "text", "placeholder": "Yes – $100 per extra stop"},
            {"id": "newYorkCity", "label": "New York City", "type": "text", "placeholder": "No"},
            {"id": "safetyBonus", "label": "Safety Bonus", "type": "text", "placeholder": "No"},
            {"id": "riderPolicy", "label": "Rider Policy", "type": "text", "placeholder": "Yes"},
            {"id": "petPolicy", "label": "Pet Policy", "type": "text", "placeholder": "No"},
            {"id": "dispatch24h", "label": "Is there 24-hour dispatch?", "type": "text", "placeholder": "Yes"},
            {"id": "routingFuelFlex", "label": "Routing / fuel-stop flexibility?", "type": "text", "placeholder": "Yes"},
            {"id": "qualcomm", "label": "Qualcomm Provided", "type": "text", "placeholder": "No"},
            {"id": "perDiemOptional", "label": "Is per diem optional?", "type": "text", "placeholder": "Yes"},
            {"id": "paidOrientation", "label": "Paid Orientation", "type": "text", "placeholder": "$0.70 CPM"},
            {"id": "orientationLength", "label": "How long is Orientation?", "type": "text", "placeholder": "e.g. 3 days"},
            {"id": "orientationLocation", "label": "Orientation held where?", "type": "text", "placeholder": "Dayton, OH"},
            {"id": "orientationDays", "label": "Orientation start / end day?", "type": "text", "placeholder": "Any day Monday – Friday"},
            {"id": "lodgingProvided", "label": "Lodging Provided (where staying?)", "type": "text", "placeholder": "In the truck"},
            {"id": "mealsProvided", "label": "Meals Provided (Breakfast / Lunch / Dinner)", "type": "text", "placeholder": "No"},
            {"id": "travelProvided", "label": "Travel Provided (Bus / Plane / Car Rental)", "type": "text", "placeholder": "No"},
            {"id": "insuranceStartsWhen", "label": "Insurance Starts When?", "type": "text", "placeholder": "N/A"},
            {"id": "lifeInsurance", "label": "Life Insurance", "type": "text", "placeholder": "N/A"},
            {"id": "retirement401k", "label": "401(k) Retirement Plan", "type": "text", "placeholder": "N/A"},
        ],
    },
    {
        "id": "recruiters",
        "title": "For Recruiters Use Only",
        "intro": "Internal notes for the recruiting team.",
        "fields": [
            {"id": "applicationTurnaround", "label": "Application Turnaround Time", "type": "text", "placeholder": "24–48 hours"},
            {"id": "rehirePolicy", "label": "Rehire Policy", "type": "text", "placeholder": "Will review"},
            {"id": "applicationOwnership", "label": "Application Ownership", "type": "text", "placeholder": "30 days"},
            {"id": "companyWebsite", "label": "Company Website", "type": "text", "placeholder": "https://…"},
        ],
    },
]

CARRIER_FIELD_IDS = [f["id"] for s in CARRIER_FORM for f in s["fields"]]


# ── small helpers ────────────────────────────────────────────────────────────
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def empty_checklist() -> dict:
    return {
        s["id"]: {"status": "not_started", "completedAt": None, "completedBy": None, "result": None, "notes": "", "mollySummary": None}
        for s in CHECKLIST_STEPS
    }


def _parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def is_stale(c: dict) -> bool:
    dt = _parse_iso(c.get("lastActivityAt"))
    if not dt:
        return False
    delta = datetime.now(timezone.utc) - dt
    return delta.total_seconds() > 5 * 24 * 60 * 60


def expiring_docs(c: dict) -> list:
    soon = datetime.now(timezone.utc).timestamp() + 30 * 24 * 60 * 60
    flags = []
    app = c.get("application") or {}
    cdl_exp = app.get("cdlExpirationDate")
    med_exp = app.get("medicalCardExpiration")
    cdl_dt = _parse_iso(cdl_exp)
    med_dt = _parse_iso(med_exp)
    if cdl_dt and cdl_dt.timestamp() <= soon:
        flags.append({"type": "CDL", "date": cdl_exp})
    if med_dt and med_dt.timestamp() <= soon:
        flags.append({"type": "Medical Card", "date": med_exp})
    return flags


def checklist_complete(c: dict) -> bool:
    cl = c.get("checklist") or {}
    return all((cl.get(sid) or {}).get("status") == "complete" for sid in STEP_IDS)
