import { describe, it, expect } from 'vitest';
import {
  slaLevel, buildPipes, checklistFor, readyToAdvance, planMove, missingForMove, leadAttempts, speedToLeadMin, leadLastContact,
  leadReached, pipeStats, retention90, columnMetrics, lifecycleFunnel, matchesFilters, lifecyclePath, nextStageOf, fmtDuration,
  docsProgress, recordSla, sortForColumn, HANDOFF_TO_ACTIVE, isHot, tenureDays,
} from './lifecycle';
import { LEAD_STAGE, HIRING_STAGE, ACTIVE_STAGE, INACTIVE_STAGE, LEAD_DEFAULT_STAGES, normalizeHiringStage } from './stages';

const NOW = Date.UTC(2026, 10, 27, 15, 0, 0);
const DAY = 864e5;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const minAgo = (m: number) => new Date(NOW - m * 6e4).toISOString();
const leadStages = LEAD_DEFAULT_STAGES.map(([name, maxDays, outcome], i) => ({ id: 's' + i, name, order: i, maxDays, disabled: false, terminal: !!outcome, outcome }));
const P = buildPipes(leadStages);

const DOCS = ['CDL Front', 'CDL Back', 'Medical Card', 'MVR', 'PSP Report', 'Clearinghouse Consent', 'Drug Test Consent', 'W-9', 'Offer Letter', 'Driver Agreement'];
const driver = (over: any = {}) => ({
  id: 'd1', name: 'Test Driver', phone: '555', email: 't@example.com', ownerName: 'Nina Patel', lifecycle: 'hiring', stage: HIRING_STAGE.DOCS, stageSince: ago(1),
  cdlClass: 'A', drugTest: 'passed', clearinghouse: 'clear', application: { submitted: true },
  documents: DOCS.map((name) => ({ key: name, name, required: true, status: 'collected' })), activities: [], ...over,
});
const lead = (over: any = {}) => ({ id: 'l1', name: 'Lead One', phone: '1', email: 'l@example.com', ownerId: 'NP', stageName: LEAD_STAGE.NEW, stageSince: minAgo(30), createdAt: minAgo(30), activities: [], screening: {}, consent: { status: 'not_asked' }, score: 70, ...over });

describe('SLA level', () => {
  it('is neutral without an SLA', () => { expect(slaLevel(5, 0)).toBe('none'); });
  it('goes green → amber → red against maxDays', () => {
    expect(slaLevel(0, 1)).toBe('ok'); expect(slaLevel(1, 1)).toBe('warn'); expect(slaLevel(2, 1)).toBe('over');
    expect(slaLevel(1, 2)).toBe('ok'); expect(slaLevel(2, 2)).toBe('warn'); expect(slaLevel(3, 2)).toBe('over');
    expect(slaLevel(5, 7)).toBe('ok'); expect(slaLevel(6, 7)).toBe('warn'); expect(slaLevel(8, 7)).toBe('over');
    expect(slaLevel(60, 90)).toBe('ok'); expect(slaLevel(70, 90)).toBe('warn'); expect(slaLevel(91, 90)).toBe('over');
  });
  it('uses the per-stage maxDays of the record’s stage', () => {
    expect(recordSla(P.hiring, driver({ stage: HIRING_STAGE.APPLICATION, stageSince: ago(3) }), NOW)).toBe('over'); // SLA 2d
    expect(recordSla(P.hiring, driver({ stage: HIRING_STAGE.DOCS, stageSince: ago(3) }), NOW)).toBe('ok'); // SLA 5d
    expect(recordSla(P.hiring, driver({ stage: HIRING_STAGE.LOST, stageSince: ago(30) }), NOW)).toBe('none');
  });
});

describe('pipeline definitions', () => {
  it('builds Leads from the editable recruit stages plus lost + handoff zones', () => {
    expect(P.leads.stages.map((s) => s.name)).toEqual([LEAD_STAGE.NEW, LEAD_STAGE.ATTEMPTING, LEAD_STAGE.CONTACTED, LEAD_STAGE.QUALIFIED, LEAD_STAGE.NOT_QUALIFIED, LEAD_STAGE.TO_HIRING]);
    expect(P.leads.stages.find((s) => s.name === LEAD_STAGE.TO_HIRING)?.to).toBe('hiring');
  });
  it('keeps custom lead stages and drops disabled ones', () => {
    const p = buildPipes([...leadStages, { id: 'x', name: 'Interview', order: 3.5, maxDays: 2, terminal: false, disabled: false }, { id: 'y', name: 'Old', order: 2.5, maxDays: 1, terminal: false, disabled: true }]);
    expect(p.leads.stages.map((s) => s.name)).toContain('Interview');
    expect(p.leads.stages.map((s) => s.name)).not.toContain('Old');
  });
  it('wires next stages and handoffs', () => {
    expect(nextStageOf(P.leads, LEAD_STAGE.QUALIFIED)).toBe(LEAD_STAGE.TO_HIRING);
    expect(nextStageOf(P.hiring, HIRING_STAGE.HIRED)).toBe(HANDOFF_TO_ACTIVE);
    expect(nextStageOf(P.active, ACTIVE_STAGE.FIRST90)).toBe(ACTIVE_STAGE.ACTIVE);
    expect(nextStageOf(P.active, ACTIVE_STAGE.ACTIVE)).toBeNull();
    expect(nextStageOf(P.inactive, INACTIVE_STAGE.REENGAGING)).toBe(INACTIVE_STAGE.REAPPLIED);
  });
  it('migrates legacy hiring stage names', () => {
    expect(normalizeHiringStage('Lead')).toBe(HIRING_STAGE.APPLICATION);
    expect(normalizeHiringStage('Background Check')).toBe(HIRING_STAGE.DOCS);
    expect(normalizeHiringStage('Onboarding')).toBe(HIRING_STAGE.ORIENTATION);
    expect(normalizeHiringStage(HIRING_STAGE.LOST)).toBe(HIRING_STAGE.LOST);
    expect(normalizeHiringStage(undefined)).toBe(HIRING_STAGE.APPLICATION);
  });
});

describe('ready-to-advance checklist', () => {
  it('Docs & checks needs CDL, medical card, MVR, PSP, Clearinghouse and drug test', () => {
    const items = checklistFor('hiring', HIRING_STAGE.DOCS, driver(), NOW);
    expect(items.map((i) => i.key)).toEqual(['cdl', 'medical', 'mvr', 'psp', 'clearinghouse', 'drug']);
    expect(readyToAdvance(P.hiring, driver(), NOW)).toBe(true);
  });
  it('offers a one-click request for a missing document', () => {
    const d = driver(); d.documents.find((x: any) => x.name === 'MVR')!.status = 'missing';
    const mvr = checklistFor('hiring', HIRING_STAGE.DOCS, d, NOW).find((i) => i.key === 'mvr')!;
    expect(mvr.done).toBe(false);
    expect(mvr.action).toEqual({ kind: 'requestDocs', label: 'Request', arg: ['MVR'] });
    expect(readyToAdvance(P.hiring, d, NOW)).toBe(false);
  });
  it('treats a collected consent without a result as not done', () => {
    const d = driver({ drugTest: 'missing', clearinghouse: 'pending' });
    const items = checklistFor('hiring', HIRING_STAGE.DOCS, d, NOW);
    expect(items.find((i) => i.key === 'drug')!.action?.kind).toBe('markCheck');
    expect(items.find((i) => i.key === 'clearinghouse')!.done).toBe(false);
  });
  it('lead checklists follow contact progress', () => {
    expect(readyToAdvance(P.leads, lead(), NOW)).toBe(false);
    const contacted = lead({ activities: [{ type: 'comm', direction: 'outbound', at: minAgo(10) }] });
    expect(readyToAdvance(P.leads, contacted, NOW)).toBe(true);
    const qual = lead({ stageName: LEAD_STAGE.QUALIFIED, consent: { status: 'in' } });
    expect(readyToAdvance(P.leads, qual, NOW)).toBe(true);
  });
  it('first-90-day drivers are ready once all four check-ins are logged', () => {
    const cis = [7, 30, 45, 90].map((day) => ({ day, due: ago(-day), doneAt: ago(1) }));
    expect(readyToAdvance(P.active, driver({ lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90, checkIns: cis }), NOW)).toBe(true);
    cis[3].doneAt = null as any;
    expect(readyToAdvance(P.active, driver({ lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90, checkIns: cis }), NOW)).toBe(false);
    expect(readyToAdvance(P.active, driver({ lifecycle: 'active', activeStage: ACTIVE_STAGE.ACTIVE }), NOW)).toBe(false);
  });
});

describe('move planning (required info when entering a stage)', () => {
  it('asks for a reason before any lost stage', () => {
    expect(planMove(P.leads, lead(), LEAD_STAGE.NOT_QUALIFIED, NOW).kind).toBe('reason');
    expect(planMove(P.hiring, driver(), HIRING_STAGE.LOST, NOW).kind).toBe('reason');
    expect(planMove(P.inactive, driver({ lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.INACTIVE }), INACTIVE_STAGE.DNR, NOW).kind).toBe('reason');
  });
  it('opens the exit form for Quit / Terminated and a reason for At risk', () => {
    const a = driver({ lifecycle: 'active', activeStage: ACTIVE_STAGE.ACTIVE });
    expect(planMove(P.active, a, ACTIVE_STAGE.QUIT, NOW).kind).toBe('quit');
    expect(planMove(P.active, a, ACTIVE_STAGE.AT_RISK, NOW).kind).toBe('risk');
  });
  it('lists cumulative missing requirements when skipping stages', () => {
    const l = lead(); // New lead, no attempts, no screening
    const miss = missingForMove(P.leads, l, LEAD_STAGE.QUALIFIED, NOW).map((m) => m.key);
    expect(miss).toEqual(expect.arrayContaining(['attempt', 'reached', 'cdl', 'mvr', 'medical', 'consent']));
    expect(planMove(P.leads, l, LEAD_STAGE.ATTEMPTING, NOW)).toEqual({ kind: 'move', missing: [expect.objectContaining({ key: 'attempt' })] });
  });
  it('never requires anything for backward moves or no-ops', () => {
    expect(missingForMove(P.hiring, driver({ stage: HIRING_STAGE.OFFER }), HIRING_STAGE.APPLICATION, NOW)).toEqual([]);
    expect(planMove(P.hiring, driver(), HIRING_STAGE.DOCS, NOW).kind).toBe('noop');
  });
  it('turns handoff zones into handoffs with remaining requirements', () => {
    const q = lead({ stageName: LEAD_STAGE.QUALIFIED, consent: { status: 'in' } });
    expect(planMove(P.leads, q, LEAD_STAGE.TO_HIRING, NOW)).toEqual({ kind: 'handoff', to: 'hiring', missing: [] });
    const h = driver({ stage: HIRING_STAGE.HIRED }); h.documents.find((x: any) => x.name === 'W-9')!.status = 'pending';
    const plan = planMove(P.hiring, h, HANDOFF_TO_ACTIVE, NOW);
    expect(plan.kind).toBe('handoff');
    expect(plan.kind === 'handoff' && plan.missing.map((m) => m.key)).toEqual(['truck', 'w9']);
    expect(missingForMove(P.inactive, driver({ lifecycle: 'inactive', rehireEligible: false }), INACTIVE_STAGE.REAPPLIED, NOW)).toHaveLength(1);
  });
});

describe('lead contact metrics', () => {
  const l = lead({ createdAt: minAgo(120), activities: [
    { type: 'comm', direction: 'inbound', outcome: 'replied', at: minAgo(30) },
    { type: 'comm', direction: 'outbound', at: minAgo(60) },
    { type: 'anna', direction: 'outbound', at: minAgo(115) },
    { type: 'note', at: minAgo(5) },
  ] });
  it('counts outbound attempts and finds the last contact', () => {
    expect(leadAttempts(l)).toBe(2);
    expect(leadLastContact(l)).toBe(minAgo(30));
    expect(leadReached(l)).toBe(true);
  });
  it('measures speed-to-lead from creation to the first outbound touch', () => {
    expect(speedToLeadMin(l)).toBe(5);
    expect(speedToLeadMin(lead())).toBeNull();
  });
  it('formats durations', () => { expect(fmtDuration(4)).toBe('4m'); expect(fmtDuration(90)).toBe('1.5h'); expect(fmtDuration(60 * 20)).toBe('20h'); expect(fmtDuration(60 * 30)).toBe('1d'); expect(fmtDuration(60 * 72)).toBe('3d'); expect(fmtDuration(null)).toBe('—'); });
});

describe('stats strip', () => {
  it('Leads: new today, not contacted, speed-to-lead, qualified %', () => {
    const leads = [
      lead({ id: 'a', createdAt: minAgo(30) }),
      lead({ id: 'b', createdAt: ago(3), stageName: LEAD_STAGE.ATTEMPTING, activities: [{ type: 'comm', direction: 'outbound', at: new Date(NOW - 3 * DAY + 10 * 6e4).toISOString() }] }),
      lead({ id: 'c', createdAt: ago(5), stageName: LEAD_STAGE.QUALIFIED, activities: [{ type: 'comm', direction: 'outbound', at: new Date(NOW - 5 * DAY + 20 * 6e4).toISOString() }] }),
    ];
    const converted = lead({ id: 'd', stageName: LEAD_STAGE.TO_HIRING, convertedTo: 'x', createdAt: ago(10) });
    const s = Object.fromEntries(pipeStats(P.leads, leads, { allLeads: [...leads, converted], now: NOW }).map((x) => [x.key, x]));
    expect(s.newToday.value).toBe('1');
    expect(s.notContacted.value).toBe('1');
    expect(s.speed.value).toBe('15m');
    expect(s.qualified.value).toBe('50%');
    expect(leads.filter(s.notContacted.test!).map((l) => l.id)).toEqual(['a']);
  });
  it('Hiring: in progress, past SLA, docs missing, offers out, avg days to hire', () => {
    const missingDocs = driver({ id: 'h2', stage: HIRING_STAGE.APPLICATION, stageSince: ago(4) }); missingDocs.documents[0].status = 'missing';
    const recs = [driver({ id: 'h1' }), missingDocs, driver({ id: 'h3', stage: HIRING_STAGE.OFFER, esign: { status: 'sent' } }), driver({ id: 'h4', stage: HIRING_STAGE.LOST })];
    const hired = [driver({ id: 'x1', lifecycle: 'active', appliedAt: ago(40), hireDate: ago(20) }), driver({ id: 'x2', lifecycle: 'active', appliedAt: ago(30), hireDate: ago(20) })];
    const s = Object.fromEntries(pipeStats(P.hiring, recs, { allDrivers: [...recs, ...hired], now: NOW }).map((x) => [x.key, x.value]));
    expect(s).toEqual({ inProgress: '3', pastSla: '1', docs: '1', offers: '1', tth: '15d' });
  });
  it('Active + Inactive stats', () => {
    const act = [driver({ lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90, hireDate: ago(10) }), driver({ lifecycle: 'active', activeStage: ACTIVE_STAGE.AT_RISK, riskReason: 'Pay', hireDate: ago(200) })];
    const sa = Object.fromEntries(pipeStats(P.active, act, { now: NOW }).map((x) => [x.key, x.value]));
    expect(sa.active).toBe('2'); expect(sa.first90).toBe('1'); expect(sa.atRisk).toBe('1');
    const ina = [driver({ lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.INACTIVE, quitReason: 'Pay', rehireEligible: true }), driver({ lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.REENGAGING, quitReason: 'Pay', rehireEligible: true }), driver({ lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.DNR, quitReason: 'Failed drug test', rehireEligible: false })];
    const si = Object.fromEntries(pipeStats(P.inactive, ina, { allDrivers: [...ina, driver({ lastReappliedAt: ago(3), reapplyCount: 1 })], now: NOW }).map((x) => [x.key, x.value]));
    expect(si).toEqual({ inactive: '2', eligible: '2', reengaging: '1', rehired: '1', topReason: 'Pay' }); // Do not rehire excluded
  });
  it('90-day retention counts early quits and ignores drivers too new to judge', () => {
    const r = retention90([
      { lifecycle: 'active', hireDate: ago(200) }, // kept
      { lifecycle: 'active', hireDate: ago(30) }, // too new
      { lifecycle: 'inactive', hireDate: ago(150), inactiveSince: ago(120), tenures: [{ hireDate: ago(150), endDate: ago(120) }] }, // left at 30d
      { lifecycle: 'inactive', hireDate: ago(60), inactiveSince: ago(20), tenures: [{ hireDate: ago(60), endDate: ago(20) }] }, // left at 40d
    ], NOW);
    expect(r).toEqual({ cohort: 3, kept: 1, pct: 33 });
    expect(tenureDays({ lifecycle: 'inactive', hireDate: ago(150), inactiveSince: ago(120) }, NOW)).toBe(30);
  });
});

describe('column metrics + lifecycle funnel', () => {
  it('computes count, avg days, past SLA and conversion from the previous column', () => {
    const recs = [
      driver({ id: '1', stage: HIRING_STAGE.APPLICATION, stageSince: ago(3) }),
      driver({ id: '2', stage: HIRING_STAGE.APPLICATION, stageSince: ago(1) }),
      driver({ id: '3', stage: HIRING_STAGE.DOCS, stageSince: ago(2) }),
      driver({ id: '4', stage: HIRING_STAGE.LOST, lostFrom: HIRING_STAGE.DOCS }),
    ];
    const m = columnMetrics(P.hiring, recs, 0, NOW);
    expect(m[HIRING_STAGE.APPLICATION]).toEqual({ count: 2, avgDays: 2, pastSla: 1, conversion: null });
    expect(m[HIRING_STAGE.DOCS].conversion).toBe(50); // 2 of 4 reached Docs
    expect(m[HIRING_STAGE.OFFER].conversion).toBe(0);
    expect(columnMetrics(P.hiring, recs, 2, NOW)[HIRING_STAGE.OFFER].conversion).toBe(50); // handed-off records reached every stage
  });
  it('summarises the lifecycle strip', () => {
    const leads = [lead({ id: 'a' }), lead({ id: 'b', convertedTo: 'd1', stageName: LEAD_STAGE.TO_HIRING }), lead({ id: 'c', stageName: LEAD_STAGE.NOT_QUALIFIED }), lead({ id: 'e', archived: true })];
    const drivers = [driver({ id: 'd1' }), driver({ id: 'd2', lifecycle: 'active', hireDate: ago(9) }), driver({ id: 'd3', lifecycle: 'inactive', hireDate: ago(99), inactiveStage: INACTIVE_STAGE.INACTIVE }), driver({ id: 'd4', archived: true })];
    const f = lifecycleFunnel(leads, drivers);
    expect(f.counts).toEqual({ leads: 1, hiring: 1, active: 1, inactive: 1 });
    expect(f.leadToHiring).toBe(33);
    expect(f.hiringToActive).toBe(67);
    expect(f.churn).toBe(50);
  });
});

describe('filters, ordering and breadcrumb', () => {
  it('quick chips combine with search and recruiter', () => {
    const late = driver({ id: 'late', stage: HIRING_STAGE.APPLICATION, stageSince: ago(5), ownerName: 'Dana Reed', nextStep: null });
    const fine = driver({ id: 'fine', nextStep: { title: 'Call', status: 'open' }, score: 90 });
    expect(matchesFilters(P.hiring, late, { pastSla: true }, NOW)).toBe(true);
    expect(matchesFilters(P.hiring, fine, { pastSla: true }, NOW)).toBe(false);
    expect(matchesFilters(P.hiring, late, { mine: true }, NOW)).toBe(false);
    expect(matchesFilters(P.hiring, late, { recruiter: 'DR', noNext: true }, NOW)).toBe(true);
    expect(matchesFilters(P.hiring, fine, { ready: true, hot: true }, NOW)).toBe(true);
    expect(matchesFilters(P.hiring, fine, { q: 'nobody' }, NOW)).toBe(false);
    expect(isHot('active', { activeStage: ACTIVE_STAGE.AT_RISK }, NOW)).toBe(true);
  });
  it('sorts the most urgent cards first', () => {
    const recs = [driver({ id: 'ok', stageSince: ago(1) }), driver({ id: 'over', stageSince: ago(9) }), driver({ id: 'warn', stageSince: ago(4) })];
    expect(sortForColumn(P.hiring, recs, NOW).map((r) => r.id)).toEqual(['over', 'warn', 'ok']);
  });
  it('builds the Lead → Hiring → Active → Inactive breadcrumb', () => {
    expect(lifecyclePath(null)).toEqual({ current: 'leads', reached: ['leads'] });
    expect(lifecyclePath(driver({ leadId: 'l1' }))).toEqual({ current: 'hiring', reached: ['leads', 'hiring'] });
    expect(lifecyclePath(driver({ lifecycle: 'inactive', hireDate: ago(5), inactiveSince: ago(1) }))).toEqual({ current: 'inactive', reached: ['hiring', 'active', 'inactive'] });
    expect(lifecyclePath(driver({ lifecycle: 'hiring', tenures: [{}] })).reached).toEqual(['hiring', 'active', 'inactive']);
  });
  it('reports document progress', () => { const d = driver(); d.documents[0].status = 'missing'; expect(docsProgress(d)).toEqual({ have: 9, total: 10 }); });
});
