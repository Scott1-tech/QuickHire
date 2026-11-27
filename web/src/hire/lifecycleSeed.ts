/* Example (demo) drivers that populate the Active and Inactive pipelines.
   Every record is flagged `example: true` so it can be told apart from real
   data and removed in one click from the Pipelines overflow menu. Names match
   the Drivers roster so its "View" links open these lifecycle records. */
import { ACTIVE_STAGE, INACTIVE_STAGE, HIRING_STAGE, CHECKIN_DAYS } from '../pipes/stages';

const DAY = 864e5;
const ago = (d: number, now: number) => new Date(now - d * DAY).toISOString();

type Spec = {
  id: string; name: string; phone: string; email: string; carrier: string; owner: string; cdl: string; lane: string;
  score: number; risk: string; position?: string;
  lifecycle: 'active' | 'inactive' | 'hiring';
  stage?: string; activeStage?: string; inactiveStage?: string;
  hiredDaysAgo?: number; stageDaysAgo: number; truckNo?: string; checkInDaysAgo?: number; checkInsDone?: number;
  riskReason?: string; returnInDays?: number; quitReason?: string; quitType?: string; inactiveDaysAgo?: number;
  rehireEligible?: boolean | null; lastContactDaysAgo?: number; note?: string; lostReason?: string; lostFrom?: string;
  reapplied?: number; prevTenure?: [number, number, string]; next?: [string, number] | null;
};

export const EXAMPLE_DRIVER_SPECS: Spec[] = [
  { id: 'ex_jwilson', name: 'James Wilson', phone: '(214) 555-0141', email: 'james.wilson@example.com', carrier: 'GRAND ONE LLC', owner: 'Nina Patel', cdl: 'TX · Class A', lane: 'OTR · Dry van', score: 93, risk: 'Low', lifecycle: 'active', activeStage: ACTIVE_STAGE.ACTIVE, hiredDaysAgo: 420, stageDaysAgo: 330, truckNo: '101', checkInDaysAgo: 12, checkInsDone: 4, next: ['Monthly check-in call', 3] },
  { id: 'ex_mgarcia', name: 'Maria Garcia', phone: '(214) 555-0142', email: 'maria.garcia@example.com', carrier: 'GRAND ONE LLC', owner: 'Dana Reed', cdl: 'TX · Class A', lane: 'Regional · Reefer', score: 90, risk: 'Low', lifecycle: 'active', activeStage: ACTIVE_STAGE.ACTIVE, hiredDaysAgo: 210, stageDaysAgo: 120, truckNo: '102', checkInDaysAgo: 5, checkInsDone: 4 },
  { id: 'ex_awhite', name: 'Angela White', phone: '(404) 555-0143', email: 'angela.white@example.com', carrier: 'GRAND ONE LLC', owner: 'Nina Patel', cdl: 'GA · Class A', lane: 'Regional · Dry van', score: 86, risk: 'Low', lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90, hiredDaysAgo: 20, stageDaysAgo: 20, truckNo: '106', checkInDaysAgo: 13, checkInsDone: 1 },
  { id: 'ex_tjackson', name: 'Tyrone Jackson', phone: '(972) 555-0144', email: 'tyrone.jackson@example.com', carrier: 'DT NATIONAL', owner: 'Sam Pike', cdl: 'TX · Class A', lane: 'OTR · Flatbed', score: 81, risk: 'Medium', lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90, hiredDaysAgo: 52, stageDaysAgo: 52, truckNo: '203', checkInDaysAgo: 22, checkInsDone: 2 },
  { id: 'ex_sortiz', name: 'Samantha Ortiz', phone: '(817) 555-0145', email: 'samantha.ortiz@example.com', carrier: 'GRAND ONE LLC', owner: 'Dana Reed', cdl: 'TX · Class A', lane: 'Local · Dry van', score: 89, risk: 'Low', lifecycle: 'active', activeStage: ACTIVE_STAGE.FIRST90, hiredDaysAgo: 92, stageDaysAgo: 92, truckNo: '107', checkInDaysAgo: 2, checkInsDone: 4 },
  { id: 'ex_cmendez', name: 'Carlos Mendez', phone: '+1 214-555-0130', email: 'cm@example.com', carrier: 'DT NATIONAL', owner: 'Dana Reed', cdl: 'FL · Class A', lane: 'OTR · Dry van', score: 84, risk: 'Low', lifecycle: 'active', activeStage: ACTIVE_STAGE.LEAVE, hiredDaysAgo: 300, stageDaysAgo: 6, truckNo: '201', checkInDaysAgo: 6, checkInsDone: 4, returnInDays: 5, note: 'Family leave — back on the 2nd.', next: ['Confirm return-to-work date', 4] },
  { id: 'ex_dmoore', name: 'Derrick Moore', phone: '(469) 555-0146', email: 'derrick.moore@example.com', carrier: 'GRAND ONE LLC', owner: 'Nina Patel', cdl: 'TX · Class A', lane: 'OTR · Dry van', score: 78, risk: 'Medium', lifecycle: 'active', activeStage: ACTIVE_STAGE.AT_RISK, hiredDaysAgo: 150, stageDaysAgo: 4, truckNo: '105', checkInDaysAgo: 26, checkInsDone: 4, riskReason: 'Home time', note: 'Missed two home-time requests in a row.', next: ['Retention call with dispatcher', 0] },
  { id: 'ex_kalbright', name: 'Ken Albright', phone: '(305) 555-0147', email: 'ken.albright@example.com', carrier: 'DT NATIONAL', owner: 'Sam Pike', cdl: 'FL · Class A', lane: 'Regional · Reefer', score: 74, risk: 'Medium', lifecycle: 'active', activeStage: ACTIVE_STAGE.AT_RISK, hiredDaysAgo: 75, stageDaysAgo: 1, truckNo: '202', checkInDaysAgo: 30, checkInsDone: 2, riskReason: 'Pay', note: 'Asked about CPM vs. a competitor offer.' },
  { id: 'ex_trusso', name: 'Tony Russo', phone: '(305) 555-0148', email: 'tony.russo@example.com', carrier: 'DT NATIONAL', owner: 'Sam Pike', cdl: 'FL · Class A', lane: 'OTR · Dry van', score: 80, risk: 'Low', lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.INACTIVE, hiredDaysAgo: 200, stageDaysAgo: 40, inactiveDaysAgo: 40, quitReason: 'Home time', quitType: 'Quit', rehireEligible: true, lastContactDaysAgo: 40, truckNo: '204' },
  { id: 'ex_gpalmer', name: 'Greg Palmer', phone: '(214) 555-0149', email: 'greg.palmer@example.com', carrier: 'GRAND ONE LLC', owner: 'Nina Patel', cdl: 'TX · Class A', lane: 'Regional · Dry van', score: 85, risk: 'Low', lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.REENGAGING, hiredDaysAgo: 300, stageDaysAgo: 9, inactiveDaysAgo: 120, quitReason: 'Pay', quitType: 'Quit', rehireEligible: true, lastContactDaysAgo: 6, truckNo: '103', next: ['Re-engagement call', 1] },
  { id: 'ex_lprice', name: 'Lamar Price', phone: '(972) 555-0150', email: 'lamar.price@example.com', carrier: 'GRAND ONE LLC', owner: 'Dana Reed', cdl: 'TX · Class A', lane: 'OTR · Flatbed', score: 72, risk: 'Medium', lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.INACTIVE, hiredDaysAgo: 75, stageDaysAgo: 15, inactiveDaysAgo: 15, quitReason: 'Equipment', quitType: 'Quit', rehireEligible: null, lastContactDaysAgo: 15, truckNo: '104', next: ['Exit interview + rehire review', -2] },
  { id: 'ex_smiller', name: 'Shawn Miller', phone: '(904) 555-0151', email: 'shawn.miller@example.com', carrier: 'DT NATIONAL', owner: 'Sam Pike', cdl: 'FL · Class A', lane: 'OTR · Dry van', score: 61, risk: 'High', lifecycle: 'inactive', inactiveStage: INACTIVE_STAGE.DNR, hiredDaysAgo: 100, stageDaysAgo: 70, inactiveDaysAgo: 70, quitReason: 'Failed drug test', quitType: 'Terminated', rehireEligible: false, lastContactDaysAgo: 70 },
  { id: 'ex_rgomez', name: 'Rita Gomez', phone: '(210) 555-0152', email: 'rita.gomez@example.com', carrier: 'GRAND ONE LLC', owner: 'Nina Patel', cdl: 'TX · Class A', lane: 'Regional · Dry van', score: 88, risk: 'Low', lifecycle: 'hiring', stage: HIRING_STAGE.APPLICATION, stageDaysAgo: 6, reapplied: 6, prevTenure: [400, 180, 'Personal'], next: ['Re-run MVR, PSP, Clearinghouse & drug test', 0] },
  { id: 'ex_bkowalski', name: 'Brian Kowalski', phone: '(312) 555-0153', email: 'brian.kowalski@example.com', carrier: 'DT NATIONAL', owner: 'Dana Reed', cdl: 'IL · Class A', lane: 'OTR · Dry van', score: 70, risk: 'Medium', lifecycle: 'hiring', stage: HIRING_STAGE.LOST, stageDaysAgo: 3, lostReason: 'Chose another carrier', lostFrom: HIRING_STAGE.OFFER },
];

/** Turn a spec into the lifecycle fields layered on top of a seeded driver. */
export function exampleLifecycleFields(s: Spec, now: number) {
  const hireDate = s.hiredDaysAgo != null ? ago(s.hiredDaysAgo, now) : null;
  const checkIns = hireDate && s.lifecycle === 'active'
    ? CHECKIN_DAYS.map((day, i) => ({ day, due: new Date(+new Date(hireDate) + day * DAY).toISOString(), doneAt: i < (s.checkInsDone || 0) ? new Date(Math.min(now, +new Date(hireDate) + (day + 1) * DAY)).toISOString() : null, taskId: null }))
    : [];
  const f: any = {
    example: true, lifecycle: s.lifecycle, lane: s.lane, appliedAt: hireDate ? ago((s.hiredDaysAgo || 0) + 14 + (s.score % 9), now) : ago(s.stageDaysAgo + 2, now),
    hireDate, truckNo: s.truckNo || '', checkIns,
    lastCheckIn: s.checkInDaysAgo != null ? ago(s.checkInDaysAgo, now) : null,
    lastContactAt: s.lastContactDaysAgo != null ? ago(s.lastContactDaysAgo, now) : s.checkInDaysAgo != null ? ago(s.checkInDaysAgo, now) : null,
    riskReason: s.riskReason || '', returnDate: s.returnInDays != null ? ago(-s.returnInDays, now) : null,
    application: { submitted: true, startDate: '', payRate: s.lane.startsWith('Local') ? '$26/hr' : '$0.62/mi', emergencyContact: '' },
  };
  if (s.next) f.nextStep = { title: s.next[0], due: ago(-s.next[1], now), status: 'open' };
  else if (s.activeStage === ACTIVE_STAGE.FIRST90) {
    const ci = checkIns.find((c) => !c.doneAt);
    f.nextStep = ci ? { title: `Day ${ci.day} check-in`, due: ci.due, status: 'open' } : { title: 'Graduate to Active (90 days done)', due: ago(0, now), status: 'open' };
  } else f.nextStep = null;
  if (s.lifecycle === 'active') { f.activeStage = s.activeStage; f.activeSince = ago(s.stageDaysAgo, now); f.stage = HIRING_STAGE.HIRED; f.orientationDone = true; }
  if (s.lifecycle === 'inactive') {
    f.inactiveStage = s.inactiveStage; f.inactiveStageSince = ago(s.stageDaysAgo, now); f.inactiveSince = ago(s.inactiveDaysAgo || 0, now);
    f.quitReason = s.quitReason; f.quitType = s.quitType; f.rehireEligible = s.rehireEligible ?? null; f.stage = HIRING_STAGE.HIRED;
    f.tenures = [{ hireDate, endDate: f.inactiveSince, reason: s.quitReason, type: s.quitType }];
  }
  if (s.lifecycle === 'hiring') {
    f.stage = s.stage; f.stageSince = ago(s.stageDaysAgo, now);
    if (s.lostReason) { f.lostReason = s.lostReason; f.lostFrom = s.lostFrom; }
    if (s.reapplied != null && s.prevTenure) {
      const [hiredAgo, endAgo, reason] = s.prevTenure;
      f.reapplyCount = 1; f.lastReappliedAt = ago(s.reapplied, now); f.appliedAt = ago(s.reapplied, now);
      f.tenures = [{ hireDate: ago(hiredAgo, now), endDate: ago(endAgo, now), reason, type: 'Quit' }];
      f.inactiveStage = INACTIVE_STAGE.REAPPLIED; f.rehireEligible = true; f.quitReason = reason;
      f.application.submitted = false;
    }
  }
  return f;
}
