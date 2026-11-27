/* QuickHire Driver Hiring Pipeline (recruiting CRM) — Phase 1 store.
   Separate from the onboarding hire store. Local-first (localStorage): editable
   pipeline stages, lead cards, structured activity/comms, next actions, consent,
   SLA aging, duplicate detection, close reasons + archive reports, boomerang
   re-entry. Every action is logged. */
import React from 'react';
import { svc as shellSvc } from '../shell/store';
import { LEAD_STAGE, LEAD_DEFAULT_STAGES, LEGACY_LEAD_STAGE } from '../pipes/stages';

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const nowIso = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

/* ── users / sources / decisions / reasons ── */
export const USERS = [
  { id: 'NP', name: 'Nina Patel', carrier: 'GRAND ONE LLC', role: 'recruiter' },
  { id: 'DR', name: 'Dana Reed', carrier: 'GRAND ONE LLC', role: 'recruiter' },
  { id: 'SP', name: 'Sam Pike', carrier: 'DT NATIONAL', role: 'manager' },
];
export const SOURCES = [
  { key: 'anna', label: 'Anna AI', icon: 'sparkles' }, { key: 'manual', label: 'Manual entry', icon: 'pencil' },
  { key: 'website', label: 'Website form', icon: 'externalLink' }, { key: 'referral', label: 'Referral', icon: 'users' },
  { key: 'ad', label: 'Ad campaign', icon: 'zap' }, { key: 'import', label: 'Import', icon: 'download' }, { key: 'other', label: 'Other', icon: 'tag' },
];
export const DECISIONS = ['acceptable', 'not_acceptable', 'refused', 'hired', 'needs_review', 'archived'];
export const CLOSE_REASONS = ['Not interested', 'Pay not acceptable', 'Location not acceptable', 'Schedule not acceptable', 'No required license', 'Failed screening', 'Missing documents', 'No response', 'Chose another company', 'Refused offer', 'Not a good fit', 'Other'];
export const INTEREST = { high: { label: 'High interest', color: '#248A3D' }, medium: { label: 'Medium', color: '#A05A00' }, low: { label: 'Low', color: '#8E8E93' }, unknown: { label: 'Unknown', color: '#8E8E93' } } as Record<string, any>;

/* ── score labels ── */
export function scoreLabel(score: number) {
  if (score >= 85) return 'Hot Lead'; if (score >= 70) return 'Good Fit'; if (score >= 55) return 'Needs Review'; if (score >= 40) return 'Low Fit'; return 'Do Not Proceed';
}
export const SCORE_META: Record<string, { color: string; bg: string }> = {
  'Hot Lead': { color: '#FF375F', bg: 'rgba(255,55,95,0.12)' },
  'Good Fit': { color: '#248A3D', bg: 'rgba(48,209,88,0.14)' },
  'Needs Review': { color: '#A05A00', bg: 'rgba(255,159,10,0.16)' },
  'Low Fit': { color: '#6E6E73', bg: '#F2F2F7' },
  'Do Not Proceed': { color: '#C62820', bg: 'rgba(255,69,58,0.12)' },
};
export function computeScore(l: any) {
  let s = 40;
  s += Math.min(20, (l.experienceYears || 0) * 4);
  if (l.licenseType && /A/i.test(l.licenseType)) s += 12; else if (l.licenseType) s += 6;
  if (l.availability === 'immediate') s += 10; else if (l.availability === '2weeks') s += 6;
  if (l.interest === 'high') s += 14; else if (l.interest === 'medium') s += 6; else if (l.interest === 'low') s -= 6;
  if ((l.location || '').match(/TX|Dallas|Houston/i)) s += 6;
  if (l.consent?.doNotContact) s -= 20;
  const replied = (l.activities || []).some((a: any) => a.direction === 'inbound');
  if (replied) s += 8;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/* ── default stages (editable) — schema v2 = the Leads lifecycle pipeline ── */
const defaultStages = () => LEAD_DEFAULT_STAGES.map(([name, maxDays, outcome], i) => ({ id: uid('stg'), name, order: i, maxDays, disabled: false, terminal: !!outcome, outcome }));

/* ── persistence ── */
const LS = 'qh_recruit_v1';
const SCHEMA = 2;
function load(): any | null { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch { return null; } }
function persist() { try { localStorage.setItem(LS, JSON.stringify({ schema: SCHEMA, stages: store.stages, leads: store.leads, automations: store.automations, meta: store.meta })); } catch { /* quota */ } }

/* Schema v1 → v2: collapse the 13-stage funnel into New lead · Attempting
   contact · Contacted · Qualified (+ Not qualified / Moved to Hiring). Custom
   stages a user added are kept (after Qualified). Idempotent. */
function migrateToV2() {
  const known = new Set<string>(LEAD_DEFAULT_STAGES.map(([n]) => n));
  const custom = (store.stages || []).filter((s: any) => !LEGACY_LEAD_STAGE[s.name] && !known.has(s.name) && !s.terminal);
  const base = defaultStages();
  const qi = base.findIndex((s) => s.name === LEAD_STAGE.QUALIFIED);
  const stages = [...base.slice(0, qi + 1), ...custom.map((s: any) => ({ ...s, outcome: '' })), ...base.slice(qi + 1)].map((s, i) => ({ ...s, order: i }));
  const names = new Set(stages.map((s) => s.name));
  store.stages = stages;
  for (const l of store.leads || []) {
    const mapped = LEGACY_LEAD_STAGE[l.stageName] || (names.has(l.stageName) ? l.stageName : LEAD_STAGE.NEW);
    if (mapped === LEAD_STAGE.NOT_QUALIFIED && !l.lostFrom) l.lostFrom = null;
    l.stageName = l.archived ? LEAD_STAGE.ARCHIVED : mapped;
    if (!Array.isArray(l.tasks)) l.tasks = [];
  }
  const aa = (store.automations || []).find((a: any) => a.id === 'autoadvance');
  if (aa) { aa.name = 'Auto-qualify when documents are received'; aa.desc = 'Move "Contacted" leads whose documents are all received to "Qualified".'; }
}

const DEFAULT_AUTOMATIONS = [
  { id: 'sla_flag', name: 'Flag SLA breaches', desc: 'Flag leads past their stage SLA as no-response.', enabled: true },
  { id: 'escalate_stale', name: 'Escalate stalled leads', desc: 'Escalate leads over 2× their stage SLA to the owner.', enabled: true },
  { id: 'rescore', name: 'Recompute driver scores', desc: 'Refresh every lead score from the latest activity.', enabled: true },
  { id: 'autoadvance', name: 'Auto-qualify when documents are received', desc: 'Move "Contacted" leads whose documents are all received to "Qualified".', enabled: false },
];

/* ── seed ── */
function mkLead(p: any) {
  const l = {
    id: uid('lead'), name: p.name, phone: p.phone, email: p.email || '', location: p.location || 'Dallas, TX',
    licenseType: p.licenseType || 'Class A', experienceYears: p.experienceYears ?? 3, availability: p.availability || 'immediate',
    source: p.source || 'manual', stageName: p.stageName, ownerId: p.ownerId || 'NP', interest: p.interest || 'unknown',
    consent: p.consent || { status: 'not_asked', at: null, channel: null, doNotContact: false },
    nextAction: p.nextAction || { title: 'Call driver', assignee: p.ownerId || 'NP', due: daysAgo(p.overdue ? 1 : -1), priority: 'normal', status: 'open' },
    annaSummary: p.annaSummary || '', screening: p.screening || { cdlValid: null, mvrClear: null, medical: null, notes: '' },
    documents: p.documents || [{ name: 'Driver Application', status: 'requested' }, { name: 'CDL', status: 'missing' }, { name: 'Medical Card', status: 'missing' }],
    tasks: [], decision: p.decision || null, closeReason: null, archived: false, archiveReport: null, canContactAgain: true, previousApplication: null,
    carrier: USERS.find((u) => u.id === (p.ownerId || 'NP'))?.carrier || 'GRAND ONE LLC',
    flags: p.flags || [], createdAt: p.createdAt || daysAgo(p.age ?? 2), stageSince: p.stageSince || daysAgo(p.stageAge ?? 1),
    activities: p.activities || [{ id: uid('a'), type: 'lead', title: 'Lead created', detail: `Source: ${p.source || 'manual'}`, at: p.createdAt || daysAgo(p.age ?? 2), user: 'System' }],
    example: !!p.example, convertedTo: null, convertedAt: null, lostFrom: p.lostFrom || null, lane: p.lane || '',
  } as any;
  if (p.closeReason) { l.closeReason = p.closeReason; l.decision = 'not_acceptable'; }
  l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score);
  return l;
}
function seedLeads() {
  return [
    mkLead({ name: 'Marcus Bell', phone: '+1 469-555-0188', email: 'marcus.bell@example.com', source: 'anna', stageName: LEAD_STAGE.ATTEMPTING, ownerId: 'NP', interest: 'high', experienceYears: 5, annaSummary: 'Driver replied within 3 min, very interested in OTR dry van. Asked about pay and home time.', activities: [{ id: uid('a'), type: 'comm', channel: 'sms', direction: 'inbound', outcome: 'replied', title: 'Driver replied — interested', at: daysAgo(1), user: 'Anna' }, { id: uid('a'), type: 'anna', channel: 'sms', direction: 'outbound', title: 'Anna sent intro message', at: new Date(Date.now() - 864e5 - 3 * 6e4).toISOString(), user: 'Anna' }, { id: uid('a'), type: 'lead', title: 'Lead created by Anna AI', detail: 'Ad campaign → website', at: new Date(Date.now() - 864e5 - 5 * 6e4).toISOString(), user: 'Anna' }], createdAt: new Date(Date.now() - 864e5 - 5 * 6e4).toISOString(), consent: { status: 'in', at: daysAgo(1), channel: 'sms', doNotContact: false } }),
    mkLead({ name: 'Robert Johnson', phone: '+1 214-555-0101', email: 'rj@example.com', source: 'referral', stageName: LEAD_STAGE.ATTEMPTING, ownerId: 'NP', interest: 'medium', experienceYears: 4, overdue: true, stageAge: 4 }),
    mkLead({ name: 'Tracy Bowman', phone: '+1 305-555-0106', email: 'tb@example.com', source: 'website', stageName: LEAD_STAGE.NEW, ownerId: 'SP', interest: 'unknown', experienceYears: 1, location: 'Miami, FL' }),
    mkLead({ name: 'Kevin Brooks', phone: '+1 214-555-0107', email: 'kb@example.com', source: 'ad', stageName: LEAD_STAGE.CONTACTED, ownerId: 'DR', interest: 'high', experienceYears: 7 }),
    mkLead({ name: 'Aisha Bello', phone: '+1 404-555-0140', email: 'ab@example.com', source: 'anna', stageName: LEAD_STAGE.CONTACTED, ownerId: 'DR', interest: 'medium', experienceYears: 3, stageAge: 4 }),
    mkLead({ name: 'Derek Hill', phone: '+1 214-555-0103', email: 'dh@example.com', source: 'referral', stageName: LEAD_STAGE.QUALIFIED, ownerId: 'NP', interest: 'high', experienceYears: 6 }),
    mkLead({ name: 'Linda Martinez', phone: '+1 214-555-0102', email: 'lm@example.com', source: 'manual', stageName: LEAD_STAGE.QUALIFIED, ownerId: 'NP', interest: 'medium', experienceYears: 2 }),
    mkLead({ name: 'Carlos Mendez', phone: '+1 214-555-0130', email: 'cm@example.com', source: 'website', stageName: LEAD_STAGE.CONTACTED, ownerId: 'DR', interest: 'high', experienceYears: 8 }),
  ];
}

/* Example leads (flagged `example: true`) so every Leads column tells a story:
   brand-new leads, multi-attempt contact, screening, qualified, and lost. */
function exampleLeads() {
  const m = (min: number) => new Date(Date.now() - min * 6e4).toISOString();
  const H = 60, D = 1440;
  const act = (type: string, title: string, min: number, extra: any = {}) => ({ id: uid('a'), type, title, at: m(min), user: extra.user || 'Nina Patel', ...extra });
  const out = (ch: string, min: number, outcome = 'no answer', user = 'Nina Patel') => act('comm', `Outbound ${ch} — ${outcome}`, min, { channel: ch, direction: 'outbound', outcome, user });
  const inb = (ch: string, min: number, outcome = 'replied') => act('comm', `Inbound ${ch} — ${outcome}`, min, { channel: ch, direction: 'inbound', outcome });
  const created = (src: string, min: number) => act('lead', 'Lead created', min, { detail: `Source: ${src}`, user: 'System' });
  const due = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const na = (title: string, days: number, owner = 'NP') => ({ title, assignee: owner, due: due(days), priority: 'normal', status: 'open' });
  const ok = { cdlValid: true, mvrClear: true, medical: true, notes: '' };
  return [
    mkLead({ example: true, name: 'Darnell Hayes', phone: '+1 972-555-0160', email: 'darnell.hayes@example.com', source: 'ad', lane: 'OTR · Dry van', stageName: LEAD_STAGE.NEW, ownerId: 'NP', interest: 'medium', experienceYears: 6, createdAt: m(25), stageSince: m(25), activities: [created('Indeed ad', 25)], nextAction: na('Call within 5 minutes', 0) }),
    mkLead({ example: true, name: 'Priya Raman', phone: '+1 469-555-0161', email: 'priya.raman@example.com', source: 'website', lane: 'Regional · Reefer', stageName: LEAD_STAGE.NEW, ownerId: 'DR', interest: 'unknown', experienceYears: 3, createdAt: m(26 * H), stageSince: m(26 * H), activities: [created('Website form', 26 * H)], nextAction: { title: 'Call driver', status: 'done' } }),
    mkLead({ example: true, name: 'Luis Ortega', phone: '+1 214-555-0162', email: 'luis.ortega@example.com', source: 'referral', lane: 'OTR · Flatbed', stageName: LEAD_STAGE.ATTEMPTING, ownerId: 'NP', interest: 'high', experienceYears: 9, createdAt: m(2 * D), stageSince: m(D), activities: [out('sms', 20 * H, 'sent'), out('call', D + 30), out('call', 2 * D - 12), created('Referral — James Wilson', 2 * D)], nextAction: na('Try again: call + text', 0) }),
    mkLead({ example: true, name: 'Keisha Grant', phone: '+1 817-555-0163', email: 'keisha.grant@example.com', source: 'ad', lane: 'Local · Dry van', stageName: LEAD_STAGE.ATTEMPTING, ownerId: 'SP', interest: 'medium', experienceYears: 2, createdAt: m(4 * D), stageSince: m(3 * D + 60), activities: [out('call', 2 * D), out('sms', 3 * D, 'sent', 'Sam Pike'), out('call', 4 * D - 95, 'voicemail', 'Sam Pike'), created('Facebook ad', 4 * D)], nextAction: { title: 'Call driver', status: 'done' } }),
    mkLead({ example: true, name: 'Tom Becker', phone: '+1 405-555-0164', email: 'tom.becker@example.com', source: 'website', lane: 'Regional · Dry van', stageName: LEAD_STAGE.CONTACTED, ownerId: 'DR', interest: 'medium', experienceYears: 4, location: 'Oklahoma City, OK', screening: { cdlValid: true, mvrClear: null, medical: true, notes: '' }, createdAt: m(3 * D), stageSince: m(D + 3 * H), activities: [inb('call', D + 3 * H, 'connected'), out('call', 3 * D - 40), created('Website form', 3 * D)], nextAction: na('Collect MVR self-report', 1, 'DR') }),
    mkLead({ example: true, name: 'Andre Coleman', phone: '+1 713-555-0165', email: 'andre.coleman@example.com', source: 'referral', lane: 'OTR · Dry van', stageName: LEAD_STAGE.CONTACTED, ownerId: 'NP', interest: 'high', experienceYears: 7, location: 'Houston, TX', screening: ok, consent: { status: 'in', at: m(2 * D), channel: 'sms', doNotContact: false }, createdAt: m(2 * D + 2 * H), stageSince: m(D), activities: [inb('sms', D, 'replied'), out('sms', 2 * D + 2 * H - 4, 'sent'), created('Referral — Maria Garcia', 2 * D + 2 * H)], nextAction: na('Move to Qualified', 0) }),
    mkLead({ example: true, name: 'Megan Foster', phone: '+1 512-555-0166', email: 'megan.foster@example.com', source: 'anna', lane: 'Regional · Reefer', stageName: LEAD_STAGE.QUALIFIED, ownerId: 'NP', interest: 'high', experienceYears: 5, location: 'Austin, TX', screening: ok, consent: { status: 'in', at: m(3 * D), channel: 'sms', doNotContact: false }, createdAt: m(3 * D + 30), stageSince: m(5 * H), annaSummary: 'CDL-A, 5 yrs reefer, clean MVR. Wants regional with weekends home.', activities: [inb('sms', 5 * H, 'replied'), act('anna', 'Anna sent intro message', 3 * D + 28, { channel: 'sms', direction: 'outbound', user: 'Anna' }), created('Anna AI', 3 * D + 30)], nextAction: na('Move to Hiring & send application', 0) }),
    mkLead({ example: true, name: 'Victor Nguyen', phone: '+1 214-555-0167', email: 'victor.nguyen@example.com', source: 'referral', lane: 'OTR · Dry van', stageName: LEAD_STAGE.QUALIFIED, ownerId: 'DR', interest: 'medium', experienceYears: 3, screening: ok, consent: { status: 'in', at: m(6 * D), channel: 'sms', doNotContact: false }, createdAt: m(7 * D), stageSince: m(3 * D + 2 * H), activities: [inb('call', 3 * D + 2 * H, 'connected'), out('call', 7 * D - 15), created('Referral', 7 * D)], nextAction: { title: 'Send offer', status: 'done' } }),
    mkLead({ example: true, name: 'Ray Dawson', phone: '+1 601-555-0168', email: 'ray.dawson@example.com', source: 'ad', licenseType: 'Class B', stageName: LEAD_STAGE.NOT_QUALIFIED, lostFrom: LEAD_STAGE.CONTACTED, closeReason: 'No required license', ownerId: 'SP', interest: 'low', experienceYears: 2, createdAt: m(6 * D), stageSince: m(4 * D), activities: [act('stage', `Moved: ${LEAD_STAGE.CONTACTED} → ${LEAD_STAGE.NOT_QUALIFIED}`, 4 * D, { detail: 'No required license', user: 'Sam Pike' }), inb('call', 5 * D, 'connected'), out('call', 6 * D - 8, 'connected', 'Sam Pike'), created('Facebook ad', 6 * D)] }),
    mkLead({ example: true, name: 'Hector Silva', phone: '+1 956-555-0169', email: 'hector.silva@example.com', source: 'website', stageName: LEAD_STAGE.NOT_QUALIFIED, lostFrom: LEAD_STAGE.ATTEMPTING, closeReason: 'Pay not acceptable', ownerId: 'NP', interest: 'low', experienceYears: 11, createdAt: m(9 * D), stageSince: m(8 * D), activities: [act('stage', `Moved: ${LEAD_STAGE.ATTEMPTING} → ${LEAD_STAGE.NOT_QUALIFIED}`, 8 * D, { detail: 'Pay not acceptable' }), inb('sms', 8 * D + 60, 'replied'), out('sms', 9 * D - 20, 'sent'), created('Website form', 9 * D)] }),
  ];
}

export const store: any = { stages: [], leads: [], automations: [], meta: {} };
(function init() {
  const s = load();
  if (s && s.leads) {
    store.stages = s.stages || defaultStages(); store.leads = s.leads; store.automations = s.automations || DEFAULT_AUTOMATIONS.map((a) => ({ ...a })); store.meta = s.meta || {};
    if ((s.schema || 1) < SCHEMA) migrateToV2();
  } else { store.stages = defaultStages(); store.leads = seedLeads(); store.automations = DEFAULT_AUTOMATIONS.map((a) => ({ ...a })); store.meta = {}; }
  if (!store.meta.examplesV2) {
    const emails = new Set(store.leads.map((l: any) => norm(l.email)));
    exampleLeads().forEach((l) => { if (!emails.has(norm(l.email))) store.leads.push(l); });
    store.meta.examplesV2 = true;
  }
  persist();
})();

const listeners = new Set<() => void>();
const emit = () => { persist(); listeners.forEach((l) => l()); };
export function useRecruit() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}

/* ── helpers ── */
export const stageByName = (name: string) => store.stages.find((s: any) => s.name === name);
export function daysInStage(l: any) { return Math.max(0, Math.floor((Date.now() - +new Date(l.stageSince || Date.now())) / 864e5)); }
export function isOverdue(l: any) { const st = stageByName(l.stageName); if (!st || !st.maxDays) return false; return daysInStage(l) > st.maxDays; }
export function agingLevel(l: any) { const st = stageByName(l.stageName); if (!st || !st.maxDays) return 'ok'; const d = daysInStage(l); if (d > st.maxDays) return 'over'; if (d >= st.maxDays) return 'warn'; return 'ok'; }
export function norm(s?: string) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

/* Duplicate detection: phone → email → fuzzy name+location. */
export function findDuplicate(p: { phone?: string; email?: string; name?: string; location?: string }, excludeId?: string) {
  const leads = store.leads.filter((l: any) => l.id !== excludeId);
  if (p.phone) { const m = leads.find((l: any) => norm(l.phone) && norm(l.phone) === norm(p.phone)); if (m) return { lead: m, on: 'phone' }; }
  if (p.email) { const m = leads.find((l: any) => norm(l.email) && norm(l.email) === norm(p.email)); if (m) return { lead: m, on: 'email' }; }
  if (p.name) { const m = leads.find((l: any) => norm(l.name) === norm(p.name) && norm(l.location) === norm(p.location || '')); if (m) return { lead: m, on: 'name+location' }; }
  return null;
}

function log(l: any, type: string, title: string, detail = '', extra: any = {}) {
  l.activities.unshift({ id: uid('a'), type, title, detail, at: nowIso(), user: extra.user || 'Nina Patel', ...extra });
  shellSvc.logActivity(type, `${l.name}: ${title}`, detail, { type: 'lead', id: l.id });
}

/* ── service ── */
export const svc = {
  lead(id: string) { return store.leads.find((l: any) => l.id === id); },
  stages() { return store.stages.filter((s: any) => !s.disabled).sort((a: any, b: any) => a.order - b.order); },
  allStages() { return store.stages.slice().sort((a: any, b: any) => a.order - b.order); },

  addLead(p: any, opts: any = {}) {
    const dupe = findDuplicate(p);
    if (dupe && !opts.force) {
      if (dupe.lead.consent?.doNotContact) return { blocked: true, reason: 'do_not_contact', dupe };
      if (dupe.lead.archived && dupe.lead.canContactAgain) return { boomerang: true, dupe };
      return { duplicate: true, dupe };
    }
    const l = mkLead({ ...p, stageName: p.stageName || LEAD_STAGE.NEW, createdAt: new Date().toISOString(), stageSince: new Date().toISOString(), nextAction: p.nextAction || { title: 'Call within 5 minutes', assignee: p.ownerId || 'NP', due: new Date().toISOString(), priority: 'high', status: 'open' } });
    if (dupe && opts.force) { l.flags = [...(l.flags || []), 'possible_duplicate']; log(l, 'system', 'Flagged as possible duplicate', `Matches ${dupe.lead.name} on ${dupe.on}`); }
    store.leads.unshift(l);
    log(l, 'lead', 'Lead created', `Source: ${SOURCES.find((s) => s.key === l.source)?.label || l.source}`, { user: l.source === 'anna' ? 'Anna' : 'Nina Patel' });
    emit();
    return { lead: l };
  },

  update(id: string, patch: any) { const l = this.lead(id); if (!l) return; Object.assign(l, patch); l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score); emit(); },
  /** Replace a lead wholesale (restoring an undo snapshot). */
  replace(rec: any) { const i = store.leads.findIndex((l: any) => l.id === rec.id); if (i >= 0) store.leads[i] = rec; else store.leads.unshift(rec); emit(); },
  remove(id: string) { store.leads = store.leads.filter((l: any) => l.id !== id); emit(); },
  replaceAll(leads: any[]) { store.leads = leads; emit(); },
  /** Log a timeline event on a lead (also mirrored to the global activity log). */
  logEvent(id: string, type: string, title: string, detail = '', extra: any = {}) { const l = this.lead(id); if (!l) return; log(l, type, title, detail, extra); emit(); },
  touch() { emit(); },
  setMeta(patch: any) { store.meta = { ...(store.meta || {}), ...patch }; emit(); },

  moveStage(id: string, stageName: string, opts: any = {}) {
    const l = this.lead(id); if (!l || l.stageName === stageName) return;
    const from = l.stageName; l.stageName = stageName; l.stageSince = nowIso();
    log(l, 'stage', `Moved: ${from} → ${stageName}`, opts.detail || '');
    emit();
  },
  assign(id: string, userId: string) { const l = this.lead(id); if (!l) return; const from = l.ownerId; l.ownerId = userId; l.carrier = USERS.find((u) => u.id === userId)?.carrier || l.carrier; log(l, 'assignment', `Reassigned ${USERS.find((u) => u.id === from)?.name || from} → ${USERS.find((u) => u.id === userId)?.name || userId}`); emit(); },
  setNextAction(id: string, na: any) { const l = this.lead(id); if (!l) return; l.nextAction = { ...l.nextAction, ...na }; log(l, 'task', `Next action: ${l.nextAction.title}`, l.nextAction.due ? `Due ${new Date(l.nextAction.due).toLocaleDateString()}` : ''); emit(); },
  completeNextAction(id: string) { const l = this.lead(id); if (!l) return; l.nextAction = { ...l.nextAction, status: 'done' }; log(l, 'task', `Completed: ${l.nextAction.title}`); emit(); },

  addNote(id: string, text: string) { const l = this.lead(id); if (!l || !text.trim()) return; log(l, 'note', 'Note', text); emit(); },
  logComm(id: string, comm: { channel: string; direction: string; outcome?: string; duration?: number; note?: string }) {
    const l = this.lead(id); if (!l) return;
    if (l.consent?.doNotContact && comm.direction === 'outbound') return { blocked: true };
    const label = `${comm.direction === 'inbound' ? 'Inbound' : 'Outbound'} ${comm.channel}${comm.outcome ? ' — ' + comm.outcome : ''}`;
    log(l, 'comm', label, comm.note || '', { channel: comm.channel, direction: comm.direction, outcome: comm.outcome, duration: comm.duration || 0 });
    if (comm.direction === 'inbound') { l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score); }
    emit(); return { ok: true };
  },

  setConsent(id: string, status: string, channel = 'sms') {
    const l = this.lead(id); if (!l) return;
    l.consent = { status, at: nowIso(), channel, doNotContact: status === 'out' };
    log(l, 'consent', `Consent: ${status === 'in' ? 'Opted In' : status === 'out' ? 'Opted Out (Do-Not-Contact)' : 'Not asked'}`, `via ${channel}`);
    if (status === 'out') this.escalate(id, 'Driver opted out — Do-Not-Contact set');
    emit();
  },
  optOutKeyword(id: string) { this.setConsent(id, 'out', 'sms'); },

  /* Anna AI */
  annaIntake(p: any) { return this.addLead({ ...p, source: 'anna', interest: p.interest || 'medium' }, { force: p.force }); },
  annaSummarize(id: string, summary: string, interest?: string) { const l = this.lead(id); if (!l) return; l.annaSummary = summary; if (interest) l.interest = interest; l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score); log(l, 'anna', 'Anna summarized conversation', summary, { user: 'Anna' }); emit(); },
  escalate(id: string, reason: string) {
    const l = this.lead(id); if (!l) return;
    l.flags = [...new Set([...(l.flags || []), 'escalated'])];
    l.tasks.unshift({ id: uid('t'), title: `Needs attention: ${reason}`, assignee: l.ownerId, priority: 'high', status: 'open', at: nowIso() });
    log(l, 'anna', 'Escalated to owner', reason, { user: 'Anna' });
    shellSvc.notify('action', `${l.name} needs attention`, reason);
    emit();
  },
  flagNoResponse(id: string) { const l = this.lead(id); if (!l) return; l.flags = [...new Set([...(l.flags || []), 'no_response'])]; log(l, 'anna', 'Flagged: no response', `${daysInStage(l)} days with no reply`, { user: 'Anna' }); emit(); },

  /* close / archive */
  close(id: string, decision: string, reason: string, canContactAgain: boolean) {
    const l = this.lead(id); if (!l) return;
    l.decision = decision; l.closeReason = reason; l.canContactAgain = canContactAgain;
    const stageName = decision === 'refused' || decision === 'not_acceptable' ? LEAD_STAGE.NOT_QUALIFIED : decision === 'acceptable' ? LEAD_STAGE.QUALIFIED : l.stageName;
    if (stageName === LEAD_STAGE.NOT_QUALIFIED && l.stageName !== stageName) l.lostFrom = l.stageName;
    if (stageByName(stageName)) this.moveStage(id, stageName, { detail: reason });
    log(l, 'decision', `Decision: ${decision.replace(/_/g, ' ')}`, reason);
    emit();
  },
  archive(id: string, reason: string, canContactAgain: boolean) {
    const l = this.lead(id); if (!l) return;
    l.archived = true; l.closeReason = reason; l.canContactAgain = canContactAgain; l.decision = l.decision || 'archived';
    l.archiveReport = {
      finalStatus: l.decision, reason, owner: l.ownerId, canContactAgain, archivedAt: nowIso(),
      annaSummary: l.annaSummary, documents: l.documents.map((d: any) => ({ name: d.name, status: d.status })),
      timeline: [...l.activities],
    };
    if (stageByName(LEAD_STAGE.ARCHIVED)) this.moveStage(id, LEAD_STAGE.ARCHIVED, { detail: reason });
    log(l, 'archive', 'Lead archived', `${reason}${canContactAgain ? ' · can re-contact' : ' · do not contact'}`);
    emit();
  },
  reopen(id: string) {
    const l = this.lead(id); if (!l) return;
    l.previousApplication = { stageName: l.stageName, closeReason: l.closeReason, archivedAt: l.archiveReport?.archivedAt, decision: l.decision };
    l.archived = false; l.decision = null; l.closeReason = null; l.archiveReport = null;
    this.moveStage(id, LEAD_STAGE.NEW, { detail: 'Re-entered pipeline (boomerang)' });
    log(l, 'lead', 'Re-opened from archive', 'Boomerang — previous history preserved');
    emit();
  },

  addTask(id: string, task: any) { const l = this.lead(id); if (!l) return; l.tasks.unshift({ id: uid('t'), status: 'open', at: nowIso(), ...task }); log(l, 'task', `Task: ${task.title}`, task.due ? `Due ${new Date(task.due).toLocaleDateString()}` : ''); emit(); },
  setDoc(id: string, name: string, status: string) { const l = this.lead(id); if (!l) return; const d = l.documents.find((x: any) => x.name === name); if (d) { d.status = status; log(l, 'document', `${name} → ${status}`); emit(); } },
  setDocFile(id: string, name: string, fileId: string, fileName: string) { const l = this.lead(id); if (!l) return; const d = l.documents.find((x: any) => x.name === name); if (d) { d.fileId = fileId; d.fileName = fileName; d.status = 'received'; log(l, 'document', `${name} uploaded`, fileName); emit(); } },

  /* editable pipeline stages */
  addStage(name: string) { store.stages.push({ id: uid('stg'), name, order: store.stages.length, maxDays: 2, disabled: false, terminal: false }); emit(); },
  renameStage(id: string, name: string) { const s = store.stages.find((x: any) => x.id === id); if (s) { s.name = name; emit(); } },
  setStageMaxDays(id: string, maxDays: number) { const s = store.stages.find((x: any) => x.id === id); if (s) { s.maxDays = maxDays; emit(); } },
  disableStage(id: string) { const s = store.stages.find((x: any) => x.id === id); if (s) { s.disabled = !s.disabled; emit(); } },
  removeStage(id: string) { const s = store.stages.find((x: any) => x.id === id); if (!s) return; if (store.leads.some((l: any) => l.stageName === s.name)) return { hasLeads: true }; store.stages = store.stages.filter((x: any) => x.id !== id); emit(); return { ok: true }; },
  moveStageOrder(id: string, dir: number) {
    const ordered = store.stages.slice().sort((a: any, b: any) => a.order - b.order);
    const i = ordered.findIndex((s: any) => s.id === id); const j = i + dir; if (j < 0 || j >= ordered.length) return;
    const a = ordered[i], b = ordered[j]; const t = a.order; a.order = b.order; b.order = t; emit();
  },

  /* automations */
  toggleAutomation(id: string) { const a = store.automations.find((x: any) => x.id === id); if (a) { a.enabled = !a.enabled; emit(); } },
  runAutomations() {
    const on = (id: string) => store.automations.find((a: any) => a.id === id)?.enabled;
    const res = { flagged: 0, escalated: 0, rescored: 0, advanced: 0 };
    for (const l of store.leads) {
      if (l.archived) continue;
      const st = stageByName(l.stageName); const d = daysInStage(l);
      if (on('sla_flag') && st?.maxDays && d > st.maxDays && !(l.flags || []).includes('no_response')) { this.flagNoResponse(l.id); res.flagged++; }
      if (on('escalate_stale') && st?.maxDays && d > st.maxDays * 2 && !(l.flags || []).includes('escalated')) { this.escalate(l.id, `Stalled ${d}d in ${l.stageName} (2× SLA)`); res.escalated++; }
      if (on('autoadvance') && l.stageName === LEAD_STAGE.CONTACTED && (l.documents || []).length && l.documents.every((d: any) => d.status === 'received')) { this.moveStage(l.id, LEAD_STAGE.QUALIFIED, { detail: 'Auto-qualified by automation (documents received)' }); res.advanced++; }
      if (on('rescore')) { const before = l.score; l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score); if (before !== l.score) res.rescored++; }
    }
    emit();
    return res;
  },
  /** Advanced Anna recommendations across the funnel. */
  recommendations(userId = 'NP') {
    const leads = this.visibleLeads(userId).filter((l: any) => !l.archived);
    const recs: any[] = [];
    for (const l of leads) {
      if (l.consent?.doNotContact) continue;
      if (stageByName(l.stageName)?.terminal) continue;
      if (l.scoreLabel === 'Hot Lead' && l.stageName !== LEAD_STAGE.QUALIFIED) recs.push({ leadId: l.id, name: l.name, priority: 'high', text: `${l.name} is a Hot Lead — fast-track: finish screening and qualify.` });
      else if (isOverdue(l)) recs.push({ leadId: l.id, name: l.name, priority: 'high', text: `${l.name} is overdue in ${l.stageName} (${daysInStage(l)}d) — follow up today.` });
      else if (l.stageName === LEAD_STAGE.QUALIFIED) recs.push({ leadId: l.id, name: l.name, priority: 'normal', text: `${l.name} is qualified — move to Hiring.` });
      else if ((l.flags || []).includes('escalated')) recs.push({ leadId: l.id, name: l.name, priority: 'high', text: `${l.name} was escalated and needs attention.` });
    }
    return recs.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1)).slice(0, 12);
  },

  /* management analytics */
  analytics() {
    const L = store.leads;
    const isHired = (l: any) => !!l.convertedTo || l.stageName === LEAD_STAGE.TO_HIRING || l.decision === 'hired';
    const hired = L.filter(isHired);
    const rejected = L.filter((l: any) => l.decision === 'not_acceptable' || (l.stageName === LEAD_STAGE.NOT_QUALIFIED && l.decision !== 'refused'));
    const refused = L.filter((l: any) => l.decision === 'refused');
    const closed = hired.length + rejected.length + refused.length;
    const hrsBetween = (a: string, b: string) => a && b ? (+new Date(b) - +new Date(a)) / 36e5 : null;
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : null;
    const timeToHire = hired.map((l: any) => hrsBetween(l.createdAt, l.convertedAt || l.stageSince)).filter((x: any) => x != null) as number[];
    // avg days in each stage (current occupants)
    const byStage = this.stages().map((s: any) => { const ls = L.filter((l: any) => l.stageName === s.name && !s.terminal); return { stage: s.name, count: L.filter((l: any) => l.stageName === s.name).length, avgDays: avg(ls.map((l: any) => daysInStage(l))) }; });
    const perRecruiter = USERS.map((u) => { const own = L.filter((l: any) => l.ownerId === u.id); return { name: u.name, leads: own.length, hired: own.filter(isHired).length, active: own.filter((l: any) => !l.archived && !stageByName(l.stageName)?.terminal).length, overdue: own.filter((l: any) => !l.archived && isOverdue(l)).length }; });
    const perSource = SOURCES.map((s) => { const src = L.filter((l: any) => l.source === s.key); return { source: s.label, leads: src.length, hired: src.filter(isHired).length }; }).filter((x) => x.leads > 0);
    const lostReasons: Record<string, number> = {};
    L.filter((l: any) => l.closeReason).forEach((l: any) => { lostReasons[l.closeReason] = (lostReasons[l.closeReason] || 0) + 1; });
    const topLost = Object.entries(lostReasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
    const anna = L.filter((l: any) => l.source === 'anna');
    return {
      totalLeads: L.length, newLeads: L.filter((l: any) => l.stageName === LEAD_STAGE.NEW).length,
      hired: hired.length, rejected: rejected.length, refused: refused.length,
      conversion: L.length ? Math.round((hired.length / L.length) * 100) : 0,
      avgHoursToHire: avg(timeToHire), byStage, perRecruiter, perSource, topLost,
      annaLeads: anna.length, annaHired: anna.filter(isHired).length,
      annaConversion: anna.length ? Math.round((anna.filter(isHired).length / anna.length) * 100) : 0,
    };
  },

  /* permissions scope */
  visibleLeads(userId = 'NP') {
    const u = USERS.find((x) => x.id === userId);
    if (!u || u.role === 'admin') return store.leads;
    if (u.role === 'manager') return store.leads.filter((l: any) => l.carrier === u.carrier);
    return store.leads.filter((l: any) => l.ownerId === userId || l.carrier === u.carrier);
  },
};

export function fmtAgo(iso: string) { if (!iso) return ''; const m = Math.floor((Date.now() - +new Date(iso)) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'; }
export function fmtDate(iso: string) { if (!iso) return '—'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
export function dueLabel(iso: string) { if (!iso) return ''; const d = Math.ceil((+new Date(iso) - Date.now()) / 864e5); if (d < 0) return `${-d}d overdue`; if (d === 0) return 'Due today'; if (d === 1) return 'Due tomorrow'; return `Due in ${d}d`; }
