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

// ---------------------------------------------------------------------------
// Simple file-based data store (no external database required).
// On Railway, mount a persistent Volume at ./data so submissions survive deploys.
// ---------------------------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'applications.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function writeAll(records) {
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2));
}
function findByToken(token) {
  return readAll().find((r) => r.token === token);
}
function findById(id) {
  return readAll().find((r) => r.id === id);
}
function upsert(record) {
  const all = readAll();
  const i = all.findIndex((r) => r.id === record.id);
  if (i === -1) all.push(record);
  else all[i] = record;
  writeAll(all);
  return record;
}

// ---------------------------------------------------------------------------
// Email + SMS (both optional — degrade gracefully to "copy the link" mode).
// ---------------------------------------------------------------------------
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

async function sendEmail(to, subject, html) {
  if (!transporter) return { sent: false, reason: 'SMTP not configured' };
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@quickhire.app';
  await transporter.sendMail({ from, to, subject, html });
  return { sent: true };
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !auth || !from) return { sent: false, reason: 'Twilio not configured' };
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  );
  if (!resp.ok) return { sent: false, reason: `Twilio error ${resp.status}` };
  return { sent: true };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  return `${req.protocol}://${req.get('host')}`;
}

// Admin auth: if ADMIN_PASSWORD is set, require it via x-admin-token header.
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // dev mode: open
  if (req.get('x-admin-token') === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Tells the dashboard whether a password is required.
app.get('/api/config', (req, res) => {
  res.json({ requiresPassword: Boolean(ADMIN_PASSWORD), companyName: COMPANY_NAME });
});

// Verify an admin password (used by the dashboard login screen).
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.json({ ok: true });
  res.json({ ok: req.body?.password === ADMIN_PASSWORD });
});

// --- Admin: create an invite for a driver ----------------------------------
app.post('/api/invites', requireAdmin, async (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Driver name and email are required.' });
  }
  const record = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(24).toString('hex'),
    name: String(name).trim(),
    email: String(email).trim(),
    phone: phone ? String(phone).trim() : '',
    status: 'invited',
    createdAt: new Date().toISOString(),
    submittedAt: null,
    application: null,
    files: {},
  };
  upsert(record);

  const link = `${baseUrl(req)}/apply.html?token=${record.token}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#1f2937">
      <h2 style="color:#b01d30">${COMPANY_NAME}</h2>
      <p>Hi ${record.name},</p>
      <p>You've been invited to complete your CDL driver qualification application.
      Please click the secure link below to fill it out:</p>
      <p><a href="${link}" style="background:#b01d30;color:#fff;padding:12px 20px;
        border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">
        Start My Application</a></p>
      <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br>${link}</p>
    </div>`;

  const emailResult = await sendEmail(
    record.email,
    `${COMPANY_NAME} — Complete your driver application`,
    html
  ).catch((e) => ({ sent: false, reason: e.message }));

  let smsResult = { sent: false, reason: 'No phone number' };
  if (record.phone) {
    smsResult = await sendSms(
      record.phone,
      `${COMPANY_NAME}: complete your driver application here: ${link}`
    ).catch((e) => ({ sent: false, reason: e.message }));
  }

  res.json({ id: record.id, link, email: emailResult, sms: smsResult });
});

// --- Admin: list all applications ------------------------------------------
app.get('/api/admin/applications', requireAdmin, (req, res) => {
  const list = readAll()
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      createdAt: r.createdAt,
      submittedAt: r.submittedAt,
      token: r.token,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// --- Admin: full detail of one application ---------------------------------
app.get('/api/admin/applications/:id', requireAdmin, (req, res) => {
  const r = findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

// --- Admin: serve an uploaded file -----------------------------------------
app.get('/api/admin/files/:id/:field', requireAdmin, (req, res) => {
  const r = findById(req.params.id);
  const meta = r?.files?.[req.params.field];
  if (!meta) return res.status(404).send('Not found');
  const filePath = path.join(UPLOAD_DIR, meta.stored);
  if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }
  res.type(meta.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${meta.name}"`);
  fs.createReadStream(filePath).pipe(res);
});

// --- Public: driver fetches their invite (name/email prefill) --------------
app.get('/api/apply/:token', (req, res) => {
  const r = findByToken(req.params.token);
  if (!r) return res.status(404).json({ error: 'Invalid or expired application link.' });
  res.json({
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    companyName: COMPANY_NAME,
  });
});

// --- Public: driver submits the completed application ----------------------
app.post('/api/apply/:token', (req, res) => {
  const r = findByToken(req.params.token);
  if (!r) return res.status(404).json({ error: 'Invalid or expired application link.' });
  if (r.status === 'submitted') {
    return res.status(409).json({ error: 'This application has already been submitted.' });
  }

  const { application, files, signature } = req.body || {};
  if (!application) return res.status(400).json({ error: 'Missing application data.' });

  // Persist any uploaded files (sent as data URLs) to disk.
  const savedFiles = {};
  const dir = path.join(UPLOAD_DIR, r.id);
  fs.mkdirSync(dir, { recursive: true });

  const decodeAndSave = (field, payload) => {
    if (!payload || !payload.dataUrl) return;
    const m = /^data:(.+?);base64,(.*)$/.exec(payload.dataUrl);
    if (!m) return;
    const mime = m[1];
    const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
    const stored = path.join(r.id, `${field}.${ext}`);
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(m[2], 'base64'));
    savedFiles[field] = { name: payload.name || `${field}.${ext}`, mime, stored };
  };

  if (files) {
    decodeAndSave('cdlFront', files.cdlFront);
    decodeAndSave('cdlBack', files.cdlBack);
    decodeAndSave('medicalCard', files.medicalCard);
  }
  if (signature?.dataUrl) decodeAndSave('signature', signature);

  r.application = application;
  r.signature = signature ? { mode: signature.mode, name: signature.name || '' } : null;
  r.files = savedFiles;
  r.status = 'submitted';
  r.submittedAt = new Date().toISOString();
  upsert(r);

  // Notify the company that an application came in (best effort).
  if (process.env.NOTIFY_EMAIL) {
    sendEmail(
      process.env.NOTIFY_EMAIL,
      `New driver application — ${r.name}`,
      `<p>${r.name} (${r.email}) submitted their application.</p>
       <p>View it in the workdeck dashboard.</p>`
    ).catch(() => {});
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`QuickHire running on http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) console.log('WARNING: ADMIN_PASSWORD not set — dashboard is open to anyone.');
  if (!transporter) console.log('NOTE: SMTP not configured — invite links are shown in the dashboard to copy/share.');
});
