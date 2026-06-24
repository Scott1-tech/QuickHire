import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import * as anna from './anna/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const COMPANY_NAME = process.env.COMPANY_NAME || 'National Carrier Xpress Corp';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
// Link sending
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.SMTP_FROM || `${COMPANY_NAME} <onboarding@resend.dev>`;
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || '';
const SUPPORT_CONTACT = process.env.SUPPORT_CONTACT || 'safety@ncxpress.com';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';
const LINK_TTL_DAYS = Number(process.env.LINK_TTL_DAYS || 14);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'candidates.json');
const OPTOUT_FILE = path.join(DATA_DIR, 'optouts.json');
const CARRIER_DB_FILE = path.join(DATA_DIR, 'carriers.json');
const PORTFOLIO_FILE = path.join(DATA_DIR, 'anna-portfolios.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');
if (!fs.existsSync(OPTOUT_FILE)) fs.writeFileSync(OPTOUT_FILE, '[]');
if (!fs.existsSync(CARRIER_DB_FILE)) fs.writeFileSync(CARRIER_DB_FILE, '[]');
if (!fs.existsSync(PORTFOLIO_FILE)) fs.writeFileSync(PORTFOLIO_FILE, '[]');

// ── SMS opt-out registry (TCPA STOP handling) ────────────────────────────────
function normPhone(p) {
  const digits = String(p || '').replace(/[^0-9]/g, '');
  return digits.replace(/^1(\d{10})$/, '$1'); // drop US country code for matching
}
function readOptouts() { try { return JSON.parse(fs.readFileSync(OPTOUT_FILE, 'utf8')); } catch { return []; } }
function isOptedOut(phone) { return readOptouts().includes(normPhone(phone)); }
function addOptout(phone) {
  const o = readOptouts(); const n = normPhone(phone);
  if (n && !o.includes(n)) { o.push(n); fs.writeFileSync(OPTOUT_FILE, JSON.stringify(o, null, 2)); }
}
function removeOptout(phone) {
  const n = normPhone(phone);
  fs.writeFileSync(OPTOUT_FILE, JSON.stringify(readOptouts().filter((x) => x !== n), null, 2));
}

// ── Checklist definition ────────────────────────────────────────────────────
export const CHECKLIST_STEPS = [
  { id: 'cdlVerification',    label: 'CDL Verification',              category: 'Compliance & Eligibility', description: 'Verify the CDL is valid, correct class, active, and free of disqualifying violations.', queryButtons: ['Verify CDL'] },
  { id: 'clearinghouseQuery', label: 'Clearinghouse Query',           category: 'Compliance & Eligibility', description: 'Run a pre-employment full query through the FMCSA Drug & Alcohol Clearinghouse.', queryButtons: ['Full Query', 'Limited Query'] },
  { id: 'pspReport',          label: 'PSP Report',                    category: 'Compliance & Eligibility', description: 'Obtain the Pre-Employment Screening Program (PSP) report from FMCSA.', queryButtons: ['Order PSP Report'] },
  { id: 'mvrCheck',           label: 'MVR Check',                     category: 'Risk Screening',           description: 'Pull the Motor Vehicle Record (MVR) from the state DMV for the past 3–10 years.', queryButtons: ['Order MVR'] },
  { id: 'backgroundCheck',    label: 'Background Check',              category: 'Risk Screening',           description: 'Run a comprehensive criminal background check through an authorized Consumer Reporting Agency (CRA).', queryButtons: ['Order Background Check'] },
  { id: 'drugTest',           label: 'Drug Test',                     category: 'Health & Safety',          description: 'Conduct a pre-employment DOT 5-panel drug test at a certified collection site.', queryButtons: ['Schedule Drug Test'] },
  { id: 'offerLetter',        label: 'Offer Letter Sent/Signed',      category: 'Employment Setup',         description: 'Send the formal offer letter and collect the driver\'s signed acceptance before onboarding.' },
  { id: 'taxForms',           label: 'I-9 / W-4 Tax Forms',          category: 'Employment Setup',         description: 'Complete I-9 employment eligibility verification and W-4 tax withholding forms.' },
  { id: 'driverOrientation',  label: 'Driver Orientation Complete',   category: 'Employment Setup',         description: 'Driver attends and completes company orientation including safety training and policy review.' },
  { id: 'onboardingPaperwork',label: 'Onboarding Paperwork Complete', category: 'Employment Setup',         description: 'All remaining onboarding documentation is signed, witnessed, and filed per company policy.' },
];

const STEP_IDS = CHECKLIST_STEPS.map((s) => s.id);

function emptyChecklist() {
  return Object.fromEntries(
    CHECKLIST_STEPS.map((s) => [s.id, { status: 'not_started', completedAt: null, completedBy: null, result: null, notes: '', mollySummary: null }])
  );
}

// ── Document definitions ────────────────────────────────────────────────────
export const MAIN_DOCS = [
  { id: 'cdlFront',            label: 'CDL Front' },
  { id: 'cdlBack',             label: 'CDL Back' },
  { id: 'medicalCard',         label: 'Medical Card' },
  { id: 'mvrReport',           label: 'Pre-hire MVR Report' },
  { id: 'pspReportDoc',        label: 'PSP Report' },
  { id: 'drugTestResults',     label: 'Pre-employment Drug Test Results' },
  { id: 'mvrConsentForm',      label: 'MVR Consent Form' },
  { id: 'pspConsentForm',      label: 'PSP Consent Form' },
  { id: 'roadTestCertificate', label: 'Road Test Certificate' },
  { id: 'driverApplication',   label: 'Driver Application for Employment' },
];
export const OTHER_DOCS = [
  { id: 'fmcsaRegistry',             label: 'FMCSA National Registry' },
  { id: 'clearinghouseResult',        label: 'Clearinghouse Query Result' },
  { id: 'w9TaxForm',                  label: 'W-9 Tax Form' },
  { id: 'preEmploymentVerification',  label: 'Pre-employment Verification' },
  { id: 'contractsLeaseAgreements',   label: 'Contracts / Lease Agreements' },
  { id: 'oaEnrollmentWesco',          label: 'OA Enrollment Wesco' },
];
const ALL_DOC_IDS = [...MAIN_DOCS, ...OTHER_DOCS].map((d) => d.id);

// ── Carrier requirements form ────────────────────────────────────────────────
// The questionnaire a carrier (or the recruiter on their behalf) fills out. It is
// the single source of truth for both the public intake page and the recruiter's
// carrier profile, so the questions are always identical for both sides.
// field types: 'text' (single line) · 'area' (multi-line) · 'yesno' (Yes/No/N-A select)
export const CARRIER_FORM = [
  {
    id: 'process',
    title: 'Application Process',
    intro: 'How a driver gets hired with this carrier.',
    fields: [
      { id: 'applicationLink',        label: 'Application link recruiters use',                       type: 'text', placeholder: 'https://intelliapp.driverapponline.com/c/…' },
      { id: 'docsForDriverManagement',label: 'Documents to enter in Driver Management (Carrier Notes)',type: 'area', placeholder: "Copy of the driver's CDL (front & back); Medical Card" },
      { id: 'followUpProcess',        label: 'Follow-up process',                                     type: 'area', placeholder: 'Reach out to the driver within 24–48 hrs after the application if approved; let us know if not proceeding.' },
      { id: 'afterApprovalProcess',   label: 'After the driver is approved — what happens?',           type: 'area', placeholder: 'Reach out within 24–48 hrs to schedule orientation; driver completes packet & drug test onsite during training after MVR clears.' },
      { id: 'invoicingProcess',       label: 'When can we invoice?',                                   type: 'area', placeholder: 'As soon as dispatch confirms the driver has dispatched solo on a load.' },
    ],
  },
  {
    id: 'prequal',
    title: 'Pre-Qualifications',
    intro: 'The minimum bar a driver must clear to qualify.',
    fields: [
      { id: 'minimumAge',              label: 'Minimum Age',                                          type: 'text', placeholder: 'At least 23 years of age' },
      { id: 'minimumExperience',       label: 'Minimum Experience (Tractor Trailer / OTR)',           type: 'area', placeholder: 'At least 2 yrs verifiable regional/OTR in the last 3 yrs; 6 months flatbed in past 3 yrs.' },
      { id: 'maxMovingViolations',     label: 'Moving Violations (max in 3-year period)',             type: 'text', placeholder: 'No more than 1 in the past 3 years' },
      { id: 'licenseSuspensionPolicy', label: 'Policy on License Suspensions',                        type: 'text', placeholder: 'No current suspensions' },
      { id: 'dotRecordableAccidents',  label: 'DOT Recordable Accidents',                             type: 'text', placeholder: 'No accidents in the past 3 years' },
      { id: 'maxMajorMovingViolations',label: 'Maximum Major Moving Violations (last 3 years)',       type: 'text', placeholder: 'No more than 1' },
      { id: 'maxJobsLast3Years',       label: 'Max. Number of Jobs (last 3 years)',                   type: 'text', placeholder: 'No more than 2 jobs in the past 2 years' },
      { id: 'unemploymentPolicy',      label: 'Policy Against Unemployment (even if accounted for)',  type: 'text', placeholder: 'Will review all' },
      { id: 'terminatedApplicants',    label: 'Terminated Applicants',                                type: 'area', placeholder: 'Will review; need reasons for termination.' },
      { id: 'criminalConvictions',     label: 'Criminal Convictions',                                 type: 'text', placeholder: 'None in the past 5 years' },
      { id: 'duiDwiPolicy',            label: 'DUI / DWI (max number & timeframe)',                   type: 'text', placeholder: 'None in a lifetime' },
      { id: 'hazmatRequired',          label: 'Is Haz-Mat Required? Grace period to obtain it?',      type: 'text', placeholder: 'No' },
      { id: 'otherEndorsements',       label: 'Other Endorsements Required',                          type: 'text', placeholder: 'No' },
      { id: 'dotPhysicalRequirements', label: 'DOT Physical Requirements',                            type: 'area', placeholder: 'Physically able; not obese.' },
      { id: 'longFormPhysicalUpfront', label: 'Long Form Physical Required Up Front?',                type: 'yesno' },
      { id: 'drugTesting',             label: 'Drug Testing',                                         type: 'area', placeholder: 'Urine; annual DOT drug screening.' },
      { id: 'otherAutomaticDQs',       label: "Other Automatic DQ's",                                 type: 'area', placeholder: 'No SAP drivers in a lifetime.' },
    ],
  },
  {
    id: 'presentation',
    title: 'Presentation',
    intro: 'What the carrier offers — pay, equipment, home time and benefits.',
    fields: [
      { id: 'signOnBonus',          label: 'Sign-On Bonus',                              type: 'text', placeholder: '$500.00 Sign On Bonus' },
      { id: 'driverTypes',          label: 'Driver Types',                               type: 'text', placeholder: 'Company Solo' },
      { id: 'typesOfRuns',          label: 'Types of Runs',                              type: 'text', placeholder: 'OTR' },
      { id: 'typeOfFreight',        label: 'Type of Freight',                            type: 'text', placeholder: 'Flatbed' },
      { id: 'typeOfEquipment',      label: 'Type of Equipment',                          type: 'text', placeholder: 'Conestoga' },
      { id: 'cameras',              label: 'Cameras',                                    type: 'text', placeholder: 'No' },
      { id: 'transmissionType',     label: 'Transmission Type',                          type: 'text', placeholder: 'Automatic; Manual' },
      { id: 'avgTractorAge',        label: 'Average Age of Tractor',                     type: 'text', placeholder: '4 years old' },
      { id: 'truckAssignedToDriver',label: 'Is truck permanently assigned to the driver?',type: 'text', placeholder: 'Usually, yes' },
      { id: 'truckSpeed',           label: 'Truck Speed',                                type: 'text', placeholder: '75 MPH' },
      { id: 'truckHomeForTimeOff',  label: 'Can truck be taken home for time off?',      type: 'text', placeholder: 'Yes' },
      { id: 'invertersApus',        label: "Inverters / APU's?",                         type: 'text', placeholder: 'Yes' },
      { id: 'pctDropAndHook',       label: '% of Drop and Hook',                         type: 'text', placeholder: '5%' },
      { id: 'pctNoTouch',           label: '% of No Touch',                              type: 'text', placeholder: '0%' },
      { id: 'pctHazmatLoads',       label: '% are Haz-Mat Loads',                        type: 'text', placeholder: '0%' },
      { id: 'payScaleSolo',         label: 'Pay Scale (Solo)',                           type: 'area', placeholder: '$0.70 cpm. Drivers also get extra for additional pickups/drops (typically 4–5 per trip).' },
      { id: 'typeOfDriverPay',      label: 'Type of Driver Pay',                         type: 'text', placeholder: 'Mileage' },
      { id: 'whenPaid',             label: 'When are drivers paid?',                     type: 'text', placeholder: 'Bi-weekly after trip ends' },
      { id: 'howPaid',              label: 'How are drivers paid?',                      type: 'text', placeholder: 'Direct Deposit' },
      { id: 'payIncrease',          label: 'Pay Increase',                               type: 'text', placeholder: 'Will review' },
      { id: 'hiringAreas',          label: 'Hiring Areas',                               type: 'text', placeholder: 'Ohio' },
      { id: 'primaryRunningAreas',  label: 'Primary Running Areas',                      type: 'text', placeholder: 'West Coast, North West, Midwest & South' },
      { id: 'avgMilesPerWeek',      label: 'Average Miles per Week',                     type: 'text', placeholder: '3000 miles per week on average' },
      { id: 'avgLengthOfHaul',      label: 'Average Length of Haul',                     type: 'text', placeholder: 'N/A' },
      { id: 'homeTimeDaysOut',      label: 'Home Time / Days Out',                       type: 'text', placeholder: 'Home a couple of days every week' },
      { id: 'avgWeeklyPay',         label: 'Average Weekly Pay',                         type: 'text', placeholder: '$2,500 – $3,000 per week on average' },
      { id: 'vacationInfo',         label: 'Driver Vacation Info',                       type: 'text', placeholder: '1 month ahead notice' },
      { id: 'ezPass',               label: 'EZ Pass Provided',                           type: 'text', placeholder: 'Yes' },
      { id: 'prePass',              label: 'Pre-Pass Provided',                          type: 'text', placeholder: 'Yes' },
      { id: 'tollCards',            label: 'Toll Cards Provided (which?)',               type: 'text', placeholder: 'No' },
      { id: 'fuelCardType',         label: 'Type of Fuel Card',                          type: 'text', placeholder: 'TCS Fuel Card' },
      { id: 'breakdownPay',         label: 'Breakdown Pay',                              type: 'text', placeholder: 'No' },
      { id: 'layoverPay',           label: 'Layover Pay',                                type: 'text', placeholder: '$100.00 per day' },
      { id: 'dockDetentionPay',     label: 'Dock Detention Pay',                         type: 'text', placeholder: 'After 5 hours' },
      { id: 'multiStopPay',         label: 'Multi-Stop Pay',                             type: 'text', placeholder: 'Yes – $100 per extra stop' },
      { id: 'newYorkCity',          label: 'New York City',                              type: 'text', placeholder: 'No' },
      { id: 'safetyBonus',          label: 'Safety Bonus',                               type: 'text', placeholder: 'No' },
      { id: 'riderPolicy',          label: 'Rider Policy',                               type: 'text', placeholder: 'Yes' },
      { id: 'petPolicy',            label: 'Pet Policy',                                 type: 'text', placeholder: 'No' },
      { id: 'dispatch24h',          label: 'Is there 24-hour dispatch?',                 type: 'text', placeholder: 'Yes' },
      { id: 'routingFuelFlex',      label: 'Routing / fuel-stop flexibility?',           type: 'text', placeholder: 'Yes' },
      { id: 'qualcomm',             label: 'Qualcomm Provided',                          type: 'text', placeholder: 'No' },
      { id: 'perDiemOptional',      label: 'Is per diem optional?',                      type: 'text', placeholder: 'Yes' },
      { id: 'paidOrientation',      label: 'Paid Orientation',                           type: 'text', placeholder: '$0.70 CPM' },
      { id: 'orientationLength',    label: 'How long is Orientation?',                   type: 'text', placeholder: 'e.g. 3 days' },
      { id: 'orientationLocation',  label: 'Orientation held where?',                    type: 'text', placeholder: 'Dayton, OH' },
      { id: 'orientationDays',      label: 'Orientation start / end day?',               type: 'text', placeholder: 'Any day Monday – Friday' },
      { id: 'lodgingProvided',      label: 'Lodging Provided (where staying?)',          type: 'text', placeholder: 'In the truck' },
      { id: 'mealsProvided',        label: 'Meals Provided (Breakfast / Lunch / Dinner)',type: 'text', placeholder: 'No' },
      { id: 'travelProvided',       label: 'Travel Provided (Bus / Plane / Car Rental)', type: 'text', placeholder: 'No' },
      { id: 'insuranceStartsWhen',  label: 'Insurance Starts When?',                     type: 'text', placeholder: 'N/A' },
      { id: 'lifeInsurance',        label: 'Life Insurance',                             type: 'text', placeholder: 'N/A' },
      { id: 'retirement401k',       label: '401(k) Retirement Plan',                     type: 'text', placeholder: 'N/A' },
    ],
  },
  {
    id: 'recruiters',
    title: 'For Recruiters Use Only',
    intro: 'Internal notes for the recruiting team.',
    fields: [
      { id: 'applicationTurnaround', label: 'Application Turnaround Time', type: 'text', placeholder: '24–48 hours' },
      { id: 'rehirePolicy',          label: 'Rehire Policy',              type: 'text', placeholder: 'Will review' },
      { id: 'applicationOwnership',  label: 'Application Ownership',      type: 'text', placeholder: '30 days' },
      { id: 'companyWebsite',        label: 'Company Website',            type: 'text', placeholder: 'https://…' },
    ],
  },
];
const CARRIER_FIELD_IDS = CARRIER_FORM.flatMap((s) => s.fields.map((f) => f.id));

// ── Carrier data layer ───────────────────────────────────────────────────────
function readCarriers() {
  try { return JSON.parse(fs.readFileSync(CARRIER_DB_FILE, 'utf8')); } catch { return []; }
}
function writeCarriers(rows) {
  fs.writeFileSync(CARRIER_DB_FILE, JSON.stringify(rows, null, 2));
}
function findCarrierById(id) { return readCarriers().find((c) => c.id === id); }
function findCarrierByToken(token) { return readCarriers().find((c) => c.token === token); }
function upsertCarrier(carrier) {
  const all = readCarriers();
  const i = all.findIndex((c) => c.id === carrier.id);
  if (i === -1) all.push(carrier); else all[i] = carrier;
  writeCarriers(all);
  return carrier;
}
// Keep only known requirement fields, coerce to trimmed strings.
function cleanRequirements(input = {}) {
  const out = {};
  for (const id of CARRIER_FIELD_IDS) {
    if (input[id] != null && String(input[id]).trim() !== '') out[id] = String(input[id]).trim();
  }
  return out;
}
function carrierProgress(c) {
  const filled = CARRIER_FIELD_IDS.filter((id) => c.requirements?.[id]).length;
  return { filled, total: CARRIER_FIELD_IDS.length };
}
// Shape returned to list views — never leaks the secret token.
function carrierSummary(c) {
  return {
    id: c.id, name: c.name, ownerName: c.ownerName || '', email: c.email || '', phone: c.phone || '',
    status: c.status, filledBy: c.filledBy || null, mode: c.mode,
    createdAt: c.createdAt, updatedAt: c.updatedAt, submittedAt: c.submittedAt || null,
    linkSentCount: c.linkSentCount || 0, linkLastSentAt: c.linkLastSentAt || null,
    linkLastStatus: c.linkLastStatus || null, linkExpiresAt: c.linkExpiresAt || null,
    progress: carrierProgress(c),
  };
}

// ── Data layer ───────────────────────────────────────────────────────────────
function migrate(r) {
  // Migrate old application records to new candidate schema
  if (r.stage) return r; // already migrated
  return {
    ...r,
    stage: r.status === 'submitted' ? 'Lead' : 'Lead',
    subStatus: 'in_progress',
    recruiter: 'Admin',
    stageChangedAt: r.createdAt,
    lastActivityAt: r.submittedAt || r.createdAt,
    linkSentCount: 1,
    linkLastSentAt: r.createdAt,
    linkLastChannels: ['email'],
    linkLastStatus: 'sent',
    linkExpiresAt: r.linkExpiresAt || null,
    consentCompletedAt: (r.application?.consentPsp && r.application?.consentMvr && r.application?.consentEmployment) ? r.submittedAt : null,
    driverFiles: r.files || {},
    signature: r.signature || null,
    checklist: emptyChecklist(),
    documents: copyDriverDocs(r.files || {}),
    pev: (r.application?.employers || []).map((e) => ({
      companyName: e.companyName || '',
      status: 'not_started',
      notes: '',
      verifiedDate: null,
    })),
    activity: r.submittedAt ? [{
      id: crypto.randomUUID(), type: 'application_submitted', by: 'Driver', at: r.submittedAt, note: 'Driver submitted their application.',
    }] : [],
    status: undefined,
    files: undefined,
  };
}

function copyDriverDocs(driverFiles) {
  const docs = {};
  const mapping = { cdlFront: 'cdlFront', cdlBack: 'cdlBack', medicalCard: 'medicalCard' };
  for (const [src, dst] of Object.entries(mapping)) {
    if (driverFiles[src]) docs[dst] = { ...driverFiles[src], uploadedAt: new Date().toISOString(), uploadedBy: 'Driver' };
  }
  return docs;
}

function readAll() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return raw.map(migrate);
  } catch { return []; }
}
function writeAll(records) {
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2));
}
function findByToken(token) { return readAll().find((r) => r.token === token); }
function findById(id) { return readAll().find((r) => r.id === id); }
function upsert(record) {
  const all = readAll();
  const i = all.findIndex((r) => r.id === record.id);
  if (i === -1) all.push(record); else all[i] = record;
  writeAll(all);
  return record;
}
function addActivity(candidate, type, by, note, meta = {}) {
  candidate.activity = candidate.activity || [];
  candidate.activity.push({ id: crypto.randomUUID(), type, by, at: new Date().toISOString(), note, ...meta });
  candidate.lastActivityAt = new Date().toISOString();
}
function isStale(c) {
  if (!c.lastActivityAt) return false;
  return (Date.now() - new Date(c.lastActivityAt).getTime()) > 5 * 24 * 60 * 60 * 1000;
}
function expiringDocs(c) {
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const flags = [];
  const cdlExp = c.application?.cdlExpirationDate;
  const medExp = c.application?.medicalCardExpiration;
  if (cdlExp && new Date(cdlExp) <= soon) flags.push({ type: 'CDL', date: cdlExp });
  if (medExp && new Date(medExp) <= soon) flags.push({ type: 'Medical Card', date: medExp });
  return flags;
}
function checklistComplete(c) {
  return STEP_IDS.every((id) => c.checklist?.[id]?.status === 'complete');
}

// ── Email + SMS sending ───────────────────────────────────────────────────────
// Email: Resend (primary) → SMTP/nodemailer (fallback). SMS: Twilio REST.
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
const emailEnabled = () => Boolean(RESEND_API_KEY || transporter);
const smsEnabled = () => Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM);
const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

const EMAIL_SUBJECT = `Complete Your Driver Application — ${COMPANY_NAME}`;

function inviteHtml(name, link) {
  return `<div style="font-family:'Inter',Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:8px">
    <div style="border-bottom:3px solid #b01d30;padding-bottom:12px;margin-bottom:20px">
      <h2 style="color:#b01d30;margin:0">${COMPANY_NAME}</h2>
    </div>
    <p>Hi ${firstNameOf(name)},</p>
    <p>Thank you for your interest in driving with ${COMPANY_NAME}. The next step is to complete
       your driver qualification application — it only takes a few minutes.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${link}" style="background:#b01d30;color:#fff;padding:14px 32px;border-radius:10px;
         text-decoration:none;font-weight:600;display:inline-block;font-size:16px">Complete My Application</a>
    </p>
    <p style="font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${link}" style="color:#b01d30;word-break:break-all">${link}</a></p>
    <p style="font-size:13px;color:#6b7280">For your security, this link expires in ${LINK_TTL_DAYS} days.
       If it expires before you finish, just reply to this email and we'll send you a new one.</p>
    <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or contact us at ${SUPPORT_CONTACT}.</p>
    <p style="margin-top:24px">Safe travels,<br><strong>${COMPANY_NAME} — Driver Recruiting</strong></p>
  </div>`;
}
function inviteText(name, link) {
  return `Hi ${firstNameOf(name)},

Thank you for your interest in driving with ${COMPANY_NAME}. The next step is to complete your driver qualification application.

Complete your application here:
${link}

For your security, this link expires in ${LINK_TTL_DAYS} days. If it expires before you finish, just reply to this email and we'll send you a new one.

Questions? Reply to this email or contact us at ${SUPPORT_CONTACT}.

Safe travels,
${COMPANY_NAME} — Driver Recruiting`;
}
function inviteSms(name, link) {
  return `${COMPANY_NAME}: Hi ${firstNameOf(name)}, please complete your driver application here: ${link} (expires in ${LINK_TTL_DAYS} days). Reply STOP to opt out.`;
}

async function sendEmail(to, name, link) {
  // Resend (primary)
  if (RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: EMAIL_FROM, to: [to], subject: EMAIL_SUBJECT,
          html: inviteHtml(name, link), text: inviteText(name, link),
          ...(REPLY_TO_EMAIL ? { reply_to: REPLY_TO_EMAIL } : {}),
        }),
      });
      if (r.ok) return { sent: true, provider: 'resend' };
      const body = await r.text().catch(() => '');
      return { sent: false, provider: 'resend', reason: `Resend ${r.status}: ${body.slice(0, 120)}` };
    } catch (e) { return { sent: false, provider: 'resend', reason: 'Resend error: ' + e.message }; }
  }
  // SMTP (fallback)
  if (transporter) {
    try {
      await transporter.sendMail({
        from: EMAIL_FROM, to, subject: EMAIL_SUBJECT,
        html: inviteHtml(name, link), text: inviteText(name, link),
        ...(REPLY_TO_EMAIL ? { replyTo: REPLY_TO_EMAIL } : {}),
      });
      return { sent: true, provider: 'smtp' };
    } catch (e) { return { sent: false, provider: 'smtp', reason: 'SMTP error: ' + e.message }; }
  }
  return { sent: false, reason: 'Email not configured' };
}

// Plain transactional email (e.g. admin notifications) — not the invite template.
async function sendPlainEmail(to, subject, html) {
  if (RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
      });
      return r.ok ? { sent: true } : { sent: false, reason: `Resend ${r.status}` };
    } catch (e) { return { sent: false, reason: e.message }; }
  }
  if (transporter) {
    try { await transporter.sendMail({ from: EMAIL_FROM, to, subject, html }); return { sent: true }; }
    catch (e) { return { sent: false, reason: e.message }; }
  }
  return { sent: false, reason: 'Email not configured' };
}

async function sendSms(to, name, link) {
  if (!smsEnabled()) return { sent: false, reason: 'Twilio not configured' };
  if (isOptedOut(to)) return { sent: false, reason: 'Recipient has opted out of SMS (STOP)' };
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: inviteSms(name, link) }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { sent: true, provider: 'twilio', sid: data.sid };
    return { sent: false, provider: 'twilio', reason: `Twilio ${r.status}: ${(data.message || '').slice(0, 120)}` };
  } catch (e) { return { sent: false, provider: 'twilio', reason: 'Twilio error: ' + e.message }; }
}

// Unified: (re)generate token + expiry, send to all available channels, log each
// attempt to the audit trail. Sending to both channels also acts as cross-channel
// fallback so a single failing channel never leaves the candidate with nothing.
async function dispatchLink(c, base, { regenerate = false } = {}) {
  if (regenerate || !c.token) c.token = crypto.randomBytes(24).toString('hex');
  c.linkExpiresAt = new Date(Date.now() + LINK_TTL_DAYS * 86400000).toISOString();
  const link = `${base}/apply.html?token=${c.token}`;

  let email = null, sms = null;
  if (c.email) {
    email = await sendEmail(c.email, c.name, link).catch((e) => ({ sent: false, reason: e.message }));
    addActivity(c, 'link_sent', 'Admin',
      `Application link ${email.sent ? 'sent' : 'FAILED'} via email to ${c.email}${email.sent ? '' : ` — ${email.reason}`}.`,
      { channel: 'email', status: email.sent ? 'sent' : 'failed', reason: email.reason || null });
  }
  if (c.phone) {
    sms = await sendSms(c.phone, c.name, link).catch((e) => ({ sent: false, reason: e.message }));
    addActivity(c, 'link_sent', 'Admin',
      `Application link ${sms.sent ? 'sent' : 'FAILED'} via SMS to ${c.phone}${sms.sent ? '' : ` — ${sms.reason}`}.`,
      { channel: 'sms', status: sms.sent ? 'sent' : 'failed', reason: sms.reason || null });
  }

  const channelsTried = [c.email ? 'email' : null, c.phone ? 'sms' : null].filter(Boolean);
  const channelsDelivered = [email?.sent ? 'email' : null, sms?.sent ? 'sms' : null].filter(Boolean);
  const anySuccess = channelsDelivered.length > 0;

  c.linkSentCount = (c.linkSentCount || 0) + 1;
  c.linkLastSentAt = new Date().toISOString();
  c.linkLastChannels = channelsDelivered.length ? channelsDelivered : channelsTried;
  c.linkLastStatus = anySuccess ? 'delivered' : 'failed';
  c.lastActivityAt = c.linkLastSentAt;

  return { link, email, sms, anySuccess, channelsDelivered };
}

// Record STOP/START on the candidate matching an inbound phone number.
function markOptoutActivity(phone, optedOut) {
  const all = readAll();
  const n = normPhone(phone);
  const c = all.find((x) => normPhone(x.phone) === n && n);
  if (!c) return;
  addActivity(c, 'sms_optout', 'Driver',
    optedOut ? `Driver replied STOP — opted out of SMS.` : `Driver replied START — opted back in to SMS.`,
    { channel: 'sms', status: optedOut ? 'opted_out' : 'opted_in' });
  upsert(c);
}

// ── Carrier requirements invite (email / SMS) ────────────────────────────────
// Generic senders so a carrier owner can be invited to fill in their hiring
// requirements. They reuse the same providers as the driver invite but carry
// carrier-specific copy. Returns { sent, reason } like the driver senders.
async function deliverEmail(to, subject, html, text) {
  if (RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text, ...(REPLY_TO_EMAIL ? { reply_to: REPLY_TO_EMAIL } : {}) }),
      });
      if (r.ok) return { sent: true, provider: 'resend' };
      const body = await r.text().catch(() => '');
      return { sent: false, provider: 'resend', reason: `Resend ${r.status}: ${body.slice(0, 120)}` };
    } catch (e) { return { sent: false, provider: 'resend', reason: 'Resend error: ' + e.message }; }
  }
  if (transporter) {
    try {
      await transporter.sendMail({ from: EMAIL_FROM, to, subject, html, text, ...(REPLY_TO_EMAIL ? { replyTo: REPLY_TO_EMAIL } : {}) });
      return { sent: true, provider: 'smtp' };
    } catch (e) { return { sent: false, provider: 'smtp', reason: 'SMTP error: ' + e.message }; }
  }
  return { sent: false, reason: 'Email not configured' };
}
async function deliverSms(to, body) {
  if (!smsEnabled()) return { sent: false, reason: 'Twilio not configured' };
  if (isOptedOut(to)) return { sent: false, reason: 'Recipient has opted out of SMS (STOP)' };
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { sent: true, provider: 'twilio', sid: data.sid };
    return { sent: false, provider: 'twilio', reason: `Twilio ${r.status}: ${(data.message || '').slice(0, 120)}` };
  } catch (e) { return { sent: false, provider: 'twilio', reason: 'Twilio error: ' + e.message }; }
}

function carrierInviteHtml(c, link) {
  const who = c.ownerName ? firstNameOf(c.ownerName) : 'there';
  return `<div style="font-family:'Inter',Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:8px">
    <div style="border-bottom:3px solid #b01d30;padding-bottom:12px;margin-bottom:20px">
      <h2 style="color:#b01d30;margin:0">${COMPANY_NAME}</h2>
    </div>
    <p>Hi ${who},</p>
    <p>We work with drivers looking for a great carrier like <strong>${c.name || 'your company'}</strong>. To match the right
       drivers to you, please complete your carrier requirements profile — it covers your pre-qualifications, pay and
       equipment. It only takes a few minutes and you can save it any time.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${link}" style="background:#b01d30;color:#fff;padding:14px 32px;border-radius:10px;
         text-decoration:none;font-weight:600;display:inline-block;font-size:16px">Complete Our Requirements</a>
    </p>
    <p style="font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${link}" style="color:#b01d30;word-break:break-all">${link}</a></p>
    <p style="font-size:13px;color:#6b7280">For your security, this link expires in ${LINK_TTL_DAYS} days.</p>
    <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or contact us at ${SUPPORT_CONTACT}.</p>
    <p style="margin-top:24px">Thank you,<br><strong>${COMPANY_NAME} — Driver Recruiting</strong></p>
  </div>`;
}
function carrierInviteText(c, link) {
  const who = c.ownerName ? firstNameOf(c.ownerName) : 'there';
  return `Hi ${who},

Please complete your carrier requirements profile for ${c.name || 'your company'} so we can match the right drivers to you. It covers your pre-qualifications, pay and equipment.

Complete it here:
${link}

This link expires in ${LINK_TTL_DAYS} days. Questions? Contact us at ${SUPPORT_CONTACT}.

Thank you,
${COMPANY_NAME} — Driver Recruiting`;
}
function carrierInviteSms(c, link) {
  return `${COMPANY_NAME}: Please complete your carrier requirements for ${c.name || 'your company'} here: ${link} (expires in ${LINK_TTL_DAYS} days). Reply STOP to opt out.`;
}

// (Re)generate the carrier's token, send the intake link to every available
// channel, and log each attempt. Mirrors dispatchLink for drivers.
async function dispatchCarrierLink(c, base, { regenerate = false } = {}) {
  if (regenerate || !c.token) c.token = crypto.randomBytes(24).toString('hex');
  c.linkExpiresAt = new Date(Date.now() + LINK_TTL_DAYS * 86400000).toISOString();
  const link = `${base}/carrier-intake.html?token=${c.token}`;

  let email = null, sms = null;
  if (c.email) {
    email = await deliverEmail(c.email, `Carrier requirements — ${c.name || COMPANY_NAME}`, carrierInviteHtml(c, link), carrierInviteText(c, link)).catch((e) => ({ sent: false, reason: e.message }));
    addActivity(c, 'link_sent', 'Recruiter',
      `Requirements link ${email.sent ? 'sent' : 'FAILED'} via email to ${c.email}${email.sent ? '' : ` — ${email.reason}`}.`,
      { channel: 'email', status: email.sent ? 'sent' : 'failed', reason: email.reason || null });
  }
  if (c.phone) {
    sms = await deliverSms(c.phone, carrierInviteSms(c, link)).catch((e) => ({ sent: false, reason: e.message }));
    addActivity(c, 'link_sent', 'Recruiter',
      `Requirements link ${sms.sent ? 'sent' : 'FAILED'} via SMS to ${c.phone}${sms.sent ? '' : ` — ${sms.reason}`}.`,
      { channel: 'sms', status: sms.sent ? 'sent' : 'failed', reason: sms.reason || null });
  }

  const channelsTried = [c.email ? 'email' : null, c.phone ? 'sms' : null].filter(Boolean);
  const channelsDelivered = [email?.sent ? 'email' : null, sms?.sent ? 'sms' : null].filter(Boolean);
  const anySuccess = channelsDelivered.length > 0;

  c.linkSentCount = (c.linkSentCount || 0) + 1;
  c.linkLastSentAt = new Date().toISOString();
  c.linkLastChannels = channelsDelivered.length ? channelsDelivered : channelsTried;
  c.linkLastStatus = anySuccess ? 'delivered' : 'failed';
  c.updatedAt = c.linkLastSentAt;

  return { link, email, sms, anySuccess, channelsDelivered };
}

// ── Molly AI ─────────────────────────────────────────────────────────────────
async function callMolly(stepDef, stepState, candidateName) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const prompt = `You are Molly, an AI hiring compliance assistant for a CDL trucking company.
A recruiter has completed the following compliance check for driver ${candidateName}:

Step: ${stepDef.label}
Result: ${stepState.result || 'Not specified'}
Notes: ${stepState.notes || 'None'}
Status: ${stepState.status}

Write a concise compliance summary as Molly. Return ONLY valid JSON matching this schema exactly:
{
  "oneLine": "one sentence summary",
  "badge": "Pass" or "Fail" or "Pending",
  "bullets": ["bullet 1", "bullet 2", "bullet 3"]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Could not parse Molly response');
  return JSON.parse(json);
}

// ── Driver screening (CDL / MVR / PSP / Insurance) ───────────────────────────
// Evaluates one applicant against a carrier's stated requirements and returns an
// approve/reject verdict with a per-category reason. Uses Claude when configured,
// and falls back to a deterministic rule engine so the feature always returns a
// verdict (and is testable without an API key).
const SCREENING_MODEL = process.env.SCREENING_MODEL || 'claude-opus-4-8';
const SCREEN_SYSTEM =
  'You are an FMCSA-compliant driver-qualification assistant for a CDL trucking carrier. ' +
  'You evaluate a single applicant strictly against the carrier\'s stated hiring requirements ' +
  'across four areas: CDL, MVR (motor vehicle record), PSP (FMCSA Pre-Employment Screening), and Insurance. ' +
  'Judge ONLY against the provided requirements and data. Never consider age, race, sex, religion, ' +
  'national origin, disability, or any other protected characteristic. Cite specific numbers in every reason. ' +
  'If data needed for a category is missing, mark that category as needing review rather than guessing.';

function normalizeScreen(p = {}) {
  const decision = ['approved', 'rejected', 'review'].includes(p.decision) ? p.decision : 'review';
  const categories = Array.isArray(p.categories)
    ? p.categories.map((c) => ({ key: String(c.key || ''), pass: Boolean(c.pass), reason: String(c.reason || '') }))
    : [];
  return { decision, categories, summary: String(p.summary || '') };
}

async function screenWithAI(requirements, driver) {
  const userPrompt =
    `Carrier requirements:\n${JSON.stringify(requirements, null, 2)}\n\n` +
    `Driver applicant:\n${JSON.stringify(driver, null, 2)}\n\n` +
    'Evaluate each of the four categories (CDL, MVR, PSP, Insurance) against the requirements. ' +
    'Return ONLY valid JSON matching this schema exactly:\n' +
    '{\n' +
    '  "decision": "approved" | "rejected" | "review",\n' +
    '  "categories": [ { "key": "CDL" | "MVR" | "PSP" | "Insurance", "pass": true | false, "reason": "one concise sentence citing specifics" } ],\n' +
    '  "summary": "one or two sentence overall recommendation"\n' +
    '}\n' +
    'Approve only if every category passes. Reject if any hard requirement fails. Use "review" only when required data is missing.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SCREENING_MODEL,
      max_tokens: 1024,
      system: SCREEN_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Could not parse screening response');
  return normalizeScreen(JSON.parse(json));
}

function screenHeuristic(reqs = {}, driver = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const rank = { A: 3, B: 2, C: 1 };
  const categories = [];

  // CDL
  {
    const r = reqs.cdl || {}, d = driver.cdl || {};
    const fails = [];
    if (r.class && (rank[String(d.class || '').toUpperCase()] || 0) < (rank[String(r.class).toUpperCase()] || 0))
      fails.push(`Requires a Class ${r.class} CDL; applicant holds ${d.class ? 'Class ' + d.class : 'no class on file'}.`);
    const missing = (r.endorsements || []).filter((e) => !(d.endorsements || []).includes(e));
    if (missing.length) fails.push(`Missing required endorsement(s): ${missing.join(', ')}.`);
    if (num(d.experienceYears) < num(r.minExperienceYears))
      fails.push(`Requires ${num(r.minExperienceYears)} yr(s) experience; applicant has ${num(d.experienceYears)}.`);
    if (r.allowOwnerOperator === false && d.type === 'owner-operator')
      fails.push('Owner-operators are not accepted for this requirement.');
    if (num(r.minValidityDays) > 0 && num(d.expiresInDays) < num(r.minValidityDays))
      fails.push(`CDL must be valid ${num(r.minValidityDays)}+ days; expires in ${num(d.expiresInDays)} day(s).`);
    categories.push({ key: 'CDL', pass: !fails.length, reason: fails.length ? fails.join(' ') : `Class ${d.class || '—'} CDL meets class, endorsement, experience, and validity requirements.` });
  }
  // MVR
  {
    const r = reqs.mvr || {}, d = driver.mvr || {};
    const fails = [];
    if (num(d.movingViolations) > num(r.maxMovingViolations)) fails.push(`${num(d.movingViolations)} moving violation(s) exceeds the limit of ${num(r.maxMovingViolations)}.`);
    if (num(d.accidents) > num(r.maxAccidents)) fails.push(`${num(d.accidents)} accident(s) exceeds the limit of ${num(r.maxAccidents)}.`);
    if (num(d.dui) > num(r.maxDUI)) fails.push(`${num(d.dui)} DUI/DWI exceeds the limit of ${num(r.maxDUI)}.`);
    categories.push({ key: 'MVR', pass: !fails.length, reason: fails.length ? fails.join(' ') : `Driving record is within limits over the last ${num(r.lookbackYears) || 3} years.` });
  }
  // PSP
  {
    const r = reqs.psp || {}, d = driver.psp || {};
    const fails = [];
    if (num(d.crashes) > num(r.maxCrashes)) fails.push(`${num(d.crashes)} PSP crash(es) exceeds the limit of ${num(r.maxCrashes)}.`);
    if (num(d.oosInspections) > num(r.maxOOSInspections)) fails.push(`${num(d.oosInspections)} out-of-service inspection(s) exceeds the limit of ${num(r.maxOOSInspections)}.`);
    categories.push({ key: 'PSP', pass: !fails.length, reason: fails.length ? fails.join(' ') : 'PSP crash and inspection history is within limits.' });
  }
  // Insurance
  {
    const r = reqs.insurance || {}, d = driver.insurance || {};
    const fails = [];
    if (num(d.autoLiability) < num(r.minAutoLiability)) fails.push(`Auto liability $${num(d.autoLiability).toLocaleString()} is below the required $${num(r.minAutoLiability).toLocaleString()}.`);
    if (r.cargoRequired && !d.hasCargo) fails.push('Cargo insurance is required but none is on file.');
    if (r.cargoRequired && d.hasCargo && num(d.cargo) < num(r.minCargo)) fails.push(`Cargo coverage $${num(d.cargo).toLocaleString()} is below the required $${num(r.minCargo).toLocaleString()}.`);
    categories.push({ key: 'Insurance', pass: !fails.length, reason: fails.length ? fails.join(' ') : 'Insurance coverage meets the stated minimums.' });
  }

  const allPass = categories.every((c) => c.pass);
  const failed = categories.filter((c) => !c.pass).map((c) => c.key);
  return {
    decision: allPass ? 'approved' : 'rejected',
    categories,
    summary: allPass
      ? 'Applicant meets all stated CDL, MVR, PSP, and insurance requirements and is recommended for approval.'
      : `Applicant does not meet requirements in: ${failed.join(', ')}. See category notes for specifics.`,
  };
}

// ── Decode & save base64 file ─────────────────────────────────────────────
function decodeAndSave(subDir, field, payload) {
  if (!payload?.dataUrl) return null;
  const m = /^data:(.+?);base64,(.*)$/.exec(payload.dataUrl);
  if (!m) return null;
  const mime = m[1];
  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
  const stored = path.join(subDir, `${field}.${ext}`);
  fs.mkdirSync(path.join(UPLOAD_DIR, subDir), { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(m[2], 'base64'));
  return { name: payload.name || `${field}.${ext}`, mime, stored };
}
function serveFile(res, stored) {
  if (!stored) return res.status(404).send('Not found');
  const full = path.join(UPLOAD_DIR, stored);
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).send('Not found');
  return full;
}

// ── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  if (req.get('x-admin-token') === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
function baseUrl(req) {
  return PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    requiresPassword: Boolean(ADMIN_PASSWORD),
    companyName: COMPANY_NAME,
    checklistSteps: CHECKLIST_STEPS,
    mainDocs: MAIN_DOCS,
    otherDocs: OTHER_DOCS,
    hasMolly: Boolean(ANTHROPIC_API_KEY),
    hasAnna: true,
    annaAi: Boolean(ANTHROPIC_API_KEY),
    hasTelegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    hasEmail: emailEnabled(),
    hasSms: smsEnabled(),
    linkTtlDays: LINK_TTL_DAYS,
  });
});

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.json({ ok: true });
  res.json({ ok: req.body?.password === ADMIN_PASSWORD });
});

// ── Candidates ───────────────────────────────────────────────────────────────
app.get('/api/candidates', requireAdmin, (req, res) => {
  const all = readAll();
  const search = (req.query.search || '').toLowerCase();
  const stageFilter = req.query.stage || '';
  const filter = req.query.filter || '';

  let list = all;
  if (search) list = list.filter((c) => c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search));
  if (stageFilter) list = list.filter((c) => c.stage === stageFilter);
  if (filter === 'stale') list = list.filter(isStale);
  if (filter === 'docs_missing') list = list.filter((c) => MAIN_DOCS.some((d) => !c.documents?.[d.id]));
  if (filter === 'expiring') list = list.filter((c) => expiringDocs(c).length > 0);

  res.json(list.map((c) => ({
    id: c.id, token: c.token, name: c.name, email: c.email, phone: c.phone,
    stage: c.stage, subStatus: c.subStatus, recruiter: c.recruiter,
    createdAt: c.createdAt, stageChangedAt: c.stageChangedAt, lastActivityAt: c.lastActivityAt,
    submittedAt: c.submittedAt, linkSentCount: c.linkSentCount,
    checklistProgress: STEP_IDS.filter((id) => c.checklist?.[id]?.status === 'complete').length,
    stale: isStale(c),
    expiringDocs: expiringDocs(c),
    missingMainDocs: MAIN_DOCS.filter((d) => !c.documents?.[d.id]).map((d) => d.label),
  })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/candidates', requireAdmin, async (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  // Duplicate check
  const all = readAll();
  const dup = all.find((c) => c.email.toLowerCase() === email.toLowerCase() || (phone && c.phone && c.phone === phone));
  if (dup) return res.status(409).json({ error: `Possible duplicate: ${dup.name} (${dup.email})`, duplicate: { id: dup.id, name: dup.name, email: dup.email, stage: dup.stage } });

  const now = new Date().toISOString();
  const candidate = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(24).toString('hex'),
    name: String(name).trim(),
    email: String(email).trim(),
    phone: phone ? String(phone).trim() : '',
    stage: 'Lead',
    subStatus: 'in_progress',
    recruiter: 'Admin',
    createdAt: now, stageChangedAt: now, lastActivityAt: now,
    linkSentCount: 0, linkLastSentAt: null, linkLastChannels: [], linkLastStatus: null, linkExpiresAt: null,
    submittedAt: null, consentCompletedAt: null,
    application: null,
    driverFiles: {}, signature: null,
    checklist: emptyChecklist(),
    documents: {},
    pev: [],
    activity: [{ id: crypto.randomUUID(), type: 'candidate_created', by: 'Admin', at: now, note: `Candidate added to pipeline at Lead.` }],
  };

  const dispatch = await dispatchLink(candidate, baseUrl(req), { regenerate: false });
  upsert(candidate);

  res.json({ id: candidate.id, link: dispatch.link, email: dispatch.email, sms: dispatch.sms, anySuccess: dispatch.anySuccess });
});

app.get('/api/candidates/:id', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json({ ...c, stale: isStale(c), expiringDocs: expiringDocs(c), checklistSteps: CHECKLIST_STEPS });
});

app.patch('/api/candidates/:id', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { stage, subStatus, recruiter, notes } = req.body || {};
  const now = new Date().toISOString();

  if (stage && stage !== c.stage) {
    // Gate: cannot move to Onboarding unless checklist complete (or Rejected always allowed)
    if (stage === 'Onboarding' && !checklistComplete(c)) {
      const outstanding = STEP_IDS.filter((id) => c.checklist?.[id]?.status !== 'complete').map((id) => CHECKLIST_STEPS.find((s) => s.id === id)?.label);
      return res.status(422).json({ error: 'Cannot advance to Onboarding — checklist incomplete.', outstanding });
    }
    addActivity(c, 'stage_change', 'Admin', `Stage changed from ${c.stage} to ${stage}.`, { from: c.stage, to: stage });
    c.stage = stage;
    c.stageChangedAt = now;
  }
  if (subStatus !== undefined) c.subStatus = subStatus;
  if (recruiter !== undefined) c.recruiter = recruiter;
  if (notes !== undefined) {
    addActivity(c, 'note_added', 'Admin', notes);
  }
  c.lastActivityAt = now;
  upsert(c);
  res.json({ ok: true, stage: c.stage });
});

app.post('/api/candidates/:id/resend', requireAdmin, async (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  // Generate a fresh, valid link (works any time, including after expiration)
  const dispatch = await dispatchLink(c, baseUrl(req), { regenerate: true });
  upsert(c);
  res.json({ link: dispatch.link, email: dispatch.email, sms: dispatch.sms, anySuccess: dispatch.anySuccess });
});

app.post('/api/candidates/:id/activity', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { note } = req.body || {};
  if (!note?.trim()) return res.status(400).json({ error: 'Note is required.' });
  addActivity(c, 'note_added', 'Admin', note.trim());
  upsert(c);
  res.json({ ok: true });
});

// Bulk actions
app.post('/api/candidates/bulk', requireAdmin, async (req, res) => {
  const { ids, action, stage } = req.body || {};
  if (!ids?.length) return res.status(400).json({ error: 'No candidates selected.' });
  const results = [];
  for (const id of ids) {
    const c = findById(id);
    if (!c) continue;
    if (action === 'stage_change' && stage) {
      if (stage === 'Onboarding' && !checklistComplete(c)) { results.push({ id, ok: false, error: 'Checklist incomplete' }); continue; }
      addActivity(c, 'stage_change', 'Admin', `Bulk stage change to ${stage}.`, { from: c.stage, to: stage });
      c.stage = stage; c.stageChangedAt = new Date().toISOString(); upsert(c);
      results.push({ id, ok: true });
    } else if (action === 'resend') {
      const dispatch = await dispatchLink(c, baseUrl(req), { regenerate: true });
      upsert(c);
      results.push({ id, ok: dispatch.anySuccess, channels: dispatch.channelsDelivered });
    }
  }
  res.json(results);
});

// ── Checklist ────────────────────────────────────────────────────────────────
app.patch('/api/candidates/:id/checklist/:stepId', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { stepId } = req.params;
  if (!STEP_IDS.includes(stepId)) return res.status(400).json({ error: 'Unknown step' });
  const { status, result, notes } = req.body || {};
  const stepIndex = STEP_IDS.indexOf(stepId);

  // Gating: step must be preceded by all prior steps being complete (except step 0)
  if (status === 'complete' && stepIndex > 0) {
    const prevId = STEP_IDS[stepIndex - 1];
    if (c.checklist[prevId]?.status !== 'complete') {
      return res.status(422).json({ error: `"${CHECKLIST_STEPS[stepIndex - 1].label}" must be completed first.` });
    }
  }
  const step = c.checklist[stepId];
  if (status) step.status = status;
  if (result !== undefined) step.result = result;
  if (notes !== undefined) step.notes = notes;
  if (status === 'complete' && !step.completedAt) {
    step.completedAt = new Date().toISOString();
    step.completedBy = 'Admin';
    addActivity(c, 'checklist_complete', 'Admin', `Checklist step "${CHECKLIST_STEPS[stepIndex].label}" marked complete.`, { stepId });
  }
  if (status === 'not_started') { step.completedAt = null; step.completedBy = null; step.mollySummary = null; }
  c.lastActivityAt = new Date().toISOString();
  upsert(c);
  res.json({ ok: true, step });
});

app.post('/api/candidates/:id/molly/:stepId', requireAdmin, async (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { stepId } = req.params;
  const stepDef = CHECKLIST_STEPS.find((s) => s.id === stepId);
  if (!stepDef) return res.status(400).json({ error: 'Unknown step' });
  try {
    const summary = await callMolly(stepDef, c.checklist[stepId] || {}, c.name);
    c.checklist[stepId].mollySummary = { ...summary, generatedAt: new Date().toISOString() };
    addActivity(c, 'molly_summary', 'Admin', `Molly AI summary generated for "${stepDef.label}".`, { stepId });
    upsert(c);
    res.json(c.checklist[stepId].mollySummary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Driver screening ──────────────────────────────────────────────────────────
// Evaluate one applicant against a carrier's requirements (CDL / MVR / PSP /
// Insurance). Returns { decision, categories[], summary, engine }. Falls back to
// the deterministic rule engine when no API key is set or the AI call fails.
app.post('/api/screen', requireAdmin, async (req, res) => {
  const { requirements, driver } = req.body || {};
  if (!requirements || !driver) return res.status(400).json({ error: 'requirements and driver are required.' });
  if (ANTHROPIC_API_KEY) {
    try {
      const result = await screenWithAI(requirements, driver);
      return res.json({ ...result, engine: 'ai', model: SCREENING_MODEL });
    } catch (e) {
      // Degrade gracefully to the rule engine rather than failing the request.
      return res.json({ ...screenHeuristic(requirements, driver), engine: 'rules', aiError: e.message });
    }
  }
  return res.json({ ...screenHeuristic(requirements, driver), engine: 'rules' });
});

// ── Documents ─────────────────────────────────────────────────────────────────
app.post('/api/candidates/:id/documents/:docType', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { docType } = req.params;
  if (!ALL_DOC_IDS.includes(docType)) return res.status(400).json({ error: 'Unknown document type' });
  const { dataUrl, name } = req.body || {};
  const saved = decodeAndSave(c.id, docType, { dataUrl, name });
  if (!saved) return res.status(400).json({ error: 'Invalid file data' });
  c.documents = c.documents || {};
  c.documents[docType] = { ...saved, uploadedAt: new Date().toISOString(), uploadedBy: 'Admin' };
  addActivity(c, 'document_uploaded', 'Admin', `Document "${MAIN_DOCS.concat(OTHER_DOCS).find((d) => d.id === docType)?.label || docType}" uploaded.`, { docType });
  upsert(c);
  res.json({ ok: true });
});

app.get('/api/candidates/:id/documents/:docType/file', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  const { docType } = req.params;
  // Check admin-uploaded documents first, then driver-uploaded files
  const meta = c?.documents?.[docType] || c?.driverFiles?.[docType];
  const fp = serveFile(res, meta?.stored);
  if (typeof fp !== 'string') return;
  res.type(meta.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${meta.name}"`);
  fs.createReadStream(fp).pipe(res);
});

app.delete('/api/candidates/:id/documents/:docType', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  delete c.documents?.[req.params.docType];
  addActivity(c, 'document_removed', 'Admin', `Document "${req.params.docType}" removed.`);
  upsert(c);
  res.json({ ok: true });
});

// Serve driver-uploaded signature
app.get('/api/candidates/:id/signature', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  const meta = c?.driverFiles?.signature;
  const fp = serveFile(res, meta?.stored);
  if (typeof fp !== 'string') return;
  res.type(meta.mime || 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="signature.png"`);
  fs.createReadStream(fp).pipe(res);
});

// ── PEV ──────────────────────────────────────────────────────────────────────
app.patch('/api/candidates/:id/pev/:index', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const idx = parseInt(req.params.index);
  if (!c.pev[idx]) return res.status(404).json({ error: 'PEV entry not found' });
  const { status, notes, verifiedDate } = req.body || {};
  if (status !== undefined) c.pev[idx].status = status;
  if (notes !== undefined) c.pev[idx].notes = notes;
  if (verifiedDate !== undefined) c.pev[idx].verifiedDate = verifiedDate;
  addActivity(c, 'pev_updated', 'Admin', `PEV updated for ${c.pev[idx].companyName}: ${status || 'notes updated'}.`);
  upsert(c);
  res.json({ ok: true });
});

// ── Telegram ──────────────────────────────────────────────────────────────────
app.post('/api/telegram/:id', requireAdmin, async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(400).json({ error: 'Telegram integration not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.' });
  }
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const text = `*New Application — ${COMPANY_NAME}*\n\nDriver: ${c.name}\nEmail: ${c.email}\nStage: ${c.stage}\nSubmitted: ${c.submittedAt ? new Date(c.submittedAt).toLocaleString() : 'Not yet'}`;
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const data = await r.json();
  if (!data.ok) return res.status(500).json({ error: data.description });
  res.json({ ok: true });
});

// ── Driver-facing apply routes ────────────────────────────────────────────────
function linkExpired(c) {
  return Boolean(c.linkExpiresAt && new Date(c.linkExpiresAt) < new Date());
}
const EXPIRED_MSG = `This link has expired. Please contact ${COMPANY_NAME} at ${SUPPORT_CONTACT} for a new one.`;

app.get('/api/apply/:token', (req, res) => {
  const c = findByToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'This application link is not valid. Please contact the company for a new one.' });
  if (c.submittedAt) return res.json({ name: c.name, email: c.email, phone: c.phone, status: 'submitted', companyName: COMPANY_NAME });
  if (linkExpired(c)) return res.status(410).json({ error: EXPIRED_MSG, expired: true });
  res.json({ name: c.name, email: c.email, phone: c.phone, status: 'pending', companyName: COMPANY_NAME, expiresAt: c.linkExpiresAt });
});

app.post('/api/apply/:token', (req, res) => {
  const c = findByToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'This application link is not valid. Please contact the company for a new one.' });
  if (c.submittedAt) return res.status(409).json({ error: 'Already submitted.' });
  if (linkExpired(c)) return res.status(410).json({ error: EXPIRED_MSG, expired: true });

  const { application, files, signature } = req.body || {};
  if (!application) return res.status(400).json({ error: 'Missing application data.' });

  const dir = c.id;
  const driverFiles = {};
  for (const field of ['cdlFront', 'cdlBack', 'medicalCard']) {
    if (files?.[field]) { const s = decodeAndSave(dir, field, files[field]); if (s) driverFiles[field] = s; }
  }
  if (signature?.dataUrl) { const s = decodeAndSave(dir, 'signature', signature); if (s) driverFiles['signature'] = s; }

  c.application = application;
  c.signature = signature ? { mode: signature.mode, name: signature.name || '' } : null;
  c.driverFiles = driverFiles;
  // Auto-copy CDL/medical to documents tab
  c.documents = { ...copyDriverDocs(driverFiles), ...(c.documents || {}) };
  c.submittedAt = new Date().toISOString();
  c.lastActivityAt = c.submittedAt;
  // Sync PEV entries from employers
  c.pev = (application.employers || []).map((e, i) => c.pev?.[i] || { companyName: e.companyName || '', status: 'not_started', notes: '', verifiedDate: null });
  c.consentCompletedAt = (application.consentPsp && application.consentMvr && application.consentEmployment) ? c.submittedAt : null;
  addActivity(c, 'application_submitted', 'Driver', 'Driver submitted their application.');
  upsert(c);

  if (process.env.NOTIFY_EMAIL) {
    sendPlainEmail(process.env.NOTIFY_EMAIL, `New driver application — ${c.name}`,
      `<p><strong>${c.name}</strong> (${c.email}) submitted their driver application.</p><p>View it in the QuickHire workdeck dashboard.</p>`).catch(() => {});
  }
  res.json({ ok: true });
});

// ── Legacy compat ─────────────────────────────────────────────────────────────
app.get('/api/admin/applications', requireAdmin, (req, res) => {
  res.json(readAll().map((c) => ({ id: c.id, name: c.name, email: c.email, status: c.submittedAt ? 'submitted' : 'invited', createdAt: c.createdAt, submittedAt: c.submittedAt, token: c.token })));
});
app.get('/api/admin/applications/:id', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
app.get('/api/admin/files/:id/:field', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  const meta = c?.driverFiles?.[req.params.field] || c?.documents?.[req.params.field];
  const fp = serveFile(res, meta?.stored);
  if (typeof fp !== 'string') return;
  res.type(meta.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${meta.name}"`);
  fs.createReadStream(fp).pipe(res);
});

// ── Twilio inbound webhook: honor STOP/START (TCPA) ──────────────────────────
// Configure this URL as the Messaging webhook for your Twilio number:
//   https://<your-domain>/api/twilio/inbound   (HTTP POST)
app.post('/api/twilio/inbound', express.urlencoded({ extended: false }), (req, res) => {
  const from = req.body.From || '';
  const body = String(req.body.Body || '').trim().toUpperCase();
  const STOP = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
  const START = ['START', 'YES', 'UNSTOP'];
  if (STOP.includes(body)) { addOptout(from); markOptoutActivity(from, true); }
  else if (START.includes(body)) { removeOptout(from); markOptoutActivity(from, false); }
  // Return empty TwiML — Twilio's Advanced Opt-Out sends the standard confirmation,
  // so we avoid sending a duplicate. We just record the opt-out on our side.
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

// ── Carriers (requirement profiles) ──────────────────────────────────────────
// Public: the questionnaire definition (so the recruiter UI and the carrier's
// own intake page always render the exact same questions).
app.get('/api/carrier-form', (_req, res) => res.json({ sections: CARRIER_FORM }));

// Recruiter: list every carrier profile (newest first).
app.get('/api/carriers', requireAdmin, (req, res) => {
  const search = (req.query.search || '').toLowerCase();
  let list = readCarriers().map(carrierSummary);
  if (search) list = list.filter((c) => c.name.toLowerCase().includes(search) || (c.email || '').toLowerCase().includes(search));
  res.json(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Recruiter: add a carrier. mode 'self' = recruiter fills the requirements now;
// mode 'invite' = email/SMS the carrier owner a link to fill it themselves.
app.post('/api/carriers', requireAdmin, async (req, res) => {
  const { name, ownerName, email, phone, mode, requirements } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Company name is required.' });
  const m = mode === 'self' ? 'self' : 'invite';
  if (m === 'invite' && !email && !phone) return res.status(400).json({ error: 'Add an email or phone so we can send the carrier their link.' });

  const now = new Date().toISOString();
  const carrier = {
    id: crypto.randomUUID(),
    token: null,
    name: String(name).trim(),
    ownerName: ownerName ? String(ownerName).trim() : '',
    email: email ? String(email).trim() : '',
    phone: phone ? String(phone).trim() : '',
    mode: m,
    status: m === 'self' ? 'completed' : 'awaiting_carrier',
    filledBy: m === 'self' ? 'recruiter' : null,
    requirements: m === 'self' ? cleanRequirements(requirements) : {},
    createdAt: now, updatedAt: now, submittedAt: m === 'self' ? now : null,
    linkSentCount: 0, linkLastSentAt: null, linkLastChannels: [], linkLastStatus: null, linkExpiresAt: null,
    activity: [{ id: crypto.randomUUID(), type: 'carrier_created', by: 'Recruiter', at: now, note: `Carrier profile created (${m === 'self' ? 'filled by recruiter' : 'invite sent to carrier'}).` }],
  };

  let dispatch = null;
  if (m === 'invite') {
    dispatch = await dispatchCarrierLink(carrier, baseUrl(req), { regenerate: true });
  }
  upsertCarrier(carrier);

  res.json({
    id: carrier.id,
    status: carrier.status,
    link: dispatch?.link || null,
    email: dispatch?.email || null,
    sms: dispatch?.sms || null,
    anySuccess: dispatch?.anySuccess ?? null,
  });
});

// Recruiter: full carrier record + the form schema for rendering.
app.get('/api/carriers/:id', requireAdmin, (req, res) => {
  const c = findCarrierById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { token, ...safe } = c;
  res.json({ ...safe, sections: CARRIER_FORM, progress: carrierProgress(c), hasLink: Boolean(token) });
});

// Recruiter: edit identity/contact and/or requirements.
app.patch('/api/carriers/:id', requireAdmin, (req, res) => {
  const c = findCarrierById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { name, ownerName, email, phone, requirements } = req.body || {};
  const now = new Date().toISOString();

  if (name !== undefined) c.name = String(name).trim();
  if (ownerName !== undefined) c.ownerName = String(ownerName).trim();
  if (email !== undefined) c.email = String(email).trim();
  if (phone !== undefined) c.phone = String(phone).trim();
  if (requirements !== undefined) {
    c.requirements = cleanRequirements(requirements);
    c.status = 'completed';
    if (!c.submittedAt) c.submittedAt = now;
    if (!c.filledBy) c.filledBy = 'recruiter';
    addActivity(c, 'requirements_updated', 'Recruiter', 'Requirements updated by recruiter.');
  }
  c.updatedAt = now;
  upsertCarrier(c);
  res.json({ ok: true, status: c.status, progress: carrierProgress(c) });
});

// Recruiter: (re)send the intake link to the carrier owner.
app.post('/api/carriers/:id/resend', requireAdmin, async (req, res) => {
  const c = findCarrierById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { email, phone } = req.body || {};
  if (email !== undefined) c.email = String(email).trim();
  if (phone !== undefined) c.phone = String(phone).trim();
  if (!c.email && !c.phone) return res.status(400).json({ error: 'Add an email or phone first.' });
  const dispatch = await dispatchCarrierLink(c, baseUrl(req), { regenerate: true });
  if (c.status === 'completed') { /* keep completed */ } else c.status = 'awaiting_carrier';
  upsertCarrier(c);
  res.json({ link: dispatch.link, email: dispatch.email, sms: dispatch.sms, anySuccess: dispatch.anySuccess });
});

app.delete('/api/carriers/:id', requireAdmin, (req, res) => {
  const all = readCarriers();
  const next = all.filter((c) => c.id !== req.params.id);
  if (next.length === all.length) return res.status(404).json({ error: 'Not found' });
  writeCarriers(next);
  res.json({ ok: true });
});

// Public (token): the carrier owner loads their intake form.
app.get('/api/carrier-intake/:token', (req, res) => {
  const c = findCarrierByToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'This link is not valid. Please contact us for a new one.' });
  if (linkExpired(c)) return res.status(410).json({ error: EXPIRED_MSG, expired: true });
  res.json({
    name: c.name, ownerName: c.ownerName || '', companyName: COMPANY_NAME,
    status: c.status, sections: CARRIER_FORM, requirements: c.requirements || {},
    expiresAt: c.linkExpiresAt,
  });
});

// Public (token): the carrier owner submits/updates their requirements.
app.post('/api/carrier-intake/:token', (req, res) => {
  const c = findCarrierByToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'This link is not valid. Please contact us for a new one.' });
  if (linkExpired(c)) return res.status(410).json({ error: EXPIRED_MSG, expired: true });
  const { requirements } = req.body || {};
  if (!requirements || typeof requirements !== 'object') return res.status(400).json({ error: 'Missing requirements.' });

  const firstTime = c.status !== 'completed';
  c.requirements = cleanRequirements(requirements);
  c.status = 'completed';
  c.filledBy = 'carrier';
  c.submittedAt = new Date().toISOString();
  c.updatedAt = c.submittedAt;
  addActivity(c, 'requirements_submitted', 'Carrier', `Carrier ${firstTime ? 'submitted' : 'updated'} their requirements.`);
  upsertCarrier(c);

  if (process.env.NOTIFY_EMAIL) {
    deliverEmail(process.env.NOTIFY_EMAIL, `Carrier requirements received — ${c.name}`,
      `<p><strong>${c.name}</strong> ${firstTime ? 'completed' : 'updated'} their carrier requirements profile.</p><p>View it in the QuickHire carriers dashboard.</p>`, '').catch(() => {});
  }
  res.json({ ok: true });
});

// ── Anna: Driver Qualification AI Agent ──────────────────────────────────────
// Standalone module in anna/ wired in here. Anna normalizes a lead, matches it
// against every carrier, builds a portfolio, and produces a compliance verdict.
const SPEC_PARSE_VERSION = 1;
const annaOpts = () => ({ apiKey: ANTHROPIC_API_KEY });

function readPortfolios() { try { return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8')); } catch { return []; } }
function writePortfolios(rows) { fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(rows, null, 2)); }
function upsertPortfolio(p) {
  const all = readPortfolios();
  const i = all.findIndex((x) => x.id === p.id);
  if (i === -1) all.push(p); else all[i] = p;
  writePortfolios(all);
  return p;
}
function findPortfolio(id) { return readPortfolios().find((p) => p.id === id); }
function portfolioSummary(p) {
  return {
    id: p.id, createdAt: p.createdAt,
    driverName: p.driver?.name || '—',
    carrierName: p.carrier?.carrierName || null,
    fitScore: p.carrier?.fitScore ?? null,
    reviewStatus: p.review?.status || 'pending',
    recruiter: p.review?.assignedRecruiter || null,
    complianceFlag: p.compliance?.flag || null,
  };
}

// Parse each carrier's free-text requirements into Anna's structured shape once,
// cache it on the carrier record, and return carriers shaped for the matcher.
async function annaCarriers() {
  const out = [];
  for (const c of readCarriers()) {
    if (!c.requirements || !Object.keys(c.requirements).length) continue; // nothing to match on yet
    if (!c.structuredRequirements || c.structuredSpecVersion !== SPEC_PARSE_VERSION) {
      const { requirements } = await anna.extractCarrierSpec(c.requirements, annaOpts());
      c.structuredRequirements = requirements;
      c.structuredSpecVersion = SPEC_PARSE_VERSION;
      upsertCarrier(c);
    }
    out.push({ id: c.id, name: c.name, requirements: c.structuredRequirements, specVersion: SPEC_PARSE_VERSION });
  }
  return out;
}

// Scan a document (image/PDF) and return extracted fields for auto-fill.
app.post('/api/anna/scan', requireAdmin, async (req, res) => {
  const { dataUrl, docType } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl is required.' });
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Document scanning requires ANTHROPIC_API_KEY.' });
  try {
    res.json(await anna.extractFromDocument({ dataUrl, docType, apiKey: ANTHROPIC_API_KEY }));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Match a driver against all carriers (normalize first), without persisting.
app.post('/api/anna/match', requireAdmin, async (req, res) => {
  const { driver, lead } = req.body || {};
  if (!driver && !lead) return res.status(400).json({ error: 'driver or lead is required.' });
  try {
    const { profile } = await anna.normalizeDriver(driver || lead, annaOpts());
    const match = anna.matchDriver(profile, await annaCarriers(), { minScore: Number(req.body?.minScore) || 0 });
    res.json({ profile, match });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Full Stage 1→3: normalize a lead, match all carriers, persist a portfolio.
app.post('/api/anna/leads', requireAdmin, async (req, res) => {
  const { lead, recruiterPool } = req.body || {};
  if (!lead) return res.status(400).json({ error: 'lead is required.' });
  try {
    const result = await anna.processLead({
      lead,
      carriers: await annaCarriers(),
      opts: { ...annaOpts(), recruiterPool: recruiterPool || [], minScore: Number(req.body?.minScore) || 0 },
    });
    if (result.portfolio) upsertPortfolio(result.portfolio);
    res.json({ profile: result.profile, match: result.match, source: result.source, portfolio: result.portfolio || null });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Suggest other carriers for a (rejected) driver.
app.post('/api/anna/rematch', requireAdmin, async (req, res) => {
  const { driver, excludeCarrierIds } = req.body || {};
  if (!driver) return res.status(400).json({ error: 'driver is required.' });
  try {
    const { profile } = await anna.normalizeDriver(driver, annaOpts());
    res.json(anna.suggestRematch(profile, await annaCarriers(), { excludeCarrierIds: excludeCarrierIds || [] }));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/anna/portfolios', requireAdmin, (_req, res) => {
  res.json(readPortfolios().map(portfolioSummary));
});
app.get('/api/anna/portfolios/:id', requireAdmin, (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// Stage 4: pull/record compliance data and write the approve/reject verdict.
app.post('/api/anna/portfolios/:id/compliance', requireAdmin, async (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!p.carrier?.carrierId) return res.status(400).json({ error: 'Portfolio has no matched carrier.' });
  const carrier = findCarrierById(p.carrier.carrierId);
  if (!carrier) return res.status(404).json({ error: 'Matched carrier no longer exists.' });
  try {
    const compliance = await anna.writeCompliance({
      carrier: { id: carrier.id, name: carrier.name, requirements: carrier.structuredRequirements || {} },
      driver: p.driver,
      records: req.body?.records || {},
      opts: { ...annaOpts(), narrate: Boolean(ANTHROPIC_API_KEY) },
    });
    p.compliance = compliance;
    // Official pulled records supersede self-reported data so any later re-match
    // reflects reality (e.g. a DUI found on the MVR follows the driver).
    p.driver = anna.mergeRecords(p.driver, req.body?.records || {});
    upsertPortfolio(p);
    res.json(compliance);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Stage 5: human checkpoint — recruiter approves or rejects.
app.post('/api/anna/portfolios/:id/decision', requireAdmin, async (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { decision, reason, by } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be "approved" or "rejected".' });
  p.review = { ...p.review, status: decision, decidedBy: by || 'Recruiter', decidedAt: new Date().toISOString(), decisionReason: reason || '' };
  upsertPortfolio(p);
  // On rejection, offer re-match suggestions to other carriers.
  let rematch = null;
  if (decision === 'rejected') {
    try { rematch = anna.suggestRematch(p.driver, await annaCarriers(), { excludeCarrierIds: [p.carrier?.carrierId].filter(Boolean) }); } catch { /* best effort */ }
  }
  res.json({ ok: true, review: p.review, rematch });
});

// Recruiter-facing Anna portfolio queue (standalone static page).
app.get('/anna', (_req, res) => res.redirect('/anna.html'));

// ── Static ─────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback: serve the FleetView React app for any /app/* client-side route.
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QuickHire on http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) console.log('WARNING: ADMIN_PASSWORD not set — dashboard is open.');
  console.log(`Email: ${RESEND_API_KEY ? 'Resend' : transporter ? 'SMTP fallback' : 'NOT configured (links shown in dashboard)'}`);
  console.log(`SMS:   ${smsEnabled() ? 'Twilio' : 'NOT configured'}`);
  if (!ANTHROPIC_API_KEY) console.log('NOTE: ANTHROPIC_API_KEY not set — Molly AI disabled; Anna runs in deterministic mode.');
  console.log('Anna: driver-qualification agent mounted at /api/anna/*');
  console.log(`Link TTL: ${LINK_TTL_DAYS} days`);
});
