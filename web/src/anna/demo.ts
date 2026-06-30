/* Local demo data so the Anna workspace renders fully without a backend.
   Shapes mirror backend/app/anna (matcher, portfolio, metrics endpoints). */

export const DEMO_CARRIERS = ['GRAND ONE LLC', 'DT NATIONAL', 'MIDWEST FREIGHT LINES', 'BLUE RIDGE CARRIERS'];

export function demoMatch(profile: any) {
  const exp = profile?.cdl?.experienceYears ?? 4;
  return {
    profile,
    match: {
      top: { carrierId: 'c1', carrierName: 'GRAND ONE LLC' },
      summary: { eligible: 2, needsData: 1, ineligible: 1, nearMisses: [{ carrierId: 'c4', carrierName: 'BLUE RIDGE CARRIERS', reason: 'Experience: has ' + exp + ' yrs, below the required 5.' }] },
      matches: [
        { carrierId: 'c1', carrierName: 'GRAND ONE LLC', status: 'ELIGIBLE', fitScore: 92, scoreBreakdown: { experienceMargin: 80, cleanRecordMargin: 100, endorsementsMatch: 100 }, reasons: [], fitSummary: `${exp} yrs experience vs 2 required · clean driving & safety record · holds required endorsement (H)`, nearMiss: null },
        { carrierId: 'c2', carrierName: 'DT NATIONAL', status: 'ELIGIBLE', fitScore: 78, scoreBreakdown: { experienceMargin: 60, cleanRecordMargin: 85 }, reasons: [], fitSummary: `${exp} yrs experience · violations within this carrier's limits · CDL valid 540 days`, nearMiss: null },
        { carrierId: 'c3', carrierName: 'MIDWEST FREIGHT LINES', status: 'NEEDS_DATA', fitScore: 0, scoreBreakdown: {}, reasons: ['PSP crashes: no data on file yet.', 'Insurance auto-liability: no data on file yet.'], fitSummary: null, nearMiss: null },
        { carrierId: 'c4', carrierName: 'BLUE RIDGE CARRIERS', status: 'INELIGIBLE', fitScore: 0, scoreBreakdown: {}, reasons: ['Experience: has ' + exp + ' yrs, below the required 5.'], fitSummary: null, nearMiss: 'Experience: has ' + exp + ' yrs, below the required 5.' },
      ],
    },
    source: 'heuristic',
  };
}

export const DEMO_PORTFOLIOS = [
  { id: 'portfolio_demo1', createdAt: new Date(Date.now() - 36e5 * 5).toISOString(), driverName: 'Robert Johnson', carrierName: 'GRAND ONE LLC', fitScore: 92, recommendationCount: 2, reviewStatus: 'pending', recruiter: 'Nina Patel', complianceFlag: null, outcome: null },
  { id: 'portfolio_demo2', createdAt: new Date(Date.now() - 36e5 * 26).toISOString(), driverName: 'Sarah Chen', carrierName: 'DT NATIONAL', fitScore: 84, recommendationCount: 3, reviewStatus: 'approved', recruiter: 'Dana Reed', complianceFlag: 'approve', outcome: 'hired' },
  { id: 'portfolio_demo3', createdAt: new Date(Date.now() - 36e5 * 50).toISOString(), driverName: 'Derek Hill', carrierName: null, fitScore: null, recommendationCount: 1, reviewStatus: 'awaiting_carrier', recruiter: 'Nina Patel', complianceFlag: null, outcome: null },
  { id: 'portfolio_demo4', createdAt: new Date(Date.now() - 36e5 * 73).toISOString(), driverName: 'Mike Okafor', carrierName: 'MIDWEST FREIGHT LINES', fitScore: 71, recommendationCount: 2, reviewStatus: 'rejected', recruiter: 'Dana Reed', complianceFlag: 'reject', outcome: 'washed_out' },
];

export function demoPortfolioDetail(id: string) {
  const summary = DEMO_PORTFOLIOS.find((p) => p.id === id) || DEMO_PORTFOLIOS[0];
  return {
    id: summary.id,
    createdAt: summary.createdAt,
    driver: { name: summary.driverName, age: 38, phone: '+1 214-555-0142', email: 'driver@example.com', cdl: { class: 'A', endorsements: ['H', 'N'], experienceYears: 6, type: 'company', expiresInDays: 540 }, mvr: { movingViolations: 0, accidents: 0, dui: 0 }, psp: { crashes: 0, oosInspections: 1 } },
    recommendations: [
      { carrierId: 'c1', carrierName: 'GRAND ONE LLC', status: 'ELIGIBLE', fitScore: 92, fitSummary: '6 yrs experience vs 2 required · clean record · holds H endorsement', nearMiss: null, topReason: null },
      { carrierId: 'c2', carrierName: 'DT NATIONAL', status: 'ELIGIBLE', fitScore: 78, fitSummary: '6 yrs experience · violations within limits', nearMiss: null, topReason: null },
      { carrierId: 'c4', carrierName: 'BLUE RIDGE CARRIERS', status: 'INELIGIBLE', fitScore: 0, fitSummary: null, nearMiss: 'Tanker endorsement (N): missing.', topReason: 'Tanker endorsement (N): missing.' },
    ],
    suggestedTop: 'c1',
    carrier: summary.carrierName ? { carrierId: 'c1', carrierName: summary.carrierName, fitScore: summary.fitScore, status: 'ELIGIBLE' } : null,
    documentWarnings: [],
    compliance: summary.complianceFlag ? {
      flag: summary.complianceFlag, status: summary.complianceFlag === 'approve' ? 'ELIGIBLE' : 'INELIGIBLE', carrierName: summary.carrierName,
      categories: [{ key: 'cdl', pass: true, reason: 'CDL meets requirements.' }, { key: 'mvr', pass: summary.complianceFlag === 'approve', reason: summary.complianceFlag === 'approve' ? 'MVR meets requirements.' : 'MVR: 2 moving violations, exceeds the limit of 1.' }, { key: 'psp', pass: true, reason: 'PSP meets requirements.' }],
      reasons: summary.complianceFlag === 'approve' ? [] : ['MVR: 2 moving violations, exceeds the limit of 1.'],
      summary: summary.complianceFlag === 'approve' ? `Driver meets all of ${summary.carrierName}'s stated CDL, MVR, PSP, and insurance requirements and is recommended for approval.` : `Driver does not meet ${summary.carrierName}'s requirements: MVR: 2 moving violations, exceeds the limit of 1.`,
      checkedAt: summary.createdAt,
    } : null,
    review: { assignedRecruiter: summary.recruiter, task: `${summary.recruiter}, please review this driver and pick the best-fit carrier.`, status: summary.reviewStatus, carrierSelectedBy: summary.carrierName ? summary.recruiter : null, carrierSelectedAt: summary.carrierName ? summary.createdAt : null, decidedBy: null, decidedAt: null, decisionReason: null },
    outcome: summary.outcome ? { status: summary.outcome } : null,
    audit: [
      { at: summary.createdAt, actor: 'Anna', event: 'lead_received', detail: `Lead intake (source: web form). Anna ranked 3 carriers; ${summary.recommendationCount} eligible.` },
      ...(summary.carrierName ? [{ at: summary.createdAt, actor: summary.recruiter, event: 'carrier_selected', detail: `Selected ${summary.carrierName}.` }] : []),
    ],
  };
}

export const DEMO_METRICS = {
  generatedAt: new Date().toISOString(),
  leads: 48, matched: 41, matchRate: 85,
  pipeline: { awaiting_carrier: 6, pending: 9, approved: 27, rejected: 6 },
  offersSelected: 33, avgHoursToSelect: 4.2, avgHoursToDecision: 19.5,
  compliance: { approve: 27, reject: 6, review: 4 },
  outcomes: { counts: { hired: 22, started: 19, retained_90d: 14, washed_out: 4, rejected: 6 }, good: 22, bad: 10, successRate: 69 },
  recruiterHoursSaved: 20.0,
  perCarrier: [
    { name: 'GRAND ONE LLC', selections: 14, good: 11, bad: 2, successRate: 85 },
    { name: 'DT NATIONAL', selections: 9, good: 6, bad: 2, successRate: 75 },
    { name: 'MIDWEST FREIGHT LINES', selections: 7, good: 4, bad: 3, successRate: 57 },
    { name: 'BLUE RIDGE CARRIERS', selections: 3, good: 1, bad: 0, successRate: 100 },
  ],
  bySource: [
    { source: 'web form', leads: 21, hired: 11, rejected: 3, hireRate: 52 },
    { source: 'Tenstreet', leads: 14, hired: 7, rejected: 2, hireRate: 50 },
    { source: 'referral', leads: 9, hired: 6, rejected: 1, hireRate: 67 },
    { source: 'indeed', leads: 4, hired: 1, rejected: 2, hireRate: 25 },
  ],
};

export const DEMO_NUDGES = [
  { portfolioId: 'portfolio_demo3', driver: 'Derek Hill', kind: 'awaiting_carrier', message: 'Waiting 50h for carrier selection — assign a recruiter.', ageHours: 50, severity: 'high' },
  { portfolioId: 'portfolio_demo1', driver: 'Robert Johnson', kind: 'pending_decision', message: 'Carrier selected but compliance not yet run.', ageHours: 5, severity: 'normal' },
];

export const SAMPLE_LEAD = {
  name: 'Marcus Bell', age: 41, phone: '+1 469-555-0188', email: 'marcus.bell@example.com',
  notes: 'Drove for Swift 2018-2023, Class A, hazmat + tanker endorsements. Clean MVR, no accidents. Looking for OTR dry van.',
  cdl: { class: 'A', endorsements: ['H', 'N'], experienceYears: 5, type: 'company', expiresInDays: 480 },
  mvr: { movingViolations: 0, accidents: 0, dui: 0 }, psp: { crashes: 0, oosInspections: 0 },
};
