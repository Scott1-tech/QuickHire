/* QuickHire Driver Hiring Pipeline (recruiting CRM) — Phase 1 store.
   Separate from the onboarding hire store. Local-first (localStorage): editable
   pipeline stages, lead cards, structured activity/comms, next actions, consent,
   SLA aging, duplicate detection, close reasons + archive reports, boomerang
   re-entry. Every action is logged. */
import React from 'react';
import { svc as shellSvc } from '../shell/store';

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

/* ── default stages (editable) ── */
const DEFAULT_STAGES = [
  ['New Lead', 1], ['Anna AI Contacted', 1], ['Needs Follow-Up', 2], ['Pre-Screening', 2],
  ['Documents Requested', 3], ['Documents Received', 2], ['Interview / Call Scheduled', 2],
  ['Ready for Review', 1], ['Approved', 0], ['Rejected', 0], ['Refused / Not Interested', 0], ['Hired', 0], ['Archived', 0],
].map(([name, maxDays], i) => ({ id: uid('stg'), name, order: i, maxDays, disabled: false, terminal: ['Approved', 'Rejected', 'Refused / Not Interested', 'Hired', 'Archived'].includes(name as string) }));

/* ── persistence ── */
const LS = 'qh_recruit_v1';
function load(): any | null { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch { return null; } }
function persist() { try { localStorage.setItem(LS, JSON.stringify({ stages: store.stages, leads: store.leads, automations: store.automations })); } catch { /* quota */ } }

const DEFAULT_AUTOMATIONS = [
  { id: 'sla_flag', name: 'Flag SLA breaches', desc: 'Flag leads past their stage SLA as no-response.', enabled: true },
  { id: 'escalate_stale', name: 'Escalate stalled leads', desc: 'Escalate leads over 2× their stage SLA to the owner.', enabled: true },
  { id: 'rescore', name: 'Recompute driver scores', desc: 'Refresh every lead score from the latest activity.', enabled: true },
  { id: 'autoadvance', name: 'Auto-advance on documents received', desc: 'Move "Documents Received" leads to "Ready for Review".', enabled: false },
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
    flags: p.flags || [], createdAt: daysAgo(p.age ?? 2), stageSince: daysAgo(p.stageAge ?? 1),
    activities: p.activities || [{ id: uid('a'), type: 'lead', title: 'Lead created', detail: `Source: ${p.source || 'manual'}`, at: daysAgo(p.age ?? 2), user: 'System' }],
  } as any;
  l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score);
  return l;
}
function seedLeads() {
  return [
    mkLead({ name: 'Marcus Bell', phone: '+1 469-555-0188', email: 'marcus.bell@example.com', source: 'anna', stageName: 'Anna AI Contacted', ownerId: 'NP', interest: 'high', experienceYears: 5, annaSummary: 'Driver replied within 3 min, very interested in OTR dry van. Asked about pay and home time.', activities: [{ id: uid('a'), type: 'lead', title: 'Lead created by Anna AI', detail: 'Ad campaign → website', at: daysAgo(1), user: 'Anna' }, { id: uid('a'), type: 'anna', channel: 'sms', direction: 'outbound', title: 'Anna sent intro message', at: daysAgo(1), user: 'Anna' }, { id: uid('a'), type: 'comm', channel: 'sms', direction: 'inbound', outcome: 'replied', title: 'Driver replied — interested', at: daysAgo(1), user: 'Anna' }], consent: { status: 'in', at: daysAgo(1), channel: 'sms', doNotContact: false } }),
    mkLead({ name: 'Robert Johnson', phone: '+1 214-555-0101', email: 'rj@example.com', source: 'referral', stageName: 'Needs Follow-Up', ownerId: 'NP', interest: 'medium', experienceYears: 4, overdue: true, stageAge: 4 }),
    mkLead({ name: 'Tracy Bowman', phone: '+1 305-555-0106', email: 'tb@example.com', source: 'website', stageName: 'New Lead', ownerId: 'SP', interest: 'unknown', experienceYears: 1, location: 'Miami, FL' }),
    mkLead({ name: 'Kevin Brooks', phone: '+1 214-555-0107', email: 'kb@example.com', source: 'ad', stageName: 'Pre-Screening', ownerId: 'DR', interest: 'high', experienceYears: 7 }),
    mkLead({ name: 'Aisha Bello', phone: '+1 404-555-0140', email: 'ab@example.com', source: 'anna', stageName: 'Documents Requested', ownerId: 'DR', interest: 'medium', experienceYears: 3, stageAge: 4 }),
    mkLead({ name: 'Derek Hill', phone: '+1 214-555-0103', email: 'dh@example.com', source: 'referral', stageName: 'Ready for Review', ownerId: 'NP', interest: 'high', experienceYears: 6 }),
    mkLead({ name: 'Linda Martinez', phone: '+1 214-555-0102', email: 'lm@example.com', source: 'manual', stageName: 'Documents Received', ownerId: 'NP', interest: 'medium', experienceYears: 2 }),
    mkLead({ name: 'Carlos Mendez', phone: '+1 214-555-0130', email: 'cm@example.com', source: 'website', stageName: 'Interview / Call Scheduled', ownerId: 'DR', interest: 'high', experienceYears: 8 }),
  ];
}

export const store: any = { stages: [], leads: [], automations: [] };
(function init() {
  const s = load();
  if (s && s.leads) { store.stages = s.stages || DEFAULT_STAGES; store.leads = s.leads; store.automations = s.automations || DEFAULT_AUTOMATIONS.map((a) => ({ ...a })); }
  else { store.stages = DEFAULT_STAGES; store.leads = seedLeads(); store.automations = DEFAULT_AUTOMATIONS.map((a) => ({ ...a })); persist(); }
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

  addLead(p: any, opts: any = {}) {
    const dupe = findDuplicate(p);
    if (dupe && !opts.force) {
      if (dupe.lead.consent?.doNotContact) return { blocked: true, reason: 'do_not_contact', dupe };
      if (dupe.lead.archived && dupe.lead.canContactAgain) return { boomerang: true, dupe };
      return { duplicate: true, dupe };
    }
    const l = mkLead({ ...p, stageName: p.stageName || 'New Lead' });
    if (dupe && opts.force) { l.flags = [...(l.flags || []), 'possible_duplicate']; log(l, 'system', 'Flagged as possible duplicate', `Matches ${dupe.lead.name} on ${dupe.on}`); }
    store.leads.unshift(l);
    log(l, 'lead', 'Lead created', `Source: ${SOURCES.find((s) => s.key === l.source)?.label || l.source}`, { user: l.source === 'anna' ? 'Anna' : 'Nina Patel' });
    emit();
    return { lead: l };
  },

  update(id: string, patch: any) { const l = this.lead(id); if (!l) return; Object.assign(l, patch); l.score = computeScore(l); l.scoreLabel = scoreLabel(l.score); emit(); },

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
    const stageName = decision === 'hired' ? 'Hired' : decision === 'refused' ? 'Refused / Not Interested' : decision === 'not_acceptable' ? 'Rejected' : decision === 'acceptable' ? 'Approved' : l.stageName;
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
    if (stageByName('Archived')) this.moveStage(id, 'Archived', { detail: reason });
    log(l, 'archive', 'Lead archived', `${reason}${canContactAgain ? ' · can re-contact' : ' · do not contact'}`);
    emit();
  },
  reopen(id: string) {
    const l = this.lead(id); if (!l) return;
    l.previousApplication = { stageName: l.stageName, closeReason: l.closeReason, archivedAt: l.archiveReport?.archivedAt, decision: l.decision };
    l.archived = false; l.decision = null; l.closeReason = null; l.archiveReport = null;
    this.moveStage(id, 'New Lead', { detail: 'Re-entered pipeline (boomerang)' });
    log(l, 'lead', 'Re-opened from archive', 'Boomerang — previous history preserved');
    emit();
  },

  addTask(id: string, task: any) { const l = this.lead(id); if (!l) return; l.tasks.unshift({ id: uid('t'), status: 'open', at: nowIso(), ...task }); log(l, 'task', `Task: ${task.title}`, task.due ? `Due ${new Date(task.due).toLocaleDateString()}` : ''); emit(); },
  setDoc(id: string, name: string, status: string) { const l = this.lead(id); if (!l) return; const d = l.documents.find((x: any) => x.name === name); if (d) { d.status = status; log(l, 'document', `${name} → ${status}`); emit(); } },

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
      if (on('autoadvance') && l.stageName === 'Documents Received') { this.moveStage(l.id, 'Ready for Review', { detail: 'Auto-advanced by automation' }); res.advanced++; }
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
      if (l.scoreLabel === 'Hot Lead' && !['Approved', 'Hired', 'Ready for Review'].includes(l.stageName)) recs.push({ leadId: l.id, name: l.name, priority: 'high', text: `${l.name} is a Hot Lead — fast-track: ${l.stageName === 'Documents Received' ? 'move to review' : 'send documents / schedule call'}.` });
      else if (isOverdue(l)) recs.push({ leadId: l.id, name: l.name, priority: 'high', text: `${l.name} is overdue in ${l.stageName} (${daysInStage(l)}d) — follow up today.` });
      else if (l.stageName === 'Ready for Review') recs.push({ leadId: l.id, name: l.name, priority: 'normal', text: `${l.name} is ready for a decision.` });
      else if ((l.flags || []).includes('escalated')) recs.push({ leadId: l.id, name: l.name, priority: 'high', text: `${l.name} was escalated and needs attention.` });
    }
    return recs.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1)).slice(0, 12);
  },

  /* management analytics */
  analytics() {
    const L = store.leads;
    const hired = L.filter((l: any) => l.stageName === 'Hired' || l.decision === 'hired');
    const rejected = L.filter((l: any) => l.stageName === 'Rejected' || l.decision === 'not_acceptable');
    const refused = L.filter((l: any) => l.stageName === 'Refused / Not Interested' || l.decision === 'refused');
    const closed = hired.length + rejected.length + refused.length;
    const hrsBetween = (a: string, b: string) => a && b ? (+new Date(b) - +new Date(a)) / 36e5 : null;
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : null;
    const timeToHire = hired.map((l: any) => { const h = (l.activities || []).find((a: any) => a.type === 'stage' && /Hired/.test(a.title))?.at || l.stageSince; return hrsBetween(l.createdAt, h); }).filter((x: any) => x != null) as number[];
    // avg days in each stage (current occupants)
    const byStage = this.stages().map((s: any) => { const ls = L.filter((l: any) => l.stageName === s.name && !s.terminal); return { stage: s.name, count: L.filter((l: any) => l.stageName === s.name).length, avgDays: avg(ls.map((l: any) => daysInStage(l))) }; });
    const perRecruiter = USERS.map((u) => { const own = L.filter((l: any) => l.ownerId === u.id); return { name: u.name, leads: own.length, hired: own.filter((l: any) => l.stageName === 'Hired').length, active: own.filter((l: any) => !l.archived).length, overdue: own.filter((l: any) => !l.archived && isOverdue(l)).length }; });
    const perSource = SOURCES.map((s) => { const src = L.filter((l: any) => l.source === s.key); return { source: s.label, leads: src.length, hired: src.filter((l: any) => l.stageName === 'Hired').length }; }).filter((x) => x.leads > 0);
    const lostReasons: Record<string, number> = {};
    L.filter((l: any) => l.closeReason).forEach((l: any) => { lostReasons[l.closeReason] = (lostReasons[l.closeReason] || 0) + 1; });
    const topLost = Object.entries(lostReasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
    const anna = L.filter((l: any) => l.source === 'anna');
    return {
      totalLeads: L.length, newLeads: L.filter((l: any) => l.stageName === 'New Lead').length,
      hired: hired.length, rejected: rejected.length, refused: refused.length,
      conversion: L.length ? Math.round((hired.length / L.length) * 100) : 0,
      avgHoursToHire: avg(timeToHire), byStage, perRecruiter, perSource, topLost,
      annaLeads: anna.length, annaHired: anna.filter((l: any) => l.stageName === 'Hired').length,
      annaConversion: anna.length ? Math.round((anna.filter((l: any) => l.stageName === 'Hired').length / anna.length) * 100) : 0,
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
