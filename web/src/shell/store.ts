/* App shell store — global Create records, notifications, and activity log.
   Local-first (localStorage) so the top bar's Create / notifications / search
   behave end-to-end and every action is logged, with no backend. */
import React from 'react';
import { store as esignStore } from '../esign/store';

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const nowIso = () => new Date().toISOString();

const LS = 'qh_shell_v1';
function load(): any | null { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch { return null; } }
function persist() { try { localStorage.setItem(LS, JSON.stringify({ notifications: store.notifications, activities: store.activities, records: store.records })); } catch { /* quota */ } }

export const store: any = { notifications: [], activities: [], records: [] };
(function init() {
  const s = load();
  if (s) { store.notifications = s.notifications || []; store.activities = s.activities || []; store.records = s.records || []; }
  else {
    store.notifications = [
      { id: uid('n'), kind: 'action', title: 'Robert Johnson — Medical Card missing', body: 'Required before screening can complete.', at: new Date(Date.now() - 36e5).toISOString(), read: false },
      { id: uid('n'), kind: 'sign', title: 'Sarah Chen viewed the Offer Letter', body: 'Awaiting signature.', at: new Date(Date.now() - 72e5).toISOString(), read: false },
      { id: uid('n'), kind: 'info', title: 'Mike Okafor completed onboarding', body: 'Company Driver Agreement signed.', at: new Date(Date.now() - 18e5 * 6).toISOString(), read: true },
    ];
    store.activities = []; store.records = []; persist();
  }
})();

const listeners = new Set<() => void>();
const emit = () => { persist(); listeners.forEach((l) => l()); };
export function useShell() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}

export const RECORD_LABELS: Record<string, string> = {
  candidate: 'Candidate', driver: 'Driver', document: 'Document', truck_assignment: 'Truck assignment',
  carrier_form: 'Carrier form', insurance_requirement: 'Insurance requirement', application_sent: 'Application',
  offer_sent: 'Offer package', doc_request: 'Document request', note: 'Note',
};

export const svc = {
  notify(kind: string, title: string, body = '') { store.notifications.unshift({ id: uid('n'), kind, title, body, at: nowIso(), read: false }); store.notifications = store.notifications.slice(0, 60); emit(); },
  logActivity(type: string, title: string, detail = '', entity: any = null) { store.activities.unshift({ id: uid('a'), type, title, detail, entity, at: nowIso(), user: 'Nina Patel' }); store.activities = store.activities.slice(0, 200); emit(); },
  addRecord(type: string, fields: any) {
    const rec = { id: uid('rec'), type, title: fields.title || fields.name || RECORD_LABELS[type] || 'Record', subtitle: fields.subtitle || '', data: fields, at: nowIso() };
    store.records.unshift(rec);
    this.logActivity(type, `${RECORD_LABELS[type] || 'Record'} created — ${rec.title}`, rec.subtitle, { type, id: rec.id });
    this.notify('info', `${RECORD_LABELS[type] || 'Record'} created`, rec.title);
    emit();
    return rec;
  },
  markAllRead() { store.notifications.forEach((n: any) => (n.read = true)); emit(); },
  markRead(id: string) { const n = store.notifications.find((x: any) => x.id === id); if (n) { n.read = true; emit(); } },
  unread() { return store.notifications.filter((n: any) => !n.read).length; },

  /** Global search across drivers, carriers, agreements, documents, records, activities. */
  search(q: string, drivers: any[] = [], carriers: any[] = []) {
    const t = q.trim().toLowerCase();
    if (!t) return [] as any[];
    const has = (s: any) => String(s || '').toLowerCase().includes(t);
    const out: any[] = [];
    drivers.forEach((d) => { if (has(d.name) || has(d.email) || has(d.carrier) || has(d.position) || has(d.phone)) out.push({ group: 'Drivers', icon: 'user', title: d.name, sub: `${d.stage} · ${d.carrier}`, action: { kind: 'candidate', id: d.id } }); });
    carriers.forEach((c) => { if (has(c.name) || has(c.dot) || has(c.mc) || has(c.dba)) out.push({ group: 'Carriers', icon: 'building', title: c.name, sub: `DOT ${c.dot} · ${c.mc}`, action: { kind: 'page', page: 'carriers' } }); });
    (esignStore.envelopes || []).forEach((e: any) => { if (has(e.title) || has(e.driverName) || has(e.carrier)) out.push({ group: 'Agreements', icon: 'sign', title: e.title, sub: `${e.driverName || '—'} · ${e.status}`, action: { kind: 'page', page: 'docusign' } }); });
    (esignStore.envelopes || []).forEach((e: any) => Object.values(e.uploads || {}).forEach((u: any) => { if (has(u.name)) out.push({ group: 'Documents', icon: 'fileText', title: u.name, sub: `Uploaded · ${e.title}`, action: { kind: 'page', page: 'docusign' } }); }));
    store.records.forEach((r: any) => { if (has(r.title) || has(r.subtitle)) out.push({ group: RECORD_LABELS[r.type] ? RECORD_LABELS[r.type] + 's' : 'Records', icon: 'tag', title: r.title, sub: r.subtitle || RECORD_LABELS[r.type], action: { kind: 'record', id: r.id } }); });
    return out.slice(0, 30);
  },
};

export function fmtAgo(iso: string) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - +new Date(iso)) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
