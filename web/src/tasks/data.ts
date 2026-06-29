import { iso, addDays } from './lib';

export const ME = { name: 'John McCollins', initials: 'JM' };

export const PEOPLE = [
  { name: 'John McCollins', initials: 'JM' },
  { name: 'Nina Patel', initials: 'NP' },
  { name: 'Dana Reed', initials: 'DR' },
  { name: 'Sam Pike', initials: 'SP' },
  { name: 'Mark Hill', initials: 'MH' },
  { name: 'Ben Adams', initials: 'BA' },
];
export const nameOf = (i: string) => (PEOPLE.find((p) => p.initials === i) || { name: i }).name;

export const CARRIERS = ['Grand One LLC', 'DT National Transportation', 'Premier Trucking Group', 'RMR Transport'];

export const CARRIER_MC: Record<string, string> = {
  'Grand One LLC': 'MC-123456',
  'DT National Transportation': 'MC-234567',
  'Premier Trucking Group': 'MC-345678',
  'RMR Transport': 'MC-456789',
  'Midwest Freight Lines': 'MC-998812',
};

// Fleet keyed by carrier (MC). Enough units per carrier that the picker scrolls.
export const TRUCKS = [
  { unit: '101', carrier: 'Grand One LLC', driver: 'James Wilson', status: 'Assigned' },
  { unit: '102', carrier: 'Grand One LLC', driver: 'Maria Garcia', status: 'Assigned' },
  { unit: '103', carrier: 'Grand One LLC', driver: '—', status: 'Available' },
  { unit: '104', carrier: 'Grand One LLC', driver: '—', status: 'Shop' },
  { unit: '105', carrier: 'Grand One LLC', driver: '—', status: 'Available' },
  { unit: '106', carrier: 'Grand One LLC', driver: 'Angela White', status: 'In-Transit' },
  { unit: '107', carrier: 'Grand One LLC', driver: '—', status: 'Available' },
  { unit: '108', carrier: 'Grand One LLC', driver: '—', status: 'Out of Service' },
  { unit: '201', carrier: 'DT National Transportation', driver: 'Carlos Mendez', status: 'In-Transit' },
  { unit: '202', carrier: 'DT National Transportation', driver: '—', status: 'Available' },
  { unit: '203', carrier: 'DT National Transportation', driver: '—', status: 'Available' },
  { unit: '204', carrier: 'DT National Transportation', driver: 'Tony Russo', status: 'Assigned' },
  { unit: '205', carrier: 'DT National Transportation', driver: '—', status: 'Shop' },
  { unit: '301', carrier: 'Premier Trucking Group', driver: '—', status: 'Available' },
  { unit: '302', carrier: 'Premier Trucking Group', driver: 'Edd Roy', status: 'Assigned' },
  { unit: '303', carrier: 'Premier Trucking Group', driver: '—', status: 'Available' },
  { unit: '304', carrier: 'Premier Trucking Group', driver: '—', status: 'Out of Service' },
  { unit: '401', carrier: 'RMR Transport', driver: '—', status: 'Available' },
  { unit: '402', carrier: 'RMR Transport', driver: '—', status: 'Available' },
];

export const TAGS = ['Compliance', 'DocuSign', 'Follow-up', 'Urgent', 'Carrier Setup', 'Onboarding', 'PEV', 'Documents', 'Message', 'Truck'];

const now = new Date();
const D = (n: number) => iso(addDays(now, n));

let _id = 0;
const uid = () => 'tk' + (++_id);

function task(t: any) {
  return {
    id: uid(),
    title: '', description: '', status: 'todo', assignee: 'NP', priority: 'normal',
    due: null, start: null, relatedType: null, related: null, carrier: null, source: 'manual',
    tags: [], checklist: [], subtasks: [], comments: [], attachments: [], watching: false,
    createdBy: 'Nina Patel', createdDate: D(-6),
    activity: [{ id: 'a0', text: 'created this task', who: 'Nina Patel', time: D(-6) }],
    ...t,
  };
}

export const SEED_TASKS = [
  task({ title: 'Verify CDL for Robert Johnson', description: 'Confirm CDL Class A and endorsements with the TX DMV before advancing to background check.', status: 'review', priority: 'urgent', due: D(-2), start: D(-3), relatedType: 'candidate', related: 'Robert Johnson', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance', 'Documents'],
    checklist: [{ id: 'c1', text: 'Pull CDL record from TX DMV', done: true }, { id: 'c2', text: 'Confirm endorsements (H, N)', done: true }, { id: 'c3', text: 'Attach to candidate file', done: false }],
    comments: [
      { id: 'm1', author: 'Dana Reed', text: 'DMV record shows endorsements match the application.', time: D(-2), mentions: [], replies: [
        { id: 'r1', author: 'Nina Patel', text: 'Great, thanks @Dana Reed — attaching it to the file now.', time: D(-1), mentions: ['Dana Reed'] },
      ] },
      { id: 'm2', author: 'Nina Patel', text: '@Mark Hill can you confirm the CDL class before we advance him?', time: D(-1), mentions: ['Mark Hill'], replies: [] },
    ] }),
  task({ title: 'Order MVR — Derek Hill', description: 'Pull the motor vehicle record from the state DMV.', status: 'inprogress', priority: 'high', due: D(0), assignee: 'DR', relatedType: 'candidate', related: 'Derek Hill', carrier: 'Grand One LLC', source: 'automation', tags: ['Compliance'],
    subtasks: [{ id: 's1', title: 'Submit MVR request', assignee: 'DR', due: D(0), done: true }, { id: 's2', title: 'Log results in file', assignee: 'DR', due: D(1), done: false }] }),
  task({ title: 'Review drug test results — Sarah Chen', description: '5-panel DOT pre-employment results returned. Verify negative and attach.', status: 'review', priority: 'urgent', due: D(0), assignee: 'DR', relatedType: 'candidate', related: 'Sarah Chen', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance'], watching: true }),
  task({ title: 'Send offer package — Sarah Chen', description: 'Generate and send the company driver offer package via DocuSign.', status: 'todo', priority: 'normal', due: D(0), assignee: 'NP', relatedType: 'docusign', related: 'Offer Letter', carrier: 'Grand One LLC', source: 'docusign', tags: ['DocuSign', 'Onboarding'] }),
  task({ title: 'Assign truck — Mike Okafor', description: 'Assign an available unit and schedule orientation.', status: 'todo', priority: 'high', due: D(1), assignee: 'DR', relatedType: 'driver', related: 'Mike Okafor', carrier: 'Grand One LLC', source: 'truck', tags: ['Truck', 'Onboarding'] }),
  task({ title: 'Follow up — Tracy Bowman (stale 8 days)', description: 'Candidate idle in Lead for 8 days. Auto-created stale-candidate reminder.', status: 'waiting', priority: 'low', due: D(1), assignee: 'SP', relatedType: 'candidate', related: 'Tracy Bowman', carrier: 'DT National Transportation', source: 'automation', tags: ['Follow-up'] }),
  task({ title: 'Medical card renewal — James Wilson', description: 'Driver medical certificate expires soon. Request updated card.', status: 'todo', priority: 'normal', due: D(5), assignee: 'NP', relatedType: 'driver', related: 'James Wilson', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance'] }),
  task({ title: 'Employment verification — Aisha Bello', description: 'Previous employer has not returned the verification request.', status: 'waiting', priority: 'normal', due: D(2), assignee: 'DR', relatedType: 'candidate', related: 'Aisha Bello', carrier: 'Grand One LLC', source: 'pev', tags: ['PEV'] }),
  task({ title: 'SMS failed — call Kevin Brooks', description: 'Outbound SMS could not be delivered. Verify the number or switch to email.', status: 'blocked', priority: 'high', due: D(-1), assignee: 'NP', relatedType: 'candidate', related: 'Kevin Brooks', carrier: 'Grand One LLC', source: 'message', tags: ['Follow-up', 'Message'] }),
  task({ title: 'DocuSign reminder — Company Driver Agreement', description: 'Envelope unsigned after 24 hours. Send reminder, then call.', status: 'inprogress', priority: 'high', due: D(0), assignee: 'NP', relatedType: 'docusign', related: 'Mike Okafor', carrier: 'Grand One LLC', source: 'docusign', tags: ['DocuSign'], watching: true }),
  task({ title: 'Carrier setup — RMR Transport', description: 'Complete carrier onboarding requirements.', status: 'inprogress', priority: 'normal', due: D(4), start: D(-1), assignee: 'SP', relatedType: 'carrier', related: 'RMR Transport', carrier: 'RMR Transport', source: 'carrier', tags: ['Carrier Setup'],
    checklist: [{ id: 'c1', text: 'Look up DOT/MC', done: true }, { id: 'c2', text: 'Complete requirements', done: true }, { id: 'c3', text: 'Upload insurance', done: false }, { id: 'c4', text: 'Add contacts', done: false }, { id: 'c5', text: 'Invite carrier', done: false }] }),
  task({ title: 'Clearinghouse consent — Aisha Bello', status: 'review', priority: 'normal', due: D(3), assignee: 'DR', relatedType: 'candidate', related: 'Aisha Bello', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance', 'DocuSign'] }),
  task({ title: 'Look up DOT 998812 — Midwest Freight', status: 'todo', priority: 'low', due: D(6), assignee: 'SP', relatedType: 'carrier', related: 'Midwest Freight Lines', carrier: 'Midwest Freight Lines', source: 'carrier', tags: ['Carrier Setup'] }),
  task({ title: 'Confirm start date — Diego Ramos', status: 'todo', priority: 'normal', due: D(2), assignee: 'SP', relatedType: 'candidate', related: 'Diego Ramos', carrier: 'DT National Transportation', source: 'candidate', tags: ['Onboarding'] }),
  task({ title: 'Review application — Linda Martinez', description: 'Auto-created when application was submitted.', status: 'todo', priority: 'normal', due: D(1), assignee: 'NP', relatedType: 'candidate', related: 'Linda Martinez', carrier: 'Grand One LLC', source: 'automation', tags: ['Onboarding'] }),
  task({ title: 'Upload insurance COI — Premier Trucking', status: 'waiting', priority: 'normal', due: D(7), assignee: 'SP', relatedType: 'carrier', related: 'Premier Trucking Group', carrier: 'Premier Trucking Group', source: 'carrier', tags: ['Carrier Setup', 'Documents'] }),
  task({ title: 'Schedule orientation — Janet Cole', status: 'todo', priority: 'low', due: null, assignee: 'DR', relatedType: 'driver', related: 'Janet Cole', carrier: 'Grand One LLC', source: 'manual', tags: ['Onboarding'] }),
  task({ title: 'Unit 103 registration expiring', description: 'Truck registration expires in 30 days. Renew before expiration.', status: 'review', priority: 'high', due: D(0), assignee: 'DR', relatedType: 'truck', related: 'Unit 103', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance', 'Truck'] }),
  task({ title: 'PSP review — Derek Hill', status: 'inprogress', priority: 'normal', due: D(3), start: D(-1), assignee: 'DR', relatedType: 'candidate', related: 'Derek Hill', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance'] }),
  task({ title: 'Quarterly compliance audit', description: 'Review document readiness across the active fleet.', status: 'todo', priority: 'normal', due: D(12), start: D(8), assignee: 'JM', source: 'manual', tags: ['Compliance'] }),
  task({ title: 'New driver onboarding — Mike Okafor', description: 'Full onboarding checklist from application to truck assignment.', status: 'inprogress', priority: 'high', due: D(4), start: D(-3), assignee: 'DR', relatedType: 'driver', related: 'Mike Okafor', carrier: 'Grand One LLC', source: 'candidate', tags: ['Onboarding'],
    checklist: [{ id: 'c1', text: 'Review application', done: true }, { id: 'c2', text: 'Verify CDL', done: true }, { id: 'c3', text: 'Verify medical card', done: true }, { id: 'c4', text: 'Send offer package', done: false }, { id: 'c5', text: 'Assign truck', done: false }] }),
  task({ title: 'Background check consent — Tracy Bowman', status: 'todo', priority: 'normal', due: D(8), assignee: 'SP', relatedType: 'docusign', related: 'Tracy Bowman', carrier: 'DT National Transportation', source: 'docusign', tags: ['DocuSign'] }),
  task({ title: 'Call driver — Carlos Mendez (CDL expiring)', description: 'CDL expires in 12 days. Call to request a renewal.', status: 'todo', priority: 'high', due: D(0), assignee: 'JM', relatedType: 'driver', related: 'Carlos Mendez', carrier: 'DT National Transportation', source: 'compliance', tags: ['Compliance', 'Follow-up'] }),
  task({ title: 'Review carrier requirements — DT National', status: 'complete', priority: 'normal', due: D(-1), assignee: 'SP', relatedType: 'carrier', related: 'DT National Transportation', carrier: 'DT National Transportation', source: 'carrier', tags: ['Carrier Setup'] }),
  task({ title: 'Verify medical card — Sarah Chen', status: 'complete', priority: 'normal', due: D(-2), assignee: 'DR', relatedType: 'candidate', related: 'Sarah Chen', carrier: 'Grand One LLC', source: 'compliance', tags: ['Compliance'] }),
  task({ title: 'Send W-9 reminder — Mike Okafor', status: 'complete', priority: 'low', due: D(-3), assignee: 'JM', relatedType: 'driver', related: 'Mike Okafor', carrier: 'Grand One LLC', source: 'docusign', tags: ['DocuSign', 'Documents'] }),
];

export const TEMPLATES = [
  { id: 't1', name: 'New Driver Onboarding', category: 'Onboarding', assignee: 'DR', checklist: ['Review application', 'Verify CDL', 'Verify medical card', 'Send offer package', 'Complete MVR / PSP / Clearinghouse', 'Assign truck', 'Schedule orientation'] },
  { id: 't2', name: 'Missing Documents Follow-up', category: 'Documents', assignee: 'NP', checklist: ['Confirm missing documents', 'Send upload link', 'Text driver', 'Call if no response', 'Mark received'] },
  { id: 't3', name: 'DocuSign Reminder', category: 'DocuSign', assignee: 'NP', checklist: ['Check envelope status', 'Send reminder', 'Call driver if not signed', 'Mark completed when signed'] },
  { id: 't4', name: 'Employment Verification', category: 'PEV', assignee: 'DR', checklist: ['Send verification request', 'Follow up after 2 days', 'Review response', 'Mark PEV complete'] },
  { id: 't5', name: 'Carrier Setup', category: 'Carrier Setup', assignee: 'SP', checklist: ['Look up DOT / MC', 'Complete requirements', 'Upload insurance', 'Add contacts', 'Invite carrier'] },
  { id: 't6', name: 'Compliance Renewal', category: 'Compliance', assignee: 'NP', checklist: ['Notify driver', 'Request updated document', 'Review document', 'Approve and update expiration'] },
];

export const SEED_AUTOMATIONS = [
  { id: 'au1', trigger: 'Application submitted', condition: 'New candidate application received', action: 'Create "Review Application" task', enabled: true, lastRun: D(0) },
  { id: 'au2', trigger: 'Candidate stale', condition: 'No activity for 3 days', action: 'Create "Follow-up" task', enabled: true, lastRun: D(-1) },
  { id: 'au3', trigger: 'DocuSign unsigned', condition: 'Envelope not signed after 24 hours', action: 'Create "Send Reminder" task', enabled: true, lastRun: D(0) },
  { id: 'au4', trigger: 'CDL expiring', condition: 'CDL expires within 30 days', action: 'Create "Renewal" task', enabled: true, lastRun: D(-2) },
  { id: 'au5', trigger: 'Medical card expiring', condition: 'Medical card expires within 30 days', action: 'Create "Renewal" task', enabled: true, lastRun: D(-2) },
  { id: 'au6', trigger: 'Employment verification not returned', condition: 'No response after 2 days', action: 'Create "PEV follow-up" task', enabled: true, lastRun: D(-1) },
  { id: 'au7', trigger: 'Checklist completed', condition: 'Onboarding checklist 100% done', action: 'Create "Assign Truck" task', enabled: true, lastRun: D(-3) },
  { id: 'au8', trigger: 'SMS failed', condition: 'Outbound SMS delivery failed', action: 'Create "Call Driver" task', enabled: false, lastRun: D(-5) },
  { id: 'au9', trigger: 'Carrier profile incomplete', condition: 'Profile incomplete for 3 days', action: 'Create "Carrier Setup follow-up" task', enabled: true, lastRun: D(-1) },
  { id: 'au10', trigger: 'Candidate enters Offer stage', condition: 'Stage changed to Offer', action: 'Create "Send Offer Package" task', enabled: true, lastRun: D(0) },
];
