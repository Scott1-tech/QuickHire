/* Store-bound lifecycle actions: stage moves with undo snapshots, the four
   pipeline handoffs, checklist one-click actions, next steps, tasks, calls,
   bulk actions and the e-sign completion listener. Every change is logged on
   the record timeline (and mirrored to the global activity log by the stores). */
import { store as rStore, svc as rSvc, norm } from '../recruit/store';
import { store as hStore, svc as hSvc } from '../hire/store';
import { svc as shellSvc } from '../shell/store';
import { addExternalTask, makeTask, removeExternalTasks } from '../tasks/bus';
import {
  PipeKey, LEAD_STAGE, HIRING_STAGE, ACTIVE_STAGE, INACTIVE_STAGE, CHECKIN_DAYS, recruiterName, recruiterId,
} from './stages';
import {
  buildPipes, stageOf, kindOf, pipeOfDriver, suggestedNextStep, nextStepOf, CheckAction, HANDOFF_TO_ACTIVE,
  isConverted, fmtDay, DAY, tenureDays,
} from './lifecycle';

const nowIso = () => new Date().toISOString();
const isoDay = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export interface Undoable { label: string; undo: () => void }
export interface ActionResult { ok: boolean; message: string; kind?: 'success' | 'info' | 'warning' | 'danger'; undo?: Undoable; openPipe?: PipeKey; id?: string }

/* ───────── reads ───────── */
export const pipes = () => buildPipes(rStore.stages);
export function records(pipe: PipeKey): any[] {
  if (pipe === 'leads') return rStore.leads.filter((l: any) => !l.archived && l.stageName !== LEAD_STAGE.TO_HIRING && l.stageName !== LEAD_STAGE.ARCHIVED && !l.convertedTo);
  return hStore.drivers.filter((d: any) => !d.archived && pipeOfDriver(d) === pipe);
}
export function record(pipe: PipeKey, id: string) { return pipe === 'leads' ? rSvc.lead(id) : hSvc.driver(id); }
export const allLeads = () => rStore.leads;
export const allDrivers = () => hStore.drivers;
/** Records that already left a pipeline through its handoff (feeds conversion %). */
export function handedOff(pipe: PipeKey): number {
  if (pipe === 'leads') return rStore.leads.filter((l: any) => !l.archived && isConverted(l)).length;
  if (pipe === 'hiring') return hStore.drivers.filter((d: any) => !d.archived && pipeOfDriver(d) !== 'hiring' && d.hireDate).length;
  if (pipe === 'inactive') return hStore.drivers.filter((d: any) => !d.archived && pipeOfDriver(d) === 'hiring' && d.reapplyCount > 0).length;
  return 0;
}
/** Records that went through a pipeline's handoff in the last `days`. */
export function recentHandoffs(pipe: PipeKey, days = 30): any[] {
  const since = Date.now() - days * DAY;
  const t = (x: string | null | undefined) => !!x && +new Date(x) >= since;
  if (pipe === 'leads') return rStore.leads.filter((l: any) => !l.archived && t(l.convertedAt));
  if (pipe === 'hiring') return hStore.drivers.filter((d: any) => !d.archived && pipeOfDriver(d) !== 'hiring' && t(d.hireDate));
  if (pipe === 'active') return hStore.drivers.filter((d: any) => !d.archived && pipeOfDriver(d) === 'inactive' && t(d.inactiveSince));
  return hStore.drivers.filter((d: any) => !d.archived && t(d.lastReappliedAt));
}

/* ───────── logging + snapshots ───────── */
function logOn(pipe: PipeKey, id: string, type: string, title: string, detail = '') {
  if (pipe === 'leads') rSvc.logEvent(id, type, title, detail);
  else hSvc.log(id, type, title, detail);
}
type Snap = { kind: 'lead' | 'driver'; id: string; data: any };
function snap(kind: 'lead' | 'driver', id: string): Snap | null {
  const r = kind === 'lead' ? rSvc.lead(id) : hSvc.driver(id);
  return r ? { kind, id, data: clone(r) } : null;
}
function restore(s: Snap | null) { if (!s) return; if (s.kind === 'lead') rSvc.replace(clone(s.data)); else hSvc.replace(clone(s.data)); }
function undoable(label: string, snaps: (Snap | null)[], extra?: () => void): Undoable {
  return { label, undo: () => { snaps.slice().reverse().forEach(restore); extra?.(); shellSvc.logActivity('undo', `Undone: ${label}`); } };
}
const touch = (pipe: PipeKey) => (pipe === 'leads' ? rSvc.touch() : hSvc.touch());

/** Smart default: when a record lands in a stage with no open next step, give
    it the stage's suggested next step (due tomorrow). */
function ensureNextStep(pipe: PipeKey, r: any, stage: string) {
  if (nextStepOf(pipe, r)) return;
  const n = { title: suggestedNextStep(stage), due: new Date(Date.now() + DAY).toISOString(), status: 'open' };
  if (pipe === 'leads') r.nextAction = { ...n, assignee: r.ownerId || 'NP', priority: 'normal' };
  else r.nextStep = n;
}

/* ───────── stage moves ───────── */
export interface MoveOpts { reason?: string; note?: string; override?: string[] }

/** Commit a plain (same-pipeline) stage move. Returns an undo token. */
export function moveRecord(pipe: PipeKey, id: string, stage: string, opts: MoveOpts = {}): ActionResult {
  const r = record(pipe, id);
  if (!r) return { ok: false, message: 'Record not found', kind: 'danger' };
  const from = stageOf(pipe, r);
  if (from === stage) return { ok: false, message: 'Already in ' + stage, kind: 'info' };
  const s = snap(kindOf(pipe), id);
  const detail = [opts.reason ? `Reason: ${opts.reason}` : '', opts.note || '', opts.override?.length ? `Moved with open requirements: ${opts.override.join(', ')}` : ''].filter(Boolean).join(' · ');
  if (pipe === 'leads') {
    if (stage === LEAD_STAGE.NOT_QUALIFIED) { r.lostFrom = from; r.closeReason = opts.reason || 'Other'; r.decision = 'not_acceptable'; }
    else if (from === LEAD_STAGE.NOT_QUALIFIED) { r.decision = null; r.closeReason = null; r.lostFrom = null; }
    if (stage !== LEAD_STAGE.NOT_QUALIFIED) ensureNextStep(pipe, r, stage);
    rSvc.moveStage(id, stage, { detail });
  } else if (pipe === 'hiring') {
    if (stage === HIRING_STAGE.LOST) { r.lostFrom = from; r.lostReason = opts.reason || 'Other'; }
    else { if (from === HIRING_STAGE.LOST) { r.lostReason = ''; r.lostFrom = ''; } ensureNextStep(pipe, r, stage); }
    hSvc.moveStage(id, stage, detail);
  } else if (pipe === 'active') {
    r.activeStage = stage; r.activeSince = nowIso();
    if (stage === ACTIVE_STAGE.AT_RISK) { r.riskReason = opts.reason || 'Other'; r.riskNote = opts.note || ''; r.retentionCallAt = null; r.actionPlan = ''; }
    if (from === ACTIVE_STAGE.AT_RISK && stage === ACTIVE_STAGE.ACTIVE) r.riskReason = '';
    if (stage === ACTIVE_STAGE.LEAVE) r.returnDate = null;
    if (!(stage === ACTIVE_STAGE.FIRST90)) ensureNextStep(pipe, r, stage);
    hSvc.log(id, 'stage', `Moved: ${from} → ${stage}`, stage === ACTIVE_STAGE.AT_RISK ? `Risk: ${r.riskReason}${opts.note ? ' — ' + opts.note : ''}` : detail);
  } else {
    r.inactiveStage = stage; r.inactiveStageSince = nowIso();
    if (stage === INACTIVE_STAGE.DNR) { r.rehireEligible = false; r.dnrReason = opts.reason || 'Other'; }
    else ensureNextStep(pipe, r, stage);
    hSvc.log(id, 'stage', `Moved: ${from} → ${stage}`, detail);
  }
  return { ok: true, message: `${r.name} → ${stage}`, kind: 'success', undo: undoable(`Moved ${r.name} to ${stage}`, [s]) };
}

/* ───────── handoffs ───────── */
function findDriverMatch(l: any) {
  const p = norm(l.phone), e = norm(l.email);
  return hStore.drivers.find((d: any) => !d.archived && ((l.convertedTo && d.id === l.convertedTo) || d.leadId === l.id || (e && norm(d.email) === e) || (p && p.length >= 7 && norm(d.phone).slice(-10) === p.slice(-10))));
}
const cdlClassOf = (license: string) => ((license || 'Class A').match(/Class\s*([ABC])/i)?.[1] || 'A').toUpperCase();

/** Leads → Hiring: create (or link) the hire driver and close the lead as won. */
export function leadToHiring(leadId: string): ActionResult {
  const l = rSvc.lead(leadId);
  if (!l) return { ok: false, message: 'Lead not found', kind: 'danger' };
  if (l.consent?.doNotContact) return { ok: false, message: `${l.name} is Do-Not-Contact — cannot move to Hiring`, kind: 'danger' };
  const ls = snap('lead', leadId);
  const existing = findDriverMatch(l);
  let driverId: string; let created = false; let ds: Snap | null = null; let msg: string;
  if (existing) {
    driverId = existing.id; ds = snap('driver', existing.id);
    existing.leadId = existing.leadId || l.id;
    if (pipeOfDriver(existing) === 'inactive') { reapplyCore(existing, 'Re-applied from a new lead'); msg = `${l.name} re-applied — back in Hiring`; }
    else { hSvc.log(existing.id, 'lifecycle', 'Linked to lead', `${l.source} lead linked to this ${pipeOfDriver(existing)} record`); msg = `${l.name} is already in ${pipeOfDriver(existing) === 'active' ? 'Active' : 'Hiring'} — linked`; }
  } else {
    const d = hSvc.addDriver({
      name: l.name, phone: l.phone, email: l.email || `${l.name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`, carrier: l.carrier || 'GRAND ONE LLC', position: 'Company Driver',
      cdlClass: cdlClassOf(l.licenseType), ownerName: recruiterName(l.ownerId), experienceYears: +l.experienceYears || 0, location: l.location || '', source: l.source, lane: l.lane || '',
      leadId: l.id, lifecycle: 'hiring', example: !!l.example, score: l.score || 70,
      nextStep: { title: suggestedNextStep(HIRING_STAGE.APPLICATION), due: new Date(Date.now() + DAY).toISOString(), status: 'open' },
    }, HIRING_STAGE.APPLICATION);
    driverId = d.id; created = true;
    hSvc.log(d.id, 'lifecycle', 'Lead → Hiring', `From ${l.source} lead · recruiter ${recruiterName(l.ownerId)} · CDL ${l.licenseType || 'Class A'}, ${l.experienceYears || 0} yrs`);
    msg = `${l.name} moved to Hiring · Application`;
  }
  l.convertedTo = driverId; l.convertedAt = nowIso();
  rSvc.moveStage(leadId, LEAD_STAGE.TO_HIRING, { detail: 'Handed off to the Hiring pipeline' });
  rSvc.logEvent(leadId, 'lifecycle', 'Lead → Hiring', created ? 'New hiring record created (Application)' : 'Linked to existing driver record');
  return {
    ok: true, message: msg, kind: 'success', openPipe: 'hiring', id: driverId,
    undo: undoable(`Moved ${l.name} to Hiring`, [ls, ds], () => { if (created) hSvc.remove(driverId); }),
  };
}

/** Hiring → Active: hire date, First 90 days, and day 7/30/45/90 check-in tasks. */
export function startOnboarding(driverId: string): ActionResult {
  const d = hSvc.driver(driverId);
  if (!d) return { ok: false, message: 'Driver not found', kind: 'danger' };
  if (pipeOfDriver(d) !== 'hiring') return { ok: false, message: `${d.name} is not in Hiring`, kind: 'info' };
  const s = snap('driver', driverId);
  const now = Date.now();
  const truck = d.assignedTruckId ? hStore.trucks.find((t: any) => t.id === d.assignedTruckId) : null;
  const owner = recruiterId(d.ownerName);
  const taskIds: string[] = [];
  const checkIns = CHECKIN_DAYS.map((day) => {
    const due = now + day * DAY;
    const t = addExternalTask(makeTask({
      title: `Day ${day} check-in — ${d.name}`,
      description: `90-day onboarding check-in for ${d.name} (${d.carrier}). Ask about pay, home time, equipment and dispatch; log it on the driver's timeline.`,
      due: isoDay(due), priority: day === 7 ? 'high' : 'normal', relatedType: 'driver', related: d.name, carrier: d.carrier,
      assignee: owner, source: 'automation', tags: ['Onboarding', 'Follow-up'], createdBy: 'Pipelines',
    }));
    taskIds.push(t.id);
    return { day, due: new Date(due).toISOString(), doneAt: null, taskId: t.id };
  });
  if (d.stage !== HIRING_STAGE.HIRED) { d.stage = HIRING_STAGE.HIRED; d.stageSince = nowIso(); }
  Object.assign(d, {
    lifecycle: 'active', hireDate: nowIso(), activeStage: ACTIVE_STAGE.FIRST90, activeSince: nowIso(), checkIns,
    truckNo: truck?.unit || d.truckNo || '', lastCheckIn: null, riskReason: '',
    nextStep: { title: 'Day 7 check-in', due: checkIns[0].due, status: 'open' },
  });
  d.tasks = [...checkIns.map((c) => ({ id: c.taskId, title: `Day ${c.day} check-in`, due: c.due, status: 'open' })), ...(d.tasks || [])];
  hSvc.log(driverId, 'lifecycle', 'Hiring → Active · First 90 days', `Hire date ${fmtDay(d.hireDate)}. 4 check-in tasks created (day 7, 30, 45, 90).`);
  return { ok: true, message: `${d.name} started 90-day onboarding · 4 check-in tasks created`, kind: 'success', openPipe: 'active', id: driverId, undo: undoable(`Started onboarding for ${d.name}`, [s], () => removeExternalTasks(taskIds)) };
}

export interface QuitInput { reason: string; type: 'Quit' | 'Terminated'; rehireEligible: boolean; note?: string }
/** Active → Inactive with a required exit reason + rehire eligibility. */
export function markQuit(driverId: string, q: QuitInput): ActionResult {
  const d = hSvc.driver(driverId);
  if (!d) return { ok: false, message: 'Driver not found', kind: 'danger' };
  if (!q.reason) return { ok: false, message: 'Pick a reason', kind: 'warning' };
  const s = snap('driver', driverId);
  const now = nowIso();
  const tenure = tenureDays(d) ?? 0;
  d.tenures = [...(d.tenures || []), { hireDate: d.hireDate, endDate: now, reason: q.reason, type: q.type }];
  Object.assign(d, {
    lifecycle: 'inactive', activeStage: ACTIVE_STAGE.QUIT, quitReason: q.reason, quitType: q.type, quitNote: q.note || '', inactiveSince: now,
    rehireEligible: q.rehireEligible, inactiveStage: q.rehireEligible ? INACTIVE_STAGE.INACTIVE : INACTIVE_STAGE.DNR, inactiveStageSince: now, riskReason: '',
    nextStep: q.rehireEligible ? { title: 'Exit interview + rehire review', due: new Date(Date.now() + 7 * DAY).toISOString(), status: 'open' } : null,
  });
  if (d.assignedTruckId) { const t = hStore.trucks.find((x: any) => x.id === d.assignedTruckId); if (t) t.status = 'Available'; d.assignedTruckId = null; }
  hSvc.log(driverId, 'lifecycle', `Active → Inactive (${q.type})`, `Reason: ${q.reason}${q.note ? ' — ' + q.note : ''}. Tenure ${tenure} days. Rehire eligible: ${q.rehireEligible ? 'Yes' : 'No'}`);
  return { ok: true, message: `${d.name} moved to Inactive (${q.type.toLowerCase()} · ${q.reason})`, kind: 'success', openPipe: 'inactive', id: driverId, undo: undoable(`Marked ${d.name} ${q.type.toLowerCase()}`, [s]) };
}

function reapplyCore(d: any, why: string) {
  const prev = (d.tenures || [])[d.tenures.length - 1];
  const days = prev?.hireDate && prev?.endDate ? Math.round((+new Date(prev.endDate) - +new Date(prev.hireDate)) / DAY) : null;
  d.reapplyCount = (d.reapplyCount || 0) + 1;
  Object.assign(d, {
    lifecycle: 'hiring', stage: HIRING_STAGE.APPLICATION, stageSince: nowIso(), appliedAt: nowIso(), lastReappliedAt: nowIso(),
    inactiveStage: INACTIVE_STAGE.REAPPLIED, inactiveStageSince: nowIso(), hireDate: null, activeStage: null, checkIns: [], lostReason: '', lostFrom: '',
    nextStep: { title: 'Re-run MVR, PSP, Clearinghouse & drug test', due: new Date(Date.now() + DAY).toISOString(), status: 'open' },
    orientationDate: null, orientationDone: false, esign: null, drugTest: 'missing', clearinghouse: 'pending',
  });
  d.application = { ...(d.application || {}), submitted: false };
  // DOT pre-employment checks must be redone for a rehire
  ['MVR', 'PSP Report', 'Drug Test Consent', 'Clearinghouse Consent'].forEach((n) => { const x = (d.documents || []).find((y: any) => y.name === n); if (x) x.status = 'missing'; });
  hSvc.log(d.id, 'lifecycle', 'Inactive → Hiring (re-applied)', `${why}. Rehire #${d.reapplyCount}${days != null ? ` · previous tenure ${days} days (${prev.reason})` : ''}. MVR, PSP, Clearinghouse and drug test reset; history kept.`);
}
/** Inactive → Hiring · Application (Tenstreet-style reapply, history kept). */
export function reapply(driverId: string): ActionResult {
  const d = hSvc.driver(driverId);
  if (!d) return { ok: false, message: 'Driver not found', kind: 'danger' };
  const s = snap('driver', driverId);
  reapplyCore(d, 'Driver re-applied');
  return { ok: true, message: `${d.name} re-applied → Hiring · Application`, kind: 'success', openPipe: 'hiring', id: driverId, undo: undoable(`Re-applied ${d.name}`, [s]) };
}

/** Commit a move into a handoff zone. */
export function handoff(pipe: PipeKey, id: string, override: string[] = []): ActionResult {
  let res: ActionResult;
  if (pipe === 'leads') res = leadToHiring(id);
  else if (pipe === 'hiring') res = startOnboarding(id);
  else if (pipe === 'inactive') res = reapply(id);
  else return { ok: false, message: 'Use the exit form to move a driver to Inactive', kind: 'info' };
  if (res.ok && override.length) logOn(pipe === 'leads' ? 'leads' : 'hiring', pipe === 'leads' ? id : (res.id || id), 'system', 'Moved with open requirements', override.join(', '));
  return res;
}

/* ───────── checklist one-click actions ───────── */
export function call(pipe: PipeKey, id: string): ActionResult {
  const r = record(pipe, id); if (!r) return { ok: false, message: 'Not found', kind: 'danger' };
  if (pipe === 'leads' && r.consent?.doNotContact) return { ok: false, message: `${r.name} is Do-Not-Contact`, kind: 'danger' };
  try { window.dispatchEvent(new CustomEvent('qh:call', { detail: { phone: r.phone, name: r.name, recordId: r.id, kind: kindOf(pipe) } })); } catch { /* non-browser */ }
  if (pipe === 'leads') rSvc.logComm(id, { channel: 'call', direction: 'outbound', outcome: 'dialed', note: 'Started from Pipelines' });
  else { r.lastContactAt = nowIso(); hSvc.log(id, 'call', `Call started — ${r.phone || ''}`.trim(), 'Started from Pipelines'); }
  return { ok: true, message: `Calling ${r.name}…`, kind: 'info' };
}
export function text(pipe: PipeKey, id: string, body: string): ActionResult {
  const r = record(pipe, id); if (!r) return { ok: false, message: 'Not found', kind: 'danger' };
  if (!body.trim()) return { ok: false, message: 'Write a message first', kind: 'warning' };
  if (pipe === 'leads') { const res = rSvc.logComm(id, { channel: 'sms', direction: 'outbound', outcome: 'sent', note: body }); if ((res as any)?.blocked) return { ok: false, message: `${r.name} is Do-Not-Contact`, kind: 'danger' }; }
  else { r.lastContactAt = nowIso(); hSvc.log(id, 'text', `Text to ${r.name}`, body); }
  return { ok: true, message: `Text sent to ${r.name.split(' ')[0]}`, kind: 'success' };
}

export function runAction(pipe: PipeKey, id: string, a: CheckAction): ActionResult {
  const r = record(pipe, id); if (!r) return { ok: false, message: 'Not found', kind: 'danger' };
  const first = r.name.split(' ')[0];
  const done = (message: string): ActionResult => ({ ok: true, message, kind: 'success' });
  switch (a.kind) {
    case 'call': return call(pipe, id);
    case 'markReached': rSvc.logComm(id, { channel: 'call', direction: 'inbound', outcome: 'connected', note: 'Two-way contact confirmed' }); return done(`${first} marked reached`);
    case 'screen': { r.screening = { ...(r.screening || {}), [a.arg]: true }; if (a.arg === 'cdlValid' && !/A/i.test(r.licenseType || '')) r.licenseType = 'Class A'; rSvc.update(id, { screening: r.screening, licenseType: r.licenseType }); rSvc.logEvent(id, 'system', `Screening: ${({ cdlValid: 'CDL-A confirmed', mvrClear: 'MVR self-report clear', medical: 'Medical card current' } as any)[a.arg] || a.arg}`); return done('Screening updated'); }
    case 'consent': rSvc.setConsent(id, 'in', 'sms'); return done(`${first} opted in to texts`);
    case 'requestDocs': hSvc.requestDocs(id, a.arg); return done(`Requested ${a.arg.join(', ')} from ${first}`);
    case 'markDocs': (a.arg as string[]).forEach((n) => { const doc = r.documents.find((x: any) => x.name === n); if (doc && doc.status !== 'collected') hSvc.setDocStatus(id, doc.key, 'collected'); }); if ((a.arg as string[]).includes('Medical Card')) r.medicalCard = 'valid'; touch(pipe); return done(`${a.arg.join(', ')} received`);
    case 'markCheck': r[a.arg] = a.arg === 'drugTest' ? 'passed' : 'clear'; hSvc.log(id, 'compliance', a.arg === 'drugTest' ? 'Drug test — passed (negative)' : 'Clearinghouse query — clear'); return done(a.arg === 'drugTest' ? 'Drug test marked passed' : 'Clearinghouse marked clear');
    case 'markApp': r.application = { ...(r.application || {}), submitted: true }; hSvc.log(id, 'application', 'Application received'); return done('Application marked received');
    case 'sendOffer': hSvc.sendOffer(id); r.esign = { status: 'sent', at: nowIso(), title: 'Offer package' }; touch(pipe); return done(`Offer package sent to ${first}`);
    case 'markSigned': r.esign = { ...(r.esign || {}), status: 'completed', at: nowIso(), title: r.esign?.title || 'Offer package' }; ['Offer Letter', 'Driver Agreement'].forEach((n) => { const doc = r.documents.find((x: any) => x.name === n); if (doc) doc.status = 'collected'; }); hSvc.log(id, 'offer', 'Offer & driver agreement signed'); return done('Marked signed');
    case 'scheduleOrientation': { const t = new Date(Date.now() + DAY); t.setHours(8, 0, 0, 0); r.orientationDate = t.toISOString(); hSvc.log(id, 'step', 'Orientation scheduled', `${fmtDay(r.orientationDate)} · 8:00 AM`); return done(`Orientation scheduled for ${fmtDay(r.orientationDate)}`); }
    case 'assignTruck': {
      let t = hSvc.trucksForCarrier(r.carrier).find((x: any) => x.status === 'Available');
      if (!t) t = hSvc.addTruck(r.carrier);
      hSvc.assignTruck(id, t.id); r.truckNo = t.unit; touch(pipe);
      return done(`Unit ${t.unit} assigned to ${first}`);
    }
    case 'completeOrientation': r.orientationDone = true; if (!r.orientationDate) r.orientationDate = nowIso(); hSvc.log(id, 'step', 'Orientation completed'); return done('Orientation completed');
    case 'checkIn': {
      const ci = (r.checkIns || []).find((c: any) => c.day === a.arg && !c.doneAt) || (r.checkIns || []).find((c: any) => !c.doneAt);
      if (ci) ci.doneAt = nowIso();
      r.lastCheckIn = nowIso(); r.lastContactAt = nowIso();
      const next = (r.checkIns || []).filter((c: any) => !c.doneAt).sort((x: any, y: any) => x.day - y.day)[0];
      r.nextStep = next ? { title: `Day ${next.day} check-in`, due: next.due, status: 'open' } : { title: suggestedNextStep(ACTIVE_STAGE.ACTIVE), due: new Date(Date.now() + 30 * DAY).toISOString(), status: 'open' };
      if (ci?.taskId) r.tasks = (r.tasks || []).map((t: any) => (t.id === ci.taskId ? { ...t, status: 'done' } : t));
      hSvc.log(id, 'call', ci ? `Day ${ci.day} check-in logged` : 'Check-in logged', 'Driver check-in call');
      return done(ci ? `Day ${ci.day} check-in logged` : 'Check-in logged');
    }
    case 'setReturn': r.returnDate = new Date(Date.now() + 7 * DAY).toISOString(); hSvc.log(id, 'note', 'Return-to-work date set', fmtDay(r.returnDate)); return done(`Return date set: ${fmtDay(r.returnDate)}`);
    case 'retentionCall': r.retentionCallAt = nowIso(); r.lastContactAt = nowIso(); hSvc.log(id, 'call', 'Retention call logged', r.riskReason ? `Risk: ${r.riskReason}` : ''); return done('Retention call logged');
    case 'actionPlan': r.actionPlan = a.arg || 'Action plan agreed with dispatch'; hSvc.log(id, 'note', 'Retention action plan', r.actionPlan); return done('Action plan saved');
    case 'markEligible': r.rehireEligible = true; hSvc.log(id, 'lifecycle', 'Marked eligible for rehire'); return done(`${first} is rehire-eligible`);
    case 'outreach': r.lastContactAt = nowIso(); hSvc.log(id, 'text', 'Re-engagement outreach', `Hi ${first}, we'd love to have you back — pay and home time have improved. Interested in talking?`); return done('Outreach logged');
    case 'markInterested': r.reengageInterested = true; hSvc.log(id, 'note', 'Driver wants to come back'); return done(`${first} marked interested`);
    default: return { ok: false, message: 'Open the profile to finish this step', kind: 'info' };
  }
}

/* ───────── next steps + tasks ───────── */
export function setNextStep(pipe: PipeKey, id: string, title: string, dueIso?: string | null): ActionResult {
  const r = record(pipe, id); if (!r || !title.trim()) return { ok: false, message: 'Add a title', kind: 'warning' };
  const due = dueIso || new Date(Date.now() + DAY).toISOString();
  if (pipe === 'leads') rSvc.setNextAction(id, { title, due, status: 'open', assignee: r.ownerId || 'NP', priority: 'normal' });
  else { r.nextStep = { title, due, status: 'open' }; hSvc.log(id, 'task', `Next step: ${title}`, `Due ${fmtDay(due)}`); }
  return { ok: true, message: 'Next step set', kind: 'success' };
}
export function completeNextStep(pipe: PipeKey, id: string): ActionResult {
  const r = record(pipe, id); if (!r) return { ok: false, message: 'Not found', kind: 'danger' };
  if (pipe === 'leads') rSvc.completeNextAction(id);
  else if (r.nextStep) { const t = r.nextStep.title; r.nextStep = { ...r.nextStep, status: 'done' }; hSvc.log(id, 'task', `Completed: ${t}`); }
  return { ok: true, message: 'Next step done', kind: 'success' };
}
export function addTask(pipe: PipeKey, id: string, p: { title: string; due?: string | null; priority?: string; assignee?: string }): ActionResult {
  const r = record(pipe, id); if (!r || !p.title.trim()) return { ok: false, message: 'Add a task title', kind: 'warning' };
  const assignee = p.assignee || (pipe === 'leads' ? r.ownerId : recruiterId(r.ownerName)) || 'NP';
  const due = p.due || isoDay(Date.now() + DAY);
  const t = addExternalTask(makeTask({ title: p.title, due, priority: p.priority || 'normal', relatedType: pipe === 'leads' ? 'candidate' : 'driver', related: r.name, carrier: r.carrier || null, assignee, source: 'candidate', createdBy: recruiterName(assignee), tags: ['Follow-up'] }));
  const dueIso = new Date(due + 'T09:00:00').toISOString();
  if (pipe === 'leads') rSvc.addTask(id, { id: t.id, title: p.title, assignee, due: dueIso, priority: p.priority || 'normal' });
  else { r.tasks = [{ id: t.id, title: p.title, due: dueIso, status: 'open' }, ...(r.tasks || [])]; hSvc.log(id, 'task', `Task: ${p.title}`, `Due ${fmtDay(dueIso)}`); }
  return { ok: true, message: 'Task added to Tasks', kind: 'success' };
}
export function nextTaskOf(r: any) {
  return (r.tasks || []).filter((t: any) => t.status !== 'done' && t.status !== 'complete').sort((a: any, b: any) => +new Date(a.due || 8.64e15) - +new Date(b.due || 8.64e15))[0] || null;
}
export function completeTask(pipe: PipeKey, id: string, taskId: string): ActionResult {
  const r = record(pipe, id); if (!r) return { ok: false, message: 'Not found', kind: 'danger' };
  const t = (r.tasks || []).find((x: any) => x.id === taskId); if (!t) return { ok: false, message: 'Task not found', kind: 'warning' };
  t.status = 'done'; logOn(pipe, id, 'task', `Completed: ${t.title}`);
  return { ok: true, message: 'Task completed', kind: 'success' };
}

export function assign(pipe: PipeKey, id: string, ownerId: string) {
  const r = record(pipe, id); if (!r) return;
  if (pipe === 'leads') { if (r.ownerId !== ownerId) rSvc.assign(id, ownerId); return; }
  const from = r.ownerName; if (recruiterId(from) === ownerId) return;
  r.ownerName = recruiterName(ownerId);
  hSvc.log(id, 'assignment', `Reassigned ${from} → ${r.ownerName}`);
}

/* ───────── bulk ───────── */
export function bulkMove(pipe: PipeKey, ids: string[], stage: string, opts: MoveOpts = {}): ActionResult {
  const undos: Undoable[] = []; let n = 0;
  ids.forEach((id) => { const res = moveRecord(pipe, id, stage, opts); if (res.ok && res.undo) { undos.push(res.undo); n++; } });
  return { ok: n > 0, message: `${n} moved to ${stage}`, kind: n ? 'success' : 'info', undo: { label: `Moved ${n} to ${stage}`, undo: () => undos.slice().reverse().forEach((u) => u.undo()) } };
}
export function bulkAssign(pipe: PipeKey, ids: string[], ownerId: string): ActionResult {
  const snaps = ids.map((id) => snap(kindOf(pipe), id));
  ids.forEach((id) => assign(pipe, id, ownerId));
  return { ok: true, message: `${ids.length} reassigned to ${recruiterName(ownerId)}`, kind: 'success', undo: undoable(`Reassigned ${ids.length}`, snaps) };
}
export function bulkTask(pipe: PipeKey, ids: string[], title: string, due?: string): ActionResult {
  let n = 0; ids.forEach((id) => { if (addTask(pipe, id, { title, due }).ok) n++; });
  return { ok: n > 0, message: `${n} task${n === 1 ? '' : 's'} added to Tasks`, kind: 'success' };
}

/* ───────── example data ───────── */
export function exampleCount() { return rStore.leads.filter((l: any) => l.example).length + hStore.drivers.filter((d: any) => d.example).length; }
export function removeExamples(): ActionResult {
  const leads = clone(rStore.leads), drivers = clone(hStore.drivers);
  const n = exampleCount();
  rSvc.replaceAll(rStore.leads.filter((l: any) => !l.example));
  hSvc.replaceAll(hStore.drivers.filter((d: any) => !d.example));
  shellSvc.logActivity('system', `Removed ${n} example records from Pipelines`);
  return { ok: true, message: `${n} example records removed`, kind: 'success', undo: { label: 'Removed example records', undo: () => { rSvc.replaceAll(leads); hSvc.replaceAll(drivers); } } };
}

/* ───────── lead ↔ driver linking (one-time migration) ───────── */
/** A lead whose phone/email matches an existing hire record has effectively
    been converted: link both sides so each person lives in one pipeline. */
function linkExistingLeads() {
  if (rStore.meta?.linkedV2) return;
  let n = 0;
  for (const l of rStore.leads) {
    if (l.convertedTo || l.archived) continue;
    const d = findDriverMatch(l);
    if (!d) continue;
    l.convertedTo = d.id; l.convertedAt = l.convertedAt || d.appliedAt || l.stageSince;
    l.stageName = LEAD_STAGE.TO_HIRING; d.leadId = d.leadId || l.id; n++;
  }
  rSvc.setMeta({ linkedV2: true });
  if (n) hSvc.touch();
}

/* ───────── e-sign completion → advance Offer & e-sign ───────── */
export function onEsignCompleted(detail: { driverName?: string; driverId?: string; envelopeId?: string; title?: string }): ActionResult {
  const name = String(detail?.driverName || '').trim().toLowerCase();
  const d = (detail?.driverId && hSvc.driver(detail.driverId)) || hStore.drivers.find((x: any) => !x.archived && String(x.name).trim().toLowerCase() === name && pipeOfDriver(x) === 'hiring') || hStore.drivers.find((x: any) => !x.archived && String(x.name).trim().toLowerCase() === name);
  if (!d) return { ok: false, message: 'No matching driver', kind: 'info' };
  const seen: string[] = d.esign?.completedIds || [];
  if (detail.envelopeId && seen.includes(detail.envelopeId)) return { ok: false, message: 'Already processed', kind: 'info' };
  const title = detail.title || 'Envelope';
  d.esign = { status: 'completed', at: nowIso(), title, envelopeId: detail.envelopeId || null, completedIds: [...seen, ...(detail.envelopeId ? [detail.envelopeId] : [])] };
  if (/offer/i.test(title)) { const doc = d.documents.find((x: any) => x.name === 'Offer Letter'); if (doc) doc.status = 'collected'; }
  if (/agreement/i.test(title)) { const doc = d.documents.find((x: any) => x.name === 'Driver Agreement'); if (doc) doc.status = 'collected'; }
  if (pipeOfDriver(d) === 'hiring' && d.stage === HIRING_STAGE.OFFER) {
    d.nextStep = { title: suggestedNextStep(HIRING_STAGE.ORIENTATION), due: new Date(Date.now() + DAY).toISOString(), status: 'open' };
    hSvc.moveStage(d.id, HIRING_STAGE.ORIENTATION, `E-sign completed — ${title}`);
    hSvc.log(d.id, 'lifecycle', 'E-sign completed → Orientation', title);
    shellSvc.notify('sign', `${d.name} signed ${title}`, 'Advanced to Orientation');
    return { ok: true, message: `${d.name} signed — moved to Orientation`, kind: 'success' };
  }
  hSvc.log(d.id, 'offer', `E-sign completed — ${title}`);
  return { ok: true, message: `${d.name} signed ${title}`, kind: 'success' };
}

declare global { interface Window { __qhPipesInstalled?: boolean } }
(function install() {
  linkExistingLeads();
  if (typeof window === 'undefined' || window.__qhPipesInstalled) return;
  window.__qhPipesInstalled = true;
  window.addEventListener('qh:esign-completed', (e: Event) => { try { onEsignCompleted((e as CustomEvent).detail || {}); } catch { /* never break the host page */ } });
})();

export { HANDOFF_TO_ACTIVE };
