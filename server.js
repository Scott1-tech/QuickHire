import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import * as anna from './anna/index.js';
import * as docusign from './docusign/index.js';

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
const ANNA_SETTINGS_FILE = path.join(DATA_DIR, 'anna-settings.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');
if (!fs.existsSync(OPTOUT_FILE)) fs.writeFileSync(OPTOUT_FILE, '[]');
if (!fs.existsSync(CARRIER_DB_FILE)) fs.writeFileSync(CARRIER_DB_FILE, '[]');
if (!fs.existsSync(PORTFOLIO_FILE)) fs.writeFileSync(PORTFOLIO_FILE, '[]');
if (!fs.existsSync(ANNA_SETTINGS_FILE)) fs.writeFileSync(ANNA_SETTINGS_FILE, '{}');

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
// Capture the raw body so the DocuSign Connect webhook can verify its HMAC.
app.use(express.json({ limit: '50mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

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
    annaAi: Boolean(annaApiKey()),
    annaIntegrations: anna.integrationStatus(),
    hasTelegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    hasEmail: emailEnabled(),
    hasSms: smsEnabled(),
    hasDocusign: true,
    docusign: docusign.status(),
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
// Anna's Anthropic key can come from the in-app Settings (stored server-side) or
// the ANTHROPIC_API_KEY env var. The UI-provided key takes precedence.
function readAnnaSettings() { try { return JSON.parse(fs.readFileSync(ANNA_SETTINGS_FILE, 'utf8')); } catch { return {}; } }
function writeAnnaSettings(o) { fs.writeFileSync(ANNA_SETTINGS_FILE, JSON.stringify(o, null, 2)); }
function annaProvider() { return readAnnaSettings().provider || 'anthropic'; }
// Key comes from in-app Settings (any provider) or the ANTHROPIC_API_KEY env var
// (which only applies when the provider is Anthropic).
function annaApiKey() {
  const s = readAnnaSettings();
  if (s.apiKey) return s.apiKey;
  return annaProvider() === 'anthropic' ? (ANTHROPIC_API_KEY || '') : '';
}
function annaKeySource() { return readAnnaSettings().apiKey ? 'ui' : (annaProvider() === 'anthropic' && ANTHROPIC_API_KEY ? 'env' : null); }
const maskKey = (k) => (k && k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : (k ? '••••' : null));
// opts passed to every Anna LLM call: provider + key (+ optional model override).
const annaOpts = () => ({ provider: annaProvider(), apiKey: annaApiKey(), model: readAnnaSettings().model || undefined });

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
// Append an immutable audit entry to a portfolio (the compliance trail).
function auditLog(p, event, detail, actor = 'Anna') {
  (p.audit ||= []).push({ at: new Date().toISOString(), actor, event, detail: detail || '' });
}

// Printable compliance packet (self-contained HTML, no external assets).
function renderPacketHtml(k, id) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const row = (label, val) => `<tr><th>${esc(label)}</th><td>${esc(val)}</td></tr>`;
  const d = k.driver || {};
  const cmp = k.compliance;
  const cats = cmp?.categories?.map((c) => `<li><b>${esc(c.key)}:</b> ${c.pass ? '✓' : '✗'} ${esc(c.reason)}</li>`).join('') || '<li>No compliance check on file.</li>';
  const audit = (k.auditTrail || []).map((a) => `<tr><td>${esc(new Date(a.at).toLocaleString())}</td><td>${esc(a.actor)}</td><td>${esc(a.event)}</td><td>${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4">No events.</td></tr>';
  const src = (k.complianceSources || []).map((s) => `${esc(s.type)} (${s.simulated ? 'simulated' : 'live'})`).join(', ') || '—';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Compliance Packet — ${esc(d.name || id)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#111;max-width:820px;margin:24px auto;padding:0 20px;line-height:1.5}
h1{font-size:20px;margin:0} h2{font-size:14px;text-transform:uppercase;color:#666;border-bottom:1px solid #eee;padding-bottom:4px;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:13px} th{text-align:left;width:200px;color:#555;vertical-align:top;padding:4px 8px}
td{padding:4px 8px} .meta{color:#888;font-size:12px} .verdict{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px}
.approve{background:#dcfce7;color:#16a34a}.reject{background:#fee2e2;color:#dc2626}.review{background:#fef3c7;color:#b45309}
.audit td,.audit th{border-bottom:1px solid #f0f0f0;font-size:12px} ul{margin:6px 0;padding-left:18px} @media print{body{margin:0}}</style></head>
<body>
<h1>Driver Compliance Packet</h1>
<div class="meta">${esc(k.company)} · Generated ${esc(new Date(k.generatedAt).toLocaleString())} · Portfolio ${esc(id)}</div>

<h2>Driver</h2>
<table>${row('Name', d.name)}${row('Age', d.age)}${row('CDL', d.cdl ? `Class ${d.cdl.class || '—'}, ${d.cdl.experienceYears ?? '—'} yrs, endorsements ${(d.cdl.endorsements || []).join(', ') || 'none'}` : '—')}${row('MVR', d.mvr ? `${d.mvr.movingViolations ?? '—'} viol, ${d.mvr.accidents ?? '—'} acc, ${d.mvr.dui ?? '—'} DUI` : '—')}${row('PSP', d.psp ? `${d.psp.crashes ?? '—'} crashes, ${d.psp.oosInspections ?? '—'} OOS` : '—')}</table>

<h2>Selected Carrier</h2>
<table>${row('Carrier', k.selectedCarrier?.carrierName || 'Not selected')}${row('Fit score', k.selectedCarrier ? k.selectedCarrier.fitScore + '%' : '—')}${row('Selected by', k.decision?.carrierSelectedBy || '—')}</table>

<h2>Consent</h2>
<table>${row('Authorized', k.consent ? ['mvr', 'psp', 'clearinghouse'].filter((t) => k.consent[t]).join(', ').toUpperCase() || 'none' : 'none on file')}${row('Signed by', k.consent?.by || '—')}${row('Signed at', k.consent?.signedAt || k.consent?.capturedAt || '—')}</table>

<h2>Compliance Verdict</h2>
${cmp ? `<p><span class="verdict ${esc(cmp.flag)}">${esc(cmp.flag.toUpperCase())}</span> &nbsp;<span class="meta">sources: ${src} · checked ${esc(new Date(cmp.checkedAt).toLocaleString())}</span></p><p>${esc(cmp.summary)}</p><ul>${cats}</ul>` : '<p class="meta">No compliance check on file.</p>'}

<h2>Recruiter Decision</h2>
<table>${row('Status', (k.decision?.status || 'pending').toUpperCase())}${row('Decided by', k.decision?.decidedBy || '—')}${row('Decided at', k.decision?.decidedAt || '—')}${row('Reason', k.decision?.reason || '—')}${k.outcome ? row('Outcome', `${k.outcome.status}${k.outcome.note ? ' — ' + k.outcome.note : ''}`) : ''}</table>

<h2>Audit Trail</h2>
<table class="audit"><tr><th>When</th><th>Actor</th><th>Event</th><th>Detail</th></tr>${audit}</table>
</body></html>`;
}
function portfolioSummary(p) {
  // When no carrier is selected yet, surface how many Anna recommends.
  const eligibleCount = (p.recommendations || []).filter((r) => r.status === 'ELIGIBLE').length;
  return {
    id: p.id, createdAt: p.createdAt,
    driverName: p.driver?.name || '—',
    carrierName: p.carrier?.carrierName || null,
    fitScore: p.carrier?.fitScore ?? null,
    recommendationCount: eligibleCount,
    reviewStatus: p.review?.status || 'pending',
    recruiter: p.review?.assignedRecruiter || null,
    complianceFlag: p.compliance?.flag || null,
    outcome: p.outcome?.status || null,
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

// ── Anna settings (AI provider + API key) ────────────────────────────────────
// Supports Claude (Anthropic, default) or another provider (OpenAI). The key is
// stored server-side and never returned to the client (only a masked hint).
app.get('/api/anna/settings', requireAdmin, (_req, res) => {
  res.json({
    configured: Boolean(annaApiKey()),
    provider: annaProvider(),
    providers: anna.PROVIDERS,                // ['anthropic','openai']
    source: annaKeySource(),                  // 'ui' | 'env' | null
    keyHint: maskKey(annaApiKey()),
    model: readAnnaSettings().model || anna.providerModel(annaProvider(), 'fast'),
    integrations: anna.integrationStatus(),
  });
});

app.post('/api/anna/settings', requireAdmin, (req, res) => {
  const provider = String(req.body?.provider || 'anthropic').toLowerCase();
  const apiKey = String(req.body?.apiKey || '').trim();
  const model = String(req.body?.model || '').trim();
  if (!anna.PROVIDERS.includes(provider)) return res.status(400).json({ error: `provider must be one of: ${anna.PROVIDERS.join(', ')}.` });
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required.' });
  if (!/^sk-/.test(apiKey)) return res.status(400).json({ error: 'That does not look like an API key (Anthropic and OpenAI keys start with "sk-").' });
  writeAnnaSettings({ ...readAnnaSettings(), provider, apiKey, model: model || undefined });
  res.json({ ok: true, configured: true, provider, source: 'ui', keyHint: maskKey(apiKey) });
});

app.delete('/api/anna/settings', requireAdmin, (_req, res) => {
  const cur = readAnnaSettings();
  delete cur.apiKey; delete cur.provider; delete cur.model;
  writeAnnaSettings(cur);
  res.json({ ok: true, configured: Boolean(annaApiKey()), provider: annaProvider(), source: annaKeySource(), keyHint: maskKey(annaApiKey()) });
});

// Verify the effective key/provider works with a tiny live call.
app.post('/api/anna/settings/test', requireAdmin, async (req, res) => {
  const provider = String(req.body?.provider || annaProvider()).toLowerCase();
  const apiKey = String(req.body?.apiKey || '').trim() || annaApiKey();
  if (!apiKey) return res.status(400).json({ ok: false, error: 'No API key configured.' });
  try {
    await anna.llmComplete({ provider, apiKey, maxTokens: 8, messages: [{ role: 'user', content: 'Reply with the word OK.' }] });
    res.json({ ok: true, message: `Connection successful — Anna is live on ${provider}.` });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Conversational assistant: answer questions + emit actions (e.g. create_task).
// Available app-wide via the floating "Ask Anna" panel.
app.post('/api/anna/chat', requireAdmin, async (req, res) => {
  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages[] is required.' });
  try {
    const out = await anna.chat({ messages, context: context || {}, opts: annaOpts() });
    res.json(out);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Scan a document (image/PDF) and return extracted fields for auto-fill.
app.post('/api/anna/scan', requireAdmin, async (req, res) => {
  const { dataUrl, docType } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl is required.' });
  // Vision/document scanning is Anthropic-only; needs an Anthropic key.
  const anthropicKey = annaProvider() === 'anthropic' ? annaApiKey() : (ANTHROPIC_API_KEY || '');
  if (!anthropicKey) return res.status(503).json({ error: 'Document scanning requires an Anthropic (Claude) key. Set provider to Anthropic in Settings → Anna AI, or set ANTHROPIC_API_KEY.' });
  try {
    res.json(await anna.extractFromDocument({ dataUrl, docType, apiKey: anthropicKey }));
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
    if (result.portfolio) {
      // Carry any consent captured at intake (direct flags or application-style
      // consentMvr/consentPsp/consentEmployment fields on the lead) onto the
      // portfolio so the compliance gate reads it automatically.
      const consentInput = req.body?.consent || lead;
      const consent = anna.normalizeConsent(consentInput);
      if (consent.mvr || consent.psp || consent.clearinghouse) result.portfolio.consent = consent;
      const elig = result.match.summary?.eligible ?? 0;
      auditLog(result.portfolio, 'lead_received', `Lead intake (source: ${result.source}). Anna ranked ${result.portfolio.recommendations?.length || 0} carriers; ${elig} eligible.`);
      if (consent.mvr || consent.psp || consent.clearinghouse) auditLog(result.portfolio, 'consent_intake', `Consent captured at intake for ${['mvr', 'psp', 'clearinghouse'].filter((t) => consent[t]).join(', ')}.`, 'Driver');
      upsertPortfolio(result.portfolio);
    }
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

// Metrics — the ROI view (reuses outcome/audit data). All derived from portfolios.
const GOOD_OUTCOMES = ['hired', 'started', 'retained_90d'];
const BAD_OUTCOMES = ['washed_out', 'rejected', 'declined_by_driver'];
const MINUTES_SAVED_PER_LEAD = 25; // est. manual screen+match+summarize time Anna replaces
app.get('/api/anna/metrics', requireAdmin, (_req, res) => {
  const ps = readPortfolios();
  const leads = ps.length;
  const hours = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 3600000 : null);
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 10) / 10 : null);
  const matched = ps.filter((p) => (p.recommendations || []).some((r) => r.status === 'ELIGIBLE')).length;
  const status = (st) => ps.filter((p) => (p.review?.status || 'awaiting_carrier') === st).length;
  const withSel = ps.filter((p) => p.carrier?.carrierId);

  const compliance = { approve: 0, reject: 0, review: 0 };
  ps.forEach((p) => { if (p.compliance?.flag) compliance[p.compliance.flag] = (compliance[p.compliance.flag] || 0) + 1; });

  const outcomeCounts = {}; let good = 0; let bad = 0;
  ps.forEach((p) => { const o = p.outcome?.status; if (!o) return; outcomeCounts[o] = (outcomeCounts[o] || 0) + 1; if (GOOD_OUTCOMES.includes(o)) good++; else if (BAD_OUTCOMES.includes(o)) bad++; });

  const pc = {};
  ps.forEach((p) => {
    const c = p.carrier; if (!c?.carrierId) return;
    (pc[c.carrierId] ||= { name: c.carrierName, selections: 0, good: 0, bad: 0 });
    pc[c.carrierId].selections++;
    const o = p.outcome?.status;
    if (GOOD_OUTCOMES.includes(o)) pc[c.carrierId].good++; else if (BAD_OUTCOMES.includes(o)) pc[c.carrierId].bad++;
  });
  const perCarrier = Object.values(pc)
    .map((c) => ({ ...c, successRate: (c.good + c.bad) ? Math.round((c.good / (c.good + c.bad)) * 100) : null }))
    .sort((a, b) => b.selections - a.selections);

  res.json({
    generatedAt: new Date().toISOString(),
    leads,
    matched,
    matchRate: leads ? Math.round((matched / leads) * 100) : null,
    pipeline: { awaiting_carrier: status('awaiting_carrier'), pending: status('pending'), approved: status('approved'), rejected: status('rejected') },
    offersSelected: withSel.length,
    avgHoursToSelect: avg(withSel.map((p) => hours(p.createdAt, p.review?.carrierSelectedAt)).filter((x) => x != null && x >= 0)),
    avgHoursToDecision: avg(ps.map((p) => hours(p.createdAt, p.review?.decidedAt)).filter((x) => x != null && x >= 0)),
    compliance,
    outcomes: { counts: outcomeCounts, good, bad, successRate: (good + bad) ? Math.round((good / (good + bad)) * 100) : null },
    recruiterHoursSaved: Math.round((leads * MINUTES_SAVED_PER_LEAD / 60) * 10) / 10,
    perCarrier,
  });
});
app.get('/api/anna/portfolios/:id', requireAdmin, (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// Compliance packet — a complete, auditable record for a driver. JSON by
// default; ?format=html returns a printable document for the file/audit.
app.get('/api/anna/portfolios/:id/packet', requireAdmin, (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const packet = {
    generatedAt: new Date().toISOString(),
    company: COMPANY_NAME,
    driver: p.driver,
    selectedCarrier: p.carrier,
    recommendations: p.recommendations,
    consent: p.consent || null,
    complianceSources: p.complianceSources || null,
    compliance: p.compliance || null,
    decision: {
      status: p.review?.status, decidedBy: p.review?.decidedBy, decidedAt: p.review?.decidedAt,
      reason: p.review?.decisionReason, carrierSelectedBy: p.review?.carrierSelectedBy,
    },
    outcome: p.outcome || null,
    auditTrail: p.audit || [],
  };
  if ((req.query.format || '') === 'html') {
    res.type('html').send(renderPacketHtml(packet, p.id));
  } else {
    res.json(packet);
  }
});

// Recruiter picks the best-fit carrier from Anna's ranked recommendations.
// Anna only recommends; a human chooses and advances.
app.post('/api/anna/portfolios/:id/select-carrier', requireAdmin, (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { carrierId, by } = req.body || {};
  if (!carrierId) return res.status(400).json({ error: 'carrierId is required.' });
  try {
    const who = by || p.review?.assignedRecruiter || 'Recruiter';
    anna.selectCarrier(p, carrierId, who);
    auditLog(p, 'carrier_selected', `Carrier "${p.carrier.carrierName}" selected (${p.carrier.fitScore}% fit) from Anna's ranked list.`, who);
    upsertPortfolio(p);
    res.json({ ok: true, carrier: p.carrier, review: p.review });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Record the driver's signed consent to pull MVR/PSP/Clearinghouse records.
// Represents the consent captured in the application flow; feeds the gate.
app.post('/api/anna/portfolios/:id/consent', requireAdmin, (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const consent = anna.normalizeConsent(req.body || {});
  consent.capturedAt = new Date().toISOString();
  consent.ip = req.ip;
  p.consent = consent;
  const types = ['mvr', 'psp', 'clearinghouse'].filter((t) => consent[t]);
  auditLog(p, 'consent_recorded', `Driver consent recorded for ${types.join(', ') || 'none'}${consent.by ? ` (signed by ${consent.by})` : ''}.`, req.body?.by || 'Recruiter');
  upsertPortfolio(p);
  res.json({ ok: true, consent });
});

// Stage 4: pull/record compliance data and write the approve/reject verdict.
app.post('/api/anna/portfolios/:id/compliance', requireAdmin, async (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!p.carrier?.carrierId) return res.status(400).json({ error: 'Select a carrier first — the recruiter picks the best fit before compliance runs.' });
  const carrier = findCarrierById(p.carrier.carrierId);
  if (!carrier) return res.status(404).json({ error: 'Matched carrier no longer exists.' });
  try {
    let records = req.body?.records || {};
    // If asked to pull from the integrations, enforce consent and fetch records
    // (real providers when configured, otherwise flagged simulated pulls).
    if (req.body?.pull) {
      const consent = req.body?.consent || p.consent || {};
      // Default to the checks the driver actually consented to.
      const types = req.body?.types || ['mvr', 'psp', 'clearinghouse'].filter((t) => consent[t]);
      if (!types.length) return res.status(403).json({ error: 'No driver consent on file — capture consent before pulling records.', missingConsent: ['mvr', 'psp', 'clearinghouse'] });
      const pulled = await anna.pullCompliance({ driver: p.driver, consent, types, queue: undefined, opts: annaOpts() });
      records = { ...pulled.records, ...records }; // manual overrides win
      p.consent = pulled.consent;
      p.complianceSources = pulled.sources;
    }
    const compliance = await anna.writeCompliance({
      carrier: { id: carrier.id, name: carrier.name, requirements: carrier.structuredRequirements || {} },
      driver: p.driver,
      records,
      opts: { ...annaOpts(), narrate: Boolean(ANTHROPIC_API_KEY) },
    });
    p.compliance = compliance;
    const srcLabel = (p.complianceSources || []).map((sx) => `${sx.type}:${sx.simulated ? 'sim' : 'live'}`).join(', ');
    auditLog(p, 'compliance_check', `Compliance ${req.body?.pull ? `pulled (${srcLabel || 'no sources'})` : 'evaluated from entered records'} for ${compliance.carrierName} → verdict: ${compliance.flag.toUpperCase()}.`, req.body?.pull ? 'Anna' : 'Recruiter');
    // Official pulled records supersede self-reported data so any later re-match
    // reflects reality (e.g. a DUI found on the MVR follows the driver).
    p.driver = anna.mergeRecords(p.driver, records);
    upsertPortfolio(p);
    res.json({ ...compliance, sources: p.complianceSources || null });
  } catch (e) {
    if (e.code === 'CONSENT_REQUIRED') return res.status(403).json({ error: e.message, missingConsent: e.missing });
    res.status(502).json({ error: e.message });
  }
});

// Outcome capture + learning: record what actually happened to a placement and
// tune the selected carrier's soft-match weights from real results.
app.post('/api/anna/portfolios/:id/outcome', requireAdmin, (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { outcome, note, by } = req.body || {};
  if (!anna.OUTCOME_KINDS.includes(outcome)) return res.status(400).json({ error: `outcome must be one of: ${anna.OUTCOME_KINDS.join(', ')}.` });
  const who = by || p.review?.assignedRecruiter || 'Recruiter';
  p.outcome = { status: outcome, note: note || '', by: who, at: new Date().toISOString() };
  auditLog(p, 'outcome', `Outcome recorded: ${outcome}${note ? ` — ${note}` : ''}.`, who);

  let learning = null;
  const carrier = p.carrier?.carrierId ? findCarrierById(p.carrier.carrierId) : null;
  if (carrier) {
    const baseWeights = anna.compileSpec({}).softWeights; // stable default weights
    const updated = anna.recordOutcome(carrier.annaLearning || {}, { outcome, breakdown: p.carrier.scoreBreakdown || {}, baseWeights });
    carrier.annaLearning = { samples: updated.samples, weights: updated.weights, stats: updated.stats };
    carrier.structuredRequirements = carrier.structuredRequirements || {};
    carrier.structuredRequirements.softWeights = updated.weights || baseWeights; // applied to future matching
    upsertCarrier(carrier);
    learning = { carrier: carrier.name, ...updated.stats, tuned: Boolean(updated.weights) };
    if (updated.weights) auditLog(p, 'learning', `Anna re-tuned ${carrier.name}'s match weights from ${updated.stats.total} placements (${updated.stats.successRate}% success).`);
  }
  upsertPortfolio(p);
  res.json({ ok: true, outcome: p.outcome, learning });
});

// Stage 5: human checkpoint — recruiter approves or rejects.
app.post('/api/anna/portfolios/:id/decision', requireAdmin, async (req, res) => {
  const p = findPortfolio(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { decision, reason, by } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be "approved" or "rejected".' });
  const who = by || p.review?.assignedRecruiter || 'Recruiter';
  p.review = { ...p.review, status: decision, decidedBy: who, decidedAt: new Date().toISOString(), decisionReason: reason || '' };
  auditLog(p, decision === 'approved' ? 'approved' : 'rejected', `${decision === 'approved' ? 'Approved & advanced' : 'Rejected'}${reason ? ` — ${reason}` : ''}.`, who);
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

// ── DocuSign (e-signature) ───────────────────────────────────────────────────
// Send QuickHire documents (offer letters, consents) to drivers for e-signature.
// Contracts auto-fill from the driver's application data; the driver only reviews
// & corrects. Envelopes are stored on the candidate record and tied to the
// "Offer Letter Sent/Signed" checklist step. Runs in simulated mode until the
// DOCUSIGN_* env vars are set (mirrors the MVR/PSP/Resend integrations).

function candidateEnvelopes(c) { return c.docusign?.envelopes || []; }
function saveEnvelope(c, record) {
  c.docusign = c.docusign || { envelopes: [] };
  const i = c.docusign.envelopes.findIndex((e) => e.envelopeId === record.envelopeId);
  if (i === -1) c.docusign.envelopes.unshift(record); else c.docusign.envelopes[i] = record;
}
function findEnvelopeGlobal(envelopeId) {
  for (const c of readAll()) {
    const e = (c.docusign?.envelopes || []).find((x) => x.envelopeId === envelopeId);
    if (e) return { candidate: c, record: e };
  }
  return null;
}
// On status transition, log to the audit trail and (for offer letters) advance
// the checklist when the document is fully signed.
function reconcileEnvelope(c, prev, updated) {
  const label = docusign.DOC_TEMPLATES[updated.docType]?.label || 'Document';
  if (updated.status === 'completed' && prev.status !== 'completed') {
    if (updated.docType === 'offer_letter' && c.checklist?.offerLetter) {
      const step = c.checklist.offerLetter;
      step.status = 'complete';
      step.completedAt = step.completedAt || new Date().toISOString();
      step.completedBy = 'DocuSign';
      step.result = step.result || 'signed';
    }
    addActivity(c, 'docusign_completed', updated.signer?.name || 'Signer',
      `${label} e-signed via DocuSign${updated.simulated ? ' (simulated)' : ''}.`,
      { channel: 'docusign', envelopeId: updated.envelopeId, docType: updated.docType });
  }
  if (updated.status === 'declined' && prev.status !== 'declined') {
    addActivity(c, 'docusign_declined', updated.signer?.name || 'Signer',
      `${label} was declined in DocuSign.`, { channel: 'docusign', envelopeId: updated.envelopeId });
  }
}

// Integration status (mode, configured doc types, account).
app.get('/api/docusign/status', requireAdmin, (_req, res) => res.json(docusign.status()));

// Account templates (live mode only; simulated returns []).
app.get('/api/docusign/templates', requireAdmin, async (_req, res) => {
  try { res.json(await docusign.templates()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// All envelopes across candidates — the console overview.
app.get('/api/docusign/envelopes', requireAdmin, (_req, res) => {
  const rows = [];
  for (const c of readAll()) {
    for (const e of candidateEnvelopes(c)) rows.push({ ...e, documentHtml: undefined, candidateId: c.id, candidateName: c.name });
  }
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

// Envelopes for one candidate.
app.get('/api/docusign/candidates/:id/envelopes', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(candidateEnvelopes(c).map((e) => ({ ...e, documentHtml: undefined })));
});

// Preview the auto-filled contract (values pulled from the driver's application).
app.post('/api/docusign/candidates/:id/preview', requireAdmin, (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  try { res.json(docusign.preview({ candidate: c, docType: req.body?.docType, fields: req.body?.fields || {} })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Send a document for e-signature.
app.post('/api/docusign/candidates/:id/send', requireAdmin, async (req, res) => {
  const c = findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { docType, fields, signer, embedded, emailSubject, message, recipients, placedFields, uploadedPdf } = req.body || {};
  try {
    const record = await docusign.send({
      candidate: c, docType, fields, signer, embedded,
      returnUrl: `${baseUrl(req)}/docusign.html?signed=1`,
      emailSubject, message, recipients, placedFields, uploadedPdf,
    });
    saveEnvelope(c, record);
    if (record.docType === 'offer_letter' && c.checklist?.offerLetter?.status === 'not_started') {
      c.checklist.offerLetter.status = 'in_progress';
    }
    addActivity(c, 'docusign_sent', 'Admin',
      `${docusign.DOC_TEMPLATES[record.docType]?.label || 'Document'} sent for e-signature to ${record.signer.email} via DocuSign${record.simulated ? ' (simulated)' : ''}.`,
      { channel: 'docusign', envelopeId: record.envelopeId, docType: record.docType, simulated: record.simulated });
    upsert(c);
    res.json({ ...record, documentHtml: undefined });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Re-poll an envelope's live status.
app.post('/api/docusign/envelopes/:envelopeId/refresh', requireAdmin, async (req, res) => {
  const found = findEnvelopeGlobal(req.params.envelopeId);
  if (!found) return res.status(404).json({ error: 'Envelope not found' });
  try {
    const updated = await docusign.refresh(found.record);
    reconcileEnvelope(found.candidate, found.record, updated);
    saveEnvelope(found.candidate, updated);
    upsert(found.candidate);
    res.json({ ...updated, documentHtml: undefined });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Embedded-signing URL (live: DocuSign recipient view · simulated: mock page).
app.get('/api/docusign/envelopes/:envelopeId/signing-url', requireAdmin, async (req, res) => {
  const found = findEnvelopeGlobal(req.params.envelopeId);
  if (!found) return res.status(404).json({ error: 'Envelope not found' });
  try { res.json(await docusign.recipientView(found.record, { returnUrl: `${baseUrl(req)}/docusign.html?signed=1` })); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// Rendered contract HTML (auto-filled preview / what the driver reviews).
app.get('/api/docusign/envelopes/:envelopeId/document.html', requireAdmin, (req, res) => {
  const found = findEnvelopeGlobal(req.params.envelopeId);
  if (!found) return res.status(404).send('Not found');
  res.type('html').send(found.record.documentHtml || '<p>No preview available.</p>');
});

// Completed-document download (live: combined PDF · simulated: generated PDF).
app.get('/api/docusign/envelopes/:envelopeId/document', requireAdmin, async (req, res) => {
  const found = findEnvelopeGlobal(req.params.envelopeId);
  if (!found) return res.status(404).json({ error: 'Envelope not found' });
  try {
    const { buffer, filename, contentType } = await docusign.download(found.record);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Void an in-flight envelope.
app.post('/api/docusign/envelopes/:envelopeId/void', requireAdmin, async (req, res) => {
  const found = findEnvelopeGlobal(req.params.envelopeId);
  if (!found) return res.status(404).json({ error: 'Envelope not found' });
  try {
    const updated = await docusign.voidEnvelope(found.record, req.body?.reason || 'Voided by recruiter');
    saveEnvelope(found.candidate, updated);
    addActivity(found.candidate, 'docusign_voided', 'Admin', `DocuSign envelope voided: ${updated.voidedReason}`, { channel: 'docusign', envelopeId: updated.envelopeId });
    upsert(found.candidate);
    res.json({ ...updated, documentHtml: undefined });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Simulated-only: advance an envelope (used by the demo "complete signing" flow).
// Returns { error } | { updated } so each route shapes its own response.
function advanceSimulated(envelopeId, toStatus) {
  const found = findEnvelopeGlobal(envelopeId);
  if (!found) return { error: 404 };
  if (!found.record.simulated) return { error: 400 };
  const updated = docusign.simulateAdvance(found.record, toStatus);
  reconcileEnvelope(found.candidate, found.record, updated);
  saveEnvelope(found.candidate, updated);
  upsert(found.candidate);
  return { updated };
}
app.post('/api/docusign/envelopes/:envelopeId/simulate', requireAdmin, (req, res) => {
  const r = advanceSimulated(req.params.envelopeId, req.body?.status || 'completed');
  if (r.error === 404) return res.status(404).json({ error: 'Envelope not found' });
  if (r.error === 400) return res.status(400).json({ error: 'Only simulated envelopes can be advanced manually. Configure DocuSign for live signing.' });
  res.json({ ...r.updated, documentHtml: undefined });
});
// Public endpoint the simulated signing page posts to (no admin token in the
// driver's browser). Returns minimal info — no signer PII on an open route.
app.post('/api/docusign/public/:envelopeId/sign', (req, res) => {
  const r = advanceSimulated(req.params.envelopeId, 'completed');
  if (r.error) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: r.updated.status });
});
app.get('/api/docusign/public/:envelopeId', (req, res) => {
  const found = findEnvelopeGlobal(req.params.envelopeId);
  if (!found || !found.record.simulated) return res.status(404).json({ error: 'Not found' });
  const r = found.record;
  res.json({ envelopeId: r.envelopeId, status: r.status, documentName: r.documentName, signer: { name: r.signer?.name }, documentHtml: r.documentHtml });
});

// DocuSign Connect webhook — status updates pushed by DocuSign.
app.post('/api/docusign/webhook', (req, res) => {
  const { ok, event } = docusign.handleWebhook(req.rawBody, req.body, req.get('X-DocuSign-Signature-1'));
  if (!ok) return res.status(401).json({ error: 'Invalid signature' });
  if (event?.envelopeId) {
    const found = findEnvelopeGlobal(event.envelopeId);
    if (found) {
      const updated = docusign.applyWebhookEvent(found.record, event);
      reconcileEnvelope(found.candidate, found.record, updated);
      saveEnvelope(found.candidate, updated);
      upsert(found.candidate);
    }
  }
  res.json({ ok: true });
});

// Recruiter-facing DocuSign console (standalone static page).
app.get('/docusign', (_req, res) => res.redirect('/docusign.html'));

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
