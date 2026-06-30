/* Hiring data store — drivers/candidates, hiring steps, documents, activities,
   AI reviews, carriers + carrier-dependent trucks + insurance requirements.
   Local-first (localStorage); seeded from the static CANDS / CARRIER_LIST. */
import React from 'react';
import { CANDS, CARRIER_LIST } from '../data';
import { svc as shellSvc } from '../shell/store';

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const nowIso = () => new Date().toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

export const STAGES = ['Lead', 'Screening', 'Background Check', 'Offer', 'Onboarding', 'Hired'];
export const STAGE_DOT: Record<string, string> = { Lead: '#8E8E93', Screening: '#007AFF', 'Background Check': '#FF9F0A', Offer: '#5856D6', Onboarding: '#34C759', Hired: '#248A3D' };

/* ───────── hiring step + document templates ───────── */
export const STEP_GROUPS = ['Compliance & Eligibility', 'Risk Screening', 'Health & Safety', 'Employment Setup'];
const DEFAULT_STEPS = [
  ['Compliance & Eligibility', 'CDL Verification', 'sign', true],
  ['Compliance & Eligibility', 'Clearinghouse Query', 'shield', true],
  ['Compliance & Eligibility', 'PSP Report', 'fileText', true],
  ['Risk Screening', 'MVR Check', 'gauge', true],
  ['Risk Screening', 'Background Check', 'user', true],
  ['Health & Safety', 'Drug Test', 'shield', true],
  ['Health & Safety', 'Medical Card', 'checkCircle', true],
  ['Employment Setup', 'Application', 'fileText', true],
  ['Employment Setup', 'Offer Letter', 'sign', true],
  ['Employment Setup', 'Driver Agreement', 'sign', true],
  ['Employment Setup', 'W-9', 'fileText', true],
  ['Employment Setup', 'Direct Deposit', 'briefcase', false],
  ['Employment Setup', 'Truck Assignment', 'truck', true],
];
export const STEP_STATUSES = ['not_started', 'in_progress', 'waiting_driver', 'waiting_admin', 'complete', 'failed', 'expired', 'missing_document'];
export const STEP_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not Started', color: '#6E6E73', bg: '#F2F2F7' },
  in_progress: { label: 'In Progress', color: '#0066CC', bg: 'rgba(0,122,255,0.12)' },
  waiting_driver: { label: 'Waiting on Driver', color: '#A05A00', bg: 'rgba(255,159,10,0.14)' },
  waiting_admin: { label: 'Waiting on Admin', color: '#A05A00', bg: 'rgba(255,159,10,0.14)' },
  complete: { label: 'Complete', color: '#248A3D', bg: 'rgba(52,199,89,0.12)' },
  failed: { label: 'Failed', color: '#C62820', bg: 'rgba(255,59,48,0.12)' },
  expired: { label: 'Expired', color: '#C62820', bg: 'rgba(255,59,48,0.12)' },
  missing_document: { label: 'Missing Document', color: '#C62820', bg: 'rgba(255,59,48,0.12)' },
};

const DEFAULT_DOCS = [
  ['Driver Application', true], ['CDL Front', true], ['CDL Back', true], ['Medical Card', true],
  ['MVR', true], ['PSP Report', true], ['Clearinghouse Consent', true], ['Drug Test Consent', true],
  ['W-9', true], ['Driver Agreement', true], ['Offer Letter', true], ['Insurance', false],
  ['Truck Assignment Form', true], ['Background Check Authorization', true],
];
export const DOC_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  collected: { label: 'Collected', color: '#248A3D', bg: 'rgba(52,199,89,0.12)' },
  pending: { label: 'Pending', color: '#0066CC', bg: 'rgba(0,122,255,0.12)' },
  expiring: { label: 'Expiring', color: '#A05A00', bg: 'rgba(255,159,10,0.14)' },
  missing: { label: 'Missing', color: '#C62820', bg: 'rgba(255,59,48,0.12)' },
};

const INSURANCE_TYPES = [
  ['Auto Liability', '$1,000,000'], ['Cargo Insurance', '$100,000'], ['General Liability', '$1,000,000'],
  ['Occupational Accident', '$500,000'], ['Physical Damage', 'ACV'], ['Workers Compensation', 'Statutory'],
];

/* ───────── seeds ───────── */
function avatarColor(name: string) {
  const palette = ['#007AFF', '#34C759', '#FF9500', '#5856D6', '#FF2D55', '#AF52DE', '#00C7BE'];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}
export const initials = (n: string) => (n || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

function seedSteps(missing: string) {
  return DEFAULT_STEPS.map(([group, name, icon, required], i) => {
    let status = 'not_started';
    if (i < 3) status = 'complete';
    else if (i < 5) status = 'in_progress';
    if (missing && (name === 'Medical Card' || name === 'CDL Verification') && missing.toLowerCase().includes('medical') && name === 'Medical Card') status = 'missing_document';
    return { id: uid('st'), group, name, icon, required, status, due: daysFromNow(3 + i), owner: 'NP', notes: '' };
  });
}
function seedDocs(missing: string) {
  return DEFAULT_DOCS.map(([name, required]) => {
    let status = 'collected';
    if (missing && String(name).toLowerCase().includes(String(missing).toLowerCase().split(' ')[0])) status = 'missing';
    else if (name === 'Insurance') status = 'pending';
    else if (Math.random() < 0.12) status = 'pending';
    return { key: uid('doc'), name, required, status, exp: name === 'Medical Card' || name === 'CDL Front' ? daysFromNow(120) : null, step: null };
  });
}

function seedTrucks() {
  const trucks: any[] = [];
  CARRIER_LIST.forEach((c, ci) => {
    const n = 3 + (ci % 2);
    for (let i = 0; i < n; i++) {
      const statuses = ['Available', 'Available', 'Assigned', 'Shop'];
      trucks.push({ id: uid('trk'), carrierId: c.id, carrier: c.name, unit: `${100 + ci * 10 + i}`, vin: `1FUJ${Math.random().toString(36).slice(2, 9).toUpperCase()}`, plate: `TX-${1000 + ci * 100 + i}`, trailer: i % 2 ? `TR-${200 + i}` : '', status: statuses[i % statuses.length], requirements: 'Class A · clean MVR' });
    }
  });
  return trucks;
}
function seedCarriers() {
  return CARRIER_LIST.map((c) => ({
    id: c.id, name: c.name, dot: c.dot, mc: c.mc, status: c.auth, address: c.address, phone: c.phone, dba: c.dba,
    contact: 'Operations', email: `ops@${c.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)}.com`,
    policy: { maxMovingViolations: 2, maxAccidents: 1, maxDUI: 0, minExperienceYears: 1 },
    insurance: INSURANCE_TYPES.map(([type, amount]) => ({ id: uid('ins'), coverageType: type, amount, provider: 'Great West', policyNumber: `GW-${Math.floor(Math.random() * 9e5 + 1e5)}`, effective: daysFromNow(-200), expiration: daysFromNow(160), active: true, additionalInsured: type === 'Auto Liability', notes: '' })),
    forms: [], notes: '', activities: [],
  }));
}

function seedDriver(c: any): any {
  const exp = 2 + (c.score % 6);
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email, carrier: c.carrier, position: c.position,
    ownerName: c.ownerName, stage: c.stage, risk: c.risk, score: c.score, missing: c.missing || '',
    cdlClass: (c.cdl || 'TX · Class A').split('Class ')[1] || 'A', cdlState: (c.cdl || 'TX').split(' ')[0],
    endorsements: c.position === 'Owner Operator' ? ['H', 'N', 'T'] : ['H'], experienceYears: exp, location: c.cdl?.startsWith('FL') ? 'Miami, FL' : 'Dallas, TX',
    medicalCard: (c.missing || '').toLowerCase().includes('medical') ? 'missing' : 'valid',
    mvr: { violations: c.risk === 'High' ? 3 : c.risk === 'Medium' ? 1 : 0, accidents: 0, dui: 0 },
    psp: { crashes: 0, oos: c.risk === 'High' ? 2 : 0 },
    drugTest: c.stage === 'Lead' ? 'missing' : 'passed', backgroundCheck: c.stage === 'Lead' || c.stage === 'Screening' ? 'pending' : 'clear',
    clearinghouse: (c.missing || '').toLowerCase().includes('clearinghouse') ? 'missing' : c.stage === 'Lead' ? 'pending' : 'clear',
    stageSince: daysFromNow(-(1 + (c.score % 8))),
    assignedTruckId: null, steps: seedSteps(c.missing || ''), documents: seedDocs(c.missing || ''),
    activities: [{ id: uid('a'), type: 'stage', title: `Entered ${c.stage}`, detail: '', at: daysFromNow(-2), user: c.ownerName }],
    aiReview: null, archived: false, application: { submitted: c.stage !== 'Lead', startDate: '', payRate: '', emergencyContact: '' },
    avatarBg: avatarColor(c.name),
  };
}

/* ───────── persistence ───────── */
const LS = 'qh_hire_v1';
function load(): any | null { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch { return null; } }
function persist() { try { localStorage.setItem(LS, JSON.stringify({ drivers: store.drivers, carriers: store.carriers, trucks: store.trucks })); } catch { /* quota */ } }

export const store: any = { drivers: [], carriers: [], trucks: [] };
(function init() {
  const s = load();
  if (s && s.drivers?.length) { store.drivers = s.drivers; store.carriers = s.carriers || seedCarriers(); store.trucks = s.trucks || seedTrucks(); }
  else { store.drivers = CANDS.map(seedDriver); store.carriers = seedCarriers(); store.trucks = seedTrucks(); persist(); }
})();

const listeners = new Set<() => void>();
const emit = () => { persist(); listeners.forEach((l) => l()); };
export function useHire() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}

/* ───────── AI eligibility (Anna) ───────── */
function resolveCarrier(name: string) {
  if (!name) return undefined;
  return store.carriers.find((c: any) => c.name === name) || store.carriers.find((c: any) => c.name.startsWith(name) || name.startsWith(c.name));
}
export function computeAIReview(d: any) {
  const carrier = resolveCarrier(d.carrier);
  const pol = carrier?.policy || { maxMovingViolations: 2, maxAccidents: 1, maxDUI: 0, minExperienceYears: 1 };
  const risks: string[] = []; const missing: string[] = []; const conflicts: string[] = []; const failed: string[] = [];
  let score = 100;

  if (d.medicalCard === 'missing') { missing.push('Valid medical card'); score -= 18; }
  if (d.clearinghouse === 'missing') { missing.push('Signed Clearinghouse consent'); score -= 14; }
  if (d.clearinghouse === 'pending') { score -= 4; }
  if (d.drugTest === 'missing') { missing.push('Drug test consent'); score -= 12; }
  if (d.backgroundCheck === 'pending') { score -= 4; }
  if (d.mvr.violations > pol.maxMovingViolations) { conflicts.push(`${d.mvr.violations} moving violations exceeds ${d.carrier} limit of ${pol.maxMovingViolations}`); failed.push('MVR'); score -= 22; }
  else if (d.mvr.violations > 0) { risks.push(`${d.mvr.violations} moving violation${d.mvr.violations > 1 ? 's' : ''} (within ${d.carrier} policy)`); score -= 4 * d.mvr.violations; }
  if (d.mvr.dui > pol.maxDUI) { conflicts.push('DUI on record exceeds carrier policy'); failed.push('MVR'); score -= 30; }
  if (d.psp.oos > 0) { risks.push(`${d.psp.oos} out-of-service inspection${d.psp.oos > 1 ? 's' : ''} on PSP`); score -= 5 * d.psp.oos; }
  if (d.experienceYears < pol.minExperienceYears) { conflicts.push(`Experience ${d.experienceYears}y below ${pol.minExperienceYears}y minimum`); score -= 16; }

  // carrier insurance must be active for a driver to be cleared under it
  const activeIns = (carrier?.insurance || []).filter((i: any) => i.active);
  const expiredIns = activeIns.filter((i: any) => i.expiration && +new Date(i.expiration) < Date.now());
  if (carrier && activeIns.length === 0) { conflicts.push(`${d.carrier} has no active insurance on file`); score -= 12; }
  expiredIns.forEach((i: any) => { risks.push(`${d.carrier} ${i.coverageType} insurance expired ${fmtDate(i.expiration)}`); score -= 4; });

  // doc completeness
  const missDocs = (d.documents || []).filter((x: any) => x.required && x.status === 'missing');
  missDocs.forEach((x: any) => { if (!missing.includes(x.name)) missing.push(x.name); });
  score -= missDocs.length * 3;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let status: string;
  if (failed.length) status = 'not_eligible';
  else if (missing.length || conflicts.length) status = missing.length > 2 ? 'needs_review' : 'conditionally_eligible';
  else status = 'eligible';

  const bestTruck = store.trucks.find((t: any) => t.carrierId === carrier?.id && t.status === 'Available');
  const next = failed.length ? `Resolve policy conflict: ${failed.join(', ')}`
    : missing.length ? `Request from driver: ${missing[0]}`
    : status === 'eligible' ? 'Advance to next stage and send offer package' : 'Complete remaining screening checks';

  const summary = status === 'eligible'
    ? `Eligible. CDL Class ${d.cdlClass}, medical card valid, PSP clear. Meets all ${d.carrier} policy and insurance requirements.`
    : status === 'not_eligible'
      ? `Not Eligible for ${d.carrier}. ${conflicts[0] || failed.join(', ')}.`
      : `${status === 'needs_review' ? 'Needs Review' : 'Conditionally Eligible'}. CDL Class ${d.cdlClass}${d.medicalCard === 'valid' ? ' and medical card are valid' : ''}.${d.mvr.violations && d.mvr.violations <= pol.maxMovingViolations ? ` MVR has ${d.mvr.violations} violation but remains within ${d.carrier} policy.` : ''}${missing.length ? ` Missing item: ${missing[0]}.` : ''}`;

  return { status, score, summary, risks, missing, conflicts, failed, suggestedAction: next, bestCarrier: d.carrier, bestTruck: bestTruck ? `Unit ${bestTruck.unit} (${bestTruck.status})` : 'No available truck', reviewedAt: nowIso() };
}
export const AI_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  eligible: { label: 'Eligible', color: '#248A3D', bg: 'rgba(52,199,89,0.12)' },
  conditionally_eligible: { label: 'Conditionally Eligible', color: '#A05A00', bg: 'rgba(255,159,10,0.14)' },
  needs_review: { label: 'Needs Review', color: '#3F3BB8', bg: 'rgba(88,86,214,0.12)' },
  not_eligible: { label: 'Not Eligible', color: '#C62820', bg: 'rgba(255,59,48,0.12)' },
};

/* ───────── completeness ───────── */
export function completeness(d: any) {
  const docs = d.documents || []; const req = docs.filter((x: any) => x.required);
  const have = req.filter((x: any) => x.status === 'collected').length;
  return req.length ? Math.round((have / req.length) * 100) : 100;
}

/* ───────── service ───────── */
export const svc = {
  driver(id: string) { return store.drivers.find((d: any) => d.id === id); },
  carriers() { return store.carriers; },
  // Tolerant match: CANDS use short carrier names ("DT NATIONAL") while the
  // carrier records use full legal names ("DT NATIONAL TRANSPORTATION LLC").
  carrierByName(name: string) {
    if (!name) return undefined;
    return store.carriers.find((c: any) => c.name === name)
      || store.carriers.find((c: any) => c.name.startsWith(name) || name.startsWith(c.name));
  },
  trucksForCarrier(name: string) { const c = this.carrierByName(name); return c ? store.trucks.filter((t: any) => t.carrierId === c.id) : []; },

  log(id: string, type: string, title: string, detail = '') {
    const d = this.driver(id); if (!d) return;
    d.activities.unshift({ id: uid('a'), type, title, detail, at: nowIso(), user: 'Nina Patel' });
    shellSvc.logActivity(type, `${d.name}: ${title}`, detail, { type: 'driver', id });
    emit();
  },
  update(id: string, patch: any) { const d = this.driver(id); if (!d) return; Object.assign(d, patch); emit(); },

  setStepStatus(id: string, stepId: string, status: string) {
    const d = this.driver(id); if (!d) return; const s = d.steps.find((x: any) => x.id === stepId); if (!s) return;
    s.status = status; this.log(id, 'step', `${s.name} → ${STEP_STATUS_META[status]?.label || status}`);
  },
  addStep(id: string, group: string, name: string) { const d = this.driver(id); if (!d) return; d.steps.push({ id: uid('st'), group, name, icon: 'fileText', required: false, status: 'not_started', due: daysFromNow(5), owner: 'NP', notes: '' }); this.log(id, 'step', `Added step "${name}"`); },
  removeStep(id: string, stepId: string) { const d = this.driver(id); if (!d) return; const s = d.steps.find((x: any) => x.id === stepId); d.steps = d.steps.filter((x: any) => x.id !== stepId); this.log(id, 'step', `Removed step "${s?.name || ''}"`); },
  toggleStepRequired(id: string, stepId: string) { const d = this.driver(id); if (!d) return; const s = d.steps.find((x: any) => x.id === stepId); if (s) { s.required = !s.required; emit(); } },
  moveStep(id: string, stepId: string, dir: number) {
    const d = this.driver(id); if (!d) return; const g = d.steps.find((x: any) => x.id === stepId)?.group;
    const groupSteps = d.steps.filter((x: any) => x.group === g); const i = groupSteps.findIndex((x: any) => x.id === stepId);
    const j = i + dir; if (j < 0 || j >= groupSteps.length) return;
    const a = groupSteps[i], b = groupSteps[j]; const ia = d.steps.indexOf(a), ib = d.steps.indexOf(b);
    [d.steps[ia], d.steps[ib]] = [d.steps[ib], d.steps[ia]]; emit();
  },

  addDocument(id: string, name: string, status = 'collected') { const d = this.driver(id); if (!d) return; d.documents.unshift({ key: uid('doc'), name, required: true, status, exp: null, step: null }); this.log(id, 'document', `Document added — ${name}`); },
  setDocStatus(id: string, key: string, status: string) { const d = this.driver(id); if (!d) return; const doc = d.documents.find((x: any) => x.key === key); if (doc) { doc.status = status; this.log(id, 'document', `${doc.name} → ${DOC_STATUS_META[status]?.label || status}`); } },
  requestDocs(id: string, names: string[]) { const d = this.driver(id); if (!d) return; names.forEach((n) => { const doc = d.documents.find((x: any) => x.name === n); if (doc && doc.status === 'missing') doc.status = 'pending'; }); this.log(id, 'request', `Requested ${names.length} document${names.length > 1 ? 's' : ''} from driver`, names.join(', ')); },

  assignTruck(id: string, truckId: string) { const d = this.driver(id); if (!d) return; d.assignedTruckId = truckId; const t = store.trucks.find((x: any) => x.id === truckId); if (t) t.status = 'Assigned'; this.log(id, 'truck', `Assigned truck — Unit ${t?.unit || ''}`); },
  changeCarrier(id: string, carrier: string) { const d = this.driver(id); if (!d) return; d.carrier = carrier; d.assignedTruckId = null; this.log(id, 'carrier', `Hiring carrier changed to ${carrier}`); },

  moveStage(id: string, stage: string) { const d = this.driver(id); if (!d || d.stage === stage) return; d.stage = stage; d.stageSince = nowIso(); this.log(id, 'stage', `Moved to ${stage}`); },
  archive(id: string, reason: string) { const d = this.driver(id); if (!d) return; d.archived = true; this.log(id, 'archive', 'Candidate archived', reason); },
  unarchive(id: string) { const d = this.driver(id); if (!d) return; d.archived = false; this.log(id, 'archive', 'Candidate restored'); },

  addDriver(fields: any, stage = 'Lead') {
    const base = { id: 'p_' + Math.random().toString(36).slice(2, 8), score: 70, risk: 'Medium', missing: '', cdl: `${(fields.cdlState || 'TX')} · Class ${fields.cdlClass || 'A'}`, ownerName: 'Nina Patel', stage, ...fields };
    const d = seedDriver(base);
    d.aiReview = computeAIReview(d);
    store.drivers.unshift(d);
    this.log(d.id, 'stage', `Candidate created in ${stage}`);
    return d;
  },

  runAIReview(id: string) { const d = this.driver(id); if (!d) return null; d.aiReview = computeAIReview(d); this.log(id, 'ai', `Anna review — ${AI_STATUS_META[d.aiReview.status].label} (${d.aiReview.score})`, d.aiReview.summary); return d.aiReview; },
  ensureReview(id: string) { const d = this.driver(id); if (d && !d.aiReview) d.aiReview = computeAIReview(d); return d?.aiReview; },

  sendApplication(id: string) { this.log(id, 'application', 'Application sent to driver'); },
  sendOffer(id: string) { this.log(id, 'offer', 'Offer package sent (DocuSign)'); },
  startCompliance(id: string) { const d = this.driver(id); if (!d) return; ['MVR Check', 'PSP Report', 'Clearinghouse Query'].forEach((n) => { const s = d.steps.find((x: any) => x.name === n); if (s && s.status === 'not_started') s.status = 'in_progress'; }); this.log(id, 'compliance', 'Compliance check started (MVR · PSP · Clearinghouse)'); },

  /* carrier folders */
  carrier(id: string) { return store.carriers.find((c: any) => c.id === id); },
  logCarrier(id: string, type: string, title: string, detail = '') { const c = this.carrier(id); if (!c) return; c.activities = c.activities || []; c.activities.unshift({ id: uid('a'), type, title, detail, at: nowIso(), user: 'Nina Patel' }); shellSvc.logActivity(type, `${c.name}: ${title}`, detail, { type: 'carrier', id }); emit(); },
  addCarrier(fields: any) {
    const c = { id: uid('car'), name: fields.name, dot: fields.dot || '', mc: fields.mc || '', status: fields.status || 'pending', address: fields.address || '', phone: fields.phone || '', dba: fields.dba || '', contact: fields.contact || '', email: fields.email || '', policy: { maxMovingViolations: 2, maxAccidents: 1, maxDUI: 0, minExperienceYears: 1 }, insurance: [], forms: [], notes: '', activities: [] };
    store.carriers.unshift(c); this.logCarrier(c.id, 'carrier', 'Carrier folder created'); return c;
  },
  updateCarrier(id: string, patch: any) { const c = this.carrier(id); if (c) { Object.assign(c, patch); emit(); } },
  updatePolicy(id: string, patch: any) { const c = this.carrier(id); if (c) { c.policy = { ...c.policy, ...patch }; this.logCarrier(id, 'policy', 'Hiring policy updated'); } },
  addForm(id: string, form: any) { const c = this.carrier(id); if (!c) return; c.forms.unshift({ id: uid('frm'), name: form.name, type: form.type || 'Carrier Form', submittedBy: form.submittedBy || c.contact || 'Carrier', status: 'submitted', at: nowIso() }); this.logCarrier(id, 'form', `Form attached — ${form.name}`); },
  removeForm(id: string, formId: string) { const c = this.carrier(id); if (!c) return; c.forms = c.forms.filter((f: any) => f.id !== formId); emit(); },
  addInsurance(carrierId: string, ins: any) { const c = this.carrier(carrierId); if (!c) return; c.insurance.unshift({ id: uid('ins'), active: true, ...ins }); this.logCarrier(carrierId, 'insurance', `Insurance added — ${ins.coverageType || 'coverage'}`); },
  updateInsurance(carrierId: string, insId: string, patch: any) { const c = this.carrier(carrierId); const ins = c?.insurance.find((i: any) => i.id === insId); if (ins) { Object.assign(ins, patch); emit(); } },
  removeInsurance(carrierId: string, insId: string) { const c = this.carrier(carrierId); if (!c) return; c.insurance = c.insurance.filter((i: any) => i.id !== insId); emit(); },
};

/* Anna summary for a carrier folder — also surfaces insurance gaps that affect
   driver eligibility (lapsed/inactive required coverage). */
export function carrierAISummary(c: any) {
  const flags: string[] = [];
  const active = (c.insurance || []).filter((i: any) => i.active);
  const expired = active.filter((i: any) => i.expiration && +new Date(i.expiration) < Date.now());
  if (!active.length) flags.push('No active insurance on file — drivers cannot be cleared for this carrier.');
  expired.forEach((i: any) => flags.push(`${i.coverageType} expired ${fmtDate(i.expiration)} — renew before hiring.`));
  if (!(c.forms || []).length) flags.push('No carrier forms submitted yet.');
  const driverCount = store.drivers.filter((d: any) => resolveCarrier(d.carrier)?.id === c.id && !d.archived).length;
  const text = `${c.name} (DOT ${c.dot || '—'}) is ${c.status}. ${active.length} active insurance ${active.length === 1 ? 'policy' : 'policies'}, ${(c.forms || []).length} form${(c.forms || []).length === 1 ? '' : 's'} on file. Hiring policy: ≤${c.policy?.maxMovingViolations} violations, ≤${c.policy?.maxDUI} DUI, ${c.policy?.minExperienceYears}y experience. ${driverCount} active driver${driverCount === 1 ? '' : 's'} hiring under this carrier.`;
  return { text, flags };
}

export function fmtAgo(iso: string) {
  if (!iso) return ''; const m = Math.floor((Date.now() - +new Date(iso)) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; return Math.floor(h / 24) + 'd ago';
}
export function fmtDate(iso: string) { if (!iso) return '—'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
