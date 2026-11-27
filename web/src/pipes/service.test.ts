import { describe, it, expect, beforeAll } from 'vitest';
import { LEAD_STAGE, HIRING_STAGE, ACTIVE_STAGE, INACTIVE_STAGE } from './stages';

/* Seed schema-v1 localStorage (old 13-stage funnel + old hiring stages) before
   the stores load, so these tests cover the migration as well as the handoffs. */
const DAY = 864e5;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const doc = (name: string, status = 'collected') => ({ key: 'k_' + name, name, required: true, status });
const v1Driver = (id: string, name: string, stage: string, email: string) => ({
  id, name, email, phone: '(555) 010-01' + id.slice(-2), carrier: 'GRAND ONE LLC', position: 'Company Driver', ownerName: 'Nina Patel', stage, risk: 'Low', score: 88,
  cdlClass: 'A', drugTest: 'passed', clearinghouse: 'clear', medicalCard: 'valid', mvr: { violations: 0, accidents: 0, dui: 0 }, psp: { crashes: 0, oos: 0 }, stageSince: ago(2),
  steps: [], documents: ['CDL Front', 'CDL Back', 'Medical Card', 'MVR', 'PSP Report', 'Clearinghouse Consent', 'Drug Test Consent', 'W-9', 'Offer Letter', 'Driver Agreement'].map((n) => doc(n)),
  activities: [{ id: 'a1', type: 'stage', title: 'Entered', at: ago(5), user: 'Nina Patel' }], application: { submitted: true }, archived: false, assignedTruckId: null,
});
const v1Lead = (id: string, name: string, stageName: string, email: string, extra: any = {}) => ({
  id, name, email, phone: '+1 777-555-0' + id.slice(-3), stageName, ownerId: 'NP', source: 'referral', licenseType: 'Class A', experienceYears: 4, createdAt: ago(3), stageSince: ago(1),
  consent: { status: 'in', doNotContact: false }, screening: { cdlValid: true, mvrClear: true, medical: true }, documents: [], tasks: [], activities: [], archived: false, nextAction: { title: 'Call', status: 'open' }, ...extra,
});

let S: typeof import('./service');
let hire: typeof import('../hire/store');
let recruit: typeof import('../recruit/store');
let bus: typeof import('../tasks/bus');

beforeAll(async () => {
  localStorage.clear();
  localStorage.setItem('qh_recruit_v1', JSON.stringify({
    stages: ['New Lead', 'Anna AI Contacted', 'Needs Follow-Up', 'Pre-Screening', 'Ready for Review', 'Rejected', 'Hired', 'Archived', 'Road Test'].map((name, i) => ({ id: 'st' + i, name, order: i, maxDays: 2, disabled: false, terminal: ['Rejected', 'Hired', 'Archived'].includes(name) })),
    leads: [
      v1Lead('l_001', 'Olivia Qualified', 'Ready for Review', 'olivia@example.com'),
      v1Lead('l_002', 'Ned New', 'New Lead', 'ned@example.com'),
      v1Lead('l_003', 'Rita Rejected', 'Rejected', 'rita.r@example.com'),
      v1Lead('l_004', 'Holly Linked', 'Needs Follow-Up', 'holly@example.com'),
      v1Lead('l_005', 'Cody Custom', 'Road Test', 'cody@example.com'),
    ],
    automations: [],
  }));
  localStorage.setItem('qh_hire_v1', JSON.stringify({
    drivers: [v1Driver('p_01', 'Holly Linked', 'Screening', 'holly@example.com'), v1Driver('p_02', 'Owen Offer', 'Offer', 'owen@example.com'), v1Driver('p_03', 'Hank Hired', 'Hired', 'hank@example.com')],
  }));
  S = await import('./service');
  hire = await import('../hire/store');
  recruit = await import('../recruit/store');
  bus = await import('../tasks/bus');
});

const lead = (name: string) => recruit.store.leads.find((l: any) => l.name === name);
const drv = (name: string) => hire.store.drivers.find((d: any) => d.name === name);

describe('localStorage migration (schema v1 → v2)', () => {
  it('maps old lead stages and keeps custom stages', () => {
    expect(lead('Olivia Qualified').stageName).toBe(LEAD_STAGE.QUALIFIED);
    expect(lead('Ned New').stageName).toBe(LEAD_STAGE.NEW);
    expect(lead('Rita Rejected').stageName).toBe(LEAD_STAGE.NOT_QUALIFIED);
    expect(lead('Cody Custom').stageName).toBe('Road Test');
    expect(S.pipes().leads.stages.map((s) => s.name)).toContain('Road Test');
  });
  it('maps old hiring stages and adds lifecycle defaults', () => {
    expect(drv('Owen Offer').stage).toBe(HIRING_STAGE.OFFER);
    expect(drv('Holly Linked').stage).toBe(HIRING_STAGE.DOCS);
    expect(drv('Hank Hired').lifecycle).toBe('hiring');
    expect(Array.isArray(drv('Hank Hired').checkIns)).toBe(true);
  });
  it('links a lead to an existing hire record (same email) so each person lives in one pipeline', () => {
    expect(lead('Holly Linked').convertedTo).toBe('p_01');
    expect(drv('Holly Linked').leadId).toBe(lead('Holly Linked').id);
    expect(S.records('leads').some((l: any) => l.name === 'Holly Linked')).toBe(false);
  });
  it('seeds example Active and Inactive drivers flagged as example data', () => {
    expect(S.records('active').length).toBeGreaterThan(3);
    expect(S.records('inactive').length).toBeGreaterThan(2);
    expect(S.records('active').every((d: any) => d.example)).toBe(true);
    expect(JSON.parse(localStorage.getItem('qh_hire_v1')!).schema).toBe(2);
  });
});

describe('stage moves + undo', () => {
  it('moves within a pipeline, smart-defaults a next step, and undoes cleanly', () => {
    const d = drv('Owen Offer'); d.nextStep = null;
    const res = S.moveRecord('hiring', d.id, HIRING_STAGE.ORIENTATION);
    expect(res.ok).toBe(true);
    expect(drv('Owen Offer').stage).toBe(HIRING_STAGE.ORIENTATION);
    expect(drv('Owen Offer').nextStep.title).toBeTruthy();
    expect(drv('Owen Offer').activities[0].title).toContain('→ ' + HIRING_STAGE.ORIENTATION);
    res.undo!.undo();
    expect(drv('Owen Offer').stage).toBe(HIRING_STAGE.OFFER);
    expect(drv('Owen Offer').nextStep).toBeNull();
  });
  it('records the reason and origin when closing as lost', () => {
    const l = lead('Ned New');
    S.moveRecord('leads', l.id, LEAD_STAGE.NOT_QUALIFIED, { reason: 'No required license' });
    expect(lead('Ned New')).toMatchObject({ stageName: LEAD_STAGE.NOT_QUALIFIED, lostFrom: LEAD_STAGE.NEW, closeReason: 'No required license' });
  });
});

describe('handoffs', () => {
  it('Leads → Hiring creates the hire driver with lead details; undo removes it', () => {
    const l = lead('Olivia Qualified');
    const res = S.leadToHiring(l.id);
    expect(res.ok).toBe(true);
    const d = hire.svc.driver(res.id!);
    expect(d).toMatchObject({ name: 'Olivia Qualified', email: 'olivia@example.com', stage: HIRING_STAGE.APPLICATION, lifecycle: 'hiring', leadId: l.id, cdlClass: 'A', experienceYears: 4, source: 'referral', ownerName: 'Nina Patel' });
    expect(lead('Olivia Qualified')).toMatchObject({ stageName: LEAD_STAGE.TO_HIRING, convertedTo: d.id });
    expect(d.activities.some((a: any) => a.type === 'lifecycle' && a.title === 'Lead → Hiring')).toBe(true);
    res.undo!.undo();
    expect(hire.svc.driver(res.id!)).toBeUndefined();
    expect(lead('Olivia Qualified').stageName).toBe(LEAD_STAGE.QUALIFIED);
    S.leadToHiring(lead('Olivia Qualified').id); // redo for later tests
  });
  it('Hiring → Active sets the hire date and creates day 7/30/45/90 check-in tasks', () => {
    const d = drv('Hank Hired');
    const before = bus.externalTasks().length;
    const res = S.startOnboarding(d.id);
    expect(res.ok).toBe(true);
    const a = drv('Hank Hired');
    expect(a).toMatchObject({ lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90 });
    expect(a.hireDate).toBeTruthy();
    expect(a.checkIns.map((c: any) => c.day)).toEqual([7, 30, 45, 90]);
    const tasks = bus.externalTasks().slice(0, 4);
    expect(bus.externalTasks().length).toBe(before + 4);
    expect(tasks.map((t: any) => t.title).sort()).toEqual(['Day 30 check-in — Hank Hired', 'Day 45 check-in — Hank Hired', 'Day 7 check-in — Hank Hired', 'Day 90 check-in — Hank Hired']);
    expect(tasks.every((t: any) => t.relatedType === 'driver' && t.related === 'Hank Hired')).toBe(true);
    res.undo!.undo();
    expect(drv('Hank Hired').lifecycle).toBe('hiring');
    expect(bus.externalTasks().length).toBe(before);
    S.startOnboarding(drv('Hank Hired').id);
  });
  it('Active → Inactive requires a reason and respects rehire eligibility', () => {
    const id = drv('Hank Hired').id;
    expect(S.markQuit(id, { reason: '', type: 'Quit', rehireEligible: true }).ok).toBe(false);
    S.markQuit(id, { reason: 'Home time', type: 'Quit', rehireEligible: true, note: 'Wants regional' });
    expect(drv('Hank Hired')).toMatchObject({ lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.INACTIVE, quitReason: 'Home time', rehireEligible: true });
    expect(drv('Hank Hired').tenures).toHaveLength(1);
    const other = S.records('active')[0];
    S.markQuit(other.id, { reason: 'Failed drug test', type: 'Terminated', rehireEligible: false });
    expect(hire.svc.driver(other.id).inactiveStage).toBe(INACTIVE_STAGE.DNR);
  });
  it('Inactive → Re-applied returns to Hiring · Application keeping history', () => {
    const id = drv('Hank Hired').id;
    const res = S.handoff('inactive', id);
    expect(res.ok).toBe(true);
    const d = drv('Hank Hired');
    expect(d).toMatchObject({ lifecycle: 'hiring', stage: HIRING_STAGE.APPLICATION, reapplyCount: 1 });
    expect(d.tenures).toHaveLength(1);
    expect(d.documents.find((x: any) => x.name === 'MVR').status).toBe('missing');
    expect(d.activities.some((a: any) => a.title === 'Inactive → Hiring (re-applied)')).toBe(true);
  });
});

describe('checklist actions + e-sign completion', () => {
  it('one-click checklist actions update the record and timeline', () => {
    const d = drv('Holly Linked');
    d.documents.find((x: any) => x.name === 'PSP Report').status = 'missing';
    S.runAction('hiring', d.id, { kind: 'requestDocs', label: 'Request', arg: ['PSP Report'] });
    expect(drv('Holly Linked').documents.find((x: any) => x.name === 'PSP Report').status).toBe('pending');
    S.runAction('hiring', d.id, { kind: 'markDocs', label: 'Mark received', arg: ['PSP Report'] });
    expect(drv('Holly Linked').documents.find((x: any) => x.name === 'PSP Report').status).toBe('collected');
  });
  it('advances Offer & e-sign → Orientation when qh:esign-completed fires (once per envelope)', () => {
    const d = drv('Owen Offer');
    window.dispatchEvent(new CustomEvent('qh:esign-completed', { detail: { driverName: 'owen offer', envelopeId: 'env_1', title: 'Offer Letter' } }));
    expect(drv('Owen Offer').stage).toBe(HIRING_STAGE.ORIENTATION);
    expect(drv('Owen Offer').esign.status).toBe('completed');
    expect(drv('Owen Offer').documents.find((x: any) => x.name === 'Offer Letter').status).toBe('collected');
    hire.svc.moveStage(d.id, HIRING_STAGE.OFFER);
    expect(S.onEsignCompleted({ driverId: d.id, envelopeId: 'env_1', title: 'Offer Letter' }).ok).toBe(false);
    expect(drv('Owen Offer').stage).toBe(HIRING_STAGE.OFFER);
  });
  it('adds a task linked to the record and to the Tasks bus', () => {
    const d = drv('Owen Offer');
    const n = bus.externalTasks().length;
    expect(S.addTask('hiring', d.id, { title: 'Confirm start date', due: '2026-12-01' }).ok).toBe(true);
    expect(bus.externalTasks().length).toBe(n + 1);
    expect(S.nextTaskOf(drv('Owen Offer')).title).toBe('Confirm start date');
  });
});
