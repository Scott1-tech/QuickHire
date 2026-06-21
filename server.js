import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');
if (!fs.existsSync(OPTOUT_FILE)) fs.writeFileSync(OPTOUT_FILE, '[]');

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
  if (!ANTHROPIC_API_KEY) console.log('NOTE: ANTHROPIC_API_KEY not set — Molly AI disabled.');
  console.log(`Link TTL: ${LINK_TTL_DAYS} days`);
});
