/* QuickHire e-signature workspace — local-first store.
   Everything persists to localStorage so the module behaves end-to-end with no
   backend; a best-effort backend sync layer (api.ts) mirrors actions to
   /api/docusign/* when a real deployment is serving the SPA. */
import React from 'react';
import { esignApi, bg } from './api';

/* ───────────────────────── ids / time ───────────────────────── */
export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const nowIso = () => new Date().toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

/* ───────────────────────── document catalog ───────────────────────── */
export type FieldType =
  | 'signature' | 'initial' | 'date' | 'text' | 'checkbox' | 'radio' | 'dropdown'
  | 'fullname' | 'email' | 'company' | 'title' | 'attachment' | 'note' | 'autofill';

export const FIELD_DEFS: Record<FieldType, { label: string; icon: string; w: number; h: number; signer: boolean }> = {
  signature: { label: 'Signature', icon: 'sign', w: 180, h: 44, signer: true },
  initial: { label: 'Initial', icon: 'pencil', w: 70, h: 40, signer: true },
  date: { label: 'Date Signed', icon: 'calendar', w: 120, h: 32, signer: true },
  text: { label: 'Text', icon: 'fileText', w: 160, h: 32, signer: true },
  checkbox: { label: 'Checkbox', icon: 'checkbox', w: 26, h: 26, signer: true },
  radio: { label: 'Radio', icon: 'circle', w: 26, h: 26, signer: true },
  dropdown: { label: 'Dropdown', icon: 'chevronDown', w: 150, h: 32, signer: true },
  fullname: { label: 'Full Name', icon: 'user', w: 170, h: 32, signer: false },
  email: { label: 'Email', icon: 'mail', w: 180, h: 32, signer: false },
  company: { label: 'Company', icon: 'building', w: 180, h: 32, signer: false },
  title: { label: 'Title', icon: 'tag', w: 150, h: 32, signer: false },
  attachment: { label: 'Attachment', icon: 'paperclip', w: 150, h: 36, signer: true },
  note: { label: 'Note', icon: 'message', w: 160, h: 50, signer: false },
  autofill: { label: 'Auto-fill', icon: 'zap', w: 160, h: 32, signer: false },
};

export const AUTOFILL_GROUPS = [
  { group: 'Driver Info', fields: [['driver.name', 'Driver Name'], ['driver.email', 'Driver Email'], ['driver.phone', 'Driver Phone'], ['driver.cdl', 'CDL Number'], ['driver.state', 'License State']] },
  { group: 'Carrier Info', fields: [['carrier.name', 'Carrier Name'], ['carrier.dot', 'DOT Number'], ['carrier.mc', 'MC Number'], ['carrier.address', 'Carrier Address']] },
  { group: 'Employment Info', fields: [['emp.position', 'Position'], ['emp.startDate', 'Start Date'], ['emp.payRate', 'Pay Rate']] },
  { group: 'Truck Info', fields: [['truck.unit', 'Unit Number'], ['truck.vin', 'VIN'], ['truck.plate', 'Plate']] },
  { group: 'Compliance Info', fields: [['comp.mvrDate', 'MVR Date'], ['comp.medCard', 'Medical Card Exp'], ['comp.clearinghouse', 'Clearinghouse ID']] },
];

const BODY_GENERIC = (carrier: string) => [
  `This agreement is entered into between ${carrier} ("Company") and the driver named below ("Driver").`,
  'The Driver agrees to operate commercial motor vehicles in compliance with all FMCSA regulations (49 CFR), company safety policies, and hours-of-service rules.',
  'Driver Name: ____________________   CDL #: ____________   State: ______',
  'By signing below, the parties acknowledge they have read and agree to the terms set forth in this document.',
  'Driver Signature: ____________________________     Date: ____________',
];

export const DOC_CATALOG: Record<string, { name: string; category: string; signerFields: FieldType[]; body: (c: string) => string[] }> = {
  offer_letter: { name: 'Offer Letter', category: 'Onboarding', signerFields: ['signature', 'date'], body: (c) => [`${c} is pleased to extend an offer of employment for the position of Company Driver.`, 'This offer is contingent on successful completion of DOT pre-employment screening, drug testing, and verification of driving history.', 'Compensation, benefits, and start date are described in the attached summary.', 'Please sign below to accept this offer.', 'Driver Signature: ____________________________     Date: ____________'] },
  company_driver_agreement: { name: 'Company Driver Agreement', category: 'Onboarding', signerFields: ['signature', 'initial', 'date'], body: BODY_GENERIC },
  mvr_consent: { name: 'MVR Consent', category: 'Compliance', signerFields: ['signature', 'date'], body: (c) => [`I authorize ${c} to obtain my Motor Vehicle Record (MVR) for employment screening purposes under the Fair Credit Reporting Act and FMCSA §391.23.`, 'This consent remains valid for the duration of my employment and the application process.', 'Driver Signature: ____________________________     Date: ____________'] },
  psp_consent: { name: 'PSP Consent', category: 'Compliance', signerFields: ['signature', 'date'], body: (c) => [`I authorize ${c} to access my FMCSA Pre-Employment Screening Program (PSP) report, including crash and inspection history.`, 'I understand this disclosure is voluntary and used for employment screening only.', 'Driver Signature: ____________________________     Date: ____________'] },
  w9: { name: 'W-9 Tax Form', category: 'Tax', signerFields: ['signature', 'date'], body: () => ['Request for Taxpayer Identification Number and Certification (Form W-9).', 'Name: ____________________   Business name: ____________________', 'Taxpayer Identification Number (SSN/EIN): ____________________', 'Under penalties of perjury, I certify the information provided is correct.', 'Signature: ____________________________     Date: ____________'] },
  clearinghouse_consent: { name: 'Clearinghouse Consent', category: 'Compliance', signerFields: ['signature', 'date'], body: (c) => [`I consent to ${c} querying the FMCSA Drug & Alcohol Clearinghouse for my records as required under 49 CFR Part 382.`, 'This limited query consent covers the duration of the hiring process.', 'Driver Signature: ____________________________     Date: ____________'] },
  owner_operator_agreement: { name: 'Owner Operator Agreement', category: 'Onboarding', signerFields: ['signature', 'initial', 'date'], body: (c) => [`This Independent Contractor (Owner-Operator) Agreement is between ${c} and the Owner-Operator named below.`, 'The Owner-Operator agrees to provide a commercial motor vehicle and transportation services under the Company’s operating authority per the lease terms.', 'Settlement, insurance, and equipment responsibilities are described herein.', 'Owner-Operator Signature: ____________________________     Date: ____________'] },
  equipment_lease: { name: 'Equipment Lease', category: 'Onboarding', signerFields: ['signature', 'initial', 'date'], body: (c) => [`Equipment Lease Agreement between ${c} ("Lessor") and the Driver ("Lessee").`, 'Unit: ____________   VIN: ____________________   Plate: ____________', 'The Lessee agrees to the weekly lease payment, maintenance, and insurance terms set forth in this agreement.', 'Lessee Signature: ____________________________     Date: ____________'] },
  drug_testing_consent: { name: 'Drug Testing Consent', category: 'Compliance', signerFields: ['signature', 'date'], body: (c) => [`I consent to pre-employment, random, post-accident, and reasonable-suspicion drug and alcohol testing as required by ${c} and FMCSA 49 CFR Part 382.`, 'I understand a positive result or refusal will disqualify me from a safety-sensitive position.', 'Driver Signature: ____________________________     Date: ____________'] },
};
export const DOC_KEYS = Object.keys(DOC_CATALOG);

/* ───────────────────────── statuses ───────────────────────── */
export const STATUS_META: Record<string, { label: string; color: string; bg: string; group: string }> = {
  draft: { label: 'Draft', color: '#6E6E73', bg: '#F2F2F7', group: 'action' },
  missing_fields: { label: 'Missing Fields', color: '#C62820', bg: 'rgba(255,59,48,0.12)', group: 'action' },
  needs_action: { label: 'Needs Action', color: '#A05A00', bg: 'rgba(255,159,10,0.14)', group: 'action' },
  failed: { label: 'Failed Send', color: '#C62820', bg: 'rgba(255,59,48,0.12)', group: 'action' },
  sent: { label: 'Sent', color: '#0066CC', bg: 'rgba(0,122,255,0.12)', group: 'waiting' },
  viewed: { label: 'Viewed', color: '#0066CC', bg: 'rgba(0,122,255,0.12)', group: 'waiting' },
  partially_signed: { label: 'Partially Signed', color: '#3F3BB8', bg: 'rgba(88,86,214,0.12)', group: 'waiting' },
  expiring_soon: { label: 'Expiring Soon', color: '#A05A00', bg: 'rgba(255,159,10,0.14)', group: 'expiring' },
  completed: { label: 'Completed', color: '#248A3D', bg: 'rgba(52,199,89,0.12)', group: 'completed' },
  declined: { label: 'Declined', color: '#C62820', bg: 'rgba(255,59,48,0.12)', group: 'waiting' },
  voided: { label: 'Voided', color: '#8E8E93', bg: '#F2F2F7', group: 'action' },
};
export const ACTION_STATUSES = ['draft', 'missing_fields', 'needs_action', 'failed'];

/* ───────────────────────── persistence ───────────────────────── */
const LS_KEY = 'qh_esign_v1';
function load(): any | null { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify({ envelopes: store.envelopes, packages: store.packages, templates: store.templates, settings: store.settings, notifications: store.notifications })); } catch { /* quota */ } }

/* ───────────────────────── defaults / seed ───────────────────────── */
export const DEFAULT_SETTINGS = {
  branding: { senderName: 'QuickHire Recruiting', logoText: 'QH', primaryColor: '#007AFF', emailFooter: 'Sent securely via QuickHire e-Signature.' },
  emailTemplates: {
    offer: { subject: 'Your offer from {carrier}', message: 'Hi {driver}, please review and sign your offer package.' },
    onboarding: { subject: 'Onboarding documents for {carrier}', message: 'Hi {driver}, a few documents need your signature to finish onboarding.' },
    compliance: { subject: 'Consent forms required', message: 'Hi {driver}, please sign the attached compliance consent forms.' },
    rehire: { subject: 'Welcome back to {carrier}', message: 'Hi {driver}, please sign the attached rehire documents.' },
  },
  reminders: { everyDays: 3, maxCount: 3, message: 'A friendly reminder to sign your QuickHire documents.' },
  expiration: { days: 14, expiringSoonDays: 3 },
  recipients: { defaultOrder: 'sequential', defaultRole: 'signer' },
  fields: { defaultRequired: true },
  simulationMode: true,
  permissions: { recruiterCanVoid: true, recruiterCanDelete: true, viewerCanDownload: true },
};

const DEFAULT_PACKAGES = [
  { name: 'Company Driver Onboarding', description: 'Full onboarding set for new company drivers.', category: 'Onboarding', documentKeys: ['offer_letter', 'company_driver_agreement', 'w9', 'drug_testing_consent'] },
  { name: 'Owner Operator Onboarding', description: 'Lease & authority documents for owner-operators.', category: 'Onboarding', documentKeys: ['owner_operator_agreement', 'equipment_lease', 'w9', 'mvr_consent'] },
  { name: 'Compliance Consent Package', description: 'FMCSA screening consent forms.', category: 'Compliance', documentKeys: ['mvr_consent', 'psp_consent', 'clearinghouse_consent'] },
  { name: 'Rehire Package', description: 'Streamlined set for returning drivers.', category: 'Rehire', documentKeys: ['offer_letter', 'drug_testing_consent', 'mvr_consent'] },
];

function seedPackages() {
  return DEFAULT_PACKAGES.map((p) => ({
    id: uid('pkg'), ...p, roles: ['signer'], signingOrder: 'sequential',
    subject: store?.settings?.emailTemplates?.onboarding?.subject || 'Documents to sign',
    message: store?.settings?.emailTemplates?.onboarding?.message || '', reminderEveryDays: 3, expiresInDays: 14,
    status: 'active', usageCount: Math.floor(Math.random() * 12), updatedAt: nowIso(),
  }));
}
function seedTemplates() {
  return [
    ['Company Driver Agreement', 'company_driver_agreement', 'Onboarding'],
    ['MVR Consent', 'mvr_consent', 'Compliance'],
    ['Offer Letter', 'offer_letter', 'Onboarding'],
  ].map(([name, key, category]) => ({
    id: uid('tpl'), name, documentKey: key, category,
    fields: defaultFieldsFor(key as string, 'r_signer'),
    roles: ['signer'], signingOrder: 'sequential', subject: `Please sign: ${name}`, message: '',
    reminderEveryDays: 3, expiresInDays: 14, status: 'active', lastUsed: nowIso(), usageCount: Math.floor(Math.random() * 20),
  }));
}

/** Default field placements for a document, assigned to a recipient id. */
export function defaultFieldsFor(docKey: string, recipientId: string): any[] {
  const def = DOC_CATALOG[docKey]; if (!def) return [];
  const out: any[] = [];
  let y = 560;
  for (const ft of def.signerFields) {
    const fd = FIELD_DEFS[ft];
    out.push({ id: uid('f'), docKey, page: 0, type: ft, x: ft === 'date' ? 360 : 80, y, w: fd.w, h: fd.h, recipientId, required: true, value: '', placeholder: fd.label, locked: false, autofill: '', label: fd.label });
    if (ft !== 'date') y += 8; else y += 60;
  }
  return out;
}

function seedEnvelopes(): any[] {
  const mk = (driverName: string, carrier: string, docKey: string, status: string, daysAgo: number, recipStatus = 'pending') => {
    const r = { id: uid('r'), name: driverName, email: driverName.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com', role: 'signer', order: 1, color: colorFor(driverName), status: recipStatus };
    const created = new Date(Date.now() - daysAgo * 864e5).toISOString();
    return {
      id: uid('env'), title: DOC_CATALOG[docKey].name, documentKeys: [docKey], recipients: [r],
      fields: defaultFieldsFor(docKey, r.id), status, subject: `Please sign: ${DOC_CATALOG[docKey].name}`, message: '',
      reminderEveryDays: 3, maxReminders: 3, remindersSent: 0, expiresAt: daysFromNow(status === 'expiring_soon' ? 2 : 14),
      createdAt: created, updatedAt: created, lastActivity: created, driverName, carrier,
      audit: [{ id: uid('a'), event: 'created', at: created, actor: 'Nina Patel', detail: 'Envelope created' }],
      certificate: status === 'completed' ? { completedAt: created, sealId: uid('seal').toUpperCase() } : null,
    };
  };
  return [
    mk('Sarah Chen', 'GRAND ONE LLC', 'offer_letter', 'sent', 1, 'viewed'),
    mk('Mike Okafor', 'GRAND ONE LLC', 'company_driver_agreement', 'completed', 5, 'signed'),
    mk('Derek Hill', 'GRAND ONE LLC', 'psp_consent', 'viewed', 2, 'viewed'),
    mk('Aisha Bello', 'DT NATIONAL', 'clearinghouse_consent', 'expiring_soon', 12),
    mk('Robert Johnson', 'GRAND ONE LLC', 'mvr_consent', 'draft', 0),
    mk('Tracy Bowman', 'DT NATIONAL', 'w9', 'needs_action', 3),
  ];
}

export function colorFor(name: string) {
  const palette = ['#007AFF', '#34C759', '#FF9500', '#5856D6', '#FF2D55', '#AF52DE', '#00C7BE'];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

/* ───────────────────────── store ───────────────────────── */
export const store: any = { envelopes: [], packages: [], templates: [], settings: structuredClone(DEFAULT_SETTINGS), notifications: [] };
(function init() {
  const saved = load();
  if (saved) {
    store.envelopes = saved.envelopes || [];
    store.packages = saved.packages || [];
    store.templates = saved.templates || [];
    store.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(saved.settings || {}) };
    store.notifications = saved.notifications || [];
  } else {
    store.envelopes = seedEnvelopes();
    store.packages = seedPackages();
    store.templates = seedTemplates();
    store.notifications = [];
    persist();
  }
})();

/* ───────────────────────── pub/sub ───────────────────────── */
const listeners = new Set<() => void>();
const emit = () => { persist(); listeners.forEach((l) => l()); };
export function useEsign() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}
export const getStore = () => store;

/* ───────────────────────── helpers ───────────────────────── */
export function recomputeStatus(env: any) {
  // auto expiring-soon / nothing-else here (terminal states preserved)
  if (['completed', 'voided', 'declined', 'draft', 'missing_fields'].includes(env.status)) return;
  const exp = env.expiresAt ? +new Date(env.expiresAt) - Date.now() : Infinity;
  const days = exp / 864e5;
  if (days <= (store.settings.expiration.expiringSoonDays || 3) && days > 0 && env.status !== 'partially_signed') env.status = 'expiring_soon';
}
function audit(env: any, event: string, detail = '', actor = 'Nina Patel') {
  env.audit = env.audit || [];
  env.audit.push({ id: uid('a'), event, at: nowIso(), actor, detail });
  env.lastActivity = nowIso();
  env.updatedAt = nowIso();
}
function notify(kind: string, message: string) {
  store.notifications.unshift({ id: uid('n'), kind, message, at: nowIso(), read: false });
  store.notifications = store.notifications.slice(0, 50);
}

/* Validation — returns array of human-readable problems (empty = ok to send). */
export function validateEnvelope(env: any): string[] {
  const errs: string[] = [];
  if (!env.documentKeys?.length) errs.push('Add at least one document.');
  const signers = (env.recipients || []).filter((r: any) => r.role === 'signer');
  if (!(env.recipients || []).length) errs.push('Add at least one recipient.');
  for (const r of env.recipients || []) {
    if (!r.name?.trim()) errs.push('A recipient is missing a name.');
    if (!r.email?.trim() || !/.+@.+\..+/.test(r.email)) errs.push(`${r.name || 'A recipient'} is missing a valid email.`);
  }
  for (const s of signers) {
    const has = (env.fields || []).some((f: any) => f.recipientId === s.id && FIELD_DEFS[f.type as FieldType]?.signer && f.required);
    if (!has) errs.push(`${s.name || 'Signer'} is missing a required signing field.`);
  }
  // overlap detection
  const fs = env.fields || [];
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
    if (fs[i].docKey === fs[j].docKey && fs[i].page === fs[j].page && overlaps(fs[i], fs[j])) {
      errs.push(`${DOC_CATALOG[fs[i].docKey]?.name || 'A document'} has overlapping fields.`); i = j = fs.length; break;
    }
  }
  if (!env.subject?.trim()) errs.push('Add an email subject.');
  if (env.expiresAt && +new Date(env.expiresAt) <= Date.now()) errs.push('Expiration date must be in the future.');
  return [...new Set(errs)];
}
export function overlaps(a: any, b: any) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function findOverlaps(fields: any[]): Set<string> {
  const bad = new Set<string>();
  for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
    if (fields[i].docKey === fields[j].docKey && fields[i].page === fields[j].page && overlaps(fields[i], fields[j])) { bad.add(fields[i].id); bad.add(fields[j].id); }
  }
  return bad;
}

/* ───────────────────────── service ───────────────────────── */
export const svc = {
  /* counts for the dashboard */
  counts() {
    const c: any = { action: 0, waiting: 0, completed: 0, expiring: 0 };
    for (const e of store.envelopes) { recomputeStatus(e); const g = STATUS_META[e.status]?.group; if (g && c[g] != null) c[g]++; }
    return c;
  },

  envelope(id: string) { return store.envelopes.find((e: any) => e.id === id); },

  createEnvelope(partial: any = {}) {
    const env = {
      id: uid('env'), title: partial.title || 'Untitled envelope', documentKeys: partial.documentKeys || [],
      recipients: partial.recipients || [], fields: partial.fields || [], status: 'draft',
      subject: partial.subject || '', message: partial.message || '', reminderEveryDays: store.settings.reminders.everyDays,
      maxReminders: store.settings.reminders.maxCount, remindersSent: 0, expiresAt: daysFromNow(store.settings.expiration.days),
      createdAt: nowIso(), updatedAt: nowIso(), lastActivity: nowIso(), driverName: partial.driverName || '', carrier: partial.carrier || '',
      audit: [], certificate: null, uploads: partial.uploads || {},
    };
    audit(env, 'created', 'Envelope created');
    store.envelopes.unshift(env); emit();
    bg(esignApi.create(env));
    return env;
  },
  updateEnvelope(id: string, patch: any) { const e = this.envelope(id); if (!e) return; Object.assign(e, patch); e.updatedAt = nowIso(); emit(); },

  /** Register an uploaded+rendered PDF onto an envelope; returns its doc key. */
  addUpload(id: string, rendered: any) {
    const e = this.envelope(id); if (!e) return null;
    const key = uid('upload');
    e.uploads = { ...(e.uploads || {}), [key]: rendered };
    e.documentKeys = [...(e.documentKeys || []), key];
    if (e.title === 'Untitled envelope') e.title = rendered.name || 'Uploaded document';
    audit(e, 'created', `Uploaded "${rendered.name}" (${(rendered.pages || []).length} page${(rendered.pages || []).length === 1 ? '' : 's'})`);
    emit();
    return key;
  },
  saveDraft(id: string) { const e = this.envelope(id); if (!e) return; if (e.status === 'draft') audit(e, 'draft_saved', 'Draft saved'); emit(); bg(esignApi.saveDraft(id, e)); },

  send(id: string) {
    const e = this.envelope(id); if (!e) return { ok: false, errors: ['Envelope not found'] };
    const errs = validateEnvelope(e);
    if (errs.length) { e.status = 'missing_fields'; audit(e, 'corrected', 'Send blocked — validation failed'); emit(); return { ok: false, errors: errs }; }
    e.status = 'sent'; e.sentAt = nowIso();
    audit(e, 'sent', `Sent to ${(e.recipients || []).map((r: any) => r.name).join(', ')}`);
    notify('sent', `${e.title} sent to ${e.driverName || (e.recipients[0] || {}).name || 'recipient'}`);
    emit(); bg(esignApi.send(id, e));
    return { ok: true, errors: [] };
  },

  remind(id: string) {
    const e = this.envelope(id); if (!e) return;
    if ((e.remindersSent || 0) >= (e.maxReminders || 3)) { return { ok: false, message: 'Max reminders reached' }; }
    e.remindersSent = (e.remindersSent || 0) + 1;
    audit(e, 'reminder_sent', `Reminder ${e.remindersSent} of ${e.maxReminders} sent`);
    notify('reminder', `Reminder sent for ${e.title}`);
    emit(); bg(esignApi.remind(id));
    return { ok: true };
  },
  extendExpiration(id: string, days = 14) { const e = this.envelope(id); if (!e) return; e.expiresAt = daysFromNow(days); if (e.status === 'expiring_soon') e.status = e.sentAt ? 'sent' : 'draft'; audit(e, 'corrected', `Expiration extended ${days} days`); emit(); },

  void(id: string, reason = '') { const e = this.envelope(id); if (!e) return; e.status = 'voided'; audit(e, 'voided', reason || 'Envelope voided'); notify('action', `${e.title} was voided`); emit(); bg(esignApi.void(id, reason)); },
  decline(id: string) { const e = this.envelope(id); if (!e) return; e.status = 'declined'; (e.recipients || []).forEach((r: any) => { if (r.status === 'pending' || r.status === 'viewed') r.status = 'declined'; }); audit(e, 'declined', 'Recipient declined to sign', (e.recipients[0] || {}).name || 'Recipient'); emit(); },

  duplicate(id: string) {
    const e = this.envelope(id); if (!e) return;
    const copy = structuredClone(e);
    copy.id = uid('env'); copy.title = e.title + ' (copy)'; copy.status = 'draft'; copy.remindersSent = 0; copy.certificate = null;
    copy.createdAt = copy.updatedAt = copy.lastActivity = nowIso(); copy.audit = []; copy.sentAt = null;
    copy.recipients = (e.recipients || []).map((r: any) => ({ ...r, id: uid('r'), status: 'pending' }));
    // remap field recipientIds
    const map: any = {}; (e.recipients || []).forEach((r: any, i: number) => { map[r.id] = copy.recipients[i]?.id; });
    copy.fields = (e.fields || []).map((f: any) => ({ ...f, id: uid('f'), recipientId: map[f.recipientId] || f.recipientId }));
    audit(copy, 'created', `Duplicated from ${e.title}`);
    store.envelopes.unshift(copy); emit();
    return copy;
  },
  remove(id: string) { store.envelopes = store.envelopes.filter((e: any) => e.id !== id); emit(); },

  /* signing simulation — advances recipient + envelope status, builds certificate */
  simulateView(id: string) { const e = this.envelope(id); if (!e) return; const r = (e.recipients || []).find((x: any) => x.status === 'pending'); if (r) { r.status = 'viewed'; } if (e.status === 'sent') e.status = 'viewed'; audit(e, 'viewed', `${(r || {}).name || 'Recipient'} viewed the document`, (r || {}).name || 'Recipient'); emit(); },
  simulateSign(id: string, recipientId?: string) {
    const e = this.envelope(id); if (!e) return;
    const r = recipientId ? (e.recipients || []).find((x: any) => x.id === recipientId) : (e.recipients || []).find((x: any) => x.status !== 'signed');
    if (r) { r.status = 'signed'; r.signedAt = nowIso(); audit(e, 'signed', `${r.name} signed`, r.name); }
    const allSigned = (e.recipients || []).filter((x: any) => x.role === 'signer').every((x: any) => x.status === 'signed');
    if (allSigned) { e.status = 'completed'; e.certificate = { completedAt: nowIso(), sealId: uid('seal').toUpperCase() }; audit(e, 'completed', 'All recipients signed — envelope completed'); notify('completed', `${e.title} completed`); }
    else { e.status = 'partially_signed'; }
    emit(); bg(esignApi.simulate(id));
  },
  markDownloaded(id: string, what = 'signed PDF') { const e = this.envelope(id); if (!e) return; audit(e, 'downloaded', `${what} downloaded`); emit(); },

  /* ── packages ── */
  createPackage(p: any) { const pkg = { id: uid('pkg'), status: 'active', usageCount: 0, updatedAt: nowIso(), roles: ['signer'], signingOrder: 'sequential', reminderEveryDays: 3, expiresInDays: 14, subject: '', message: '', ...p }; store.packages.unshift(pkg); emit(); bg(esignApi.createPackage(pkg)); return pkg; },
  updatePackage(id: string, patch: any) { const p = store.packages.find((x: any) => x.id === id); if (p) { Object.assign(p, patch); p.updatedAt = nowIso(); emit(); } },
  duplicatePackage(id: string) { const p = store.packages.find((x: any) => x.id === id); if (!p) return; const copy = { ...structuredClone(p), id: uid('pkg'), name: p.name + ' (copy)', usageCount: 0, updatedAt: nowIso() }; store.packages.unshift(copy); emit(); return copy; },
  archivePackage(id: string) { const p = store.packages.find((x: any) => x.id === id); if (p) { p.status = p.status === 'archived' ? 'active' : 'archived'; emit(); } },
  removePackage(id: string) { store.packages = store.packages.filter((x: any) => x.id !== id); emit(); },

  /** Build & send an envelope from a package for a driver/carrier. */
  sendPackage(packageId: string, driver: { name: string; email: string; carrier: string }, opts: any = {}) {
    const p = store.packages.find((x: any) => x.id === packageId); if (!p) return null;
    const r = { id: uid('r'), name: driver.name, email: driver.email, role: 'signer', order: 1, color: colorFor(driver.name), status: 'pending' };
    const fields: any[] = [];
    p.documentKeys.forEach((k: string) => fields.push(...defaultFieldsFor(k, r.id)));
    const env = {
      id: uid('env'), title: p.name, documentKeys: [...p.documentKeys], recipients: [r], fields,
      status: 'draft', subject: (p.subject || `${p.name} — please sign`).replace('{driver}', driver.name).replace('{carrier}', driver.carrier),
      message: (p.message || '').replace('{driver}', driver.name).replace('{carrier}', driver.carrier),
      reminderEveryDays: p.reminderEveryDays || 3, maxReminders: store.settings.reminders.maxCount, remindersSent: 0,
      expiresAt: daysFromNow(p.expiresInDays || 14), createdAt: nowIso(), updatedAt: nowIso(), lastActivity: nowIso(),
      driverName: driver.name, carrier: driver.carrier, packageId, audit: [], certificate: null,
    };
    audit(env, 'created', `Created from package "${p.name}"`);
    store.envelopes.unshift(env);
    p.usageCount = (p.usageCount || 0) + 1; p.updatedAt = nowIso();
    if (!opts.draftOnly) { emit(); const res = this.send(env.id); return { env, res }; }
    emit(); return { env, res: { ok: true, errors: [] } };
  },

  /* ── templates ── */
  createTemplate(t: any) { const tpl = { id: uid('tpl'), status: 'active', usageCount: 0, lastUsed: nowIso(), roles: ['signer'], signingOrder: 'sequential', reminderEveryDays: 3, expiresInDays: 14, subject: '', message: '', fields: [], ...t }; store.templates.unshift(tpl); emit(); return tpl; },
  updateTemplate(id: string, patch: any) { const t = store.templates.find((x: any) => x.id === id); if (t) { Object.assign(t, patch); emit(); } },
  duplicateTemplate(id: string) { const t = store.templates.find((x: any) => x.id === id); if (!t) return; const copy = { ...structuredClone(t), id: uid('tpl'), name: t.name + ' (copy)', usageCount: 0, lastUsed: nowIso() }; store.templates.unshift(copy); emit(); return copy; },
  archiveTemplate(id: string) { const t = store.templates.find((x: any) => x.id === id); if (t) { t.status = t.status === 'archived' ? 'active' : 'archived'; emit(); } },
  removeTemplate(id: string) { store.templates = store.templates.filter((x: any) => x.id !== id); emit(); },
  useTemplate(id: string, driver?: { name: string; email: string; carrier: string }) {
    const t = store.templates.find((x: any) => x.id === id); if (!t) return null;
    t.usageCount = (t.usageCount || 0) + 1; t.lastUsed = nowIso();
    const r = { id: uid('r'), name: driver?.name || '', email: driver?.email || '', role: 'signer', order: 1, color: colorFor(driver?.name || 'Signer'), status: 'pending' };
    const map: any = {}; const recipDefault = (t.fields[0] || {}).recipientId;
    const fields = (t.fields || []).map((f: any) => { map[f.recipientId] = r.id; return { ...f, id: uid('f'), recipientId: r.id }; });
    void recipDefault;
    const env = this.createEnvelope({ title: t.name, documentKeys: [t.documentKey], recipients: [r], fields, subject: t.subject || `Please sign: ${t.name}`, message: t.message, driverName: driver?.name || '', carrier: driver?.carrier || '' });
    return env;
  },

  /* ── settings ── */
  updateSettings(patch: any) { store.settings = { ...store.settings, ...patch }; emit(); bg(esignApi.updateSettings(store.settings)); },
  setSettingPath(path: string, value: any) { const parts = path.split('.'); let o = store.settings; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = value; emit(); },

  markNotificationsRead() { store.notifications.forEach((n: any) => (n.read = true)); emit(); },
  resetDemo() { store.envelopes = seedEnvelopes(); store.packages = seedPackages(); store.templates = seedTemplates(); store.notifications = []; store.settings = structuredClone(DEFAULT_SETTINGS); emit(); },
};

/* ───────────────────────── formatting ───────────────────────── */
export function fmtAgo(iso: string) {
  if (!iso) return '—';
  const ms = Date.now() - +new Date(iso); const m = Math.floor(ms / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); return d + 'd ago';
}
export function fmtDate(iso: string) { if (!iso) return '—'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
export function daysUntil(iso: string) { if (!iso) return null; return Math.ceil((+new Date(iso) - Date.now()) / 864e5); }

/** Display name for a document key, resolving uploaded PDFs from the envelope. */
export function docName(env: any, key: string) {
  if (key && key.startsWith('upload_')) return env?.uploads?.[key]?.name || 'Uploaded document';
  return DOC_CATALOG[key]?.name || key;
}
/** Rendered pages for an uploaded doc, or null for catalog documents. */
export function uploadPages(env: any, key: string) {
  if (key && key.startsWith('upload_')) return env?.uploads?.[key]?.pages || [];
  return null;
}
