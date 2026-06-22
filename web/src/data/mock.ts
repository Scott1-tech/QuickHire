import type {
  Carrier, Driver, Candidate, Truck, Employee, Task,
  NotificationItem, ChecklistStep,
} from '@/types';

// Relative ISO timestamp helper: `days` and `hours` offsets from now.
const rel = (days: number, hours: number) =>
  new Date(Date.now() + days * 864e5 + hours * 36e5).toISOString();

export const CARRIERS: Carrier[] = [
  { id: 'c1', name: 'GRAND ONE LLC', dot: '1234567', mc: ['MC-123456'], authority: 'active', address: '1200 Fleet Ave, Dallas, TX', phone: '(214) 555-0100' },
  { id: 'c2', name: 'DT NATIONAL TRANSPORTATION LLC', dot: '2345678', mc: ['MC-234567', 'MC-234568'], authority: 'active', address: '88 Cargo Rd, Atlanta, GA', phone: '(404) 555-0200' },
  { id: 'c3', name: 'PREMIER TRUCKING GROUP INC', dot: '3456789', mc: ['MC-345678'], authority: 'active', address: '500 Lane St, Chicago, IL', phone: '(312) 555-0300' },
  { id: 'c4', name: 'RMR TRANSPORT', dot: '4567890', mc: ['MC-456789'], authority: 'pending', address: '77 Depot Way, Phoenix, AZ', phone: '(602) 555-0400' },
];

export const DRIVERS: Driver[] = [
  { id: 'd1', carrierId: 'c1', name: 'JAMES WILSON', score: 94, license: 'TX12345678', state: 'TX', status: 'active', type: 'company', mc: 'MC-123456', phone: '(214) 555-1001', email: 'jwilson@example.com', driverStatus: 'Available', assignedTruckId: 't1', team: false, dispatcher: 'Dana Reed', hireDate: '2023-01-15' },
  { id: 'd2', carrierId: 'c1', name: 'MARIA GARCIA', score: 87, license: 'TX87654321', state: 'TX', status: 'active', type: 'owner-operator', mc: 'MC-123456', phone: '(214) 555-1002', email: 'mgarcia@example.com', driverStatus: 'On-trip', assignedTruckId: 't2', team: true, dispatcher: 'Dana Reed', hireDate: '2023-06-20', isNew: true },
  { id: 'd3', carrierId: 'c2', name: 'CARLOS MENDEZ', score: 91, license: 'FL44332211', state: 'FL', status: 'active', type: 'company', mc: 'MC-234567', phone: '(404) 555-1003', email: 'cmendez@example.com', driverStatus: 'Home', assignedTruckId: null, team: false, dispatcher: 'Sam Pike', hireDate: '2022-11-01' },
  { id: 'd4', carrierId: 'c1', name: 'ANGELA WHITE', score: 78, license: 'GA99887766', state: 'GA', status: 'unassigned', type: 'company', mc: 'MC-123456', phone: '(214) 555-1004', email: 'awhite@example.com', driverStatus: 'Available', assignedTruckId: null, team: false, hireDate: '2024-02-10' },
  { id: 'd5', carrierId: 'c2', name: 'TONY RUSSO', score: 65, license: 'FL11223344', state: 'FL', status: 'terminated', type: 'company', mc: 'MC-234567', phone: '(404) 555-1005', hireDate: '2021-03-10' },
];

export const CANDIDATES: Candidate[] = [
  { id: 'p1', carrierId: 'c1', name: 'ROBERT JOHNSON', stage: 'Screening', email: 'rj@example.com', phone: '(555) 010-0101', statusTag: 'in_progress', stageEnteredAt: rel(-3, -22), winProb: 40, amount: 5200, appProgress: 65, ownerUserId: 'u1' },
  { id: 'p2', carrierId: 'c1', name: 'LINDA MARTINEZ', stage: 'Lead', email: 'lm@example.com', phone: '(555) 010-0102', statusTag: 'not_started', stageEnteredAt: rel(-6, -23), winProb: 15, amount: 5200, appProgress: 10, ownerUserId: 'u1' },
  { id: 'p3', carrierId: 'c1', name: 'DEREK HILL', stage: 'Background Check', email: 'dh@example.com', phone: '(555) 010-0103', statusTag: 'in_progress', stageEnteredAt: rel(-1, -4), winProb: 60, amount: 5200, appProgress: 80, ownerUserId: 'u2' },
  { id: 'p4', carrierId: 'c1', name: 'SARAH CHEN', stage: 'Offer', email: 'sc@example.com', phone: '(555) 010-0104', statusTag: 'submitted', stageEnteredAt: rel(-2, 0), winProb: 85, amount: 5200, appProgress: 100, ownerUserId: 'u1' },
  { id: 'p5', carrierId: 'c1', name: 'MIKE OKAFOR', stage: 'Onboarding', email: 'mo@example.com', phone: '(555) 010-0105', statusTag: 'submitted', stageEnteredAt: rel(0, -4), winProb: 95, amount: 5200, appProgress: 100, ownerUserId: 'u2', assignedTruckId: null },
  { id: 'p6', carrierId: 'c2', name: 'TRACY BOWMAN', stage: 'Lead', email: 'tb@example.com', phone: '(555) 010-0106', statusTag: 'not_started', stageEnteredAt: rel(-8, 0), winProb: 10, amount: 4800, appProgress: 5, ownerUserId: 'u3' },
];

export const TRUCKS: Truck[] = [
  { id: 't1', carrierId: 'c1', unit: '101', make: 'Peterbilt', model: '389', year: 2021, plate: 'TX-ABC123', vin: '1XPBD49X1MD123456', state: 'TX', mc: 'MC-123456', status: 'Assigned', ownership: 'company', owner: 'Grand One LLC', operatorDriverId: 'd1', odometer: 245000, regExpiry: '2025-09-01', inspExpiry: '2025-07-15', insExpiry: '2025-12-01' },
  { id: 't2', carrierId: 'c1', unit: '102', make: 'Kenworth', model: 'T680', year: 2022, plate: 'TX-DEF456', vin: '1XKAD49X2ND654321', state: 'TX', mc: 'MC-123456', status: 'Assigned', ownership: 'owner-operator', owner: 'Maria Garcia', operatorDriverId: 'd2', odometer: 180000, regExpiry: '2025-08-01', inspExpiry: '2025-10-15', insExpiry: '2025-11-01' },
  { id: 't3', carrierId: 'c1', unit: '103', make: 'Freightliner', model: 'Cascadia', year: 2020, plate: 'TX-GHI789', vin: '3AKJHHDR0LS987654', state: 'TX', mc: 'MC-123456', status: 'Available', ownership: 'company', owner: 'Ryder Lease', operatorDriverId: null, odometer: 320000, regExpiry: '2025-06-01', inspExpiry: '2025-06-20', insExpiry: '2025-10-01' },
  { id: 't4', carrierId: 'c1', unit: '104', make: 'Volvo', model: 'VNL 760', year: 2023, plate: 'TX-JKL012', vin: '4V4NC9EH0PN111222', state: 'TX', mc: 'MC-123456', status: 'Shop', ownership: 'company', owner: 'Wells Fargo Eq', operatorDriverId: null, odometer: 95000, regExpiry: '2026-01-01', inspExpiry: '2025-09-01', insExpiry: '2026-01-01' },
  { id: 't5', carrierId: 'c2', unit: '201', make: 'Mack', model: 'Anthem', year: 2021, plate: 'GA-MNO345', vin: '1M1AN4GY5MM333444', state: 'GA', mc: 'MC-234567', status: 'In-Transit', ownership: 'company', owner: 'DT National', operatorDriverId: 'd3', odometer: 210000, regExpiry: '2025-07-01', inspExpiry: '2025-08-10', insExpiry: '2025-11-15' },
];

export const EMPLOYEES: Employee[] = [
  { id: 'e1', carrierId: 'c1', firstName: 'Dana', lastName: 'Reed', status: 'ACTIVE', nickname: 'D', phone: '(214) 555-2001', email: 'dana@grandone.com', shift: 'Main shift', role: 'dispatcher', kind: 'dispatcher' },
  { id: 'e2', carrierId: 'c1', firstName: 'Sam', lastName: 'Pike', status: 'ACTIVE', phone: '(214) 555-2002', email: 'sam@grandone.com', shift: 'Night shift', role: 'dispatcher', kind: 'dispatcher' },
  { id: 'e3', carrierId: 'c1', firstName: 'Nina', lastName: 'Patel', status: 'ACTIVE', phone: '(214) 555-2003', email: 'nina@grandone.com', shift: 'Main shift', role: 'recruiter', kind: 'employee' },
  { id: 'e4', carrierId: 'c1', firstName: 'Omar', lastName: 'Flores', status: 'ACTIVE', phone: '(214) 555-2004', email: 'omar@grandone.com', shift: 'Afterhours shift', role: 'accounting', kind: 'employee' },
];

export const TASKS: Task[] = [
  { id: 'tk1', carrierId: 'c1', title: 'Verify CDL for Robert Johnson', status: 'IN PROGRESS', assignee: 'NP', due: rel(1, 0), priority: 'High', comments: 2, attachments: 1 },
  { id: 'tk2', carrierId: 'c1', title: 'Order MVR — Derek Hill', status: 'TO DO', assignee: 'NP', due: rel(2, 0), priority: 'Normal', comments: 0, attachments: 0 },
  { id: 'tk3', carrierId: 'c1', title: 'Review drug test results — Sarah Chen', status: 'REVIEW NEEDED', assignee: 'DR', due: rel(0, -2), priority: 'Urgent', comments: 3, attachments: 2 },
  { id: 'tk4', carrierId: 'c1', title: 'Quarterly safety audit', status: 'LONG-TERM', assignee: 'OF', due: rel(30, 0), priority: 'Normal', comments: 1, attachments: 0 },
  { id: 'tk5', carrierId: 'c1', title: 'Onboard Mike Okafor — assign truck', status: 'IN PROGRESS', assignee: 'DR', due: rel(1, 0), priority: 'High', comments: 0, attachments: 0 },
  { id: 'tk6', carrierId: 'c1', title: 'File W-9 — Sarah Chen', status: 'COMPLETE', assignee: 'OF', due: rel(-1, 0), priority: 'Normal', comments: 0, attachments: 1 },
];

export const NOTIFICATIONS: NotificationItem[] = [
  { id: 'n1', actor: 'Dana Reed', event: 'moved Robert Johnson: Lead → Screening', time: '2h ago', group: 'Yesterday', priority: 'High' },
  { id: 'n2', actor: 'System', event: 'Drug test results uploaded for Sarah Chen', time: '5h ago', group: 'Yesterday' },
  { id: 'n3', actor: 'Nina Patel', event: '@mentioned you on "Verify CDL"', time: '1d ago', group: 'Last 7 days' },
  { id: 'n4', actor: 'System', event: 'Truck #104 status changed: Available → Shop', time: '3d ago', group: 'Last 7 days' },
];

export const CHECKLIST_TEMPLATE: ChecklistStep[] = [
  { id: 'cdl', name: 'CDL Verification', group: 'Compliance & Eligibility', status: 'complete', description: 'Verify CDL class, endorsements, and status with the issuing state.', result: 'CDL valid — Class A, no restrictions.' },
  { id: 'clearinghouse', name: 'Clearinghouse Query', group: 'Compliance & Eligibility', status: 'ready', description: 'Run an FMCSA Drug & Alcohol Clearinghouse query.', result: 'No drug or alcohol violations found.' },
  { id: 'psp', name: 'PSP Report', group: 'Compliance & Eligibility', status: 'ready', description: 'Pull the Pre-Employment Screening Program report.' },
  { id: 'mvr', name: 'MVR Check', group: 'Risk Screening', status: 'ready', description: 'Order the Motor Vehicle Record from the state DMV.' },
  { id: 'bgc', name: 'Background Check', group: 'Risk Screening', status: 'action', description: 'Criminal and employment background screening.' },
  { id: 'drug', name: 'Drug Test', group: 'Health & Safety', status: 'ready', description: 'Pre-employment DOT drug test (5-panel).' },
  { id: 'contracts', name: 'Contracts & Agreements', group: 'Employment Setup', status: 'action', description: 'Send and collect signed employment/lease agreements.' },
  { id: 'orientation', name: 'Orientation', group: 'Employment Setup', status: 'action', description: 'Schedule and complete driver orientation.' },
  { id: 'roadtest', name: 'Road Test', group: 'Employment Setup', status: 'action', description: 'Administer and certify the road test.' },
];

export const DOC_TYPES_MAIN: string[] = [
  'CDL Front', 'CDL Back', 'Medical card', 'FMCSA National Registry', 'Pre-hire MVR report',
  'PSP report', 'Clearinghouse pre-employment query result', 'Pre-employment drug test results',
  'W-9 tax form', 'MVR consent form', 'PSP consent form', 'Pre-employment verification',
  'Driver application for employment', 'Contracts and/or lease agreements', 'OA Enrollment', 'Road Test Certificate',
];
