/* QuickHire e-Sign — local-first store + service.
   Envelope/template metadata persists to localStorage (`qh_esign_v2`, written
   on a short throttle and flushed on pagehide); document bytes live in
   IndexedDB (blobs.ts). A best-effort sync layer (api.ts) mirrors actions to
   /api/docusign/* when a backend serves the SPA. Integrations with the rest of
   QuickHire (activity log, notifications, driver documents) subscribe through
   onEsignEvent() so this module has no import cycles with other stores. */
import React from 'react';
import { esignApi, bg } from './api';
import {
  Envelope, Template, TemplateRole, Recipient, Field, EDoc, Person, Values, Signature, EnvStatus, ViewKey,
  uid, nowIso, daysFromNow, colorForIndex, advanceRouting, deriveStatus, activeRecipients, completion, autoValue, isDone,
  validateForSend, instantiateTemplate, cloneFields, personMergeData, fillMerge, formDataCsv, inView, migrateEnvelopeV1, migrateTemplateV1,
  FIELD_DEFS, STATUS_META, IN_FLIGHT, isInputType, fmtAgo, fmtDate, daysUntil, PAGE_W,
} from './model';
import { CATALOG, CATALOG_KEYS, catalogFields, catalogPages } from './catalog';
import { putBlob, dataUrlToBytes, deleteBlob, listBlobIds, sha256Hex } from './blobs';
import { readPdfFile } from './pdf';
import { CANDS, CARRIER_LIST } from '../data';

export { uid, nowIso, STATUS_META, FIELD_DEFS, fmtAgo, fmtDate, daysUntil };
export type { Envelope, Template, Recipient, Field, EDoc };
/** v1 compatibility: catalog keyed by document key. */
export const DOC_CATALOG = CATALOG;
export const DOC_KEYS = CATALOG_KEYS;

/* ───────────────────────── settings ───────────────────────── */
export const ERSD_TEXT = `Before you sign, please read this Electronic Record and Signature Disclosure.

1. Consent to electronic records. You agree that the sender may provide notices, disclosures, agreements and other documents to you electronically, and that your electronic signature has the same legal effect as a handwritten signature under the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).

2. Paper copies. You may request a paper copy of any document at no charge by contacting the sender. You may download and print each completed document.

3. Withdrawing consent. You may withdraw consent at any time before signing by choosing "Decline to sign". Withdrawal does not affect documents already signed.

4. System requirements. A current web browser (Chrome, Safari, Edge or Firefox) with JavaScript enabled and the ability to view or save PDF files.

5. Updating your contact information. Tell the sender if your email address or mobile number changes.`;

export const DEFAULT_SETTINGS = {
  sender: { name: 'Nina Patel', email: 'nina.patel@quickhire.app', company: 'QuickHire Recruiting' },
  branding: { senderName: 'QuickHire Recruiting', logoText: 'QH', primaryColor: '#007AFF', emailFooter: 'Sent securely with QuickHire e-Sign.' },
  reminders: { enabled: true, everyDays: 3, maxCount: 3 },
  expiration: { days: 30, warnDays: 3 },
  staleHours: 48,
  simulationMode: true,
  ersd: ERSD_TEXT,
  defaultMessage: 'Hi {first}, please review and sign the attached documents. Reach out with any questions.',
  permissions: { recruiterCanVoid: true, recruiterCanDelete: true },
};
export type Settings = typeof DEFAULT_SETTINGS;

export interface PowerForm { id: string; templateId: string; name: string; roleId: string; createdAt: string; uses: number; active: boolean; instructions: string }
export interface Batch { id: string; templateId: string; name: string; createdAt: string; count: number; failed: number }

/* ───────────────────────── store ───────────────────────── */
export const store: {
  envelopes: Envelope[]; templates: Template[]; folders: { id: string; name: string }[]; powerforms: PowerForm[]; batches: Batch[];
  settings: Settings; notifications: any[]; rev: number; storageWarning?: string; lastRemovedTemplate?: Template | null;
} = { envelopes: [], templates: [], folders: [], powerforms: [], batches: [], settings: structuredClone(DEFAULT_SETTINGS), notifications: [], rev: 0 };

const LS_V2 = 'qh_esign_v2';
const LS_V1 = 'qh_esign_v1';
const readLS = (k: string) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };

let persistTimer: any = null;
function persistNow() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  try {
    localStorage.setItem(LS_V2, JSON.stringify({ v: 2, envelopes: store.envelopes, templates: store.templates, folders: store.folders, powerforms: store.powerforms, batches: store.batches, settings: store.settings, notifications: store.notifications }));
    store.storageWarning = undefined;
  } catch {
    store.storageWarning = 'This device is out of storage for e-Sign data. Download and purge old envelopes, or connect the QuickHire backend.';
  }
}
function schedulePersist() { if (!persistTimer) persistTimer = setTimeout(persistNow, 200); }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow);
  document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'hidden') persistNow(); });
  // keep tabs in sync (e.g. a signing session open in another tab)
  window.addEventListener('storage', (e) => { if (e.key === LS_V2 && e.newValue) { try { hydrate(JSON.parse(e.newValue)); listeners.forEach((l) => l()); } catch { /* ignore */ } } });
}

const listeners = new Set<() => void>();
function emit() { store.rev++; schedulePersist(); listeners.forEach((l) => l()); }
export function useEsign() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}
export const getStore = () => store;
export function flushPersist() { persistNow(); }

/* ───────────────────────── events (integration hooks) ───────────────────────── */
export type EsignEvent = { type: string; env: Envelope; recipient?: Recipient; from?: string; to?: string; detail?: string };
const hooks = new Set<(e: EsignEvent) => void>();
export function onEsignEvent(h: (e: EsignEvent) => void) { hooks.add(h); return () => { hooks.delete(h); }; }
function fire(e: EsignEvent) { hooks.forEach((h) => { try { h(e); } catch (err) { console.warn('[esign] hook failed', err); } }); }

/* ───────────────────────── helpers ───────────────────────── */
const me = () => ({ name: store.settings.sender.name, email: store.settings.sender.email });
function audit(env: Envelope, event: string, detail = '', actor?: { name: string; email?: string } | string, extra: Partial<{ recipientId: string; ua: string }> = {}) {
  const a = typeof actor === 'string' ? { name: actor } : actor || me();
  env.audit.push({ id: uid('a'), at: nowIso(), event, actor: a.name, actorEmail: a.email, detail, ...extra });
  env.lastActivity = env.updatedAt = nowIso();
}
function setStatus(env: Envelope, next: EnvStatus) {
  const from = env.status; if (from === next) return;
  env.status = next; fire({ type: 'status', env, from, to: next });
}
/** Backend mirror: off in simulation mode (local-only preview), on for real deployments. */
function sync(call: () => Promise<any> | undefined) { if (store.settings.simulationMode && !(globalThis as any).__QH_ESIGN_SYNC__) return; try { bg(call()); } catch { /* offline */ } }
const sanitizeForApi = (env: Envelope) => ({ ...env, documents: env.documents.map((d) => ({ ...d, legacyImages: undefined })) });

export function catalogDoc(key: string, carrier = 'GRAND ONE LLC'): EDoc {
  return { id: uid('doc'), name: CATALOG[key]?.name || key, source: 'catalog', catalogKey: key, carrier, pages: catalogPages() };
}

function normalize(e: any): Envelope {
  const s = store.settings;
  const env: Envelope = {
    title: 'Untitled envelope', status: 'draft', documents: [], recipients: [], fields: [], subject: '', message: '', signingOrder: true,
    reminders: { enabled: s.reminders.enabled, everyDays: s.reminders.everyDays }, remindersSent: 0, maxReminders: s.reminders.maxCount,
    expireDays: s.expiration.days, expiresAt: daysFromNow(s.expiration.days), warnDays: s.expiration.warnDays, driverName: '', carrier: '',
    createdAt: nowIso(), updatedAt: nowIso(), lastActivity: nowIso(), audit: [], comments: [], certificate: null, deletedAt: null, sender: me(), version: 2,
    ...e,
  };
  env.recipients = (env.recipients || []).map((r: any, i: number) => ({ color: colorForIndex(i), order: i + 1, status: 'created', action: 'sign', name: '', email: '', ...r }));
  env.fields = (env.fields || []).filter((f: any) => f && f.docId);
  env.audit = env.audit || []; env.comments = env.comments || [];
  return env;
}

/* ───────────────────────── seeds ───────────────────────── */
const carrierInfo = (name: string) => { const c = CARRIER_LIST.find((x) => x.name === name || x.name.startsWith(name) || name.startsWith(x.name)); return c ? { name: c.name, dot: c.dot, mc: c.mc, address: c.address } : { name }; };
export function candPerson(c: any): Person {
  const cdl = String(c.cdl || 'TX · Class A');
  return { kind: 'driver', id: c.id, name: c.name, email: c.email, phone: c.phone, cdlState: cdl.split(' ')[0], cdlClass: cdl.split('Class ')[1] || 'A', position: c.position || 'Company Driver', carrier: c.carrier, carrierInfo: carrierInfo(c.carrier), address: cdl.startsWith('FL') ? 'Miami, FL' : 'Dallas, TX', payRate: c.position === 'Owner Operator' ? '75% of linehaul' : '$0.62 / mile', startDate: '' };
}

function role(id: string, roleName: string, i: number, extra: Partial<TemplateRole> = {}): TemplateRole {
  return { id, roleName, name: '', email: '', action: 'sign', order: i + 1, color: colorForIndex(i), ...extra };
}
function packetTemplate(name: string, description: string, category: string, carrier: string, keys: string[], roles: TemplateRole[], subject: string): Template {
  const signerRoles = roles.filter((r) => r.action === 'sign' || r.action === 'in_person');
  const documents = keys.map((k) => catalogDoc(k, carrier));
  const fields = documents.flatMap((d) => catalogFields(d.catalogKey!, d.id, signerRoles.map((r) => r.id)));
  return { id: uid('tpl'), name, description, category, carrier, documents, roles, fields, subject, message: DEFAULT_SETTINGS.defaultMessage, signingOrder: true, reminders: { enabled: true, everyDays: 3 }, expireDays: 30, status: 'active', usageCount: 0, createdAt: nowIso(), updatedAt: nowIso() };
}
function seedTemplates(): Template[] {
  const g1 = 'GRAND ONE LLC', dt = 'DT NATIONAL TRANSPORTATION LLC';
  return [
    packetTemplate('GRAND ONE LLC — Company Driver Packet', 'Offer, driver agreement, W-9 and screening consents for new company drivers.', 'Carrier packet', g1,
      ['offer_letter', 'company_driver_agreement', 'w9', 'drug_testing_consent', 'mvr_consent'],
      [role('role_driver', 'Driver', 0), role('role_carrier', 'Carrier Representative', 1, { name: 'Dana Reed', email: 'dana.reed@grandone.example' }), role('role_cc', 'Recruiting file', 2, { action: 'cc', name: 'Nina Patel', email: 'nina.patel@quickhire.app' })],
      'GRAND ONE LLC onboarding packet for {driver}'),
    packetTemplate('DT NATIONAL — Owner Operator Packet', 'Lease agreement, equipment lease, W-9, PSP and Clearinghouse consents.', 'Carrier packet', dt,
      ['owner_operator_agreement', 'equipment_lease', 'w9', 'psp_consent', 'clearinghouse_consent'],
      [role('role_oo', 'Owner-Operator', 0), role('role_dt', 'DT National Representative', 1, { name: 'Sam Pike', email: 'sam.pike@dtnational.example' })],
      'DT NATIONAL owner-operator documents for {driver}'),
    packetTemplate('FMCSA Screening Consents', 'MVR, PSP, Clearinghouse and drug & alcohol testing consents.', 'Compliance', g1,
      ['mvr_consent', 'psp_consent', 'clearinghouse_consent', 'drug_testing_consent'], [role('role_driver', 'Driver', 0)], 'Screening consent forms for {driver}'),
    packetTemplate('Offer Letter', 'Single offer letter with carrier countersignature.', 'Onboarding', g1, ['offer_letter'],
      [role('role_driver', 'Driver', 0), role('role_carrier', 'Carrier Representative', 1, { name: 'Dana Reed', email: 'dana.reed@grandone.example' })], 'Your offer from {carrier}'),
    packetTemplate('Rehire Packet', 'Streamlined set for returning drivers.', 'Rehire', g1, ['offer_letter', 'drug_testing_consent', 'mvr_consent'],
      [role('role_driver', 'Driver', 0), role('role_carrier', 'Carrier Representative', 1, { name: 'Dana Reed', email: 'dana.reed@grandone.example' })], 'Welcome back to {carrier}'),
  ];
}

function seedEnvelopes(templates: Template[]): Envelope[] {
  const H = 36e5;
  const byName = (n: string) => CANDS.find((c: any) => c.name === n);
  const tpl = (name: string) => templates.find((t) => t.name === name)!;
  const make = (tName: string, cand: string, hoursAgo: number, progress: (e: Envelope, t0: number) => void) => {
    const c = byName(cand); const p = candPerson(c);
    const t = tpl(tName);
    const inst = instantiateTemplate(t, { [t.roles[0].id]: { name: p.name, email: p.email || '', phone: p.phone, driverId: p.id } }, personMergeData(p));
    const t0 = Date.now() - hoursAgo * H; const at = (h: number) => new Date(t0 + h * H).toISOString();
    const env = normalize({ id: uid('env'), title: t.name.replace(/^.* — /, '') + ` — ${p.name}`, documents: inst.documents, recipients: inst.recipients, fields: inst.fields, subject: inst.subject, message: inst.message, templateId: t.id, driverId: p.id, driverName: p.name, carrier: p.carrierInfo?.name || p.carrier || '', createdAt: at(0), updatedAt: at(0), lastActivity: at(0) });
    env.audit.push({ id: uid('a'), at: at(0), event: 'created', actor: 'Nina Patel', detail: `Created from template "${t.name}"` });
    env.status = 'sent'; env.sentAt = at(0.1); env.expiresAt = new Date(t0 + 30 * 864e5).toISOString();
    env.audit.push({ id: uid('a'), at: at(0.1), event: 'sent', actor: 'Nina Patel', detail: `Sent to ${env.recipients.filter((r) => r.order === 1).map((r) => r.name).join(', ')}` });
    advanceRouting(env, at(0.1));
    progress(env, t0);
    env.status = env.status === 'sent' ? deriveStatus(env) : env.status;
    env.lastActivity = env.audit[env.audit.length - 1].at;
    return env;
  };
  const view = (e: Envelope, r: Recipient, at: string) => { r.status = 'delivered'; r.deliveredAt = at; r.consentAt = at; e.audit.push({ id: uid('a'), at, event: 'viewed', actor: r.name, actorEmail: r.email, detail: `${r.name} viewed the envelope` }); };
  const sign = (e: Envelope, r: Recipient, at: string) => {
    view(e, r, at);
    r.signature = { kind: 'typed', font: 'Dancing Script', name: r.name, initials: r.name.split(' ').map((s) => s[0]).join(''), sigUrl: '', iniUrl: '', adoptedAt: at };
    for (const f of e.fields.filter((x) => x.recipientId === r.id)) {
      if (f.type === 'signature' || f.type === 'initial') f.value = 'signed';
      else if (f.type === 'checkbox') f.value = 'true';
      else if (FIELD_DEFS[f.type].kind === 'auto') f.value = autoValue(f, r, at);
      else if (!f.value && f.type === 'dropdown') f.value = f.options?.[0] || '';
      else if (!f.value && f.type === 'text' && !f.readOnly) f.value = f.validation?.kind === 'zip' ? '75201' : f.validation?.kind === 'regex' ? '123-45-6789' : 'On file';
      f.filledAt = at;
    }
    r.status = 'signed'; r.signedAt = at;
    e.audit.push({ id: uid('a'), at, event: 'signed', actor: r.name, actorEmail: r.email, detail: `${r.name} signed` });
    const res = advanceRouting(e, at);
    res.notified.forEach((n) => e.audit.push({ id: uid('a'), at, event: 'sent', actor: 'System', detail: `Sent to ${n.name}` }));
    if (res.complete) { e.status = 'completed'; e.completedAt = at; e.certificate = { completedAt: at, sealId: uid('seal').toUpperCase() }; e.audit.push({ id: uid('a'), at, event: 'completed', actor: 'System', detail: 'All recipients completed — envelope completed' }); }
  };
  const iso = (t0: number, h: number) => new Date(t0 + h * H).toISOString();
  return [
    make('GRAND ONE LLC — Company Driver Packet', 'Robert Johnson', 70, (e, t0) => view(e, e.recipients[0], iso(t0, 6))),
    make('Offer Letter', 'Derek Hill', 30, (e, t0) => sign(e, e.recipients[0], iso(t0, 4))),
    make('FMCSA Screening Consents', 'Mike Okafor', 130, (e, t0) => sign(e, e.recipients[0], iso(t0, 20))),
    make('DT NATIONAL — Owner Operator Packet', 'Diego Ramos', 26 * 24, (e) => { e.expiresAt = daysFromNow(2); }),
    make('Offer Letter', 'Tracy Bowman', 52, (e, t0) => { const r = e.recipients[0]; view(e, r, iso(t0, 3)); r.status = 'declined'; r.declinedAt = iso(t0, 3.2); r.declineReason = 'Pay rate is not what we discussed.'; e.status = 'declined'; e.declinedAt = r.declinedAt; e.declineReason = r.declineReason; e.audit.push({ id: uid('a'), at: r.declinedAt, event: 'declined', actor: r.name, detail: `Declined: ${r.declineReason}` }); }),
    make('FMCSA Screening Consents', 'Kevin Brooks', 200, (e, t0) => { e.status = 'voided'; e.voidedAt = iso(t0, 50); e.voidReason = 'Wrong carrier selected'; e.audit.push({ id: uid('a'), at: e.voidedAt, event: 'voided', actor: 'Nina Patel', detail: 'Voided: Wrong carrier selected' }); }),
  ];
}

/* ───────────────────────── init / migration ───────────────────────── */
function hydrate(saved: any) {
  store.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(saved.settings || {}), sender: { ...DEFAULT_SETTINGS.sender, ...(saved.settings?.sender || {}) } } as Settings;
  store.envelopes = (saved.envelopes || []).map(normalize);
  store.templates = saved.templates || [];
  store.folders = saved.folders || [];
  store.powerforms = saved.powerforms || [];
  store.batches = saved.batches || [];
  store.notifications = saved.notifications || [];
}

(function init() {
  if (typeof localStorage === 'undefined') return;
  const v2 = readLS(LS_V2);
  if (v2) { hydrate(v2); return; }
  const v1 = readLS(LS_V1);
  if (v1 && (v1.envelopes?.length || v1.templates?.length || v1.packages?.length)) {
    const sender = { ...DEFAULT_SETTINGS.sender };
    const catalog = CATALOG as any;
    store.envelopes = (v1.envelopes || []).map((e: any) => normalize(migrateEnvelopeV1(e, catalog, sender)));
    store.templates = [
      ...seedTemplates(),
      ...(v1.templates || []).map((t: any) => migrateTemplateV1(t, catalog)),
      ...(v1.packages || []).map((p: any) => migrateTemplateV1(p, catalog, true)),
    ];
    for (const t of store.templates) for (const d of t.documents) if (d.source === 'catalog' && !d.carrier) d.carrier = t.carrier || 'GRAND ONE LLC';
    if (v1.settings?.simulationMode === false) store.settings.simulationMode = false;
    store.notifications = v1.notifications || [];
    persistNow();
    return;
  }
  store.templates = seedTemplates();
  store.envelopes = seedEnvelopes(store.templates);
  persistNow();
})();

/** Move legacy v1 page images out of localStorage into IndexedDB, then drop the v1 key. */
export async function migrateLegacyBlobs() {
  let moved = 0;
  for (const e of store.envelopes) for (const d of e.documents) {
    if (!d.legacyImages?.length) continue;
    const ids: string[] = [];
    for (const url of d.legacyImages) { const { bytes, type } = dataUrlToBytes(url); ids.push(await putBlob(bytes, type)); }
    d.imageBlobIds = ids; delete d.legacyImages; moved++;
  }
  if (moved) persistNow();
  const stillLegacy = store.envelopes.some((e) => e.documents.some((d) => d.legacyImages?.length));
  if (!stillLegacy) { try { localStorage.removeItem(LS_V1); } catch { /* ignore */ } }
  return moved;
}

/** Delete IndexedDB blobs no envelope or template references any more. */
export async function gcBlobs() {
  const used = new Set<string>();
  const add = (d: EDoc) => { if (d.blobId) used.add(d.blobId); (d.imageBlobIds || []).forEach((x) => used.add(x)); };
  store.envelopes.forEach((e) => e.documents.forEach(add)); store.templates.forEach((t) => t.documents.forEach(add));
  for (const id of await listBlobIds()) if (!used.has(id)) await deleteBlob(id);
}

/* ───────────────────────── service ───────────────────────── */
export const svc = {
  envelope(id?: string | null) { return id ? store.envelopes.find((e) => e.id === id) : undefined; },
  template(id?: string | null) { return id ? store.templates.find((t) => t.id === id) : undefined; },
  me,
  counts() {
    const out: Record<string, number> = {};
    for (const v of ['inbox', 'sent', 'drafts', 'deleted', 'action', 'waiting', 'expiring', 'completed', 'closed'] as ViewKey[]) out[v] = store.envelopes.filter((e) => inView(e, v)).length;
    return out;
  },

  /* ── documents ── */
  async importPdf(file: File): Promise<EDoc> {
    const info = await readPdfFile(file);
    const blobId = await putBlob(info.bytes, 'application/pdf');
    return { id: uid('doc'), name: info.name, source: 'pdf', blobId, pages: info.pages, size: info.size, sha256: await sha256Hex(info.bytes) };
  },
  catalogDoc,

  /* ── drafts ── */
  createEnvelope(partial: Partial<Envelope> = {}) {
    const env = normalize({ id: uid('env'), ...partial, status: 'draft', createdAt: nowIso(), updatedAt: nowIso(), lastActivity: nowIso(), audit: [], comments: [] });
    if (!env.message && !env.selfSign) env.message = '';
    audit(env, 'created', partial.templateId ? `Created from template "${svc.template(partial.templateId)?.name || ''}"` : 'Envelope created');
    store.envelopes.unshift(env); emit();
    sync(() => esignApi.create(sanitizeForApi(env)));
    return env;
  },
  updateEnvelope(id: string, patch: Partial<Envelope>) {
    const e = svc.envelope(id); if (!e) return;
    Object.assign(e, patch); e.updatedAt = nowIso(); emit();
    if (e.status === 'draft') { clearTimeout((svc as any)._saveT); (svc as any)._saveT = setTimeout(() => sync(() => esignApi.saveDraft(id, sanitizeForApi(e))), 1500); }
  },
  /** Link a driver: fills the first signer and every merge field. */
  linkPerson(id: string, p: Person | null) {
    const e = svc.envelope(id); if (!e) return { missing: [] as string[] };
    if (!p) { svc.updateEnvelope(id, { driverId: undefined, leadId: undefined, driverName: '' }); return { missing: [] }; }
    const data = personMergeData(p);
    const filled = fillMerge(e.fields, data);
    const recipients = [...e.recipients];
    const first = recipients.find((r) => r.action === 'sign' || r.action === 'in_person');
    if (first && (!first.name || first.driverId || !first.email)) Object.assign(first, { name: p.name, email: p.email || first.email, phone: p.phone || first.phone, driverId: p.id });
    else if (!first) recipients.unshift({ id: uid('r'), name: p.name, email: p.email || '', phone: p.phone, action: 'sign', order: 1, color: colorForIndex(recipients.length), status: 'created', driverId: p.id, roleName: 'Driver' });
    svc.updateEnvelope(id, { fields: filled.fields, recipients, driverId: p.kind === 'lead' ? undefined : p.id, leadId: p.kind === 'lead' ? p.id : undefined, driverName: p.name, carrier: p.carrierInfo?.name || p.carrier || e.carrier });
    return { missing: filled.missing };
  },
  deleteDraft(id: string) { store.envelopes = store.envelopes.filter((e) => e.id !== id); emit(); },

  /* ── sending ── */
  send(id: string): { ok: boolean; errors: string[] } {
    const e = svc.envelope(id); if (!e) return { ok: false, errors: ['Envelope not found'] };
    const errors = validateForSend(e);
    if (errors.length) return { ok: false, errors };
    const at = nowIso();
    for (const r of e.recipients) Object.assign(r, { status: 'created', sentAt: undefined, deliveredAt: undefined, signedAt: undefined, completedAt: undefined });
    for (const f of e.fields) (f as any).senderValue = f.value;
    e.sentAt = at; e.expiresAt = daysFromNow(e.expireDays || store.settings.expiration.days);
    e.remindersSent = 0; e.reminders = { ...e.reminders, lastAt: undefined };
    setStatus(e, 'sent');
    if (e.selfSign) audit(e, 'sent', 'Self-signing session started');
    else audit(e, 'sent', `Envelope sent${e.signingOrder ? ' with signing order' : ''} · expires ${fmtDate(e.expiresAt)}`);
    const res = advanceRouting(e, at);
    res.notified.forEach((r) => audit(e, r.action === 'cc' ? 'copied' : 'delivered_email', r.action === 'in_person' ? `In-person session queued for ${r.name} (host: ${r.hostName || me().name})` : `${r.action === 'cc' ? 'Copy sent' : 'Invitation sent'} to ${r.name} <${r.email}>${r.accessCode ? ' · access code required' : ''}${r.smsAuth ? ' · SMS code' : ''}`, 'System', { recipientId: r.id }));
    fire({ type: 'sent', env: e });
    emit(); sync(() => esignApi.send(id, sanitizeForApi(e)));
    return { ok: true, errors: [] };
  },
  resend(id: string) {
    const e = svc.envelope(id); if (!e) return;
    const act = activeRecipients(e);
    act.forEach((r) => audit(e, 'resent', `Invitation re-sent to ${r.name} <${r.email}>`, undefined, { recipientId: r.id }));
    fire({ type: 'resent', env: e }); emit(); sync(() => esignApi.saveDraft(id, sanitizeForApi(e)));
    return act.length;
  },
  remind(id: string, auto = false): { ok: boolean; message?: string } {
    const e = svc.envelope(id); if (!e) return { ok: false };
    const act = activeRecipients(e);
    if (!act.length) return { ok: false, message: 'Nobody is waiting to sign' };
    if (auto && e.remindersSent >= e.maxReminders) return { ok: false, message: 'Reminder limit reached' };
    e.remindersSent++; e.reminders = { ...e.reminders, lastAt: nowIso() };
    audit(e, 'reminder_sent', `${auto ? 'Automatic reminder' : 'Reminder'} sent to ${act.map((r) => r.name).join(', ')}`, auto ? 'System' : undefined);
    fire({ type: 'reminded', env: e, detail: auto ? 'auto' : 'manual' });
    emit(); sync(() => esignApi.remind(id));
    return { ok: true };
  },
  void(id: string, reason: string) {
    const e = svc.envelope(id); if (!e) return;
    e.voidedAt = nowIso(); e.voidReason = reason;
    setStatus(e, 'voided'); audit(e, 'voided', `Voided: ${reason}`);
    emit(); sync(() => esignApi.void(id, reason));
  },

  /* ── correct ── */
  beginCorrect(id: string) {
    const e = svc.envelope(id); if (!e || !IN_FLIGHT.includes(e.status)) return false;
    (e as any).prevStatus = e.status;
    const doneIds = new Set(e.recipients.filter((r) => isDone(r)).map((r) => r.id));
    e.fields.forEach((f) => { f.locked = doneIds.has(f.recipientId); });
    setStatus(e, 'correcting'); audit(e, 'correcting', 'Correction started — signing paused');
    emit(); return true;
  },
  finishCorrect(id: string): { ok: boolean; errors: string[] } {
    const e = svc.envelope(id); if (!e) return { ok: false, errors: ['Envelope not found'] };
    const errors = validateForSend({ ...e, expiresAt: e.expiresAt });
    if (errors.length) return { ok: false, errors };
    e.fields.forEach((f) => { delete f.locked; });
    e.recipients.forEach((r) => { if (!r.status) r.status = 'created'; });
    e.status = 'sent'; // temporarily in flight so routing + status derive from recipients
    const res = advanceRouting(e);
    res.notified.forEach((r) => audit(e, 'delivered_email', `Invitation sent to ${r.name} <${r.email}>`, 'System', { recipientId: r.id }));
    const next = res.complete ? 'completed' : deriveStatus(e);
    e.status = 'correcting';
    setStatus(e, next);
    if (next === 'completed') { e.completedAt = nowIso(); e.certificate = { completedAt: e.completedAt, sealId: uid('seal').toUpperCase() }; fire({ type: 'completed', env: e }); }
    delete (e as any).prevStatus;
    audit(e, 'corrected', 'Envelope corrected and re-sent to pending recipients');
    activeRecipients(e).forEach((r) => audit(e, 'resent', `Corrected invitation sent to ${r.name}`, 'System', { recipientId: r.id }));
    fire({ type: 'corrected', env: e }); emit(); sync(() => esignApi.saveDraft(id, sanitizeForApi(e)));
    return { ok: true, errors: [] };
  },
  cancelCorrect(id: string) {
    const e = svc.envelope(id); if (!e || e.status !== 'correcting') return;
    e.fields.forEach((f) => { delete f.locked; });
    setStatus(e, (e as any).prevStatus || 'sent'); delete (e as any).prevStatus;
    audit(e, 'corrected', 'Correction cancelled — no changes sent'); emit();
  },

  /* ── signing session ── */
  openSession(id: string, rid: string, opts: { host?: string } = {}) {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return;
    if (!r.deliveredAt) {
      r.deliveredAt = nowIso();
      if (r.status === 'sent') r.status = 'delivered';
      audit(e, 'viewed', opts.host ? `${r.name} opened the in-person session hosted by ${opts.host}` : `${r.name} opened the envelope`, { name: r.name, email: r.email }, { recipientId: r.id, ua: navigator.userAgent });
      if (IN_FLIGHT.includes(e.status) && e.status !== 'correcting') setStatus(e, deriveStatus(e));
      fire({ type: 'viewed', env: e, recipient: r });
      emit();
    }
  },
  verifyAccess(id: string, rid: string, code: string): boolean {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return false;
    const ok = !r.accessCode || code.trim() === r.accessCode.trim();
    if (ok) { r.authAt = nowIso(); audit(e, 'auth_passed', `${r.name} entered the correct access code`, { name: r.name, email: r.email }, { recipientId: r.id }); }
    else audit(e, 'auth_failed', `Incorrect access code entered for ${r.name}`, { name: r.name, email: r.email }, { recipientId: r.id });
    emit(); return ok;
  },
  smsVerified(id: string, rid: string) {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return;
    r.authAt = nowIso(); audit(e, 'auth_passed', `${r.name} verified the SMS code sent to •••${String(r.phone || '').replace(/\D/g, '').slice(-4)}${store.settings.simulationMode ? ' (simulated delivery)' : ''}`, { name: r.name, email: r.email }, { recipientId: rid }); emit();
  },
  consent(id: string, rid: string) {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return;
    r.consentAt = nowIso(); audit(e, 'consent', `${r.name} agreed to use electronic records and signatures`, { name: r.name, email: r.email }, { recipientId: r.id }); emit();
  },
  saveProgress(id: string, rid: string, values: Values) {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return;
    for (const f of e.fields) if (f.recipientId === rid && !f.readOnly && values[f.id] !== undefined && f.type !== 'signature' && f.type !== 'initial') f.value = values[f.id];
    audit(e, 'finish_later', `${r.name} saved progress to finish later`, { name: r.name, email: r.email }, { recipientId: rid }); emit();
  },
  finish(id: string, rid: string, values: Values, signature: Signature | null): { ok: boolean; complete?: boolean; error?: string } {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return { ok: false, error: 'Envelope not found' };
    if (!activeRecipients(e).some((x) => x.id === rid)) return { ok: false, error: 'This envelope is not waiting for you.' };
    const all: Values = { ...Object.fromEntries(e.fields.map((f) => [f.id, f.value])), ...values };
    const c = completion(e.fields, rid, all);
    if (!c.complete) return { ok: false, error: c.missing.length ? 'Complete all required fields.' : c.errors[0]?.message };
    const at = nowIso();
    for (const f of e.fields) {
      if (f.recipientId !== rid) continue;
      if (FIELD_DEFS[f.type].kind === 'auto') f.value = autoValue(f, r, at);
      else if (!f.readOnly && all[f.id] !== undefined) f.value = all[f.id];
      if (f.value || isInputType(f.type)) f.filledAt = at;
    }
    r.signature = signature || r.signature || null;
    r.userAgent = navigator.userAgent;
    const approver = r.action === 'approve';
    const viewer = r.action === 'view';
    r.status = viewer ? 'completed' : 'signed';
    if (viewer) r.completedAt = at; else r.signedAt = at;
    audit(e, viewer ? 'viewed_done' : approver ? 'approved' : 'signed', viewer ? `${r.name} reviewed the documents` : approver ? `${r.name} approved` : `${r.name} signed`, { name: r.name, email: r.email }, { recipientId: rid, ua: navigator.userAgent });
    fire({ type: 'signed', env: e, recipient: r });
    const res = advanceRouting(e, at);
    res.notified.forEach((n) => audit(e, n.action === 'cc' ? 'copied' : 'delivered_email', `${n.action === 'cc' ? 'Copy sent' : 'Invitation sent'} to ${n.name} <${n.email}>`, 'System', { recipientId: n.id }));
    if (res.complete) {
      e.completedAt = at; e.certificate = { completedAt: at, sealId: uid('seal').toUpperCase() };
      setStatus(e, 'completed');
      audit(e, 'completed', 'All recipients completed — envelope completed', 'System');
      fire({ type: 'completed', env: e });
    } else setStatus(e, deriveStatus(e));
    emit(); sync(() => esignApi.saveDraft(id, sanitizeForApi(e)));
    return { ok: true, complete: res.complete };
  },
  decline(id: string, rid: string, reason: string) {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return;
    r.status = 'declined'; r.declinedAt = nowIso(); r.declineReason = reason;
    e.declinedAt = r.declinedAt; e.declineReason = reason;
    setStatus(e, 'declined');
    audit(e, 'declined', `${r.name} declined to sign: ${reason}`, { name: r.name, email: r.email }, { recipientId: rid });
    emit(); sync(() => esignApi.saveDraft(id, sanitizeForApi(e)));
  },
  delegate(id: string, rid: string, to: { name: string; email: string; reason?: string }) {
    const e = svc.envelope(id); const r = e?.recipients.find((x) => x.id === rid); if (!e || !r) return;
    const from = { name: r.name, email: r.email, reason: to.reason, at: nowIso() };
    Object.assign(r, { name: to.name, email: to.email, delegatedFrom: from, status: 'sent', sentAt: nowIso(), deliveredAt: undefined, consentAt: undefined, authAt: undefined, signature: null, driverId: undefined });
    audit(e, 'delegated', `${from.name} assigned their part to ${to.name} <${to.email}>${to.reason ? ` — ${to.reason}` : ''}`, { name: from.name, email: from.email }, { recipientId: rid });
    fire({ type: 'delegated', env: e, recipient: r }); emit();
  },
  addComment(id: string, c: { author: string; authorEmail?: string; text: string; recipientId?: string }) {
    const e = svc.envelope(id); if (!e || !c.text.trim()) return;
    e.comments.push({ id: uid('c'), at: nowIso(), ...c, text: c.text.trim() });
    audit(e, 'comment', `${c.author} commented`, { name: c.author, email: c.authorEmail }); emit();
  },

  /* ── manage ── */
  clone(id: string): Envelope | undefined {
    const e = svc.envelope(id); if (!e) return;
    const rmap: Record<string, string> = {};
    const recipients = e.recipients.map((r, i) => { const nid = uid('r'); rmap[r.id] = nid; return { id: nid, name: r.delegatedFrom?.name || r.name, email: r.delegatedFrom?.email || r.email, phone: r.phone, action: r.action, order: r.order, color: r.color || colorForIndex(i), status: 'created' as const, roleName: r.roleName, privateMessage: r.privateMessage, accessCode: r.accessCode, smsAuth: r.smsAuth, language: r.language, hostName: r.hostName, hostEmail: r.hostEmail, driverId: r.driverId }; });
    const dmap: Record<string, string> = {};
    const documents = e.documents.map((d) => { const nid = uid('doc'); dmap[d.id] = nid; return { ...d, id: nid }; });
    const fields = cloneFields(e.fields, (f) => ({ recipientId: rmap[f.recipientId] || f.recipientId, docId: dmap[f.docId] || f.docId, value: (f as any).senderValue ?? (f.filledAt ? '' : f.value), filledAt: undefined, locked: undefined }));
    const copy = svc.createEnvelope({ title: e.title.replace(/( \(copy\))?$/, ' (copy)'), documents, recipients, fields, subject: e.subject, message: e.message, signingOrder: e.signingOrder, reminders: { enabled: e.reminders.enabled, everyDays: e.reminders.everyDays }, expireDays: e.expireDays, warnDays: e.warnDays, driverId: e.driverId, leadId: e.leadId, driverName: e.driverName, carrier: e.carrier, templateId: e.templateId });
    audit(copy, 'cloned', `Cloned from "${e.title}"`); emit();
    return copy;
  },
  softDelete(id: string) { const e = svc.envelope(id); if (!e) return; e.deletedAt = nowIso(); audit(e, 'deleted', 'Moved to Deleted'); fire({ type: 'deleted', env: e }); emit(); },
  restore(id: string) { const e = svc.envelope(id); if (!e) return; e.deletedAt = null; audit(e, 'restored', 'Restored from Deleted'); emit(); },
  purge(id: string) { store.envelopes = store.envelopes.filter((e) => e.id !== id); emit(); gcBlobs().catch(() => {}); },
  moveToFolder(id: string, folderId: string | null) { const e = svc.envelope(id); if (!e) return; e.folder = folderId || undefined; audit(e, 'moved', folderId ? `Moved to folder "${store.folders.find((f) => f.id === folderId)?.name || ''}"` : 'Removed from folder'); emit(); },
  createFolder(name: string) { const f = { id: uid('fld'), name: name.trim() || 'New folder' }; store.folders.push(f); emit(); return f; },
  renameFolder(id: string, name: string) { const f = store.folders.find((x) => x.id === id); if (f) { f.name = name; emit(); } },
  deleteFolder(id: string) { store.folders = store.folders.filter((x) => x.id !== id); store.envelopes.forEach((e) => { if (e.folder === id) e.folder = undefined; }); emit(); },
  markDownloaded(id: string, what: string) { const e = svc.envelope(id); if (!e) return; audit(e, 'downloaded', `${what} downloaded`); emit(); },
  setSignedFile(id: string, fileId: string, docHash?: string) { const e = svc.envelope(id); if (!e) return; e.signedFileId = fileId; if (docHash && e.certificate) e.certificate.docHash = docHash; emit(); },
  exportCsv(id: string) { const e = svc.envelope(id); return e ? formDataCsv(e) : ''; },

  /* ── templates ── */
  createTemplate(t: Partial<Template> = {}): Template {
    const tpl: Template = { id: uid('tpl'), name: 'Untitled template', description: '', category: 'Onboarding', documents: [], roles: [role(uid('role'), 'Driver', 0)], fields: [], subject: '', message: store.settings.defaultMessage, signingOrder: true, reminders: { enabled: true, everyDays: store.settings.reminders.everyDays }, expireDays: store.settings.expiration.days, status: 'active', usageCount: 0, createdAt: nowIso(), updatedAt: nowIso(), ...t };
    store.templates.unshift(tpl); emit(); return tpl;
  },
  updateTemplate(id: string, patch: Partial<Template>) { const t = svc.template(id); if (!t) return; Object.assign(t, patch, { updatedAt: nowIso() }); emit(); },
  removeTemplate(id: string) { const t = svc.template(id); if (!t) return; store.lastRemovedTemplate = t; store.templates = store.templates.filter((x) => x.id !== id); emit(); return t; },
  restoreTemplate(t: Template) { if (!store.templates.some((x) => x.id === t.id)) store.templates.unshift(t); emit(); },
  duplicateTemplate(id: string) {
    const t = svc.template(id); if (!t) return;
    const rmap: Record<string, string> = {}; const roles = t.roles.map((r) => { const nid = uid('role'); rmap[r.id] = nid; return { ...r, id: nid }; });
    const dmap: Record<string, string> = {}; const documents = t.documents.map((d) => { const nid = uid('doc'); dmap[d.id] = nid; return { ...d, id: nid }; });
    const copy: Template = { ...structuredClone(t), id: uid('tpl'), name: t.name + ' (copy)', roles, documents, fields: cloneFields(t.fields, (f) => ({ recipientId: rmap[f.recipientId] || f.recipientId, docId: dmap[f.docId] || f.docId })), usageCount: 0, createdAt: nowIso(), updatedAt: nowIso() };
    store.templates.unshift(copy); emit(); return copy;
  },
  saveAsTemplate(id: string, name: string): Template | undefined {
    const e = svc.envelope(id); if (!e) return;
    const rmap: Record<string, string> = {};
    const roles: TemplateRole[] = e.recipients.map((r, i) => { const rid = uid('role'); rmap[r.id] = rid; const isDriver = !!r.driverId || i === 0; return { id: rid, roleName: r.roleName || (isDriver ? 'Driver' : `Recipient ${i + 1}`), name: isDriver ? '' : r.name, email: isDriver ? '' : r.email, action: r.action, order: r.order, color: r.color, accessCode: r.accessCode, privateMessage: r.privateMessage }; });
    const dmap: Record<string, string> = {}; const documents = e.documents.map((d) => { const nid = uid('doc'); dmap[d.id] = nid; return { ...d, id: nid }; });
    const fields = cloneFields(e.fields, (f) => ({ recipientId: rmap[f.recipientId] || f.recipientId, docId: dmap[f.docId] || f.docId, value: f.mergeKey ? '' : ((f as any).senderValue ?? (f.filledAt ? '' : f.value)), filledAt: undefined, locked: undefined }));
    const tpl = svc.createTemplate({ name: name.trim() || e.title, description: `Saved from envelope "${e.title}"`, category: 'Saved', carrier: e.carrier, documents, roles, fields, subject: e.subject, message: e.message, signingOrder: e.signingOrder, reminders: { enabled: e.reminders.enabled, everyDays: e.reminders.everyDays }, expireDays: e.expireDays });
    audit(e, 'saved_template', `Saved as template "${tpl.name}"`); emit();
    return tpl;
  },
  /** Primary signing role of a template (receives the driver). */
  driverRole(t: Template) { return [...t.roles].filter((r) => r.action !== 'cc').sort((a, b) => a.order - b.order)[0] || t.roles[0]; },
  envelopeFromTemplate(tplId: string, person?: Person | null, extra: Record<string, { name: string; email: string }> = {}): { env: Envelope; missing: string[] } | null {
    const t = svc.template(tplId); if (!t) return null;
    const lead = svc.driverRole(t);
    const assign: any = { ...extra };
    if (person && lead) assign[lead.id] = { name: person.name, email: person.email || '', phone: person.phone, driverId: person.id };
    const inst = instantiateTemplate(t, assign, personMergeData(person));
    if (person) inst.documents.forEach((d) => { if (d.source === 'catalog' && person.carrierInfo?.name) d.carrier = person.carrierInfo.name; });
    t.usageCount++; t.lastUsed = nowIso();
    const env = svc.createEnvelope({ title: person ? `${t.name.replace(/^.* — /, '')} — ${person.name}` : t.name, documents: inst.documents, recipients: inst.recipients, fields: inst.fields, subject: inst.subject || `Please sign: ${t.name}`, message: inst.message, signingOrder: t.signingOrder, reminders: { ...t.reminders }, expireDays: t.expireDays, templateId: t.id, driverId: person?.kind === 'lead' ? undefined : person?.id, leadId: person?.kind === 'lead' ? person.id : undefined, driverName: person?.name || '', carrier: person?.carrierInfo?.name || person?.carrier || t.carrier || '' });
    return { env, missing: inst.missingMerge };
  },
  bulkSend(tplId: string, rows: { person?: Person | null; name: string; email: string; phone?: string }[]) {
    const t = svc.template(tplId); if (!t) return null;
    const batch: Batch = { id: uid('batch'), templateId: tplId, name: `${t.name} · ${new Date().toLocaleDateString()}`, createdAt: nowIso(), count: 0, failed: 0 };
    const results: { name: string; ok: boolean; envId?: string; error?: string }[] = [];
    for (const row of rows) {
      const person: Person = row.person || { name: row.name, email: row.email, phone: row.phone };
      const out = svc.envelopeFromTemplate(tplId, { ...person, name: row.name || person.name, email: row.email || person.email, phone: row.phone || person.phone });
      if (!out) { results.push({ name: row.name, ok: false, error: 'Template missing' }); batch.failed++; continue; }
      out.env.batchId = batch.id;
      const res = svc.send(out.env.id);
      if (res.ok) { batch.count++; results.push({ name: row.name, ok: true, envId: out.env.id }); }
      else { batch.failed++; results.push({ name: row.name, ok: false, envId: out.env.id, error: res.errors[0] }); }
    }
    store.batches.unshift(batch); emit();
    return { batch, results };
  },

  /* ── self-service links (PowerForm-style) ── */
  createPowerForm(tplId: string) {
    const t = svc.template(tplId); if (!t) return null;
    const pf: PowerForm = { id: uid('pf'), templateId: tplId, name: t.name, roleId: svc.driverRole(t).id, createdAt: nowIso(), uses: 0, active: true, instructions: 'Enter your name and email to review and sign.' };
    store.powerforms.unshift(pf); emit(); return pf;
  },
  togglePowerForm(id: string) { const p = store.powerforms.find((x) => x.id === id); if (p) { p.active = !p.active; emit(); } },
  removePowerForm(id: string) { store.powerforms = store.powerforms.filter((x) => x.id !== id); emit(); },
  submitPowerForm(id: string, who: { name: string; email: string; phone?: string }) {
    const pf = store.powerforms.find((x) => x.id === id); if (!pf || !pf.active) return null;
    const out = svc.envelopeFromTemplate(pf.templateId, { name: who.name, email: who.email, phone: who.phone }); if (!out) return null;
    out.env.title = `${pf.name} — ${who.name} (self-service)`;
    audit(out.env, 'powerform', `Started from self-service link by ${who.name} <${who.email}>`, { name: who.name, email: who.email });
    const res = svc.send(out.env.id);
    if (!res.ok) return { env: out.env, errors: res.errors };
    pf.uses++; emit();
    const rid = activeRecipients(out.env).find((r) => r.email === who.email)?.id;
    return { env: out.env, recipientId: rid, errors: [] };
  },

  /* ── housekeeping: expirations, automatic reminders, 48h stale alerts ── */
  tick(now = Date.now()) {
    let changed = false;
    for (const e of store.envelopes) {
      if (!IN_FLIGHT.includes(e.status) || e.status === 'correcting' || e.deletedAt) continue;
      if (e.expiresAt && +new Date(e.expiresAt) <= now) { setStatus(e, 'expired'); audit(e, 'expired', 'Envelope expired before all recipients finished', 'System'); changed = true; continue; }
      const act = activeRecipients(e);
      if (!act.length) continue;
      if (e.reminders.enabled && e.remindersSent < e.maxReminders) {
        const last = +new Date(e.reminders.lastAt || e.sentAt || e.createdAt);
        if (now - last >= (e.reminders.everyDays || 3) * 864e5) { svc.remind(e.id, true); changed = true; }
      }
      const oldest = Math.min(...act.map((r) => +new Date(r.sentAt || e.sentAt || e.createdAt)));
      if (!e.staleNotifiedAt && now - oldest >= (store.settings.staleHours || 48) * 36e5) {
        e.staleNotifiedAt = new Date(now).toISOString(); fire({ type: 'stale', env: e, detail: act.map((r) => r.name).join(', ') }); changed = true;
      }
    }
    if (changed) emit();
  },

  /* ── settings ── */
  setSetting(path: string, value: any) { const parts = path.split('.'); let o: any = store.settings; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = { ...(o[parts[i]] || {}) }; o[parts[parts.length - 1]] = value; emit(); sync(() => esignApi.updateSettings(store.settings)); },
  async resetDemo() { store.templates = seedTemplates(); store.envelopes = seedEnvelopes(store.templates); store.folders = []; store.powerforms = []; store.batches = []; store.settings = structuredClone(DEFAULT_SETTINGS); emit(); gcBlobs().catch(() => {}); },
};

/* ───────────────────────── v1 compatibility helpers ───────────────────────── */
export function docName(env: Envelope | any, key: string) { return env?.documents?.find((d: EDoc) => d.id === key)?.name || CATALOG[key]?.name || key; }
export function totalPages(docs: EDoc[]) { return docs.reduce((n, d) => n + d.pages.length, 0); }
export { PAGE_W };
