import React from 'react';
import { addExternalTask } from '../tasks/bus';

/* ============================================================================
   QuickHire unified communications + FMCSA store
   In-memory mock backing the documented API surface:
     RingCentral:  /api/ringcentral/*  /api/drivers/:id/sms|call-log|messages
     Email:        /api/email/*         /api/drivers/:id/email|emails
     FMCSA:        /api/fmcsa/*         /api/carriers/:id/fmcsa-fill
   ========================================================================== */

const nowMinus = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();
let _id = 0;
const uid = (p = 'm') => p + (++_id) + '_' + Date.now().toString(36);

export const fmtWhen = (ts: string) => {
  const d = new Date(ts); const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 1) return 'now';
  if (diff < 60) return Math.round(diff) + 'm';
  if (diff < 60 * 24) return Math.round(diff / 60) + 'h';
  const days = Math.round(diff / 1440); if (days < 7) return days + 'd';
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate();
};
export const fmtClock = (ts: string) => { const d = new Date(ts); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${m} ${ap}`; };

/* ---------------- accounts ---------------- */
export type Account = { id: string; type: 'ringcentral' | 'email' | 'fmcsa'; label: string; provider: string; status: 'connected' | 'disconnected' | 'demo' | 'error'; connectedAt: string; lastSyncAt: string };

/* ---------------- RingCentral numbers ---------------- */
export type RcNumber = { id: string; phoneNumber: string; label: string; extensionId: string; smsEnabled: boolean; callsEnabled: boolean; assignedUser: string; assignedTeam: string; receiveSms: boolean; receiveCalls: boolean; sharedInbox: boolean; defaultOutbound: boolean; active: boolean };

/* ---------------- Email inboxes ---------------- */
export type EmailInbox = { id: string; emailAddress: string; label: string; provider: string; assignedUser: string; assignedTeam: string; receiveEmails: boolean; sendEmails: boolean; sharedInbox: boolean; defaultOutbound: boolean; signature: string; active: boolean };

const store = {
  accounts: [
    { id: 'acc_rc', type: 'ringcentral', label: 'RingCentral', provider: 'RingCentral', status: 'connected', accountId: 'RC-8842019', extensionId: 'EXT-101', webhookStatus: 'active', connectedAt: nowMinus(60 * 24 * 30), lastSyncAt: nowMinus(4) },
    { id: 'acc_email', type: 'email', label: 'Email', provider: 'Gmail', status: 'connected', connectedAt: nowMinus(60 * 24 * 20), lastSyncAt: nowMinus(12) },
    { id: 'acc_fmcsa', type: 'fmcsa', label: 'FMCSA', provider: 'FMCSA SAFER', status: 'demo', dataMode: 'demo', webKey: '', cacheHours: 24, autoFill: true, mismatchTasks: true, watchlistChecks: true, connectedAt: nowMinus(60 * 24 * 10), lastSyncAt: nowMinus(20) },
  ] as any[],

  rcNumbers: [
    { id: 'rc1', phoneNumber: '+1 214-555-1000', label: 'Recruiting Main', extensionId: 'EXT-101', smsEnabled: true, callsEnabled: true, assignedUser: 'Nina Patel', assignedTeam: 'Recruiting', receiveSms: true, receiveCalls: true, sharedInbox: true, defaultOutbound: true, active: true },
    { id: 'rc2', phoneNumber: '+1 214-555-1010', label: 'Compliance Line', extensionId: 'EXT-110', smsEnabled: true, callsEnabled: true, assignedUser: 'Dana Reed', assignedTeam: 'Compliance', receiveSms: true, receiveCalls: true, sharedInbox: true, defaultOutbound: false, active: true },
    { id: 'rc3', phoneNumber: '+1 469-555-2200', label: 'Dispatch', extensionId: 'EXT-120', smsEnabled: true, callsEnabled: true, assignedUser: 'Sam Pike', assignedTeam: 'Dispatch', receiveSms: false, receiveCalls: true, sharedInbox: false, defaultOutbound: false, active: true },
    { id: 'rc4', phoneNumber: '+1 214-555-1099', label: 'Office Fax (voice only)', extensionId: 'EXT-199', smsEnabled: false, callsEnabled: true, assignedUser: '—', assignedTeam: 'Office', receiveSms: false, receiveCalls: false, sharedInbox: false, defaultOutbound: false, active: false },
  ] as RcNumber[],

  emailInboxes: [
    { id: 'em1', emailAddress: 'recruiting@quickhire.com', label: 'Recruiting', provider: 'Gmail', assignedUser: 'Nina Patel', assignedTeam: 'Recruiting', receiveEmails: true, sendEmails: true, sharedInbox: true, defaultOutbound: true, signature: 'Nina Patel · QuickHire Recruiting · (214) 555-1000', active: true },
    { id: 'em2', emailAddress: 'safety@quickhire.com', label: 'Safety', provider: 'Gmail', assignedUser: 'Dana Reed', assignedTeam: 'Safety', receiveEmails: true, sendEmails: true, sharedInbox: true, defaultOutbound: false, signature: 'QuickHire Safety Department', active: true },
    { id: 'em3', emailAddress: 'compliance@quickhire.com', label: 'Compliance', provider: 'Outlook', assignedUser: 'Dana Reed', assignedTeam: 'Compliance', receiveEmails: true, sendEmails: true, sharedInbox: true, defaultOutbound: false, signature: 'QuickHire Compliance', active: true },
    { id: 'em4', emailAddress: 'dispatch@quickhire.com', label: 'Dispatch', provider: 'Gmail', assignedUser: 'Sam Pike', assignedTeam: 'Dispatch', receiveEmails: true, sendEmails: true, sharedInbox: true, defaultOutbound: false, signature: 'QuickHire Dispatch', active: true },
    { id: 'em5', emailAddress: 'nina@quickhire.com', label: 'Nina Patel', provider: 'Gmail', assignedUser: 'Nina Patel', assignedTeam: 'Recruiting', receiveEmails: true, sendEmails: true, sharedInbox: false, defaultOutbound: false, signature: 'Nina Patel · QuickHire', active: true },
  ] as EmailInbox[],

  smsTemplates: [
    { id: 'st1', name: 'Application reminder', body: 'Hi {name}, this is {recruiter} at QuickHire. Just a reminder to finish your driver application — reply here with any questions.' },
    { id: 'st2', name: 'Missing document request', body: 'Hi {name}, we still need your {doc}. You can upload it securely here: {link}' },
    { id: 'st3', name: 'Medical card renewal', body: 'Hi {name}, your medical card is expiring soon. Please send an updated copy so we can keep you compliant.' },
    { id: 'st4', name: 'DocuSign reminder', body: 'Hi {name}, your onboarding documents are ready to sign. It takes 2 minutes: {link}' },
    { id: 'st5', name: 'Orientation reminder', body: 'Hi {name}, reminder that orientation is scheduled. Reply CONFIRM to lock it in.' },
  ],
  emailTemplates: [
    { id: 'et1', name: 'Application reminder', subject: 'Finish your QuickHire application', body: 'Hi {name},\n\nJust a friendly reminder to complete your driver application. Let me know if you have any questions.\n\n{signature}' },
    { id: 'et2', name: 'Missing document request', subject: 'Document needed: {doc}', body: 'Hi {name},\n\nWe still need your {doc} to move forward. You can upload it here: {link}\n\n{signature}' },
    { id: 'et3', name: 'Medical card renewal', subject: 'Medical card renewal', body: 'Hi {name},\n\nOur records show your medical card is expiring soon. Please reply with an updated copy.\n\n{signature}' },
    { id: 'et4', name: 'DocuSign reminder', subject: 'Your documents are ready to sign', body: 'Hi {name},\n\nYour onboarding package is ready for signature: {link}\n\n{signature}' },
    { id: 'et5', name: 'Employment verification follow-up', subject: 'Employment verification request', body: 'Hello,\n\nWe are verifying employment for {name}. Please confirm the dates of employment at your earliest convenience.\n\n{signature}' },
    { id: 'et6', name: 'Orientation reminder', subject: 'Orientation details', body: 'Hi {name},\n\nReminder about your upcoming orientation. Please confirm your attendance.\n\n{signature}' },
    { id: 'et7', name: 'Carrier requirements reminder', subject: 'Outstanding carrier requirements', body: 'Hello,\n\nThe following requirements are still outstanding for your carrier setup. Please review and complete them.\n\n{signature}' },
  ],

  contacts: [
    { id: 'p1', name: 'Robert Johnson', kind: 'candidate', phone: '+1 555-010-0101', email: 'rj@example.com', carrier: 'Grand One LLC', stage: 'Screening', recruiter: 'Nina Patel', missing: ['Medical Card'], rcNumberId: 'rc1', inboxId: 'em1', docusign: 'Not sent', optOut: false },
    { id: 'p4', name: 'Sarah Chen', kind: 'candidate', phone: '+1 555-010-0104', email: 'sc@example.com', carrier: 'Grand One LLC', stage: 'Offer', recruiter: 'Nina Patel', missing: [], rcNumberId: 'rc1', inboxId: 'em1', docusign: 'In Progress', optOut: false },
    { id: 'p3', name: 'Derek Hill', kind: 'candidate', phone: '+1 555-010-0103', email: 'dh@example.com', carrier: 'Grand One LLC', stage: 'Background Check', recruiter: 'Dana Reed', missing: [], rcNumberId: 'rc2', inboxId: 'em3', docusign: 'Complete', optOut: false },
    { id: 'p7', name: 'Kevin Brooks', kind: 'candidate', phone: '+1 555-010-0107', email: 'kb@example.com', carrier: 'Grand One LLC', stage: 'Screening', recruiter: 'Nina Patel', missing: ['Medical Card'], rcNumberId: 'rc1', inboxId: 'em1', docusign: 'Not sent', optOut: false },
    { id: 'p5', name: 'Mike Okafor', kind: 'driver', phone: '+1 555-010-0105', email: 'mo@example.com', carrier: 'Grand One LLC', stage: 'Onboarding', recruiter: 'Dana Reed', missing: ['W-9'], rcNumberId: 'rc1', inboxId: 'em1', docusign: 'Pending', optOut: false },
  ] as any[],

  messages: [] as any[],

  // FMCSA "public dataset" the demo lookups resolve against
  fmcsaDb: [
    { dotNumber: '1234567', mcNumber: 'MC-123456', legalName: 'GRAND ONE LLC', dbaName: 'Grand One', operatingStatus: 'Active', authorityStatus: 'Active', physicalAddress: '1200 Fleet Ave, Dallas, TX 75201', mailingAddress: '1200 Fleet Ave, Dallas, TX 75201', phone: '(214) 555-0100', powerUnits: 48, drivers: 52, safetyRating: 'Satisfactory', mcs150Date: '2025-11-02', state: 'TX' },
    { dotNumber: '2345678', mcNumber: 'MC-234567', legalName: 'DT NATIONAL TRANSPORTATION LLC', dbaName: 'DT National', operatingStatus: 'Active', authorityStatus: 'Active', physicalAddress: '88 Cargo Rd, Atlanta, GA 30301', mailingAddress: 'PO Box 441, Atlanta, GA 30301', phone: '(404) 555-0200', powerUnits: 23, drivers: 25, safetyRating: 'None', mcs150Date: '2025-08-14', state: 'GA' },
    { dotNumber: '3456789', mcNumber: 'MC-345678', legalName: 'PREMIER TRUCKING GROUP INC', dbaName: '', operatingStatus: 'Active', authorityStatus: 'Active', physicalAddress: '500 Lane St, Chicago, IL 60601', mailingAddress: '500 Lane St, Chicago, IL 60601', phone: '(312) 555-0300', powerUnits: 14, drivers: 14, safetyRating: 'Conditional', mcs150Date: '2025-03-09', state: 'IL' },
    { dotNumber: '4567890', mcNumber: 'MC-456789', legalName: 'RMR TRANSPORT', dbaName: 'RMR', operatingStatus: 'Active', authorityStatus: 'Pending', physicalAddress: '77 Depot Way, Phoenix, AZ 85001', mailingAddress: '77 Depot Way, Phoenix, AZ 85001', phone: '(602) 555-0400', powerUnits: 6, drivers: 5, safetyRating: 'None', mcs150Date: '2024-12-20', state: 'AZ' },
    { dotNumber: '998812', mcNumber: 'MC-998812', legalName: 'MIDWEST FREIGHT LINES LLC', dbaName: 'Midwest Freight', operatingStatus: 'Active', authorityStatus: 'Active', physicalAddress: '410 Industrial Pkwy, Columbus, OH 43201', mailingAddress: '410 Industrial Pkwy, Columbus, OH 43201', phone: '(614) 555-0710', powerUnits: 31, drivers: 34, safetyRating: 'Satisfactory', mcs150Date: '2025-10-01', state: 'OH' },
    { dotNumber: '771204', mcNumber: 'MC-771204', legalName: 'BLUE RIDGE CARRIERS INC', dbaName: '', operatingStatus: 'Out of Service', authorityStatus: 'Inactive', physicalAddress: '9 Summit Rd, Knoxville, TN 37901', mailingAddress: '9 Summit Rd, Knoxville, TN 37901', phone: '(865) 555-0990', powerUnits: 0, drivers: 0, safetyRating: 'Unsatisfactory', mcs150Date: '2023-06-15', state: 'TN' },
  ] as any[],

  snapshots: [] as any[],
  mismatches: [] as any[],
  watchlist: [] as any[],
  recentSearches: [] as any[],
};

/* seed a few realistic messages across channels */
function seed() {
  const add = (m: any) => store.messages.push({ id: uid(), read: true, needsReply: false, attachments: [], ...m });
  add({ contactId: 'p1', channel: 'sms', direction: 'inbound', from: '+1 555-010-0101', to: '+1 214-555-1000', via: 'rc1', recruiter: 'Nina Patel', body: 'Hi, where do I send my medical card?', status: 'received', time: nowMinus(140), needsReply: false });
  add({ contactId: 'p1', channel: 'sms', direction: 'outbound', from: '+1 214-555-1000', to: '+1 555-010-0101', via: 'rc1', recruiter: 'Nina Patel', body: 'You can upload it with this secure link, or text a photo here.', status: 'delivered', time: nowMinus(131) });
  add({ contactId: 'p1', channel: 'sms', direction: 'inbound', from: '+1 555-010-0101', to: '+1 214-555-1000', via: 'rc1', recruiter: 'Nina Patel', body: 'Yes I can come in Thursday for orientation', status: 'received', time: nowMinus(12), read: false, needsReply: true });
  add({ contactId: 'p1', channel: 'call', direction: 'outbound', from: '+1 214-555-1000', to: '+1 555-010-0101', via: 'rc1', recruiter: 'Nina Patel', body: 'Call to confirm documents', callOutcome: 'connected', durationSec: 214, status: 'completed', time: nowMinus(200) });

  add({ contactId: 'p4', channel: 'email', direction: 'outbound', from: 'recruiting@quickhire.com', to: 'sc@example.com', via: 'em1', recruiter: 'Nina Patel', subject: 'Your offer package is ready', body: 'Hi Sarah — your offer package is ready for signature. Let me know if you have any questions.', status: 'delivered', time: nowMinus(80) });
  add({ contactId: 'p4', channel: 'email', direction: 'inbound', from: 'sc@example.com', to: 'recruiting@quickhire.com', via: 'em1', recruiter: 'Nina Patel', subject: 'Re: Your offer package is ready', body: 'Reviewing the offer now, thank you!', status: 'received', time: nowMinus(45), read: false, needsReply: true });

  add({ contactId: 'p3', channel: 'call', direction: 'inbound', from: '+1 555-010-0103', to: '+1 214-555-1010', via: 'rc2', recruiter: 'Dana Reed', body: 'Missed call', callOutcome: 'missed', status: 'missed', time: nowMinus(180), read: false, needsReply: true });
  add({ contactId: 'p3', channel: 'voicemail', direction: 'inbound', from: '+1 555-010-0103', to: '+1 214-555-1010', via: 'rc2', recruiter: 'Dana Reed', body: 'Voicemail: background check consent is signed, call me back.', durationSec: 31, status: 'received', time: nowMinus(178), read: false });

  add({ contactId: 'p7', channel: 'sms', direction: 'outbound', from: '+1 214-555-1000', to: '+1 555-010-0107', via: 'rc1', recruiter: 'Nina Patel', body: 'Hi Kevin, we still need your medical card.', status: 'failed', time: nowMinus(300), needsReply: true });
  add({ contactId: 'p5', channel: 'internal_note', direction: 'outbound', from: 'Dana Reed', to: '', via: '', recruiter: 'Dana Reed', body: 'Driver prefers calls after 5pm. W-9 still outstanding.', status: 'note', time: nowMinus(90) });
}
seed();

/* ---------------- pub/sub ---------------- */
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function useComms() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}
export const getStore = () => store;

const contact = (id: string) => store.contacts.find((c) => c.id === id);
const rcNumber = (id: string) => store.rcNumbers.find((n) => n.id === id);
const inbox = (id: string) => store.emailInboxes.find((n) => n.id === id);

/* ---------------- service: RingCentral ---------------- */
export const svc = {
  // GET /api/ringcentral/status , /api/email/status , /api/fmcsa/status
  status(type: 'ringcentral' | 'email' | 'fmcsa') { return store.accounts.find((a) => a.type === type); },

  // GET /api/ringcentral/numbers
  numbers() { return store.rcNumbers; },
  // PATCH /api/ringcentral/numbers/:id/settings
  patchNumber(id: string, patch: any) { const n = rcNumber(id); if (n) Object.assign(n, patch); emit(); return n; },
  syncNumbers() { const a = store.accounts.find((x) => x.type === 'ringcentral'); if (a) a.lastSyncAt = new Date().toISOString(); emit(); return store.rcNumbers; },
  // POST /api/ringcentral/test-sms
  testSms(numberId: string) { emit(); return { ok: true, number: rcNumber(numberId)?.phoneNumber }; },

  // GET /api/email/inboxes  + PATCH settings
  inboxes() { return store.emailInboxes; },
  patchInbox(id: string, patch: any) { const n = inbox(id); if (n) Object.assign(n, patch); emit(); return n; },
  testEmail(inboxId: string) { emit(); return { ok: true, inbox: inbox(inboxId)?.emailAddress }; },

  // GET /api/drivers/:id/messages
  messagesFor(contactId: string) { return store.messages.filter((m) => m.contactId === contactId).sort((a, b) => +new Date(a.time) - +new Date(b.time)); },

  markRead(contactId: string) { store.messages.forEach((m) => { if (m.contactId === contactId) { m.read = true; if (m.direction === 'inbound') m.needsReply = false; } }); emit(); },

  // POST /api/drivers/:id/sms
  sendSms(contactId: string, fromNumberId: string, body: string, opts: any = {}) {
    const c = contact(contactId); const n = rcNumber(fromNumberId);
    const fail = opts.simulateFail || /\bFAILTEST\b/.test(body);
    const m = { id: uid('sms'), contactId, channel: 'sms', direction: 'outbound', from: n?.phoneNumber || '', to: c?.phone || '', via: fromNumberId, recruiter: opts.recruiter || 'Nina Patel', body, status: fail ? 'failed' : 'sent', time: new Date().toISOString(), read: true, needsReply: false, attachments: [] };
    store.messages.push(m);
    if (!fail) setTimeout(() => { m.status = 'delivered'; emit(); }, 900);
    if (fail) this._task({ title: `Failed SMS — ${c?.name}`, contactId, priority: 'high', tags: ['Message', 'Follow-up'], related: c?.name, alert: true });
    if (opts.followUp) this._task({ title: `Follow up — ${c?.name}`, contactId, related: c?.name, tags: ['Follow-up'] });
    emit(); return m;
  },

  // POST /api/drivers/:id/call-log
  logCall(contactId: string, fromNumberId: string, outcome: string, note = '', opts: any = {}) {
    const c = contact(contactId); const n = rcNumber(fromNumberId);
    const m = { id: uid('call'), contactId, channel: outcome === 'left_voicemail' ? 'voicemail' : 'call', direction: 'outbound', from: n?.phoneNumber || '', to: c?.phone || '', via: fromNumberId, recruiter: opts.recruiter || 'Nina Patel', body: note || CALL_OUTCOMES.find((o) => o.key === outcome)?.label || 'Call', callOutcome: outcome, durationSec: opts.durationSec || 0, status: 'completed', time: new Date().toISOString(), read: true, needsReply: false };
    store.messages.push(m);
    if (outcome === 'no_answer' || outcome === 'follow_up' || outcome === 'left_voicemail') this._task({ title: `Call driver back — ${c?.name}`, contactId, related: c?.name, tags: ['Follow-up'] });
    if (outcome === 'bad_number') this._task({ title: `Bad number — verify contact for ${c?.name}`, contactId, related: c?.name, priority: 'high', tags: ['Follow-up'], alert: true });
    emit(); return m;
  },

  // POST /api/drivers/:id/email
  sendEmail(contactId: string, fromInboxId: string, subject: string, body: string, opts: any = {}) {
    const c = contact(contactId); const i = inbox(fromInboxId);
    const fail = opts.simulateFail;
    const m = { id: uid('em'), contactId, channel: 'email', direction: 'outbound', from: i?.emailAddress || '', to: c?.email || '', via: fromInboxId, recruiter: opts.recruiter || 'Nina Patel', subject, body, status: fail ? 'failed' : 'sent', time: new Date().toISOString(), read: true, needsReply: false, attachments: opts.attachments || [] };
    store.messages.push(m);
    if (!fail) setTimeout(() => { m.status = 'delivered'; emit(); }, 900);
    if (fail) this._task({ title: `Failed email — ${c?.name}`, contactId, priority: 'high', tags: ['Follow-up'], related: c?.name, alert: true });
    if (opts.followUp) this._task({ title: `Follow up — ${c?.name}`, contactId, related: c?.name, tags: ['Follow-up'] });
    emit(); return m;
  },

  saveNote(contactId: string, body: string, opts: any = {}) {
    const m = { id: uid('note'), contactId, channel: 'internal_note', direction: 'outbound', from: opts.recruiter || 'Nina Patel', to: '', via: '', recruiter: opts.recruiter || 'Nina Patel', body, status: 'note', time: new Date().toISOString(), read: true, needsReply: false };
    store.messages.push(m); emit(); return m;
  },

  // STOP handling
  markOptOut(contactId: string) { const c = contact(contactId); if (c) c.optOut = true; emit(); },

  // DocuSign reminder via channel
  docusignReminder(contactId: string, channel: 'sms' | 'email') {
    const c = contact(contactId);
    if (channel === 'sms') return this.sendSms(contactId, c?.rcNumberId || 'rc1', `Hi ${c?.name?.split(' ')[0]}, your onboarding documents are ready to sign: https://quickhire.app/sign/${contactId}`, {});
    return this.sendEmail(contactId, c?.inboxId || 'em1', 'Your documents are ready to sign', `Hi ${c?.name?.split(' ')[0]},\n\nYour onboarding package is ready for signature: https://quickhire.app/sign/${contactId}\n\nQuickHire Recruiting`, {});
  },

  /* ---------------- service: FMCSA ---------------- */
  // GET /api/fmcsa/lookup?dot=&mc=&name=&phone=&state=
  fmcsaLookup(query: any) {
    const q = (s: string) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const term = query.dot || query.mc || query.name || query.phone || query.q || '';
    const rec = store.fmcsaDb.find((r) =>
      (query.dot && q(r.dotNumber) === q(query.dot)) ||
      (query.mc && q(r.mcNumber).includes(q(query.mc))) ||
      (query.name && q(r.legalName).includes(q(query.name))) ||
      (query.phone && q(r.phone) === q(query.phone)) ||
      (query.q && (q(r.dotNumber).includes(q(query.q)) || q(r.mcNumber).includes(q(query.q)) || q(r.legalName).includes(q(query.q)) || q(r.dbaName).includes(q(query.q)))));
    const entry = { id: uid('rs'), term: String(term), at: new Date().toISOString(), found: !!rec, name: rec?.legalName || 'Not found', dot: rec?.dotNumber };
    store.recentSearches = [entry, ...store.recentSearches.filter((x) => x.term !== entry.term)].slice(0, 12);
    emit();
    if (!rec) return null;
    return { ...rec, source: store.accounts.find((a) => a.type === 'fmcsa')?.dataMode === 'api' ? 'FMCSA API' : 'FMCSA public dataset (demo)', fetchedAt: new Date().toISOString() };
  },
  testLookup() { return this.fmcsaLookup({ dot: '998812' }); },

  // compute mismatches between a QuickHire carrier and FMCSA snapshot
  detectMismatches(carrier: any, snap: any) {
    const out: any[] = [];
    const cmp = (field: string, label: string, cur: any, fm: any, severity = 'warning') => { if (cur && fm && String(cur).trim().toLowerCase() !== String(fm).trim().toLowerCase()) out.push({ field, label, currentValue: cur, fmcsaValue: fm, severity }); };
    cmp('legalName', 'Legal name', carrier.name, snap.legalName);
    cmp('dot', 'DOT number', carrier.dot, snap.dotNumber, 'error');
    cmp('mc', 'MC number', carrier.mc, snap.mcNumber, 'error');
    cmp('phone', 'Phone', carrier.phone, snap.phone);
    cmp('address', 'Address', carrier.address, snap.physicalAddress);
    if (snap.authorityStatus && snap.authorityStatus !== 'Active') out.push({ field: 'authority', label: 'Authority status', currentValue: carrier.auth || '—', fmcsaValue: snap.authorityStatus, severity: 'error' });
    const stale = snap.mcs150Date && (Date.now() - +new Date(snap.mcs150Date)) > 1000 * 60 * 60 * 24 * 365;
    if (stale) out.push({ field: 'mcs150', label: 'MCS-150 (data stale)', currentValue: '—', fmcsaValue: snap.mcs150Date, severity: 'warning' });
    return out;
  },

  // POST /api/carriers/:id/fmcsa-fill
  applyFmcsa(carrierId: string, snap: any) {
    const s = { id: uid('snap'), carrierId, dotNumber: snap.dotNumber, mcNumber: snap.mcNumber, legalName: snap.legalName, dbaName: snap.dbaName, operatingStatus: snap.operatingStatus, authorityStatus: snap.authorityStatus, physicalAddress: snap.physicalAddress, mailingAddress: snap.mailingAddress, phone: snap.phone, powerUnits: snap.powerUnits, drivers: snap.drivers, safetyRating: snap.safetyRating, mcs150Date: snap.mcs150Date, source: snap.source, fetchedAt: new Date().toISOString() };
    store.snapshots = [s, ...store.snapshots.filter((x) => x.carrierId !== carrierId)];
    emit(); return s;
  },
  snapshotFor(carrierId: string) { return store.snapshots.find((s) => s.carrierId === carrierId); },

  createMismatchTask(carrierName: string, mismatch: any) {
    this._task({ title: `Review FMCSA mismatch (${mismatch.label}) — ${carrierName}`, priority: mismatch.severity === 'error' ? 'high' : 'normal', related: carrierName, relatedType: 'carrier', carrier: carrierName, tags: ['Compliance', 'Carrier Setup'] });
  },

  // GET/POST/DELETE /api/fmcsa/watchlist
  watchlist() { return store.watchlist; },
  addWatch(snap: any) { if (store.watchlist.some((w) => w.dotNumber === snap.dotNumber)) return; store.watchlist.push({ id: uid('w'), dotNumber: snap.dotNumber, mcNumber: snap.mcNumber, name: snap.legalName, authorityStatus: snap.authorityStatus, safetyRating: snap.safetyRating, powerUnits: snap.powerUnits, drivers: snap.drivers, addedAt: new Date().toISOString(), lastChecked: new Date().toISOString(), change: null }); emit(); },
  removeWatch(id: string) { store.watchlist = store.watchlist.filter((w) => w.id !== id); emit(); },
  // simulate a watchlist check that surfaces a change → notif + task
  checkWatch(id: string) {
    const w = store.watchlist.find((x) => x.id === id); if (!w) return;
    const before = w.authorityStatus; const after = before === 'Active' ? 'Pending' : 'Active';
    w.change = { field: 'Authority status', before, after, at: new Date().toISOString() };
    w.authorityStatus = after; w.lastChecked = new Date().toISOString();
    this._task({ title: `FMCSA change: authority ${before} → ${after} — ${w.name}`, priority: 'high', related: w.name, relatedType: 'carrier', carrier: w.name, tags: ['Compliance'] });
    emit(); return w.change;
  },

  // shared task creator → pushes into the Tasks workspace + records an alert
  _task(p: any) {
    const t = addExternalTask({ title: p.title, status: 'todo', priority: p.priority || 'normal', assignee: 'NP', source: 'automation', related: p.related || (p.contactId ? contact(p.contactId)?.name : null), relatedType: p.relatedType || (p.contactId ? 'candidate' : null), carrier: p.carrier || (p.contactId ? contact(p.contactId)?.carrier : null), tags: p.tags || ['Follow-up'], due: null });
    return t;
  },
};

export const CALL_OUTCOMES = [
  { key: 'connected', label: 'Connected', icon: 'phone', color: '#34C759' },
  { key: 'no_answer', label: 'No answer', icon: 'phoneMissed', color: '#FF9500' },
  { key: 'left_voicemail', label: 'Left voicemail', icon: 'voicemail', color: '#5856D6' },
  { key: 'bad_number', label: 'Bad number', icon: 'ban', color: '#FF3B30' },
  { key: 'follow_up', label: 'Follow-up needed', icon: 'flag', color: '#007AFF' },
];

export const MSG_STATUS: Record<string, { label: string; color: string }> = {
  sent: { label: 'Sent', color: '#6E6E73' },
  delivered: { label: 'Delivered', color: '#34C759' },
  read: { label: 'Read', color: '#34C759' },
  received: { label: 'Received', color: '#6E6E73' },
  failed: { label: 'Failed', color: '#FF3B30' },
  missed: { label: 'Missed', color: '#FF3B30' },
  completed: { label: 'Completed', color: '#6E6E73' },
  note: { label: 'Note', color: '#6E6E73' },
  opt_out: { label: 'Opted out', color: '#FF9500' },
};
