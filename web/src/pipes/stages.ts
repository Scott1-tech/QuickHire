/* Canonical lifecycle stage names shared by the recruit store (Leads), the hire
   store (Hiring / Active / Inactive) and the Pipelines UI. Dependency-free so
   the stores can import it for their localStorage migrations without cycles. */

export type PipeKey = 'leads' | 'hiring' | 'active' | 'inactive';
export const PIPE_ORDER: PipeKey[] = ['leads', 'hiring', 'active', 'inactive'];

/* ── Leads (recruit store) ── */
export const LEAD_STAGE = {
  NEW: 'New lead',
  ATTEMPTING: 'Attempting contact',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NOT_QUALIFIED: 'Not qualified', // final · lost
  TO_HIRING: 'Moved to Hiring', // final · won (handoff, hidden from the board)
  ARCHIVED: 'Archived', // hidden (Archive tab)
} as const;

/** Default recruit stages for schema v2: [name, maxDays (SLA), outcome]. */
export const LEAD_DEFAULT_STAGES: [string, number, '' | 'lost' | 'won' | 'archived'][] = [
  [LEAD_STAGE.NEW, 1, ''],
  [LEAD_STAGE.ATTEMPTING, 2, ''],
  [LEAD_STAGE.CONTACTED, 3, ''],
  [LEAD_STAGE.QUALIFIED, 2, ''],
  [LEAD_STAGE.NOT_QUALIFIED, 0, 'lost'],
  [LEAD_STAGE.TO_HIRING, 0, 'won'],
  [LEAD_STAGE.ARCHIVED, 0, 'archived'],
];

/** Schema v1 → v2 lead stage mapping (old 13-stage recruiting funnel). */
export const LEGACY_LEAD_STAGE: Record<string, string> = {
  'New Lead': LEAD_STAGE.NEW,
  'Anna AI Contacted': LEAD_STAGE.ATTEMPTING,
  'Needs Follow-Up': LEAD_STAGE.ATTEMPTING,
  'Pre-Screening': LEAD_STAGE.CONTACTED,
  'Documents Requested': LEAD_STAGE.CONTACTED,
  'Interview / Call Scheduled': LEAD_STAGE.CONTACTED,
  'Documents Received': LEAD_STAGE.QUALIFIED,
  'Ready for Review': LEAD_STAGE.QUALIFIED,
  Approved: LEAD_STAGE.QUALIFIED,
  Rejected: LEAD_STAGE.NOT_QUALIFIED,
  'Refused / Not Interested': LEAD_STAGE.NOT_QUALIFIED,
  Hired: LEAD_STAGE.TO_HIRING,
  Archived: LEAD_STAGE.ARCHIVED,
};

/* ── Hiring (hire store `stage`) ── */
export const HIRING_STAGE = {
  APPLICATION: 'Application',
  DOCS: 'Docs & checks',
  OFFER: 'Offer & e-sign',
  ORIENTATION: 'Orientation',
  HIRED: 'Hired',
  LOST: 'Withdrawn / Rejected', // final · lost
} as const;
export const HIRING_STAGES: string[] = [HIRING_STAGE.APPLICATION, HIRING_STAGE.DOCS, HIRING_STAGE.OFFER, HIRING_STAGE.ORIENTATION, HIRING_STAGE.HIRED];

/** Old hire-store stages → new Hiring stages. */
export const LEGACY_HIRING_STAGE: Record<string, string> = {
  Lead: HIRING_STAGE.APPLICATION,
  Screening: HIRING_STAGE.DOCS,
  'Background Check': HIRING_STAGE.DOCS,
  Offer: HIRING_STAGE.OFFER,
  Onboarding: HIRING_STAGE.ORIENTATION,
  Hired: HIRING_STAGE.HIRED,
};
export function normalizeHiringStage(s: string | null | undefined): string {
  if (!s) return HIRING_STAGE.APPLICATION;
  if (HIRING_STAGES.includes(s) || s === HIRING_STAGE.LOST) return s;
  return LEGACY_HIRING_STAGE[s] || HIRING_STAGE.APPLICATION;
}

/* ── Active drivers (hire store `activeStage`) ── */
export const ACTIVE_STAGE = {
  FIRST90: 'First 90 days',
  ACTIVE: 'Active',
  LEAVE: 'Home time / Leave',
  AT_RISK: 'At risk',
  QUIT: 'Quit / Terminated', // final · hands off to Inactive
} as const;

/* ── Inactive & rehire (hire store `inactiveStage`) ── */
export const INACTIVE_STAGE = {
  INACTIVE: 'Inactive',
  REENGAGING: 'Re-engaging',
  REAPPLIED: 'Re-applied', // hands off back to Hiring → Application
  DNR: 'Do not rehire', // final · lost
} as const;

/* ── reasons ── */
export const QUIT_REASONS = ['Pay', 'Home time', 'Equipment', 'Dispatcher/communication', 'Accident/safety', 'Failed drug test', 'Personal', 'Other'];
export const RISK_REASONS = ['Pay', 'Home time', 'Equipment', 'Dispatcher/communication', 'Accident/safety', 'Personal', 'Other'];
export const LEAD_LOST_REASONS = ['No required license', 'Not enough experience', 'Failed screening', 'Pay not acceptable', 'Location not acceptable', 'Not interested', 'No response', 'Chose another company', 'Other'];
export const HIRING_LOST_REASONS = ['Withdrew', 'Chose another carrier', 'Failed drug test', 'MVR / PSP outside policy', 'Clearinghouse violation', 'No-show to orientation', 'Docs never received', 'Other'];
export const DNR_REASONS = ['Failed drug test', 'Accident/safety', 'Abandoned truck', 'Policy violation', 'Other'];

/* ── recruiters (owner ids used across stores) ── */
export const RECRUITERS = [
  { id: 'NP', name: 'Nina Patel' },
  { id: 'DR', name: 'Dana Reed' },
  { id: 'SP', name: 'Sam Pike' },
];
export const ME = 'NP';
export const recruiterName = (id: string) => RECRUITERS.find((r) => r.id === id)?.name || id;
export const recruiterId = (name: string) => RECRUITERS.find((r) => r.name === name)?.id || (name || 'NP').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

/** Check-in schedule (days after hire) for the 90-day onboarding cadence. */
export const CHECKIN_DAYS = [7, 30, 45, 90];
