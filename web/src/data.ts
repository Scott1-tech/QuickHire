// Mock data + static definitions for the QuickHire recruiter command center.

export const CARRIERS = [
  { name: 'GRAND ONE LLC', dot: '1234567', badge: 'G' },
  { name: 'DT NATIONAL TRANSPORTATION', dot: '2345678', badge: 'DT' },
  { name: 'PREMIER TRUCKING GROUP', dot: '3456789', badge: 'PT' },
];

export const CARRIER_LIST = [
  { id: 'c1', name: 'GRAND ONE LLC', dot: '1234567', mc: 'MC-123456', auth: 'active', complete: 92, address: '1200 Fleet Ave, Dallas, TX', phone: '(214) 555-0100', dba: 'Grand One' },
  { id: 'c2', name: 'DT NATIONAL TRANSPORTATION LLC', dot: '2345678', mc: 'MC-234567', auth: 'active', complete: 78, address: '88 Cargo Rd, Atlanta, GA', phone: '(404) 555-0200', dba: 'DT National' },
  { id: 'c3', name: 'PREMIER TRUCKING GROUP INC', dot: '3456789', mc: 'MC-345678', auth: 'active', complete: 64, address: '500 Lane St, Chicago, IL', phone: '(312) 555-0300', dba: '—' },
  { id: 'c4', name: 'RMR TRANSPORT', dot: '4567890', mc: 'MC-456789', auth: 'pending', complete: 41, address: '77 Depot Way, Phoenix, AZ', phone: '(602) 555-0400', dba: 'RMR' },
];

export const TASKS = [
  { id: 'tk1', title: 'Verify CDL for Robert Johnson', cand: 'p1', related: 'Robert Johnson · GRAND ONE LLC', group: 'overdue', due: '2d overdue', prio: 'urgent', assignee: 'NP', auto: false, desc: 'Confirm CDL Class A and endorsements with the TX DMV before advancing to background check.' },
  { id: 'tk2', title: 'Order MVR — Derek Hill', cand: 'p3', related: 'Derek Hill · GRAND ONE LLC', group: 'today', due: 'Today 4:00 PM', prio: 'high', assignee: 'DR', auto: true, desc: 'Pull the motor vehicle record from the state DMV. Auto-created when the candidate entered Background Check.' },
  { id: 'tk3', title: 'Review drug test results — Sarah Chen', cand: 'p4', related: 'Sarah Chen · GRAND ONE LLC', group: 'today', due: 'Today 5:30 PM', prio: 'urgent', assignee: 'DR', auto: false, desc: '5-panel DOT pre-employment results have returned. Verify negative and attach to the candidate file.' },
  { id: 'tk4', title: 'Send offer package — Sarah Chen', cand: 'p4', related: 'Sarah Chen · GRAND ONE LLC', group: 'today', due: 'Today', prio: 'normal', assignee: 'NP', auto: false, desc: 'Generate and send the company driver offer package via DocuSign.' },
  { id: 'tk5', title: 'Assign truck — Mike Okafor', cand: 'p5', related: 'Mike Okafor · GRAND ONE LLC', group: 'tomorrow', due: 'Tomorrow', prio: 'high', assignee: 'DR', auto: false, desc: 'Assign an available unit and schedule orientation.' },
  { id: 'tk6', title: 'Follow up — Tracy Bowman stale 8 days', cand: 'p6', related: 'Tracy Bowman · DT NATIONAL', group: 'tomorrow', due: 'Tomorrow', prio: 'low', assignee: 'SP', auto: true, desc: 'Candidate has been idle in Lead for 8 days. Auto-created stale-candidate reminder.' },
  { id: 'tk7', title: 'Medical card expires in 30 days — James Wilson', cand: null, related: 'James Wilson · GRAND ONE LLC', group: 'week', due: 'In 5 days', prio: 'normal', assignee: 'NP', auto: true, desc: 'Driver medical certificate expires soon. Request an updated medical card.' },
  { id: 'tk8', title: 'Employer verification not returned — Aisha Bello', cand: 'p8', related: 'Aisha Bello · GRAND ONE LLC', group: 'waiting', due: 'Waiting', prio: 'normal', assignee: 'DR', auto: true, desc: 'Previous employer has not returned the verification request. Awaiting response.' },
  { id: 'tk9', title: 'SMS failed — Kevin Brooks', cand: 'p7', related: 'Kevin Brooks · GRAND ONE LLC', group: 'waiting', due: 'Waiting', prio: 'high', assignee: 'NP', auto: true, desc: 'Outbound SMS could not be delivered. Verify the number or switch to email.' },
];

export const DRIVERS_TBL = [
  { name: 'James Wilson', carrier: 'GRAND ONE LLC', cdl: 'TX12345678', med: 'Mar 2027', medOk: true, truck: '#101', status: 'Active', comp: 'Compliant' },
  { name: 'Maria Garcia', carrier: 'GRAND ONE LLC', cdl: 'TX87654321', med: 'Aug 2026', medOk: true, truck: '#102', status: 'On-trip', comp: 'Compliant' },
  { name: 'Carlos Mendez', carrier: 'DT NATIONAL', cdl: 'FL44332211', med: 'Jun 2026', medOk: false, truck: '—', status: 'Home', comp: 'Expiring' },
  { name: 'Angela White', carrier: 'GRAND ONE LLC', cdl: 'GA99887766', med: 'Jan 2027', medOk: true, truck: '—', status: 'Unassigned', comp: 'Review' },
  { name: 'Tony Russo', carrier: 'DT NATIONAL', cdl: 'FL11223344', med: 'Expired', medOk: false, truck: '—', status: 'Inactive', comp: 'Missing' },
];

export const TRUCKS_TBL = [
  { unit: '101', carrier: 'GRAND ONE LLC', driver: 'James Wilson', status: 'Assigned', reg: 'Sep 2026', regOk: true, insp: 'Jul 2026', inspOk: true, ins: 'Dec 2026', insOk: true },
  { unit: '102', carrier: 'GRAND ONE LLC', driver: 'Maria Garcia', status: 'Assigned', reg: 'Aug 2026', regOk: true, insp: 'Oct 2026', inspOk: true, ins: 'Nov 2026', insOk: true },
  { unit: '103', carrier: 'GRAND ONE LLC', driver: '—', status: 'Available', reg: 'Jun 2026', regOk: false, insp: 'Jun 2026', inspOk: false, ins: 'Oct 2026', insOk: true },
  { unit: '104', carrier: 'GRAND ONE LLC', driver: '—', status: 'Shop', reg: 'Jan 2027', regOk: true, insp: 'Sep 2026', inspOk: true, ins: 'Jan 2027', insOk: true },
  { unit: '201', carrier: 'DT NATIONAL', driver: 'Carlos Mendez', status: 'In-Transit', reg: 'Jul 2026', regOk: true, insp: 'Aug 2026', inspOk: true, ins: 'Nov 2026', insOk: true },
];

export const CANDS = [
  { id: 'p1', name: 'Robert Johnson', stage: 'Screening', time: '3d in stage', missing: 'Medical Card', score: 82, risk: 'Medium', next: 'Run MVR', owner: 'NP', ownerName: 'Nina Patel', carrier: 'GRAND ONE LLC', email: 'rj@example.com', phone: '(555) 010-0101', cdl: 'TX · Class A', position: 'Company Driver' },
  { id: 'p2', name: 'Linda Martinez', stage: 'Lead', time: '6d in stage', missing: 'CDL Back', score: 71, risk: 'Medium', next: 'Send application', owner: 'NP', ownerName: 'Nina Patel', carrier: 'GRAND ONE LLC', email: 'lm@example.com', phone: '(555) 010-0102', cdl: 'TX · Class A', position: 'Company Driver' },
  { id: 'p3', name: 'Derek Hill', stage: 'Background Check', time: '1d in stage', missing: '', score: 88, risk: 'Low', next: 'Review PSP', owner: 'DR', ownerName: 'Dana Reed', carrier: 'GRAND ONE LLC', email: 'dh@example.com', phone: '(555) 010-0103', cdl: 'TX · Class A', position: 'Company Driver' },
  { id: 'p4', name: 'Sarah Chen', stage: 'Offer', time: '2d in stage', missing: '', score: 91, risk: 'Low', next: 'Send offer package', owner: 'NP', ownerName: 'Nina Patel', carrier: 'GRAND ONE LLC', email: 'sc@example.com', phone: '(555) 010-0104', cdl: 'TX · Class A', position: 'Company Driver' },
  { id: 'p5', name: 'Mike Okafor', stage: 'Onboarding', time: '4h in stage', missing: 'W-9', score: 95, risk: 'Low', next: 'Assign truck', owner: 'DR', ownerName: 'Dana Reed', carrier: 'GRAND ONE LLC', email: 'mo@example.com', phone: '(555) 010-0105', cdl: 'TX · Class A', position: 'Company Driver' },
  { id: 'p6', name: 'Tracy Bowman', stage: 'Lead', time: '8d in stage', missing: 'CDL Front', score: 48, risk: 'High', next: 'First contact', owner: 'SP', ownerName: 'Sam Pike', carrier: 'DT NATIONAL', email: 'tb@example.com', phone: '(555) 010-0106', cdl: 'FL · Class A', position: 'Owner Operator' },
  { id: 'p7', name: 'Kevin Brooks', stage: 'Screening', time: '1d in stage', missing: 'Medical Card', score: 77, risk: 'Medium', next: 'Order drug test', owner: 'NP', ownerName: 'Nina Patel', carrier: 'GRAND ONE LLC', email: 'kb@example.com', phone: '(555) 010-0107', cdl: 'TX · Class A', position: 'Company Driver' },
  { id: 'p8', name: 'Aisha Bello', stage: 'Background Check', time: '2d in stage', missing: 'PSP Consent', score: 84, risk: 'Low', next: 'Pull PSP', owner: 'DR', ownerName: 'Dana Reed', carrier: 'GRAND ONE LLC', email: 'ab@example.com', phone: '(555) 010-0108', cdl: 'GA · Class A', position: 'Company Driver' },
  { id: 'p9', name: 'Diego Ramos', stage: 'Offer', time: '1d in stage', missing: '', score: 89, risk: 'Low', next: 'Confirm start date', owner: 'SP', ownerName: 'Sam Pike', carrier: 'DT NATIONAL', email: 'dr@example.com', phone: '(555) 010-0109', cdl: 'FL · Class A', position: 'Company Driver' },
  { id: 'p10', name: 'Janet Cole', stage: 'Hired', time: 'Hired 2d ago', missing: '', score: 92, risk: 'Low', next: 'Orientation set', owner: 'DR', ownerName: 'Dana Reed', carrier: 'GRAND ONE LLC', email: 'jc@example.com', phone: '(555) 010-0110', cdl: 'TX · Class A', position: 'Company Driver' },
];

export const STAGES = ['Lead', 'Screening', 'Background Check', 'Offer', 'Onboarding', 'Hired'];
export const STAGE_TITLES: Record<string, string> = { Lead: 'Lead', Screening: 'Screening', 'Background Check': 'Background Check', Offer: 'Offer', Onboarding: 'Onboarding', Hired: 'Hired / Complete' };
export const STAGE_DOT: Record<string, string> = { Lead: '#8E8E93', Screening: '#007AFF', 'Background Check': '#FF9F0A', Offer: '#007AFF', Onboarding: '#34C759', Hired: '#34C759' };

export const THREADS = [
  { id: 'm1', candId: 'p1', name: 'Robert Johnson', channel: 'SMS', preview: 'Yes I can come in Thursday for orientation', age: '12m', unread: true,
    messages: [
      { from: 'them', text: 'Hi, I got your message about the medical card. Where do I send it?', meta: 'Robert · 1:04 PM' },
      { from: 'me', text: 'You can upload it through the secure link I just texted, or reply with a photo here.', meta: 'You · 1:09 PM' },
      { from: 'them', text: 'Yes I can come in Thursday for orientation', meta: 'Robert · 1:22 PM' },
    ] },
  { id: 'm2', candId: 'p4', name: 'Sarah Chen', channel: 'Email', preview: 'Reviewing the offer now, thank you!', age: '1h', unread: true,
    messages: [
      { from: 'me', text: 'Hi Sarah — your offer package is ready for signature. Let me know if you have any questions.', meta: 'You · 11:40 AM' },
      { from: 'them', text: 'Reviewing the offer now, thank you!', meta: 'Sarah · 12:15 PM' },
    ] },
  { id: 'm3', candId: 'p3', name: 'Derek Hill', channel: 'SMS', preview: 'Background check consent signed', age: '3h', unread: false,
    messages: [
      { from: 'them', text: 'Background check consent signed', meta: 'Derek · 10:02 AM' },
      { from: 'me', text: 'Perfect, we are pulling your PSP and MVR now. Should hear back within 24h.', meta: 'You · 10:15 AM' },
    ] },
  { id: 'm4', candId: 'p5', name: 'Mike Okafor', channel: 'Email', preview: 'Which W-9 box do I check?', age: '5h', unread: false,
    messages: [
      { from: 'them', text: 'Which W-9 box do I check for an LLC?', meta: 'Mike · 8:30 AM' },
    ] },
];

export const TEMPLATES = [
  { name: 'Offer Letter', fields: 8, updated: '2d ago', status: 'Live', carriers: 'All carriers' },
  { name: 'MVR Consent', fields: 5, updated: '1w ago', status: 'Live', carriers: 'All carriers' },
  { name: 'PSP Consent', fields: 5, updated: '1w ago', status: 'Live', carriers: 'All carriers' },
  { name: 'Drug Testing Consent', fields: 4, updated: '2w ago', status: 'Live', carriers: 'GRAND ONE, DT National' },
  { name: 'Clearinghouse Consent', fields: 6, updated: '3w ago', status: 'Live', carriers: 'All carriers' },
  { name: 'Company Driver Agreement', fields: 12, updated: '4d ago', status: 'Draft', carriers: 'GRAND ONE LLC' },
  { name: 'Owner Operator Agreement', fields: 14, updated: '5d ago', status: 'Draft', carriers: 'DT National' },
  { name: 'Equipment Lease Agreement', fields: 11, updated: '1mo ago', status: 'Live', carriers: 'DT National' },
];

export const PACKAGES = [
  { name: 'Company Driver Onboarding', docs: ['Offer Letter', 'Company Driver Agreement', 'W-9 Tax Form', 'Drug Testing Consent'] },
  { name: 'Owner Operator Onboarding', docs: ['Owner Operator Agreement', 'Equipment Lease', 'W-9 Tax Form', 'MVR Consent'] },
  { name: 'Compliance Consent Package', docs: ['MVR Consent', 'PSP Consent', 'Clearinghouse Consent'] },
  { name: 'Rehire Package', docs: ['Offer Letter', 'Drug Testing Consent', 'MVR Consent'] },
];

export const AGREEMENTS = [
  { doc: 'Offer Letter', candidate: 'Sarah Chen', carrier: 'GRAND ONE LLC', status: 'In Progress', event: '2h ago' },
  { doc: 'Company Driver Agreement', candidate: 'Mike Okafor', carrier: 'GRAND ONE LLC', status: 'Pending', event: '5h ago' },
  { doc: 'MVR Consent', candidate: 'Derek Hill', carrier: 'GRAND ONE LLC', status: 'Complete', event: '1d ago' },
  { doc: 'Clearinghouse Consent', candidate: 'Aisha Bello', carrier: 'GRAND ONE LLC', status: 'Missing', event: '2d ago' },
  { doc: 'Owner Operator Agreement', candidate: 'Diego Ramos', carrier: 'DT NATIONAL', status: 'In Progress', event: '3d ago' },
];

export const COMP_ROWS = [
  { id: 'cr1', driver: 'Robert Johnson', carrier: 'GRAND ONE LLC', doc: 'Medical Card', status: 'Missing', expiry: '—', days: '—', daysColor: '#C62820', action: 'Request' },
  { id: 'cr2', driver: 'James Wilson', carrier: 'GRAND ONE LLC', doc: 'CDL', status: 'Pending', expiry: 'Aug 12, 2026', days: '46d', daysColor: '#A05A00', action: 'View' },
  { id: 'cr3', driver: 'Maria Garcia', carrier: 'GRAND ONE LLC', doc: 'Medical Card', status: 'Complete', expiry: 'Mar 03, 2027', days: '249d', daysColor: '#6E6E73', action: 'View' },
  { id: 'cr4', driver: 'Kevin Brooks', carrier: 'GRAND ONE LLC', doc: 'Medical Card', status: 'Missing', expiry: '—', days: '—', daysColor: '#C62820', action: 'Request' },
  { id: 'cr5', driver: 'Carlos Mendez', carrier: 'DT NATIONAL', doc: 'CDL', status: 'Pending', expiry: 'Jul 09, 2026', days: '12d', daysColor: '#C62820', action: 'Approve' },
  { id: 'cr6', driver: 'Aisha Bello', carrier: 'GRAND ONE LLC', doc: 'PSP Consent', status: 'In Progress', expiry: '—', days: '—', daysColor: '#0066CC', action: 'View' },
  { id: 'cr7', driver: 'Diego Ramos', carrier: 'DT NATIONAL', doc: 'Drug Test', status: 'Complete', expiry: 'n/a', days: '—', daysColor: '#6E6E73', action: 'View' },
];

export const INTEGRATIONS = [
  { key: 'docusign', name: 'DocuSign', mark: 'DS', logoBg: '#FFC821', sync: 'Synced 4m ago' },
  { key: 'ringcentral', name: 'RingCentral', mark: 'RC', logoBg: '#FF6B00', sync: 'Synced 1h ago' },
  { key: 'gmail', name: 'Gmail', mark: 'M', logoBg: '#EA4335', sync: '' },
  { key: 'fmcsa', name: 'FMCSA', mark: 'F', logoBg: '#1F4E96', sync: 'Synced 20m ago' },
  { key: 'tenstreet', name: 'Tenstreet', mark: 'TS', logoBg: '#0B7285', sync: '' },
  { key: 'drive', name: 'Google Drive', mark: 'GD', logoBg: '#1FA463', sync: 'Synced 2h ago' },
  { key: 'onedrive', name: 'OneDrive', mark: 'OD', logoBg: '#0364B8', sync: '' },
  { key: 'slack', name: 'Slack', mark: 'SL', logoBg: '#611f69', sync: '' },
];

export const SETTINGS_NAV = ['Company', 'Users & Roles', 'Integrations', 'DocuSign', 'RingCentral', 'Email', 'FMCSA', 'Security', 'Data Export'];

export const AVATAR_COLORS = ['#007AFF', '#5856D6', '#34C759', '#FF9F0A', '#AF52DE', '#0FB5AE', '#FF2D55'];

export const ICONS: Record<string, string> = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  hiring: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  drivers: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 18.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  carriers: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>',
  compliance: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  docusign: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  messages: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  tasks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  reports: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  collapse: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  note: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  task: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6 9 17l-4-4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  spark: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  sign: '<path d="M3 17c3.5 0 4-6 7.5-6S14 17 17.5 17"/><path d="M19 21H5"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  checkbox: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 11 2 2 4-4"/>',
  wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
};
