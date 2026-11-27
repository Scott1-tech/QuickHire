/* Pure lifecycle logic for the four linked pipelines (Leads → Hiring → Active →
   Inactive). No store access and no side effects: every function takes plain
   records (+ an optional `now`) so it can be unit-tested and reused by the board,
   list, peek panel and profiles. */
import {
  PipeKey, LEAD_STAGE, HIRING_STAGE, ACTIVE_STAGE, INACTIVE_STAGE, ME, recruiterId,
} from './stages';

export const DAY = 864e5;
export const HANDOFF_TO_ACTIVE = 'Start 90-day onboarding';

export type SlaLevel = 'none' | 'ok' | 'warn' | 'over';
export interface StageDef {
  name: string;
  color: string;
  maxDays: number;
  /** lost = closed with a reason · handoff = moves the record to another pipeline */
  final?: 'lost' | 'handoff';
  to?: PipeKey;
  label?: string; // display label for handoff zones
}
export interface PipeDef { key: PipeKey; label: string; noun: string; color: string; stages: StageDef[] }
export interface CheckAction { kind: string; label: string; arg?: any }
export interface CheckItem { key: string; label: string; done: boolean; action?: CheckAction }

export const PIPE_META: Record<PipeKey, { label: string; noun: string; color: string }> = {
  leads: { label: 'Leads', noun: 'lead', color: '#007AFF' },
  hiring: { label: 'Hiring', noun: 'candidate', color: '#5856D6' },
  active: { label: 'Active', noun: 'driver', color: '#34C759' },
  inactive: { label: 'Inactive', noun: 'former driver', color: '#8E8E93' },
};

const LEAD_COLORS: Record<string, string> = {
  [LEAD_STAGE.NEW]: '#5AC8FA', [LEAD_STAGE.ATTEMPTING]: '#007AFF', [LEAD_STAGE.CONTACTED]: '#5856D6', [LEAD_STAGE.QUALIFIED]: '#34C759',
};
const FALLBACK = ['#5AC8FA', '#007AFF', '#5856D6', '#AF52DE', '#FF9F0A', '#34C759', '#0FB5AE'];

/** Build the four pipeline definitions. Lead stages come from the (editable)
    recruit store; the other three are fixed lifecycle stages. */
export function buildPipes(leadStages: any[] = []): Record<PipeKey, PipeDef> {
  const open = leadStages
    .filter((s) => !s.disabled && !s.terminal)
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ name: s.name, color: LEAD_COLORS[s.name] || FALLBACK[i % FALLBACK.length], maxDays: +s.maxDays || 0 }));
  const leads: StageDef[] = [
    ...(open.length ? open : [{ name: LEAD_STAGE.NEW, color: LEAD_COLORS[LEAD_STAGE.NEW], maxDays: 1 }]),
    { name: LEAD_STAGE.NOT_QUALIFIED, color: '#FF3B30', maxDays: 0, final: 'lost' },
    { name: LEAD_STAGE.TO_HIRING, color: PIPE_META.hiring.color, maxDays: 0, final: 'handoff', to: 'hiring', label: 'Move to Hiring' },
  ];
  const hiring: StageDef[] = [
    { name: HIRING_STAGE.APPLICATION, color: '#5AC8FA', maxDays: 2 },
    { name: HIRING_STAGE.DOCS, color: '#FF9F0A', maxDays: 5 },
    { name: HIRING_STAGE.OFFER, color: '#5856D6', maxDays: 3 },
    { name: HIRING_STAGE.ORIENTATION, color: '#007AFF', maxDays: 4 },
    { name: HIRING_STAGE.HIRED, color: '#34C759', maxDays: 2 },
    { name: HIRING_STAGE.LOST, color: '#FF3B30', maxDays: 0, final: 'lost' },
    { name: HANDOFF_TO_ACTIVE, color: PIPE_META.active.color, maxDays: 0, final: 'handoff', to: 'active', label: 'Start 90-day onboarding' },
  ];
  const active: StageDef[] = [
    { name: ACTIVE_STAGE.FIRST90, color: '#5AC8FA', maxDays: 90 },
    { name: ACTIVE_STAGE.ACTIVE, color: '#34C759', maxDays: 0 },
    { name: ACTIVE_STAGE.LEAVE, color: '#AF52DE', maxDays: 14 },
    { name: ACTIVE_STAGE.AT_RISK, color: '#FF9F0A', maxDays: 3 },
    { name: ACTIVE_STAGE.QUIT, color: '#FF3B30', maxDays: 0, final: 'handoff', to: 'inactive', label: 'Quit / Terminated' },
  ];
  const inactive: StageDef[] = [
    { name: INACTIVE_STAGE.INACTIVE, color: '#8E8E93', maxDays: 30 },
    { name: INACTIVE_STAGE.REENGAGING, color: '#007AFF', maxDays: 14 },
    { name: INACTIVE_STAGE.REAPPLIED, color: PIPE_META.hiring.color, maxDays: 0, final: 'handoff', to: 'hiring', label: 'Re-applied → Hiring' },
    { name: INACTIVE_STAGE.DNR, color: '#FF3B30', maxDays: 0, final: 'lost' },
  ];
  const mk = (key: PipeKey, stages: StageDef[]): PipeDef => ({ key, ...PIPE_META[key], stages });
  return { leads: mk('leads', leads), hiring: mk('hiring', hiring), active: mk('active', active), inactive: mk('inactive', inactive) };
}

export const openStages = (def: PipeDef) => def.stages.filter((s) => !s.final);
export const finalStages = (def: PipeDef) => def.stages.filter((s) => !!s.final);
export const stageDef = (def: PipeDef, name: string) => def.stages.find((s) => s.name === name);

/* ───────── record accessors ───────── */
export const kindOf = (pipe: PipeKey) => (pipe === 'leads' ? 'lead' : 'driver');

export function stageOf(pipe: PipeKey, r: any): string {
  if (pipe === 'leads') return r.stageName;
  if (pipe === 'hiring') return r.stage;
  if (pipe === 'active') return r.activeStage || ACTIVE_STAGE.ACTIVE;
  return r.inactiveStage || INACTIVE_STAGE.INACTIVE;
}
export function sinceOf(pipe: PipeKey, r: any): string | null {
  if (pipe === 'leads' || pipe === 'hiring') return r.stageSince || null;
  if (pipe === 'active') return r.activeSince || r.hireDate || null;
  return r.inactiveStageSince || r.inactiveSince || null;
}
/** Which pipeline a hire-store driver currently lives in. */
export function pipeOfDriver(d: any): PipeKey { return d?.lifecycle === 'active' ? 'active' : d?.lifecycle === 'inactive' ? 'inactive' : 'hiring'; }

export function daysBetween(a: string | number | null | undefined, b: number = Date.now()) {
  if (a == null || a === '') return 0;
  const t = typeof a === 'number' ? a : +new Date(a);
  if (!isFinite(t)) return 0;
  return Math.max(0, Math.floor((b - t) / DAY));
}
export const daysInStage = (pipe: PipeKey, r: any, now = Date.now()) => daysBetween(sinceOf(pipe, r), now);

/** Green / amber / red against the stage SLA (maxDays). */
export function slaLevel(days: number, maxDays: number): SlaLevel {
  if (!maxDays || maxDays <= 0) return 'none';
  if (days > maxDays) return 'over';
  const warnAt = Math.max(1, Math.ceil(maxDays * 0.75));
  return days >= warnAt ? 'warn' : 'ok';
}
export function recordSla(def: PipeDef, r: any, now = Date.now()): SlaLevel {
  const st = stageDef(def, stageOf(def.key, r));
  if (!st || st.final) return 'none';
  return slaLevel(daysInStage(def.key, r, now), st.maxDays);
}
export const SLA_COLORS: Record<SlaLevel, { fg: string; bg: string }> = {
  none: { fg: '#6E6E73', bg: '#F2F2F7' },
  ok: { fg: '#248A3D', bg: 'rgba(52,199,89,0.13)' },
  warn: { fg: '#A05A00', bg: 'rgba(255,159,10,0.16)' },
  over: { fg: '#C62820', bg: 'rgba(255,59,48,0.12)' },
};

export function ownerOf(pipe: PipeKey, r: any): string { return pipe === 'leads' ? (r.ownerId || 'NP') : recruiterId(r.ownerName || 'Nina Patel'); }

/* ───────── leads: contact metrics ───────── */
const isContactAct = (a: any) => !!a && (a.type === 'comm' || a.type === 'anna') && (a.direction === 'outbound' || a.direction === 'inbound');
export function leadAttempts(l: any): number { return (l.activities || []).filter((a: any) => isContactAct(a) && a.direction === 'outbound').length; }
export function leadReached(l: any): boolean { return (l.activities || []).some((a: any) => isContactAct(a) && (a.direction === 'inbound' || a.outcome === 'connected')); }
export function leadLastContact(l: any): string | null {
  let best = 0;
  for (const a of l.activities || []) if (isContactAct(a)) { const t = +new Date(a.at); if (t > best) best = t; }
  return best ? new Date(best).toISOString() : null;
}
/** Minutes from lead creation to the first outbound touch (null if never contacted). */
export function speedToLeadMin(l: any): number | null {
  let first = Infinity;
  for (const a of l.activities || []) if (isContactAct(a) && a.direction === 'outbound') { const t = +new Date(a.at); if (t < first) first = t; }
  if (!isFinite(first) || !l.createdAt) return null;
  return Math.max(0, Math.round((first - +new Date(l.createdAt)) / 6e4));
}

/* ───────── drivers: hiring + active metrics ───────── */
export function docsProgress(d: any) {
  const req = (d.documents || []).filter((x: any) => x.required);
  return { have: req.filter((x: any) => x.status === 'collected').length, total: req.length };
}
export const hasMissingDocs = (d: any) => (d.documents || []).some((x: any) => x.required && x.status === 'missing');
export const docStatus = (d: any, name: string) => (d.documents || []).find((x: any) => x.name === name)?.status || 'missing';
export function tenureDays(d: any, now = Date.now()): number | null {
  if (!d.hireDate) return null;
  const end = d.lifecycle === 'inactive' && d.inactiveSince ? +new Date(d.inactiveSince) : now;
  return daysBetween(d.hireDate, end);
}
export const esignStatus = (d: any): 'none' | 'sent' | 'viewed' | 'completed' => d.esign?.status || 'none';
export function driverLastContact(d: any): string | null {
  let best = d.lastContactAt ? +new Date(d.lastContactAt) : 0;
  for (const a of d.activities || []) if (['call', 'text', 'email'].includes(a.type)) { const t = +new Date(a.at); if (t > best) best = t; }
  return best ? new Date(best).toISOString() : null;
}
export const lastContactOf = (pipe: PipeKey, r: any) => (pipe === 'leads' ? leadLastContact(r) : driverLastContact(r));
export const checkInFor = (d: any, day: number) => (d.checkIns || []).find((c: any) => c.day === day);
/** Next not-yet-done 90-day check-in. */
export function nextCheckIn(d: any) { return (d.checkIns || []).filter((c: any) => !c.doneAt).sort((a: any, b: any) => a.day - b.day)[0] || null; }

/* ───────── next step ───────── */
export function nextStepOf(pipe: PipeKey, r: any): { title: string; due: string | null } | null {
  const n = pipe === 'leads' ? r.nextAction : r.nextStep;
  if (!n || !n.title || n.status === 'done') return null;
  return { title: n.title, due: n.due || null };
}
const SUGGESTED: Record<string, string> = {
  [LEAD_STAGE.NEW]: 'Call within 5 minutes', [LEAD_STAGE.ATTEMPTING]: 'Try again: call + text', [LEAD_STAGE.CONTACTED]: 'Finish screening questions', [LEAD_STAGE.QUALIFIED]: 'Move to Hiring & send application',
  [HIRING_STAGE.APPLICATION]: 'Review application', [HIRING_STAGE.DOCS]: 'Collect CDL, med card, MVR & PSP', [HIRING_STAGE.OFFER]: 'Follow up on offer e-sign', [HIRING_STAGE.ORIENTATION]: 'Confirm orientation & truck', [HIRING_STAGE.HIRED]: 'Start 90-day onboarding',
  [ACTIVE_STAGE.FIRST90]: 'Next 90-day check-in', [ACTIVE_STAGE.ACTIVE]: 'Monthly check-in call', [ACTIVE_STAGE.LEAVE]: 'Confirm return-to-work date', [ACTIVE_STAGE.AT_RISK]: 'Retention call with dispatcher',
  [INACTIVE_STAGE.INACTIVE]: 'Review rehire eligibility', [INACTIVE_STAGE.REENGAGING]: 'Re-engagement call',
};
export const suggestedNextStep = (stage: string) => SUGGESTED[stage] || 'Follow up';

/* ───────── stage exit checklists (Zoho-Blueprint style) ───────── */
const docItem = (d: any, key: string, label: string, names: string[]): CheckItem => {
  const st = names.map((n) => docStatus(d, n));
  const done = st.every((s) => s === 'collected');
  const missing = names.filter((_, i) => st[i] === 'missing');
  return { key, label, done, action: done ? undefined : missing.length ? { kind: 'requestDocs', label: 'Request', arg: missing } : { kind: 'markDocs', label: 'Mark received', arg: names } };
};

export function checklistFor(pipe: PipeKey, stage: string, r: any, now = Date.now()): CheckItem[] {
  if (pipe === 'leads') {
    const sc = r.screening || {};
    if (stage === LEAD_STAGE.NEW) return [{ key: 'attempt', label: 'First contact attempt', done: leadAttempts(r) > 0, action: { kind: 'call', label: 'Call' } }];
    if (stage === LEAD_STAGE.ATTEMPTING) return [{ key: 'reached', label: 'Two-way contact made', done: leadReached(r), action: { kind: 'markReached', label: 'Mark reached' } }];
    if (stage === LEAD_STAGE.CONTACTED) return [
      { key: 'cdl', label: 'CDL-A confirmed', done: sc.cdlValid === true && /A/i.test(r.licenseType || ''), action: { kind: 'screen', label: 'Confirm', arg: 'cdlValid' } },
      { key: 'exp', label: '1+ yr verifiable experience', done: (+r.experienceYears || 0) >= 1, action: { kind: 'openProfile', label: 'Edit' } },
      { key: 'mvr', label: 'MVR self-report clear', done: sc.mvrClear === true, action: { kind: 'screen', label: 'Confirm', arg: 'mvrClear' } },
      { key: 'medical', label: 'DOT medical card current', done: sc.medical === true, action: { kind: 'screen', label: 'Confirm', arg: 'medical' } },
      { key: 'consent', label: 'TCPA consent to text', done: r.consent?.status === 'in', action: { kind: 'consent', label: 'Record opt-in' } },
    ];
    if (stage === LEAD_STAGE.QUALIFIED) return [
      { key: 'email', label: 'Email on file', done: !!r.email, action: { kind: 'openProfile', label: 'Add' } },
      { key: 'consent', label: 'TCPA consent to text', done: r.consent?.status === 'in', action: { kind: 'consent', label: 'Record opt-in' } },
    ];
    return [];
  }
  if (pipe === 'hiring') {
    if (stage === HIRING_STAGE.APPLICATION) return [
      { key: 'app', label: 'Application submitted', done: !!r.application?.submitted, action: { kind: 'markApp', label: 'Mark received' } },
      { key: 'cdlA', label: 'CDL class A', done: (r.cdlClass || '').toUpperCase() === 'A', action: { kind: 'openProfile', label: 'Edit' } },
      { key: 'contact', label: 'Phone & email on file', done: !!r.phone && !!r.email, action: { kind: 'openProfile', label: 'Edit' } },
    ];
    if (stage === HIRING_STAGE.DOCS) {
      const clr = docItem(r, 'clearinghouse', 'Clearinghouse query', ['Clearinghouse Consent']);
      if (clr.done && r.clearinghouse !== 'clear') { clr.done = false; clr.action = { kind: 'markCheck', label: 'Mark clear', arg: 'clearinghouse' }; }
      const drug = docItem(r, 'drug', 'Pre-employment drug test', ['Drug Test Consent']);
      if (drug.done && r.drugTest !== 'passed') { drug.done = false; drug.action = { kind: 'markCheck', label: 'Mark passed', arg: 'drugTest' }; }
      return [
        docItem(r, 'cdl', 'CDL (front & back)', ['CDL Front', 'CDL Back']),
        docItem(r, 'medical', 'DOT medical card', ['Medical Card']),
        docItem(r, 'mvr', 'MVR', ['MVR']),
        docItem(r, 'psp', 'PSP report', ['PSP Report']),
        clr, drug,
      ];
    }
    if (stage === HIRING_STAGE.OFFER) {
      const es = esignStatus(r);
      return [
        { key: 'sent', label: 'Offer package sent', done: es !== 'none', action: { kind: 'sendOffer', label: 'Send' } },
        { key: 'signed', label: 'Offer & agreement signed', done: es === 'completed', action: { kind: 'markSigned', label: 'Mark signed' } },
      ];
    }
    if (stage === HIRING_STAGE.ORIENTATION) return [
      { key: 'scheduled', label: 'Orientation scheduled', done: !!r.orientationDate, action: { kind: 'scheduleOrientation', label: 'Schedule' } },
      { key: 'truck', label: 'Truck assigned', done: !!(r.assignedTruckId || r.truckNo), action: { kind: 'assignTruck', label: 'Assign' } },
      { key: 'done', label: 'Orientation completed', done: !!r.orientationDone, action: { kind: 'completeOrientation', label: 'Complete' } },
    ];
    if (stage === HIRING_STAGE.HIRED) return [
      { key: 'truck', label: 'Truck assigned', done: !!(r.assignedTruckId || r.truckNo), action: { kind: 'assignTruck', label: 'Assign' } },
      { key: 'w9', label: 'W-9 on file', done: docStatus(r, 'W-9') === 'collected', action: docStatus(r, 'W-9') === 'missing' ? { kind: 'requestDocs', label: 'Request', arg: ['W-9'] } : { kind: 'markDocs', label: 'Mark received', arg: ['W-9'] } },
    ];
    return [];
  }
  if (pipe === 'active') {
    if (stage === ACTIVE_STAGE.FIRST90) {
      const cis = (r.checkIns || []).slice().sort((a: any, b: any) => a.day - b.day);
      return cis.map((c: any) => ({ key: 'ci' + c.day, label: `Day ${c.day} check-in`, done: !!c.doneAt, action: c.doneAt ? undefined : { kind: 'checkIn', label: +new Date(c.due) <= now ? 'Log now' : 'Log', arg: c.day } }));
    }
    if (stage === ACTIVE_STAGE.LEAVE) return [{ key: 'return', label: 'Return-to-work date confirmed', done: !!r.returnDate, action: { kind: 'setReturn', label: 'Set' } }];
    if (stage === ACTIVE_STAGE.AT_RISK) return [
      { key: 'retention', label: 'Retention call logged', done: !!r.retentionCallAt, action: { kind: 'retentionCall', label: 'Log call' } },
      { key: 'plan', label: 'Action plan noted', done: !!r.actionPlan, action: { kind: 'actionPlan', label: 'Add' } },
    ];
    return [];
  }
  // inactive
  if (stage === INACTIVE_STAGE.INACTIVE) return [
    { key: 'reason', label: 'Exit reason recorded', done: !!r.quitReason, action: { kind: 'openProfile', label: 'Open' } },
    { key: 'eligible', label: 'Eligible for rehire', done: r.rehireEligible === true, action: { kind: 'markEligible', label: 'Mark eligible' } },
  ];
  if (stage === INACTIVE_STAGE.REENGAGING) {
    const lc = driverLastContact(r);
    return [
      { key: 'outreach', label: 'Outreach in the last 14 days', done: !!lc && daysBetween(lc, now) <= 14, action: { kind: 'outreach', label: 'Log outreach' } },
      { key: 'interest', label: 'Driver wants to come back', done: !!r.reengageInterested, action: { kind: 'markInterested', label: 'Mark interested' } },
    ];
  }
  return [];
}

/** Where "Move to next stage" goes from a stage (handoff zones included). */
export function nextStageOf(def: PipeDef, stage: string): string | null {
  if (def.key === 'active') return ({ [ACTIVE_STAGE.FIRST90]: ACTIVE_STAGE.ACTIVE, [ACTIVE_STAGE.LEAVE]: ACTIVE_STAGE.ACTIVE, [ACTIVE_STAGE.AT_RISK]: ACTIVE_STAGE.ACTIVE } as Record<string, string>)[stage] || null;
  const st = stageDef(def, stage);
  if (!st || st.final) return null;
  const open = openStages(def);
  const i = open.findIndex((s) => s.name === stage);
  if (i >= 0 && i < open.length - 1) return open[i + 1].name;
  return def.stages.find((s) => s.final === 'handoff')?.name || null;
}

export function readyToAdvance(def: PipeDef, r: any, now = Date.now()): boolean {
  const stage = stageOf(def.key, r);
  const st = stageDef(def, stage);
  if (!st || st.final || !nextStageOf(def, stage)) return false;
  const items = checklistFor(def.key, stage, r, now);
  return items.length > 0 && items.every((x) => x.done);
}

/** Requirements that are still open when moving `r` into `target`
    (HubSpot-style "required info when entering a stage"). */
export function missingForMove(def: PipeDef, r: any, target: string, now = Date.now()): CheckItem[] {
  const pipe = def.key; const cur = stageOf(pipe, r);
  const t = stageDef(def, target);
  if (!t || t.final === 'lost' || cur === target) return [];
  if (pipe === 'active') return nextStageOf(def, cur) === target ? checklistFor(pipe, cur, r, now).filter((x) => !x.done) : [];
  if (pipe === 'inactive' && target === INACTIVE_STAGE.REAPPLIED) return r.rehireEligible === false ? [{ key: 'dnr', label: 'Driver is marked not eligible for rehire', done: false }] : [];
  const open = openStages(def);
  const ci = open.findIndex((s) => s.name === cur);
  if (ci < 0) return []; // re-opening from a final stage
  const ti = t.final === 'handoff' ? open.length : open.findIndex((s) => s.name === target);
  if (ti <= ci) return [];
  const out: CheckItem[] = [];
  for (let i = ci; i < ti; i++) out.push(...checklistFor(pipe, open[i].name, r, now).filter((x) => !x.done));
  return out;
}

export type MovePlan =
  | { kind: 'noop' }
  | { kind: 'move'; missing: CheckItem[] }
  | { kind: 'reason'; missing: CheckItem[] }
  | { kind: 'quit'; missing: CheckItem[] }
  | { kind: 'risk'; missing: CheckItem[] }
  | { kind: 'handoff'; to: PipeKey; missing: CheckItem[] };

/** Decide what the UI must collect before a stage move can be committed. */
export function planMove(def: PipeDef, r: any, target: string, now = Date.now()): MovePlan {
  const cur = stageOf(def.key, r);
  const t = stageDef(def, target);
  if (!t || cur === target) return { kind: 'noop' };
  if (def.key === 'active' && target === ACTIVE_STAGE.QUIT) return { kind: 'quit', missing: [] };
  if (def.key === 'active' && target === ACTIVE_STAGE.AT_RISK) return { kind: 'risk', missing: [] };
  if (t.final === 'lost') return { kind: 'reason', missing: [] };
  const missing = missingForMove(def, r, target, now);
  if (t.final === 'handoff') return { kind: 'handoff', to: t.to as PipeKey, missing };
  return { kind: 'move', missing };
}

/* ───────── filters ───────── */
export interface Filters { mine?: boolean; pastSla?: boolean; noNext?: boolean; ready?: boolean; hot?: boolean; recruiter?: string; q?: string }

export function isHot(pipe: PipeKey, r: any, now = Date.now()): boolean {
  if (pipe === 'leads') return (+r.score || 0) >= 85;
  if (pipe === 'hiring') return (+r.score || 0) >= 85 && r.risk !== 'High';
  if (pipe === 'active') return r.activeStage === ACTIVE_STAGE.AT_RISK || !!r.riskReason;
  const lc = driverLastContact(r);
  return r.rehireEligible === true && !!lc && daysBetween(lc, now) <= 30 && r.inactiveStage !== INACTIVE_STAGE.DNR;
}
export const HOT_HINT: Record<PipeKey, string> = {
  leads: 'Lead score 85+', hiring: 'Fit score 85+ with low risk', active: 'Flagged at risk — needs a retention touch', inactive: 'Rehire-eligible and in touch within 30 days',
};
export function isOpen(def: PipeDef, r: any) { const st = stageDef(def, stageOf(def.key, r)); return !!st && !st.final; }

export function matchesFilters(def: PipeDef, r: any, f: Filters, now = Date.now()): boolean {
  const pipe = def.key;
  if (f.q) {
    const hay = `${r.name} ${r.phone || ''} ${r.email || ''} ${r.carrier || ''} ${r.truckNo || ''} ${r.location || ''}`.toLowerCase();
    if (!hay.includes(f.q.trim().toLowerCase())) return false;
  }
  if (f.recruiter && f.recruiter !== 'all' && ownerOf(pipe, r) !== f.recruiter) return false;
  if (f.mine && ownerOf(pipe, r) !== ME) return false;
  if (f.pastSla && recordSla(def, r, now) !== 'over') return false;
  if (f.noNext && (!isOpen(def, r) || nextStepOf(pipe, r))) return false;
  if (f.ready && !readyToAdvance(def, r, now)) return false;
  if (f.hot && !isHot(pipe, r, now)) return false;
  return true;
}

/* ───────── stats strip ───────── */
export interface Stat { key: string; label: string; value: string; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'bad'; test?: (r: any) => boolean; jump?: { pipe: PipeKey; stat: string } }
const sameDay = (a: string | null | undefined, now: number) => !!a && new Date(a).toDateString() === new Date(now).toDateString();
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
export function fmtDuration(min: number | null): string {
  if (min == null || !isFinite(min)) return '—';
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
export const isConverted = (l: any) => !!l.convertedTo || l.stageName === LEAD_STAGE.TO_HIRING;

/** 90-day retention: of drivers who were hired ≥90 days ago (or already left
    before reaching 90 days), the share whose tenure reached 90 days. */
export function retention90(drivers: any[], now = Date.now()) {
  const tenures: { days: number; ended: boolean; since: number }[] = [];
  for (const d of drivers) {
    if (d.archived) continue;
    for (const t of d.tenures || []) if (t.hireDate && t.endDate) tenures.push({ days: daysBetween(t.hireDate, +new Date(t.endDate)), ended: true, since: daysBetween(t.hireDate, now) });
    if (d.hireDate && d.lifecycle !== 'hiring' && !(d.lifecycle === 'inactive' && (d.tenures || []).some((t: any) => t.hireDate === d.hireDate))) {
      const ended = d.lifecycle === 'inactive';
      tenures.push({ days: tenureDays(d, now) || 0, ended, since: daysBetween(d.hireDate, now) });
    }
  }
  const cohort = tenures.filter((t) => t.since >= 90 || (t.ended && t.days < 90));
  const kept = cohort.filter((t) => t.days >= 90).length;
  return { cohort: cohort.length, kept, pct: pct(kept, cohort.length) };
}

export function pipeStats(def: PipeDef, records: any[], ctx: { allLeads?: any[]; allDrivers?: any[]; now?: number } = {}): Stat[] {
  const now = ctx.now ?? Date.now();
  const pipe = def.key;
  const open = records.filter((r) => isOpen(def, r));
  const count = (xs: any[]) => String(xs.length);
  if (pipe === 'leads') {
    const all = (ctx.allLeads || records).filter((l) => !l.archived);
    const speeds = all.filter((l) => daysBetween(l.createdAt, now) <= 30).map(speedToLeadMin).filter((x): x is number => x != null);
    const sp = avg(speeds);
    const qual = all.filter((l) => l.stageName === LEAD_STAGE.QUALIFIED || isConverted(l)).length;
    const newToday = (r: any) => sameDay(r.createdAt, now);
    const notContacted = (r: any) => isOpen(def, r) && leadAttempts(r) === 0;
    const slow = (r: any) => { if (!isOpen(def, r)) return false; const s = speedToLeadMin(r); return s == null ? (now - +new Date(r.createdAt)) / 6e4 > 60 : s > 60; };
    const qp = pct(qual, all.length);
    return [
      { key: 'newToday', label: 'New today', value: count(records.filter(newToday)), test: newToday },
      { key: 'notContacted', label: 'Not contacted', value: count(records.filter(notContacted)), tone: records.some(notContacted) ? 'warn' : 'neutral', test: notContacted },
      { key: 'speed', label: 'Avg speed-to-lead', value: fmtDuration(sp), hint: 'Click to see leads slower than 1h', tone: sp == null ? 'neutral' : sp <= 15 ? 'good' : sp <= 60 ? 'warn' : 'bad', test: slow },
      { key: 'qualified', label: 'Qualified', value: qp == null ? '—' : `${qp}%`, hint: 'Qualified or moved to Hiring', test: (r: any) => r.stageName === LEAD_STAGE.QUALIFIED },
    ];
  }
  if (pipe === 'hiring') {
    const all = (ctx.allDrivers || records).filter((d) => !d.archived);
    const tth = all.filter((d) => d.hireDate && d.appliedAt && +new Date(d.hireDate) >= +new Date(d.appliedAt)).map((d) => daysBetween(d.appliedAt, +new Date(d.hireDate)));
    const a = avg(tth);
    const past = (r: any) => recordSla(def, r, now) === 'over';
    const docs = (r: any) => isOpen(def, r) && hasMissingDocs(r);
    const offers = (r: any) => r.stage === HIRING_STAGE.OFFER && esignStatus(r) !== 'completed';
    const slow = (r: any) => isOpen(def, r) && a != null && daysBetween(r.appliedAt || r.stageSince, now) > a;
    return [
      { key: 'inProgress', label: 'In progress', value: count(open), test: (r: any) => isOpen(def, r) },
      { key: 'pastSla', label: 'Past SLA', value: count(records.filter(past)), tone: records.some(past) ? 'bad' : 'good', test: past },
      { key: 'docs', label: 'Docs missing', value: count(records.filter(docs)), tone: records.some(docs) ? 'warn' : 'good', test: docs },
      { key: 'offers', label: 'Offers out', value: count(records.filter(offers)), test: offers },
      { key: 'tth', label: 'Avg days to hire', value: a == null ? '—' : `${Math.round(a)}d`, hint: 'Click to see candidates slower than average', test: slow },
    ];
  }
  if (pipe === 'active') {
    const ret = retention90(ctx.allDrivers || records, now);
    const first = (r: any) => r.activeStage === ACTIVE_STAGE.FIRST90;
    const risk = (r: any) => r.activeStage === ACTIVE_STAGE.AT_RISK || !!r.riskReason;
    return [
      { key: 'active', label: 'Active drivers', value: count(records) },
      { key: 'first90', label: 'In first 90 days', value: count(records.filter(first)), test: first },
      { key: 'atRisk', label: 'At risk', value: count(records.filter(risk)), tone: records.some(risk) ? 'bad' : 'good', test: risk },
      { key: 'retention', label: '90-day retention', value: ret.pct == null ? '—' : `${ret.pct}%`, hint: `${ret.kept} of ${ret.cohort} drivers stayed 90+ days · click for tenured drivers`, tone: ret.pct == null ? 'neutral' : ret.pct >= 80 ? 'good' : ret.pct >= 60 ? 'warn' : 'bad', test: (r: any) => (tenureDays(r, now) || 0) >= 90 },
    ];
  }
  const all = ctx.allDrivers || records;
  const reasons: Record<string, number> = {};
  records.forEach((r) => { if (r.quitReason) reasons[r.quitReason] = (reasons[r.quitReason] || 0) + 1; });
  const top = Object.entries(reasons).sort((x, y) => y[1] - x[1])[0];
  const eligible = (r: any) => r.rehireEligible === true && r.inactiveStage !== INACTIVE_STAGE.DNR;
  const reeng = (r: any) => r.inactiveStage === INACTIVE_STAGE.REENGAGING;
  const rehired = all.filter((d) => !d.archived && d.lastReappliedAt && daysBetween(d.lastReappliedAt, now) <= 30);
  return [
    { key: 'inactive', label: 'Inactive', value: count(open), hint: 'Excludes Do not rehire', test: (r: any) => isOpen(def, r) },
    { key: 'eligible', label: 'Rehire-eligible', value: count(records.filter(eligible)), tone: 'good', test: eligible },
    { key: 'reengaging', label: 'Re-engaging', value: count(records.filter(reeng)), test: reeng },
    { key: 'rehired', label: 'Rehired (30d)', value: String(rehired.length), hint: 'Re-applied in the last 30 days · opens them in Hiring', jump: { pipe: 'hiring', stat: 'rehires' } },
    { key: 'topReason', label: 'Top quit reason', value: top ? top[0] : '—', hint: top ? `${top[1]} driver${top[1] === 1 ? '' : 's'} · click to filter` : undefined, test: top ? (r: any) => r.quitReason === top[0] : undefined },
  ];
}
/** Hidden stat filters reachable through a `jump` from another pipeline. */
export const JUMP_TESTS: Record<string, (r: any) => boolean> = { rehires: (r: any) => (r.reapplyCount || 0) > 0 };

/* ───────── column metrics ───────── */
export interface ColumnMetric { count: number; avgDays: number | null; pastSla: number; conversion: number | null }
/** Per-stage count, average days, past-SLA and snapshot conversion from the
    previous column. `beyond` = records that already left through the handoff. */
export function columnMetrics(def: PipeDef, records: any[], beyond = 0, now = Date.now()): Record<string, ColumnMetric> {
  const pipe = def.key; const open = openStages(def);
  const out: Record<string, ColumnMetric> = {};
  const idx = (r: any) => {
    const s = stageOf(pipe, r); const i = open.findIndex((x) => x.name === s);
    if (i >= 0) return i;
    const st = stageDef(def, s);
    if (st?.final === 'lost') { const j = open.findIndex((x) => x.name === r.lostFrom); return j >= 0 ? j : 0; }
    return open.length; // handoff / won
  };
  const linear = pipe !== 'active';
  const reached = open.map((_, i) => records.filter((r) => idx(r) >= i).length + beyond);
  for (const s of def.stages) {
    const inStage = records.filter((r) => stageOf(pipe, r) === s.name);
    const days = inStage.map((r) => daysInStage(pipe, r, now));
    const i = open.findIndex((x) => x.name === s.name);
    out[s.name] = {
      count: inStage.length,
      avgDays: s.final || !days.length ? null : Math.round(avg(days) as number),
      pastSla: s.final ? 0 : inStage.filter((r) => slaLevel(daysInStage(pipe, r, now), s.maxDays) === 'over').length,
      conversion: linear && i > 0 ? pct(reached[i], reached[i - 1]) : null,
    };
  }
  return out;
}

/* ───────── lifecycle strip ───────── */
export function lifecycleFunnel(leads: any[], drivers: any[]) {
  const L = leads.filter((l) => !l.archived);
  const D = drivers.filter((d) => !d.archived);
  const openLead = (l: any) => !isConverted(l) && l.stageName !== LEAD_STAGE.NOT_QUALIFIED && l.stageName !== LEAD_STAGE.ARCHIVED;
  const counts = {
    leads: L.filter(openLead).length,
    hiring: D.filter((d) => pipeOfDriver(d) === 'hiring' && d.stage !== HIRING_STAGE.LOST).length,
    active: D.filter((d) => pipeOfDriver(d) === 'active').length,
    inactive: D.filter((d) => pipeOfDriver(d) === 'inactive' && d.inactiveStage !== INACTIVE_STAGE.DNR).length,
  };
  const everHired = D.filter((d) => d.hireDate || (d.tenures || []).length);
  return {
    counts,
    leadToHiring: pct(L.filter(isConverted).length, L.length),
    hiringToActive: pct(everHired.length, D.length),
    churn: pct(D.filter((d) => pipeOfDriver(d) === 'inactive').length, everHired.length),
  };
}

/** Lifecycle breadcrumb state for a driver (optionally its originating lead). */
export function lifecyclePath(d: any | null, lead?: any | null): { current: PipeKey; reached: PipeKey[] } {
  if (!d) return { current: 'leads', reached: ['leads'] };
  const reached = new Set<PipeKey>();
  if (lead || d.leadId) reached.add('leads');
  reached.add('hiring');
  if (d.hireDate || (d.tenures || []).length) reached.add('active');
  if (d.inactiveSince || (d.tenures || []).length) reached.add('inactive');
  const current = pipeOfDriver(d);
  reached.add(current);
  return { current, reached: (['leads', 'hiring', 'active', 'inactive'] as PipeKey[]).filter((p) => reached.has(p)) };
}

/* ───────── ordering + labels ───────── */
const SLA_RANK: Record<SlaLevel, number> = { over: 0, warn: 1, ok: 2, none: 3 };
/** Most urgent first: past SLA, then nearing SLA, then longest in stage. */
export function sortForColumn(def: PipeDef, records: any[], now = Date.now()) {
  return records.slice().sort((a, b) => SLA_RANK[recordSla(def, a, now)] - SLA_RANK[recordSla(def, b, now)] || daysInStage(def.key, b, now) - daysInStage(def.key, a, now) || String(a.name).localeCompare(String(b.name)));
}
export function lifecycleLabel(d: any): string {
  const p = pipeOfDriver(d);
  return `${PIPE_META[p].label} · ${stageOf(p, d)}`;
}
export function fmtShortAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const m = Math.floor((now - +new Date(iso)) / 6e4);
  if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 60) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
export function fmtDay(iso: string | null | undefined) { if (!iso) return '—'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
