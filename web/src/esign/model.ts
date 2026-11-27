/* QuickHire e-Sign — pure domain model.
   No React, no DOM, no storage: everything here is deterministic and unit
   tested (model.test.ts). The store, editor and signing UI all build on these
   rules so the sender's editor, the signer's session and the completed PDF
   agree on what is visible, required and valid. */

/* ───────────────────────── ids / time ───────────────────────── */
export function uid(prefix: string): string {
  const c: any = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  const raw = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${raw}`;
}
export const nowIso = () => new Date().toISOString();
export const daysFromNow = (d: number, from = Date.now()) => new Date(from + d * 864e5).toISOString();

/* Display coordinate space: every page is rendered PAGE_W px wide; field
   geometry is stored page-relative in these units so it survives zoom and is
   converted to PDF points only when flattening. */
export const PAGE_W = 680;
export const LETTER = { w: 612, h: 792 };
export const PT_TO_PX = PAGE_W / LETTER.w;

/* ───────────────────────── types ───────────────────────── */
export type FieldType =
  | 'signature' | 'initial' | 'stamp' | 'dateSigned'
  | 'fullName' | 'firstName' | 'lastName' | 'email' | 'company' | 'title'
  | 'text' | 'number' | 'date' | 'checkbox' | 'radio' | 'dropdown'
  | 'note' | 'attachment' | 'approve' | 'decline' | 'formula' | 'drawing';

export type FieldKind = 'sign' | 'auto' | 'input' | 'choice' | 'display' | 'file' | 'action' | 'computed' | 'drawing';

export type ValidationKind = 'none' | 'email' | 'number' | 'date' | 'ssn' | 'zip' | 'phone' | 'regex';
export type Validation = { kind: ValidationKind; pattern?: string; message?: string; maxLength?: number; min?: number; max?: number };
export type CondOp = 'checked' | 'unchecked' | 'equals' | 'notEmpty';
export type Conditional = { fieldId: string; op: CondOp; value?: string };

export interface Field {
  id: string;
  docId: string;
  page: number;
  x: number; y: number; w: number; h: number;
  type: FieldType;
  recipientId: string;
  required: boolean;
  readOnly?: boolean;
  label?: string;          // data label (also used by formulas / CSV export)
  tooltip?: string;
  value?: string;          // default value from sender, or the signer's entry
  placeholder?: string;
  validation?: Validation;
  options?: string[];      // dropdown options
  group?: string;          // radio / checkbox group name
  optionValue?: string;    // value of a single radio button
  groupMin?: number;       // checkbox group selection rules
  groupMax?: number;
  conditional?: Conditional | null;
  fontSize?: number;
  mergeKey?: string;       // auto-fill from the QuickHire driver record
  formula?: string;
  locked?: boolean;        // locked during correction (already signed)
  filledAt?: string;
}

export type RecipientAction = 'sign' | 'in_person' | 'cc' | 'view' | 'approve';
export type RecipientStatus = 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined';

export interface Signature {
  kind: 'typed' | 'drawn' | 'uploaded';
  font?: string;
  name: string;
  initials: string;
  sigUrl: string;       // PNG data URL (transparent)
  iniUrl: string;       // PNG data URL (transparent)
  stampUrl?: string;
  adoptedAt: string;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  action: RecipientAction;
  order: number;
  color: string;
  status: RecipientStatus;
  roleName?: string;          // template role ("Driver", "Carrier Rep")
  privateMessage?: string;
  accessCode?: string;
  smsAuth?: boolean;
  language?: string;          // 'en' | 'es'
  hostName?: string;          // in-person signing host
  hostEmail?: string;
  sentAt?: string; deliveredAt?: string; signedAt?: string; completedAt?: string; declinedAt?: string;
  declineReason?: string;
  consentAt?: string;
  authAt?: string;
  signature?: Signature | null;
  delegatedFrom?: { name: string; email: string; reason?: string; at: string } | null;
  userAgent?: string;
  driverId?: string;
}

export type DocSource = 'pdf' | 'catalog' | 'images';
export interface EDoc {
  id: string;
  name: string;
  source: DocSource;
  blobId?: string;            // IndexedDB blob of the original PDF bytes
  catalogKey?: string;        // built-in QuickHire document
  carrier?: string;           // catalog documents render the carrier name
  imageBlobIds?: string[];    // legacy v1 uploads (rasterized pages)
  legacyImages?: string[];    // legacy data URLs pending move to IndexedDB
  pages: { w: number; h: number }[];
  size?: number;
  sha256?: string;
}

export interface AuditEvent { id: string; at: string; event: string; actor: string; actorEmail?: string; detail: string; recipientId?: string; ua?: string }
export interface Comment { id: string; at: string; author: string; authorEmail?: string; text: string; recipientId?: string }

export type EnvStatus = 'draft' | 'sent' | 'viewed' | 'partially_signed' | 'completed' | 'declined' | 'voided' | 'expired' | 'correcting';

export interface Envelope {
  id: string;
  title: string;
  status: EnvStatus;
  documents: EDoc[];
  recipients: Recipient[];
  fields: Field[];
  subject: string;
  message: string;
  signingOrder: boolean;
  reminders: { enabled: boolean; everyDays: number; lastAt?: string };
  remindersSent: number;
  maxReminders: number;
  expireDays: number;
  expiresAt: string;
  warnDays: number;
  driverId?: string;
  leadId?: string;
  driverName: string;
  carrier: string;
  templateId?: string;
  batchId?: string;
  selfSign?: boolean;
  folder?: string;            // custom folder id
  deletedAt?: string | null;
  createdAt: string; updatedAt: string; lastActivity: string;
  sentAt?: string; completedAt?: string; voidedAt?: string; voidReason?: string; declinedAt?: string; declineReason?: string;
  audit: AuditEvent[];
  comments: Comment[];
  certificate?: { completedAt: string; sealId: string; docHash?: string } | null;
  signedFileId?: string;
  staleNotifiedAt?: string;
  sender: { name: string; email: string };
  version: 2;
}

export interface TemplateRole { id: string; roleName: string; name: string; email: string; action: RecipientAction; order: number; color: string; accessCode?: string; privateMessage?: string }
export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  carrier?: string;
  documents: EDoc[];
  roles: TemplateRole[];
  fields: Field[];
  subject: string;
  message: string;
  signingOrder: boolean;
  reminders: { enabled: boolean; everyDays: number };
  expireDays: number;
  status: 'active' | 'archived';
  usageCount: number;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
  favorite?: boolean;
}

/* ───────────────────────── field catalog ───────────────────────── */
export const FIELD_DEFS: Record<FieldType, { label: string; icon: string; w: number; h: number; kind: FieldKind; group: string; phase2?: boolean }> = {
  signature: { label: 'Signature', icon: 'sign', w: 170, h: 40, kind: 'sign', group: 'Signature' },
  initial: { label: 'Initial', icon: 'initial', w: 64, h: 40, kind: 'sign', group: 'Signature' },
  stamp: { label: 'Stamp', icon: 'stamp', w: 130, h: 70, kind: 'sign', group: 'Signature' },
  dateSigned: { label: 'Date Signed', icon: 'calendar', w: 120, h: 24, kind: 'auto', group: 'Signature' },
  fullName: { label: 'Full Name', icon: 'user', w: 170, h: 24, kind: 'auto', group: 'Recipient' },
  firstName: { label: 'First Name', icon: 'user', w: 120, h: 24, kind: 'auto', group: 'Recipient' },
  lastName: { label: 'Last Name', icon: 'user', w: 120, h: 24, kind: 'auto', group: 'Recipient' },
  email: { label: 'Email', icon: 'mail', w: 190, h: 24, kind: 'auto', group: 'Recipient' },
  company: { label: 'Company', icon: 'building', w: 170, h: 24, kind: 'input', group: 'Recipient' },
  title: { label: 'Title', icon: 'briefcase', w: 150, h: 24, kind: 'input', group: 'Recipient' },
  text: { label: 'Text', icon: 'text', w: 170, h: 24, kind: 'input', group: 'Fields' },
  number: { label: 'Number', icon: 'hash', w: 100, h: 24, kind: 'input', group: 'Fields' },
  date: { label: 'Date', icon: 'calendar', w: 110, h: 24, kind: 'input', group: 'Fields' },
  checkbox: { label: 'Checkbox', icon: 'checkSquare', w: 18, h: 18, kind: 'choice', group: 'Fields' },
  radio: { label: 'Radio Group', icon: 'radio', w: 18, h: 18, kind: 'choice', group: 'Fields' },
  dropdown: { label: 'Dropdown', icon: 'chevronDown', w: 150, h: 24, kind: 'choice', group: 'Fields' },
  note: { label: 'Note', icon: 'message', w: 190, h: 50, kind: 'display', group: 'Fields' },
  attachment: { label: 'Attachment', icon: 'paperclip', w: 150, h: 28, kind: 'file', group: 'Fields' },
  approve: { label: 'Approve', icon: 'thumbsUp', w: 90, h: 28, kind: 'action', group: 'Actions' },
  decline: { label: 'Decline', icon: 'ban', w: 90, h: 28, kind: 'action', group: 'Actions' },
  formula: { label: 'Formula', icon: 'sigma', w: 110, h: 24, kind: 'computed', group: 'Advanced', phase2: true },
  drawing: { label: 'Drawing', icon: 'pencil', w: 220, h: 120, kind: 'drawing', group: 'Advanced', phase2: true },
};
export const FIELD_TYPES = Object.keys(FIELD_DEFS) as FieldType[];
export const FIELD_GROUPS = ['Signature', 'Recipient', 'Fields', 'Actions', 'Advanced'];

/** Types a signer actively completes (as opposed to auto/display/computed). */
export function isInputType(t: FieldType) { const k = FIELD_DEFS[t]?.kind; return k === 'sign' || k === 'input' || k === 'choice' || k === 'file' || k === 'action' || k === 'drawing'; }

/* ───────────────────────── recipient actions ───────────────────────── */
export const ACTIONS: { value: RecipientAction; label: string; short: string; desc: string; icon: string }[] = [
  { value: 'sign', label: 'Needs to sign', short: 'Signer', desc: 'Signs and fills fields assigned to them.', icon: 'sign' },
  { value: 'in_person', label: 'In-person signer', short: 'In person', desc: 'Signs on your device while you host the session.', icon: 'users' },
  { value: 'cc', label: 'Receives a copy', short: 'CC', desc: 'Gets a copy of the completed envelope.', icon: 'copy' },
  { value: 'view', label: 'Needs to view', short: 'Viewer', desc: 'Must open and review; no fields.', icon: 'eye' },
  { value: 'approve', label: 'Approver', short: 'Approver', desc: 'Approves or declines; can fill assigned fields.', icon: 'thumbsUp' },
];
export const actionLabel = (a: RecipientAction) => ACTIONS.find((x) => x.value === a)?.label || a;
/** Recipients that must do something before the envelope can complete. */
export const isActionable = (r: Pick<Recipient, 'action'>) => r.action !== 'cc';
/** Recipients that can be assigned fields. */
export const canHaveFields = (r: Pick<Recipient, 'action'>) => r.action === 'sign' || r.action === 'in_person' || r.action === 'approve';
export const isDone = (r: Pick<Recipient, 'status'>) => r.status === 'signed' || r.status === 'completed';

export const RECIPIENT_COLORS = ['#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF2D55', '#00A5B5', '#B8860B', '#5856D6'];
export function colorForIndex(i: number) { return RECIPIENT_COLORS[((i % RECIPIENT_COLORS.length) + RECIPIENT_COLORS.length) % RECIPIENT_COLORS.length]; }

/* ───────────────────────── routing order ───────────────────────── */
/** Effective routing order: everyone is order 1 when signing order is off. */
export function effectiveOrder(env: Pick<Envelope, 'signingOrder'>, r: Pick<Recipient, 'order'>) {
  return env.signingOrder ? Math.max(1, Math.floor(Number(r.order) || 1)) : 1;
}

/** The routing order currently in progress, or null when every actionable recipient is done. */
export function currentRoutingOrder(env: Pick<Envelope, 'signingOrder' | 'recipients'>): number | null {
  const pending = env.recipients.filter((r) => isActionable(r) && !isDone(r) && r.status !== 'declined');
  if (!pending.length) return null;
  return Math.min(...pending.map((r) => effectiveOrder(env, r)));
}

/** Recipients who can act right now (same order number = parallel). */
export function activeRecipients(env: Pick<Envelope, 'signingOrder' | 'recipients' | 'status'>): Recipient[] {
  if (!['sent', 'viewed', 'partially_signed', 'correcting'].includes(env.status)) return [];
  const cur = currentRoutingOrder(env);
  if (cur == null) return [];
  return env.recipients.filter((r) => isActionable(r) && !isDone(r) && r.status !== 'declined' && effectiveOrder(env, r) === cur);
}

/** Distinct routing steps in order: [[order, recipients[]], ...]. */
export function routingSteps(env: Pick<Envelope, 'signingOrder' | 'recipients'>): [number, Recipient[]][] {
  const m = new Map<number, Recipient[]>();
  for (const r of env.recipients) { const o = effectiveOrder(env, r); if (!m.has(o)) m.set(o, []); m.get(o)!.push(r); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Advance routing after a change: newly active recipients get `sent`, carbon
 * copies at or before the current step get their copy. Returns the recipients
 * that were just notified and whether every actionable recipient is done.
 */
export function advanceRouting(env: Envelope, at = nowIso()): { notified: Recipient[]; complete: boolean } {
  const cur = currentRoutingOrder(env);
  const notified: Recipient[] = [];
  if (cur == null) {
    for (const r of env.recipients) if (r.action === 'cc' && r.status !== 'completed') { r.status = 'completed'; r.sentAt = r.sentAt || at; r.completedAt = at; notified.push(r); }
    const declined = env.recipients.some((r) => r.status === 'declined');
    return { notified, complete: !declined && env.recipients.some(isActionable) };
  }
  for (const r of env.recipients) {
    const o = effectiveOrder(env, r);
    if (r.action === 'cc') { if (o <= cur && r.status === 'created') { r.status = 'completed'; r.sentAt = at; r.completedAt = at; notified.push(r); } continue; }
    if (o === cur && r.status === 'created') { r.status = 'sent'; r.sentAt = at; notified.push(r); }
  }
  return { notified, complete: false };
}

/** Recompute the envelope status from recipient progress (non-terminal states only). */
export function deriveStatus(env: Pick<Envelope, 'status' | 'recipients'>): EnvStatus {
  if (['draft', 'completed', 'declined', 'voided', 'expired', 'correcting'].includes(env.status)) return env.status;
  const act = env.recipients.filter(isActionable);
  if (act.some((r) => r.status === 'declined')) return 'declined';
  if (act.length && act.every(isDone)) return 'completed';
  if (act.some(isDone)) return 'partially_signed';
  if (act.some((r) => r.status === 'delivered')) return 'viewed';
  return 'sent';
}

/* ───────────────────────── field values / visibility ───────────────────────── */
export type Values = Record<string, string | undefined>;
const truthy = (v?: string) => !!v && v !== 'false' && v !== '0' && v !== 'off';
export const isChecked = truthy;

/** Value of a radio group: the optionValue of the selected button. */
export function radioGroupValue(fields: Field[], group: string, recipientId: string, values: Values): string {
  const on = fields.find((f) => f.type === 'radio' && f.group === group && f.recipientId === recipientId && truthy(values[f.id]));
  return on ? (on.optionValue || '') : '';
}

/** Value used by conditional logic for a parent field. */
export function logicalValue(parent: Field, fields: Field[], values: Values): string {
  if (parent.type === 'radio' && parent.group) return radioGroupValue(fields, parent.group, parent.recipientId, values);
  return String(values[parent.id] ?? '');
}

export function conditionMet(cond: Conditional, parent: Field, fields: Field[], values: Values): boolean {
  const v = logicalValue(parent, fields, values);
  switch (cond.op) {
    case 'checked': return truthy(v);
    case 'unchecked': return !truthy(v);
    case 'notEmpty': return v.trim() !== '';
    case 'equals': return v.trim().toLowerCase() === String(cond.value ?? '').trim().toLowerCase();
    default: return true;
  }
}

/** Conditional visibility, cascading through parents (cycle safe). */
export function isVisible(field: Field, fields: Field[], values: Values, depth = 0): boolean {
  const c = field.conditional;
  if (!c || !c.fieldId) return true;
  if (depth > 12) return false;
  const parent = fields.find((f) => f.id === c.fieldId);
  if (!parent) return true;
  if (!isVisible(parent, fields, values, depth + 1)) return false;
  return conditionMet(c, parent, fields, values);
}

/* ───────────────────────── validation ───────────────────────── */
export const VALIDATIONS: { value: ValidationKind; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'email', label: 'Email' }, { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' }, { value: 'ssn', label: 'SSN' }, { value: 'zip', label: 'ZIP code' },
  { value: 'phone', label: 'Phone' }, { value: 'regex', label: 'Custom (regex)' },
];

export function parseDate(s: string): Date | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let mm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) { m = +mm[1]; d = +mm[2]; y = +mm[3]; if (y < 100) y += 2000; }
  else return null;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

/** Returns a human message when `value` breaks the field's rules, else null. Empty values are handled by `required`. */
export function validateValue(field: Pick<Field, 'type' | 'validation'>, value?: string): string | null {
  const v = String(value ?? '');
  if (!v.trim()) return null;
  const val = field.validation || { kind: 'none' as ValidationKind };
  if (val.maxLength && v.length > val.maxLength) return `Use ${val.maxLength} characters or fewer.`;
  let kind: ValidationKind = val.kind || 'none';
  if (kind === 'none') kind = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'none';
  const msg = (fallback: string) => val.message?.trim() || fallback;
  switch (kind) {
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : msg('Enter a valid email address.');
    case 'number': {
      const n = Number(v.replace(/[,\s$]/g, ''));
      if (!/^-?[\d,\s$]*\.?\d+$/.test(v.trim()) || Number.isNaN(n)) return msg('Enter a number.');
      if (val.min != null && n < val.min) return msg(`Enter ${val.min} or more.`);
      if (val.max != null && n > val.max) return msg(`Enter ${val.max} or less.`);
      return null;
    }
    case 'date': return parseDate(v) ? null : msg('Enter a date like 01/31/2026.');
    case 'ssn': return /^\d{3}-?\d{2}-?\d{4}$/.test(v.trim()) ? null : msg('Enter a 9-digit SSN (123-45-6789).');
    case 'zip': return /^\d{5}(-\d{4})?$/.test(v.trim()) ? null : msg('Enter a 5-digit ZIP (or ZIP+4).');
    case 'phone': return v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length === 10 ? null : msg('Enter a 10-digit phone number.');
    case 'regex': {
      if (!val.pattern) return null;
      try { return new RegExp(`^(?:${val.pattern})$`).test(v) ? null : msg('This value is not in the expected format.'); }
      catch { return null; }
    }
    default: return null;
  }
}

/* ───────────────────────── formulas (phase 2) ───────────────────────── */
/** Safe arithmetic over [Data Label] references: + - * / ( ). Returns null when invalid. */
export function evalFormula(expr: string, byLabel: Record<string, number>): number | null {
  const src = String(expr || '');
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const num = (): number | null => {
    ws();
    if (src[i] === '(') { i++; const v = add(); ws(); if (src[i] !== ')') return null; i++; return v; }
    if (src[i] === '-') { i++; const v = num(); return v == null ? null : -v; }
    if (src[i] === '[') { const j = src.indexOf(']', i); if (j < 0) return null; const key = src.slice(i + 1, j).trim().toLowerCase(); i = j + 1; const hit = Object.keys(byLabel).find((k) => k.toLowerCase() === key); return hit != null ? byLabel[hit] : 0; }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i)); if (!m) return null; i += m[0].length; return parseFloat(m[0]);
  };
  const mul = (): number | null => { let l = num(); if (l == null) return null; for (;;) { ws(); const op = src[i]; if (op !== '*' && op !== '/') return l; i++; const r = num(); if (r == null) return null; l = op === '*' ? l * r : (r === 0 ? null as any : l / r); if (l == null) return null; } };
  const add = (): number | null => { let l = mul(); if (l == null) return null; for (;;) { ws(); const op = src[i]; if (op !== '+' && op !== '-') return l; i++; const r = mul(); if (r == null) return null; l = op === '+' ? l + r : l - r; } };
  if (!src.trim()) return null;
  const out = add(); ws();
  if (out == null || i < src.length || !Number.isFinite(out)) return null;
  return Math.round(out * 1e6) / 1e6;
}

export function numericByLabel(fields: Field[], values: Values): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fields) {
    if (!f.label) continue;
    const raw = f.type === 'checkbox' ? (truthy(values[f.id]) ? '1' : '0') : String(values[f.id] ?? '');
    const n = Number(raw.replace(/[,\s$]/g, ''));
    out[f.label] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

/* ───────────────────────── auto values ───────────────────────── */
export function splitName(name: string) { const p = String(name || '').trim().split(/\s+/); return { first: p[0] || '', last: p.length > 1 ? p[p.length - 1] : '' }; }
export function fmtSignedDate(iso: string) { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; }

/** Value shown for auto fields (filled from the recipient at signing time). */
export function autoValue(f: Field, r: Pick<Recipient, 'name' | 'email'> | undefined, at = nowIso()): string {
  if (!r) return '';
  switch (f.type) {
    case 'dateSigned': return fmtSignedDate(at);
    case 'fullName': return r.name;
    case 'firstName': return splitName(r.name).first;
    case 'lastName': return splitName(r.name).last;
    case 'email': return r.email;
    default: return '';
  }
}

/* ───────────────────────── required-field completion ───────────────────────── */
export interface Completion { total: number; done: number; missing: Field[]; errors: { field: Field; message: string }[]; complete: boolean }

/** What a recipient still has to do. Radio groups and checkbox groups count once. */
export function completion(fields: Field[], recipientId: string, values: Values): Completion {
  const mine = fields.filter((f) => f.recipientId === recipientId && !f.readOnly && isVisible(f, fields, values));
  const missing: Field[] = [];
  const errors: { field: Field; message: string }[] = [];
  let total = 0, done = 0;
  const seenGroups = new Set<string>();
  for (const f of mine) {
    const k = FIELD_DEFS[f.type]?.kind;
    if (!k || k === 'auto' || k === 'display' || k === 'computed' || f.type === 'decline') continue;
    if (f.type === 'radio' && f.group) {
      const key = 'r:' + f.group; if (seenGroups.has(key)) continue; seenGroups.add(key);
      const groupFields = mine.filter((x) => x.type === 'radio' && x.group === f.group);
      if (!groupFields.some((x) => x.required)) continue;
      total++; if (radioGroupValue(fields, f.group, recipientId, values)) done++; else missing.push(groupFields[0]);
      continue;
    }
    if (f.type === 'checkbox' && f.group) {
      const key = 'c:' + f.group; if (seenGroups.has(key)) continue; seenGroups.add(key);
      const gf = mine.filter((x) => x.type === 'checkbox' && x.group === f.group);
      const lead = gf[0];
      const min = lead.groupMin != null ? lead.groupMin : (gf.some((x) => x.required) ? 1 : 0);
      const max = lead.groupMax != null && lead.groupMax > 0 ? lead.groupMax : Infinity;
      const n = gf.filter((x) => truthy(values[x.id])).length;
      if (min === 0 && max === Infinity) continue;
      total++;
      if (n < min) missing.push(lead);
      else if (n > max) errors.push({ field: lead, message: `Select no more than ${max}.` });
      else done++;
      continue;
    }
    const v = values[f.id];
    const filled = f.type === 'checkbox' ? truthy(v) : !!String(v ?? '').trim();
    if (filled && (k === 'input' || f.type === 'text')) { const e = validateValue(f, v); if (e) errors.push({ field: f, message: e }); }
    if (!f.required) continue;
    total++;
    if (filled) done++; else missing.push(f);
  }
  return { total, done, missing, errors, complete: missing.length === 0 && errors.length === 0 };
}

/** Sort fields in reading order (document, page, top-to-bottom, left-to-right). */
export function readingOrder(fields: Field[], docOrder: string[]): Field[] {
  const di = (id: string) => { const i = docOrder.indexOf(id); return i < 0 ? 999 : i; };
  return [...fields].sort((a, b) => di(a.docId) - di(b.docId) || a.page - b.page || (Math.abs(a.y - b.y) > 6 ? a.y - b.y : a.x - b.x));
}

/* ───────────────────────── merge fields ───────────────────────── */
export const MERGE_FIELDS: { key: string; label: string; w?: number }[] = [
  { key: 'driver.name', label: 'Driver name' },
  { key: 'driver.firstName', label: 'First name' },
  { key: 'driver.lastName', label: 'Last name' },
  { key: 'driver.phone', label: 'Phone' },
  { key: 'driver.email', label: 'Email', w: 190 },
  { key: 'driver.address', label: 'Address', w: 220 },
  { key: 'driver.cdlNumber', label: 'CDL number' },
  { key: 'driver.cdlState', label: 'CDL state', w: 70 },
  { key: 'driver.cdlClass', label: 'CDL class', w: 70 },
  { key: 'emp.position', label: 'Position' },
  { key: 'emp.payRate', label: 'Pay rate', w: 120 },
  { key: 'emp.startDate', label: 'Start date', w: 110 },
  { key: 'carrier.name', label: 'Carrier', w: 220 },
  { key: 'carrier.dot', label: 'Carrier DOT #', w: 110 },
  { key: 'carrier.mc', label: 'Carrier MC #', w: 110 },
  { key: 'carrier.address', label: 'Carrier address', w: 220 },
];
export const mergeLabel = (key: string) => MERGE_FIELDS.find((m) => m.key === key)?.label || key;

export interface Person { kind?: 'driver' | 'lead'; id?: string; name: string; email?: string; phone?: string; address?: string; cdlNumber?: string; cdlState?: string; cdlClass?: string; position?: string; payRate?: string; startDate?: string; carrier?: string; carrierInfo?: { name?: string; dot?: string; mc?: string; address?: string } | null }
/** Merge data record for a QuickHire driver/lead. */
export function personMergeData(p: Person | null | undefined): Record<string, string> {
  if (!p) return {};
  const { first, last } = splitName(p.name);
  const c = p.carrierInfo || {};
  const out: Record<string, string> = {
    'driver.name': p.name || '', 'driver.firstName': first, 'driver.lastName': last, 'driver.phone': p.phone || '', 'driver.email': p.email || '',
    'driver.address': p.address || '', 'driver.cdlNumber': p.cdlNumber || '', 'driver.cdlState': p.cdlState || '', 'driver.cdlClass': p.cdlClass ? `Class ${String(p.cdlClass).replace(/^class\s*/i, '')}` : '',
    'emp.position': p.position || '', 'emp.payRate': p.payRate || '', 'emp.startDate': p.startDate || '',
    'carrier.name': c.name || p.carrier || '', 'carrier.dot': c.dot || '', 'carrier.mc': c.mc || '', 'carrier.address': c.address || '',
  };
  return out;
}

/** Fill merge fields from a data record. Missing data leaves the sender default untouched and is reported. */
export function fillMerge(fields: Field[], data: Record<string, string | undefined>): { fields: Field[]; missing: string[] } {
  const missing = new Set<string>();
  const out = fields.map((f) => {
    if (!f.mergeKey) return f;
    const v = data[f.mergeKey];
    if (v == null || String(v).trim() === '') { missing.add(f.mergeKey); return f; }
    return { ...f, value: String(v) };
  });
  return { fields: out, missing: [...missing] };
}

/** Replace {driver}, {carrier}, {first} placeholders in subject/message text. */
export function fillText(s: string, data: Record<string, string | undefined>) {
  return String(s || '').replace(/\{(driver|first|carrier|position)\}/g, (_m, k) => String((k === 'driver' ? data['driver.name'] : k === 'first' ? data['driver.firstName'] : k === 'carrier' ? data['carrier.name'] : data['emp.position']) || ''));
}

/* ───────────────────────── templates ───────────────────────── */
export interface Assignee { name: string; email: string; phone?: string; driverId?: string }

/** Turn a template into envelope parts: roles become recipients, field recipient ids are remapped. */
export function instantiateTemplate(t: Template, assign: Record<string, Assignee | undefined>, mergeData: Record<string, string | undefined> = {}) {
  const map: Record<string, string> = {};
  const recipients: Recipient[] = t.roles.map((role) => {
    const a = assign[role.id];
    const id = uid('r'); map[role.id] = id;
    return { id, name: a?.name ?? role.name ?? '', email: a?.email ?? role.email ?? '', phone: a?.phone, action: role.action, order: role.order, color: role.color, status: 'created', roleName: role.roleName, accessCode: role.accessCode, privateMessage: role.privateMessage, driverId: a?.driverId };
  });
  const docMap: Record<string, string> = {};
  const documents: EDoc[] = t.documents.map((d) => { const id = uid('doc'); docMap[d.id] = id; return { ...d, id, legacyImages: undefined }; });
  const idMap: Record<string, string> = {};
  let fields: Field[] = t.fields.map((f) => { const id = uid('f'); idMap[f.id] = id; return { ...f, id, docId: docMap[f.docId] || f.docId, recipientId: map[f.recipientId] || f.recipientId }; });
  fields = fields.map((f) => (f.conditional ? { ...f, conditional: { ...f.conditional, fieldId: idMap[f.conditional.fieldId] || f.conditional.fieldId } } : f));
  const filled = fillMerge(fields, mergeData);
  return { recipients, documents, fields: filled.fields, missingMerge: filled.missing, subject: fillText(t.subject, mergeData), message: fillText(t.message, mergeData) };
}

/** Copy fields (new ids) remapping conditional references within the copied set. */
export function cloneFields(fields: Field[], patch: (f: Field) => Partial<Field> = () => ({})): Field[] {
  const idMap: Record<string, string> = {};
  const out = fields.map((f) => { const id = uid('f'); idMap[f.id] = id; return { ...f, ...patch(f), id }; });
  return out.map((f) => (f.conditional && idMap[f.conditional.fieldId] ? { ...f, conditional: { ...f.conditional, fieldId: idMap[f.conditional.fieldId] } } : f));
}

/* ───────────────────────── envelope validation (sender) ───────────────────────── */
export function validateForSend(env: Pick<Envelope, 'documents' | 'recipients' | 'fields' | 'subject' | 'expiresAt'>): string[] {
  const errs: string[] = [];
  if (!env.documents.length) errs.push('Add at least one document.');
  if (!env.recipients.length) errs.push('Add at least one recipient.');
  for (const r of env.recipients) {
    const who = r.name?.trim() || r.roleName || 'A recipient';
    if (!r.name?.trim()) errs.push(`${who} needs a name.`);
    if (!r.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email.trim())) errs.push(`${who} needs a valid email.`);
    if (r.smsAuth && (r.phone || '').replace(/\D/g, '').length < 10) errs.push(`${who} needs a mobile number for SMS verification.`);
    if (r.action === 'in_person' && !r.hostName?.trim()) errs.push(`${who} is an in-person signer — add a host.`);
  }
  for (const r of env.recipients.filter((x) => x.action === 'sign' || x.action === 'in_person')) {
    const has = env.fields.some((f) => f.recipientId === r.id && (f.type === 'signature' || f.type === 'initial' || f.type === 'stamp'));
    if (!has) errs.push(`${r.name || r.roleName || 'A signer'} has no signature field.`);
  }
  const ids = new Set(env.recipients.map((r) => r.id));
  if (env.fields.some((f) => !ids.has(f.recipientId))) errs.push('Some fields are not assigned to a recipient.');
  if (!String(env.subject || '').trim()) errs.push('Add an email subject.');
  if (env.expiresAt && +new Date(env.expiresAt) <= Date.now()) errs.push('Expiration must be in the future.');
  return [...new Set(errs)];
}

/* ───────────────────────── manage views ───────────────────────── */
export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#6E6E73', bg: '#F2F2F7' },
  sent: { label: 'Sent', color: '#0066CC', bg: 'rgba(0,122,255,0.11)' },
  viewed: { label: 'Delivered', color: '#0066CC', bg: 'rgba(0,122,255,0.11)' },
  partially_signed: { label: 'In progress', color: '#3F3BB8', bg: 'rgba(88,86,214,0.12)' },
  correcting: { label: 'Correcting', color: '#A05A00', bg: 'rgba(255,159,10,0.14)' },
  completed: { label: 'Completed', color: '#248A3D', bg: 'rgba(52,199,89,0.13)' },
  declined: { label: 'Declined', color: '#C62820', bg: 'rgba(255,59,48,0.11)' },
  voided: { label: 'Voided', color: '#6E6E73', bg: '#F2F2F7' },
  expired: { label: 'Expired', color: '#8E5A00', bg: 'rgba(255,159,10,0.12)' },
  // legacy v1 labels kept so old references still render
  missing_fields: { label: 'Draft', color: '#6E6E73', bg: '#F2F2F7' },
  needs_action: { label: 'Sent', color: '#0066CC', bg: 'rgba(0,122,255,0.11)' },
  failed: { label: 'Draft', color: '#6E6E73', bg: '#F2F2F7' },
  expiring_soon: { label: 'Sent', color: '#0066CC', bg: 'rgba(0,122,255,0.11)' },
};
export const IN_FLIGHT: EnvStatus[] = ['sent', 'viewed', 'partially_signed', 'correcting'];

export function isExpiringSoon(env: Pick<Envelope, 'status' | 'expiresAt' | 'warnDays'>, now = Date.now()) {
  if (!IN_FLIGHT.includes(env.status) || !env.expiresAt) return false;
  const d = (+new Date(env.expiresAt) - now) / 864e5;
  return d > 0 && d <= (env.warnDays || 3);
}
/** Envelopes where the sender must act: their own signature, hosting an in-person signer. */
export function needsSenderAction(env: Envelope): boolean {
  const act = activeRecipients(env);
  const me = (env.sender?.email || '').toLowerCase();
  return act.some((r) => r.action === 'in_person' || (me && r.email.toLowerCase() === me));
}

export type ViewKey = 'inbox' | 'sent' | 'drafts' | 'deleted' | 'action' | 'waiting' | 'expiring' | 'completed' | 'closed' | 'all';
export function inView(env: Envelope, view: ViewKey, now = Date.now()): boolean {
  const deleted = !!env.deletedAt;
  if (view === 'deleted') return deleted;
  if (deleted) return false;
  const me = (env.sender?.email || '').toLowerCase();
  switch (view) {
    case 'all': return true;
    case 'drafts': return env.status === 'draft';
    case 'sent': return env.status !== 'draft' && !env.selfSign;
    case 'inbox': return env.status !== 'draft' && (env.selfSign || env.recipients.some((r) => !!me && r.email.toLowerCase() === me));
    case 'action': return IN_FLIGHT.includes(env.status) && needsSenderAction(env);
    case 'waiting': return IN_FLIGHT.includes(env.status) && !needsSenderAction(env);
    case 'expiring': return isExpiringSoon(env, now);
    case 'completed': return env.status === 'completed';
    case 'closed': return env.status === 'declined' || env.status === 'voided' || env.status === 'expired';
    default: return true;
  }
}

/** Short human status line: "Waiting for Mike Okafor", "Completed", ... */
export function statusLine(env: Envelope): string {
  if (env.status === 'draft') return 'Draft';
  if (env.status === 'completed') return 'Completed';
  if (env.status === 'voided') return `Voided${env.voidReason ? ' — ' + env.voidReason : ''}`;
  if (env.status === 'expired') return 'Expired';
  if (env.status === 'declined') { const r = env.recipients.find((x) => x.status === 'declined'); return `Declined by ${r?.name || 'recipient'}`; }
  const act = activeRecipients(env);
  if (!act.length) return STATUS_META[env.status]?.label || env.status;
  const names = act.map((r) => r.name || r.roleName || 'recipient');
  return `Waiting for ${names.length > 2 ? `${names[0]} and ${names.length - 1} others` : names.join(' and ')}`;
}

/* ───────────────────────── CSV ───────────────────────── */
export function csvEscape(v: any) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

/** Minimal RFC 4180 parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvRecipient { name: string; email: string; phone: string; carrier: string; error?: string }
/** Bulk-send recipient list: header row optional (name,email,phone[,carrier]). */
export function parseRecipientsCsv(text: string): CsvRecipient[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.some((h) => ['name', 'email', 'phone', 'full name', 'e-mail', 'carrier', 'mobile'].includes(h));
  const idx = (names: string[], fallback: number) => { if (!hasHeader) return fallback; const i = head.findIndex((h) => names.includes(h)); return i; };
  const ni = idx(['name', 'full name', 'driver', 'driver name'], 0), ei = idx(['email', 'e-mail', 'email address'], 1), pi = idx(['phone', 'mobile', 'phone number', 'cell'], 2), ci = idx(['carrier', 'company'], 3);
  return rows.slice(hasHeader ? 1 : 0).map((r) => {
    const get = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    const rec: CsvRecipient = { name: get(ni), email: get(ei), phone: get(pi), carrier: get(ci) };
    if (!rec.name) rec.error = 'Missing name';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rec.email)) rec.error = 'Invalid email';
    return rec;
  });
}

/** Export every field's data for an envelope (Manage → Export form data). */
export function formDataCsv(env: Pick<Envelope, 'documents' | 'recipients' | 'fields'>): string {
  const head = ['Document', 'Page', 'Recipient', 'Recipient email', 'Field type', 'Data label', 'Value', 'Required'];
  const docName = (id: string) => env.documents.find((d) => d.id === id)?.name || '';
  const lines = readingOrder(env.fields, env.documents.map((d) => d.id)).map((f) => {
    const r = env.recipients.find((x) => x.id === f.recipientId);
    let value = f.value ?? '';
    if (f.type === 'signature' || f.type === 'initial' || f.type === 'stamp') value = value ? `Signed ${f.filledAt ? new Date(f.filledAt).toISOString() : ''}`.trim() : '';
    if (f.type === 'radio') value = truthy(f.value) ? (f.optionValue || 'Selected') : '';
    if (f.type === 'checkbox') value = truthy(f.value) ? 'Checked' : 'Unchecked';
    if (f.type === 'attachment' && value) { try { value = JSON.parse(value).name || value; } catch { /* plain */ } }
    if (f.type === 'drawing' && value) value = 'Drawing';
    return [docName(f.docId), f.page + 1, r?.name || '', r?.email || '', FIELD_DEFS[f.type]?.label || f.type, f.label || '', value, f.required ? 'Yes' : 'No'].map(csvEscape).join(',');
  });
  return [head.join(','), ...lines].join('\r\n');
}

/* ───────────────────────── v1 → v2 migration ───────────────────────── */
const V1_TYPE: Record<string, FieldType> = { signature: 'signature', initial: 'initial', date: 'dateSigned', text: 'text', checkbox: 'checkbox', radio: 'radio', dropdown: 'dropdown', fullname: 'fullName', email: 'email', company: 'company', title: 'title', attachment: 'attachment', note: 'note', autofill: 'text' };
const V1_ACTION: Record<string, RecipientAction> = { signer: 'sign', cc: 'cc', viewer: 'view', approver: 'approve' };
const V1_RSTATUS: Record<string, RecipientStatus> = { pending: 'sent', viewed: 'delivered', signed: 'signed', declined: 'declined' };
const V1_ENV: Record<string, EnvStatus> = { draft: 'draft', missing_fields: 'draft', failed: 'draft', needs_action: 'sent', sent: 'sent', viewed: 'viewed', partially_signed: 'partially_signed', expiring_soon: 'sent', completed: 'completed', declined: 'declined', voided: 'voided' };
const V1_MERGE: Record<string, string> = { 'driver.name': 'driver.name', 'driver.email': 'driver.email', 'driver.phone': 'driver.phone', 'driver.cdl': 'driver.cdlNumber', 'driver.state': 'driver.cdlState', 'carrier.name': 'carrier.name', 'carrier.dot': 'carrier.dot', 'carrier.mc': 'carrier.mc', 'carrier.address': 'carrier.address', 'emp.position': 'emp.position', 'emp.startDate': 'emp.startDate', 'emp.payRate': 'emp.payRate' };

export interface V1Catalog { [key: string]: { name: string } }

/** Convert one v1 envelope. Catalog docs keep their key; uploads keep their rasterized pages. */
export function migrateEnvelopeV1(e: any, catalog: V1Catalog, sender: { name: string; email: string }): Envelope {
  const docs: EDoc[] = (e.documentKeys || []).map((k: string) => {
    if (String(k).startsWith('upload_')) {
      const up = e.uploads?.[k] || {};
      const pages = (up.pages || []).map((p: any) => ({ w: PAGE_W, h: Math.round(p.h || 880) }));
      return { id: k, name: up.name || 'Uploaded document', source: 'images' as DocSource, legacyImages: (up.pages || []).map((p: any) => p.dataUrl), pages: pages.length ? pages : [{ w: PAGE_W, h: 880 }] };
    }
    return { id: k, name: catalog[k]?.name || k, source: 'catalog' as DocSource, catalogKey: k, carrier: e.carrier || '', pages: [{ w: PAGE_W, h: Math.round(LETTER.h * PT_TO_PX) }] };
  });
  const sent = e.status && !['draft', 'missing_fields', 'failed'].includes(e.status);
  const recipients: Recipient[] = (e.recipients || []).map((r: any, i: number) => ({
    id: r.id || uid('r'), name: r.name || '', email: r.email || '', action: V1_ACTION[r.role] || 'sign', order: r.order || i + 1,
    color: r.color || colorForIndex(i), status: sent ? (V1_RSTATUS[r.status] || 'sent') : 'created', privateMessage: r.message || '',
    sentAt: sent ? e.sentAt || e.createdAt : undefined, signedAt: r.signedAt, deliveredAt: r.status === 'viewed' || r.status === 'signed' ? e.lastActivity : undefined,
  }));
  const fields: Field[] = (e.fields || []).map((f: any) => {
    const doc = docs.find((d) => d.id === f.docKey);
    let page = 0, y = Number(f.y) || 0;
    if (doc && doc.source === 'images') { let acc = 0; for (let p = 0; p < doc.pages.length; p++) { if (y < acc + doc.pages[p].h || p === doc.pages.length - 1) { page = p; y -= acc; break; } acc += doc.pages[p].h; } }
    const type = V1_TYPE[f.type] || 'text';
    const out: Field = { id: f.id || uid('f'), docId: f.docKey, page, x: Number(f.x) || 0, y: Math.max(0, y), w: Number(f.w) || FIELD_DEFS[type].w, h: Number(f.h) || FIELD_DEFS[type].h, type, recipientId: f.recipientId, required: !!f.required, label: f.label || '', tooltip: f.tooltip || '', value: f.value || '', placeholder: f.placeholder || '' };
    if (f.type === 'autofill') { out.mergeKey = V1_MERGE[f.autofill] || f.autofill; out.readOnly = true; }
    if (f.locked) out.readOnly = true;
    if (type === 'radio') { out.group = 'Radio ' + out.id.slice(-4); out.optionValue = 'Yes'; }
    if (type === 'dropdown') out.options = ['Option 1', 'Option 2'];
    return out;
  }).filter((f: Field) => docs.some((d) => d.id === f.docId));
  const status = V1_ENV[e.status] || 'draft';
  return {
    id: e.id || uid('env'), title: e.title || 'Untitled envelope', status, documents: docs, recipients, fields,
    subject: e.subject || '', message: e.message || '', signingOrder: true,
    reminders: { enabled: (e.reminderEveryDays || 0) > 0, everyDays: e.reminderEveryDays || 3 }, remindersSent: e.remindersSent || 0, maxReminders: e.maxReminders || 3,
    expireDays: 14, expiresAt: e.expiresAt || daysFromNow(14), warnDays: 3,
    driverName: e.driverName || '', carrier: e.carrier || '', createdAt: e.createdAt || nowIso(), updatedAt: e.updatedAt || nowIso(), lastActivity: e.lastActivity || e.updatedAt || nowIso(),
    sentAt: sent ? e.sentAt || e.createdAt : undefined, completedAt: status === 'completed' ? e.certificate?.completedAt || e.updatedAt : undefined,
    audit: (e.audit || []).map((a: any) => ({ id: a.id || uid('a'), at: a.at, event: a.event, actor: a.actor || sender.name, detail: a.detail || '' })),
    comments: [], certificate: e.certificate || null, deletedAt: null, sender, version: 2,
  };
}

/** Convert a v1 template (single catalog doc) or package (several catalog docs) into a v2 template. */
export function migrateTemplateV1(t: any, catalog: V1Catalog, isPackage = false): Template {
  const role: TemplateRole = { id: 'role_signer', roleName: 'Driver', name: '', email: '', action: 'sign', order: 1, color: colorForIndex(0) };
  const keys: string[] = isPackage ? t.documentKeys || [] : [t.documentKey].filter(Boolean);
  const documents: EDoc[] = keys.map((k) => ({ id: k, name: catalog[k]?.name || k, source: 'catalog', catalogKey: k, pages: [{ w: PAGE_W, h: Math.round(LETTER.h * PT_TO_PX) }] }));
  const fields: Field[] = (t.fields || []).map((f: any) => {
    const type = V1_TYPE[f.type] || 'text';
    return { id: f.id || uid('f'), docId: f.docKey, page: 0, x: f.x, y: f.y, w: f.w, h: f.h, type, recipientId: role.id, required: !!f.required, label: f.label || '', value: '', mergeKey: f.type === 'autofill' ? V1_MERGE[f.autofill] || f.autofill : undefined, readOnly: f.type === 'autofill' || undefined } as Field;
  }).filter((f: Field) => documents.some((d) => d.id === f.docId));
  return {
    id: t.id || uid('tpl'), name: t.name || 'Template', description: t.description || '', category: t.category || 'Onboarding', documents, roles: [role], fields,
    subject: t.subject || `Please sign: ${t.name || 'documents'}`, message: t.message || '', signingOrder: true, reminders: { enabled: true, everyDays: t.reminderEveryDays || 3 },
    expireDays: t.expiresInDays || 14, status: t.status === 'archived' ? 'archived' : 'active', usageCount: t.usageCount || 0, lastUsed: t.lastUsed || t.updatedAt, createdAt: t.updatedAt || nowIso(), updatedAt: t.updatedAt || nowIso(),
  };
}

/* ───────────────────────── formatting ───────────────────────── */
export function fmtAgo(iso?: string, now = Date.now()) {
  if (!iso) return '—';
  const m = Math.floor((now - +new Date(iso)) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 30) return d + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDate(iso?: string) { if (!iso) return '—'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
export function fmtDateTime(iso?: string) { if (!iso) return '—'; return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
export function daysUntil(iso?: string, now = Date.now()) { if (!iso) return null; return Math.ceil((+new Date(iso) - now) / 864e5); }
export const shortId = (id: string) => String(id || '').replace(/^env_/, '').slice(0, 8).toUpperCase();
