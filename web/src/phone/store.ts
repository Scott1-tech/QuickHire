/* In-app calling — phone service + store.

   One module owns the whole call lifecycle so every entry point (dock dialer,
   click-to-call links, the `qh:call` window event, the RingCentral widget)
   behaves the same:

     dial / ring → live → ended → wrap-up → logged on the driver/lead timeline
                                          + follow-up task + backend call log
     ring → (no answer) → missed → logged + notification + callback task + badge

   Two engines:
     • RingCentral Embeddable (when an admin configured our own Client ID)
     • Demo softphone (no credentials) — same UI and logging, simulated audio.

   Local-first like the other stores: module-level state, listeners, a
   usePhone() hook and localStorage persistence (config, last 200 calls, pending
   wrap-ups, drafts). Config is also synced to the backend when one exists. */
import React from 'react';
import { store as hireStore, svc as hireSvc } from '../hire/store';
import { store as recruitStore, svc as recruitSvc } from '../recruit/store';
import { svc as shellSvc } from '../shell/store';
import { getStore as commsStore, svc as commsSvc } from '../comms/store';
import { addExternalTask, makeTask, externalTasks } from '../tasks/bus';
import { SEED_TASKS } from '../tasks/data';
import { normalizePhone, formatPhone, matchPhone, buildPhoneIndex, samePhone, type PhoneRecord, type PhoneIndex } from './number';
import { describeWhen, isoDay } from './when';
import * as rc from './rc';
import { phoneApi, backendLikely } from './api';
import { openRecord } from './nav';

/* ───────────────────────── types ───────────────────────── */
export type CallState = 'ringing' | 'live' | 'ended' | 'missed';
export type RecordKind = 'lead' | 'driver';
export type Outcome = 'connected' | 'left_voicemail' | 'no_answer' | 'wrong_number' | 'not_interested';

export const OUTCOMES: { key: Outcome; label: string; color: string }[] = [
  { key: 'connected', label: 'Connected', color: '#248A3D' },
  { key: 'left_voicemail', label: 'Left voicemail', color: '#5856D6' },
  { key: 'no_answer', label: 'No answer', color: '#A05A00' },
  { key: 'wrong_number', label: 'Wrong number', color: '#C62820' },
  { key: 'not_interested', label: 'Not interested', color: '#6E6E73' },
];
export const outcomeLabel = (o: string | null | undefined) => OUTCOMES.find((x) => x.key === o)?.label || (o === 'missed' ? 'Missed' : o || '');

export type Call = {
  id: string;
  direction: 'inbound' | 'outbound';
  number: string;                 // E.164 when complete, else the dialed digits
  recordKind: RecordKind | null;
  recordId: string | null;
  name: string | null;
  state: CallState;
  startedAt: string;              // began ringing / dialing
  answeredAt: string | null;
  endedAt: string | null;
  duration: number;               // seconds connected
  notes: string;
  outcome: Outcome | null;
  recording: { active: boolean; id?: string; url?: string } | null;
  muted: boolean;
  held: boolean;
  source: 'demo' | 'rc';
  rcIds: string[];
  rcControlId: string | null;
  answering?: boolean;
  declined?: boolean;
  wrapped?: boolean;
  discarded?: boolean;
  matches?: number;
  remoteName?: string;
  followUp?: { at: string; taskId: string } | null;
};
export type CallCtx = { name?: string; recordId?: string; kind?: RecordKind; force?: boolean };
type Config = { clientId: string; mode: rc.RcMode; callerId: string; updatedAt: string | null };
type Toast = { id: string; title: string; kind: string };
type Snack = { id: string; text: string; actionLabel?: string; onAction?: () => void };

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();
export const HISTORY_MAX = 200;

/* ───────────────────────── state ───────────────────────── */
export const store = {
  config: { clientId: '', mode: 'browser', callerId: '', updatedAt: null } as Config,
  rc: { status: 'off' as 'off' | 'loading' | 'ready' | 'error', error: '', loggedIn: false, loginNumber: '', webphone: '', visible: false },
  sync: { state: 'local' as 'local' | 'syncing' | 'synced' | 'error', at: null as string | null },
  calls: [] as Call[],      // ringing or live right now
  wrapQueue: [] as Call[],  // ended, waiting for wrap-up (oldest first)
  history: [] as Call[],    // newest first, finished calls
  missedUnseen: 0,
  ui: { open: false, tab: 'dialer' as 'dialer' | 'recent' | 'rc', collapsed: false, dial: '', dnc: null as null | { phone: string; ctx: CallCtx; name: string }, missedFocus: false },
  toasts: [] as Toast[],
  snack: null as Snack | null,
};

const LS = 'qh_phone_v1';
function snapshot() {
  return { config: store.config, history: store.history.slice(0, HISTORY_MAX), wrapQueue: store.wrapQueue, missedUnseen: store.missedUnseen, calls: store.calls.filter((c) => c.state === 'live') };
}
function persistNow() { try { localStorage.setItem(LS, JSON.stringify(snapshot())); } catch { /* quota / private mode */ } }
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() { if (persistTimer) clearTimeout(persistTimer); persistTimer = setTimeout(() => { persistTimer = null; persistNow(); }, 250); }

function hydrate(s: any) {
  if (!s || typeof s !== 'object') return;
  if (s.config && typeof s.config === 'object') {
    store.config = { clientId: String(s.config.clientId || ''), mode: s.config.mode === 'ringout' ? 'ringout' : 'browser', callerId: String(s.config.callerId || ''), updatedAt: s.config.updatedAt || null };
  }
  if (Array.isArray(s.history)) store.history = s.history.slice(0, HISTORY_MAX);
  if (Array.isArray(s.wrapQueue)) store.wrapQueue = s.wrapQueue;
  store.missedUnseen = Math.max(0, +s.missedUnseen || 0);
}
(function init() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS) : null;
    if (!raw) return;
    const s = JSON.parse(raw);
    hydrate(s);
    // A call that was live when the page closed can't be resumed (demo) — keep
    // its notes by sending it to wrap-up instead of losing them.
    if (Array.isArray(s.calls)) for (const c of s.calls) {
      if (!c || !c.id || store.wrapQueue.some((w) => w.id === c.id)) continue;
      const ended = { ...c, state: 'ended' as CallState, endedAt: c.endedAt || nowIso(), notes: c.notes || '' };
      if (ended.answeredAt) ended.duration = Math.max(0, Math.round((+new Date(ended.endedAt) - +new Date(ended.answeredAt)) / 1000));
      store.wrapQueue.push(ended);
      store.history.unshift({ ...ended });
    }
  } catch { /* corrupt storage — start clean */ }
})();

const listeners = new Set<() => void>();
function emit() { schedulePersist(); listeners.forEach((l) => l()); }
export function usePhone() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return store;
}

/* ───────────────────────── feedback ───────────────────────── */
export function toast(title: string, kind = 'success') {
  const t = { id: uid('t'), title, kind };
  store.toasts = [...store.toasts, t];
  setTimeout(() => { store.toasts = store.toasts.filter((x) => x.id !== t.id); listeners.forEach((l) => l()); }, 3200);
  listeners.forEach((l) => l());
}
let snackTimer: ReturnType<typeof setTimeout> | null = null;
function snack(text: string, actionLabel?: string, onAction?: () => void) {
  if (snackTimer) clearTimeout(snackTimer);
  const s = { id: uid('s'), text, actionLabel, onAction };
  store.snack = s;
  snackTimer = setTimeout(() => { if (store.snack?.id === s.id) { store.snack = null; listeners.forEach((l) => l()); } }, 6500);
  listeners.forEach((l) => l());
}
export function runSnack() { const s = store.snack; store.snack = null; emit(); s?.onAction?.(); }
export function dismissSnack() { store.snack = null; emit(); }

let baseTitle = '';
function flashTitle(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) { if (!baseTitle) baseTitle = document.title; document.title = 'Incoming call · ' + baseTitle; }
  else if (baseTitle) { document.title = baseTitle; baseTitle = ''; }
}

/* ───────────────────────── records ───────────────────────── */
let idxCache: { key: string; at: number; idx: PhoneIndex } | null = null;
function phoneIndex(): PhoneIndex {
  const drivers: any[] = hireStore.drivers || [], leads: any[] = recruitStore.leads || [];
  const key = `${drivers.length}:${leads.length}:${drivers[0]?.id || ''}:${leads[0]?.id || ''}`;
  if (idxCache && idxCache.key === key && Date.now() - idxCache.at < 1500) return idxCache.idx;
  const recs: PhoneRecord[] = [
    ...drivers.map((d) => ({ kind: 'driver' as const, id: d.id, name: d.name, phone: d.phone, archived: !!d.archived })),
    ...leads.map((l) => ({ kind: 'lead' as const, id: l.id, name: l.name, phone: l.phone, archived: !!l.archived })),
  ];
  const idx = buildPhoneIndex(recs);
  idxCache = { key, at: Date.now(), idx };
  return idx;
}
export function invalidateMatches() { idxCache = null; }
export function findRecords(phone: string): PhoneRecord[] { return matchPhone(phone, phoneIndex()); }

function rawRecord(kind: RecordKind | null, id: string | null): any {
  if (!kind || !id) return null;
  return kind === 'driver' ? hireSvc.driver(id) : recruitSvc.lead(id);
}

export type RecordInfo = { kind: RecordKind; id: string; name: string; phone: string; stage: string; subtitle: string; carrier: string; lastNote: string; openTasks: number; dnc: boolean };
const isOpenTask = (t: any) => t && t.status !== 'complete' && t.status !== 'done';
function workspaceOpenTasks(name: string) {
  const seen = new Set<string>();
  let n = 0;
  for (const t of [...externalTasks(), ...SEED_TASKS]) { if (!t || seen.has(t.id)) continue; seen.add(t.id); if (t.related === name && isOpenTask(t)) n++; }
  return n;
}
export function recordInfo(kind: RecordKind | null, id: string | null): RecordInfo | null {
  const r = rawRecord(kind, id);
  if (!r || !kind || !id) return null;
  if (kind === 'lead') {
    const note = (r.activities || []).find((a: any) => ['note', 'comm', 'anna'].includes(a.type) && a.detail)?.detail || r.annaSummary || '';
    const own = (r.tasks || []).filter(isOpenTask).length + (r.nextAction && r.nextAction.status !== 'done' ? 1 : 0);
    return { kind, id, name: r.name, phone: r.phone, stage: r.stageName, subtitle: `Lead · ${r.stageName}`, carrier: r.carrier || '', lastNote: note, openTasks: own + workspaceOpenTasks(r.name), dnc: !!r.consent?.doNotContact };
  }
  const note = (r.activities || []).find((a: any) => ['note', 'call', 'text', 'email'].includes(a.type) && a.detail)?.detail || '';
  return { kind, id, name: r.name, phone: r.phone, stage: r.stage, subtitle: `Driver · ${r.stage}`, carrier: r.carrier || '', lastNote: note, openTasks: workspaceOpenTasks(r.name), dnc: false };
}

function resolve(number: string, ctx: CallCtx = {}): Pick<Call, 'recordKind' | 'recordId' | 'name' | 'matches'> {
  if (ctx.recordId) {
    const kind: RecordKind | null = ctx.kind || (hireSvc.driver(ctx.recordId) ? 'driver' : recruitSvc.lead(ctx.recordId) ? 'lead' : null);
    const r = rawRecord(kind, ctx.recordId);
    if (r) return { recordKind: kind, recordId: ctx.recordId, name: ctx.name || r.name, matches: 1 };
  }
  const hits = findRecords(number);
  if (hits.length) return { recordKind: hits[0].kind, recordId: hits[0].id, name: hits[0].name, matches: hits.length };
  return { recordKind: null, recordId: null, name: ctx.name || null, matches: 0 };
}

/** The recruit stage a connected call would advance this lead to, if any. */
export function stageAdvanceFor(kind: RecordKind | null, id: string | null): { from: string; to: string } | null {
  if (kind !== 'lead' || !id) return null;
  const l = recruitSvc.lead(id); if (!l || l.archived) return null;
  const stages = recruitSvc.stages();
  if (stages.length < 2 || l.stageName !== stages[0].name) return null;
  const next = stages.slice(1).find((s: any) => !s.terminal);
  return next ? { from: stages[0].name, to: next.name } : null;
}

/* ───────────────────────── call helpers ───────────────────────── */
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
function later(id: string, ms: number, fn: () => void) { const t = setTimeout(fn, ms); timers.set(id, [...(timers.get(id) || []), t]); }
function clearTimers(id: string) { (timers.get(id) || []).forEach(clearTimeout); timers.delete(id); }

function newCall(p: Partial<Call> & Pick<Call, 'direction' | 'number' | 'source'>): Call {
  return {
    id: uid('call'), recordKind: null, recordId: null, name: null, state: 'ringing', startedAt: nowIso(), answeredAt: null, endedAt: null,
    duration: 0, notes: '', outcome: null, recording: null, muted: false, held: false, rcIds: [], rcControlId: null, matches: 0, ...p,
  };
}
export const isRcMode = () => rc.isValidClientId(store.config.clientId);
export const displayName = (c: Pick<Call, 'name' | 'number' | 'remoteName'>) => c.name || c.remoteName || formatPhone(c.number) || 'Unknown caller';
export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export const elapsed = (c: Call) => (c.answeredAt ? Math.max(0, (Date.now() - +new Date(c.answeredAt)) / 1000) : 0);
const findCall = (id: string) => store.calls.find((c) => c.id === id) || store.wrapQueue.find((c) => c.id === id);
function patchHistory(c: Call) { const i = store.history.findIndex((h) => h.id === c.id); const copy = { ...c }; if (i >= 0) store.history[i] = copy; else store.history.unshift(copy); store.history = store.history.slice(0, HISTORY_MAX); }
const busy = () => store.calls.some((c) => c.state === 'ringing' || c.state === 'live');

/* ───────────────────────── outbound ───────────────────────── */
let pendingDial: { phone: string; ctx: CallCtx } | null = null;

/** Start a call. Every click-to-call surface in the app ends up here. */
export function callNumber(phone: string, ctx: CallCtx = {}): Call | null {
  const n = normalizePhone(phone);
  if (!n.dialable) {
    store.ui = { ...store.ui, open: true, tab: 'dialer', dial: String(phone || '') };
    emit(); toast("That doesn't look like a complete phone number", 'warning'); return null;
  }
  if (busy()) { store.ui = { ...store.ui, open: true, collapsed: false }; emit(); toast('Finish your current call first', 'warning'); return null; }
  const dial = n.e164 || n.digits;
  const who = resolve(dial, ctx);
  const info = recordInfo(who.recordKind, who.recordId);
  if (info?.dnc && !ctx.force) {
    // Do-Not-Contact: ask once instead of silently calling an opted-out lead.
    store.ui = { ...store.ui, open: true, tab: 'dialer', collapsed: false, dial: formatPhone(dial), dnc: { phone: dial, ctx: { ...ctx, recordId: who.recordId || undefined, kind: who.recordKind || undefined }, name: info.name } };
    emit(); return null;
  }
  store.ui = { ...store.ui, dnc: null };

  if (isRcMode()) {
    if (store.rc.status === 'error') { toast(store.rc.error || 'RingCentral is unavailable — check Settings', 'danger'); return null; }
    if (!store.rc.loggedIn) {
      pendingDial = { phone: dial, ctx: { ...ctx, force: true } };
      showRcWidget(true);
      toast('Sign in to RingCentral — your call starts right after', 'info');
      return null;
    }
    const c = newCall({ direction: 'outbound', number: dial, source: 'rc', ...who });
    if (!rc.rcDial(dial, store.config.callerId || undefined)) { toast('The RingCentral phone is still loading — try again in a moment', 'warning'); return null; }
    store.calls.push(c);
    // If RingCentral never reports the call (cancelled in the widget, blocked
    // mic…), drop the placeholder quietly instead of leaving a ghost call.
    later(c.id, 60000, () => { if (store.calls.includes(c) && !c.rcIds.length) { store.calls = store.calls.filter((x) => x !== c); emit(); toast("RingCentral didn't start the call", 'warning'); } });
    openSurface(); emit(); return c;
  }

  const c = newCall({ direction: 'outbound', number: dial, source: 'demo', ...who });
  store.calls.push(c);
  later(c.id, 1600, () => { if (c.state === 'ringing' && store.calls.includes(c)) { c.state = 'live'; c.answeredAt = nowIso(); emit(); } });
  openSurface(); emit(); return c;
}

/** Ask-once override for Do-Not-Contact leads. */
export function confirmDncCall() { const d = store.ui.dnc; if (!d) return null; store.ui = { ...store.ui, dnc: null }; return callNumber(d.phone, { ...d.ctx, force: true }); }
export function cancelDnc() { store.ui = { ...store.ui, dnc: null }; emit(); }

function openSurface() { store.ui = { ...store.ui, open: true, collapsed: false }; }

/* ───────────────────────── inbound (demo) ───────────────────────── */
export function simulateIncoming(opts: { unknown?: boolean; number?: string } = {}): Call | null {
  if (busy()) { toast('Finish your current call first', 'warning'); store.ui = { ...store.ui, open: true, collapsed: false }; emit(); return null; }
  let number = opts.number || '';
  if (!number && !opts.unknown) {
    const pool = [
      ...(hireStore.drivers || []).filter((d: any) => !d.archived && normalizePhone(d.phone).dialable && d.phone !== '(555) 010-0000'),
      ...(recruitStore.leads || []).filter((l: any) => !l.archived && normalizePhone(l.phone).dialable && !l.consent?.doNotContact),
    ];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    number = pick ? pick.phone : '';
  }
  if (!number) {
    for (let i = 0; i < 20 && !number; i++) { const cand = `+1972555${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`; if (!findRecords(cand).length) number = cand; }
  }
  const n = normalizePhone(number);
  const c = newCall({ direction: 'inbound', number: n.e164 || n.digits, source: 'demo', ...resolve(n.e164 || n.digits) });
  store.calls.push(c);
  flashTitle(true);
  later(c.id, 30000, () => { if (c.state === 'ringing' && store.calls.includes(c)) finishCall(c, { missed: true }); });
  openSurface(); emit(); return c;
}

/* ───────────────────────── call controls ───────────────────────── */
export function answer(id: string) {
  const c = store.calls.find((x) => x.id === id); if (!c || c.state !== 'ringing') return;
  flashTitle(false);
  if (c.source === 'rc') {
    rc.rcControl('answer', c.rcControlId);
    c.answering = true;
    later(c.id, 6000, () => { if (c.answering && c.state === 'ringing' && store.calls.includes(c)) { c.answering = false; c.state = 'live'; c.answeredAt = nowIso(); emit(); } });
  } else { clearTimers(c.id); c.state = 'live'; c.answeredAt = nowIso(); }
  openSurface(); emit();
}
export function decline(id: string) {
  const c = store.calls.find((x) => x.id === id); if (!c) return;
  if (c.source === 'rc') rc.rcControl('reject', c.rcControlId);
  finishCall(c, { missed: true, declined: true });
}
export function hangup(id: string) {
  const c = store.calls.find((x) => x.id === id); if (!c) return;
  if (c.source === 'rc' && c.rcIds.length) {
    rc.rcControl('hangup', c.rcControlId);
    // the widget reports rc-call-end-notify; end locally if it doesn't
    later(c.id, 4000, () => { if (store.calls.includes(c)) finishCall(c, {}); });
    return;
  }
  finishCall(c, {});
}
export function toggleMute(id: string) { const c = store.calls.find((x) => x.id === id); if (!c) return; if (c.source === 'rc') rc.rcControl(c.muted ? 'unmute' : 'mute', c.rcControlId); c.muted = !c.muted; emit(); }
export function toggleHold(id: string) { const c = store.calls.find((x) => x.id === id); if (!c) return; if (c.source === 'rc') rc.rcControl(c.held ? 'unhold' : 'hold', c.rcControlId); c.held = !c.held; emit(); }
export function toggleRecord(id: string) {
  const c = store.calls.find((x) => x.id === id); if (!c || c.state !== 'live') return;
  const on = !c.recording?.active;
  if (c.source === 'rc') rc.rcControl(on ? 'startRecord' : 'stopRecord', c.rcControlId);
  c.recording = { ...(c.recording || {}), active: on };
  emit(); toast(on ? 'Recording started' : 'Recording stopped', 'info');
}
export function transfer(id: string, to: string): boolean {
  const c = store.calls.find((x) => x.id === id); if (!c) return false;
  const n = normalizePhone(to);
  if (!n.dialable) { toast('Enter a complete number to transfer to', 'warning'); return false; }
  const target = n.e164 || n.digits;
  c.notes = [c.notes, `Transferred to ${formatPhone(target)}.`].filter(Boolean).join('\n');
  if (c.source === 'rc') { rc.rcControl('transfer', c.rcControlId, { transferNumber: target }); later(c.id, 5000, () => { if (store.calls.includes(c)) finishCall(c, {}); }); emit(); }
  else finishCall(c, {});
  toast(`Transferred to ${formatPhone(target)}`, 'success');
  return true;
}

/** Notes typed during the call / wrap-up — autosaved as a draft. */
export function setNotes(id: string, notes: string) { const c = findCall(id); if (!c) return; c.notes = notes; emit(); }

/* ───────────────────────── ending calls ───────────────────────── */
function finishCall(c: Call, o: { missed?: boolean; declined?: boolean; duration?: number | null }) {
  clearTimers(c.id);
  store.calls = store.calls.filter((x) => x.id !== c.id);
  if (!store.calls.some((x) => x.state === 'ringing' && x.direction === 'inbound')) flashTitle(false);
  c.endedAt = nowIso();
  c.answering = false;
  c.duration = o.duration != null && c.answeredAt ? o.duration : c.answeredAt ? Math.max(0, Math.round((+new Date(c.endedAt) - +new Date(c.answeredAt)) / 1000)) : 0;
  if (c.recording) c.recording = { ...c.recording, active: false };
  if (o.missed && !c.answeredAt) { handleMissed(c, !!o.declined); return; }
  c.state = 'ended';
  if (!c.outcome) c.outcome = c.answeredAt ? 'connected' : 'no_answer';
  store.wrapQueue.push(c);
  patchHistory(c);
  store.ui = { ...store.ui, open: true, collapsed: false };
  emit();
}

function logToRecord(c: Call, title: string, detail: string, outcomeText: string) {
  const r = rawRecord(c.recordKind, c.recordId);
  if (r && c.recordKind === 'lead') {
    const res: any = recruitSvc.logComm(r.id, { channel: 'call', direction: c.direction, outcome: outcomeText, duration: c.duration, note: detail });
    if (res?.blocked) recruitSvc.addNote(r.id, `${title} (lead is Do-Not-Contact)${detail ? ' — ' + detail : ''}`);
    return true;
  }
  if (r && c.recordKind === 'driver') { hireSvc.log(r.id, 'call', title, detail); return true; }
  shellSvc.logActivity('call', `${title} — ${formatPhone(c.number)}`, detail);
  return false;
}

function mirrorToMessages(c: Call, outcome: string, note: string) {
  // Calls placed from the Messages workspace also show in that thread.
  try {
    const cs: any[] = commsStore().contacts || [];
    const ct = cs.find((x) => x.id === c.recordId) || cs.find((x) => samePhone(x.phone, c.number));
    if (ct) commsSvc.recordCall(ct.id, { direction: c.direction, outcome, note, durationSec: c.duration, number: c.number });
  } catch { /* messages store unavailable */ }
}

function postCallLog(c: Call, outcome: string) {
  if (!c.recordId || !backendLikely()) return;
  phoneApi.logCall(c.recordId, {
    to: c.direction === 'outbound' ? c.number : '', from: c.direction === 'inbound' ? c.number : (store.config.callerId || ''),
    direction: c.direction, outcome, notes: c.notes, durationSec: c.duration, callId: c.rcIds[0] || c.id,
    recordKind: c.recordKind, name: c.name, startedAt: c.startedAt, createdBy: 'recruiter', source: c.source,
  }).catch(() => { /* best-effort — the call is already on the timeline */ });
}

function handleMissed(c: Call, declined: boolean) {
  c.state = 'missed';
  c.outcome = null;
  c.declined = declined;
  const who = displayName(c);
  const at = new Date(c.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  logToRecord(c, declined ? 'Declined call' : 'Missed call', `Inbound from ${formatPhone(c.number)} at ${at}`, declined ? 'Declined' : 'Missed');
  const task = addExternalTask(makeTask({
    title: `Call back ${who}`, description: `Suggested after a ${declined ? 'declined' : 'missed'} call at ${at} from ${formatPhone(c.number)}.`,
    priority: 'high', due: isoDay(new Date()), assignee: 'NP', related: c.name || formatPhone(c.number),
    relatedType: c.recordKind === 'lead' ? 'candidate' : c.recordKind === 'driver' ? 'driver' : null,
    source: 'automation', tags: ['Follow-up', 'Call'], createdBy: 'QuickHire Phone',
  }));
  c.followUp = { at: nowIso(), taskId: task.id };
  if (!declined) {
    shellSvc.notify('action', `Missed call from ${who}`, 'A callback task was added to Tasks.');
    store.missedUnseen += 1;
  }
  mirrorToMessages(c, 'missed', declined ? 'Declined call' : 'Missed call');
  postCallLog(c, 'missed');
  patchHistory(c);
  // nothing left to do on this call — don't leave the dialer open behind it
  if (!store.calls.length && !store.wrapQueue.length) store.ui = { ...store.ui, open: false };
  emit();
}

/* ───────────────────────── wrap-up ───────────────────────── */
export type WrapUp = { outcome: Outcome; notes: string; followUp: boolean; followUpAt: Date | null; advanceStage: boolean };

export function saveWrapUp(id: string, w: WrapUp): { ok: boolean; taskId?: string; movedTo?: string } {
  const c = store.wrapQueue.find((x) => x.id === id);
  if (!c) return { ok: false };
  c.outcome = w.outcome; c.notes = (w.notes || '').trim();
  const label = outcomeLabel(w.outcome);
  const dir = c.direction === 'inbound' ? 'Inbound' : 'Outbound';
  const title = `${dir} call — ${label}${c.duration ? ' · ' + fmtDuration(c.duration) : ''}`;
  const linked = logToRecord(c, title, c.notes, label);
  const info = recordInfo(c.recordKind, c.recordId);

  let taskId: string | undefined;
  if (w.followUp && w.followUpAt) {
    const when = describeWhen(w.followUpAt);
    const who = displayName(c);
    const task = addExternalTask(makeTask({
      title: `Follow-up call — ${who}`,
      description: `Scheduled for ${when}. Last call: ${label}${c.notes ? ' — ' + c.notes : ''}`,
      due: isoDay(w.followUpAt), priority: 'normal', assignee: 'NP', related: c.name || formatPhone(c.number),
      relatedType: c.recordKind === 'lead' ? 'candidate' : c.recordKind === 'driver' ? 'driver' : null,
      carrier: info?.carrier || null, source: 'manual', tags: ['Follow-up', 'Call'], createdBy: 'Nina Patel',
    }));
    taskId = String(task.id);
    c.followUp = { at: w.followUpAt.toISOString(), taskId: String(task.id) };
    if (linked && c.recordKind === 'lead') { const l = recruitSvc.lead(c.recordId!); recruitSvc.setNextAction(c.recordId!, { title: 'Follow-up call', due: w.followUpAt.toISOString(), assignee: l?.ownerId || 'NP', priority: 'normal', status: 'open' }); }
    else if (linked && c.recordKind === 'driver') hireSvc.log(c.recordId!, 'task', `Task created — ${task.title}`, when);
  }

  let movedTo: string | undefined;
  const adv = w.outcome === 'connected' && w.advanceStage ? stageAdvanceFor(c.recordKind, c.recordId) : null;
  if (adv && c.recordId) { recruitSvc.moveStage(c.recordId, adv.to, { detail: 'Connected on a call' }); movedTo = adv.to; }

  mirrorToMessages(c, w.outcome, c.notes || title);
  postCallLog(c, w.outcome);
  c.wrapped = true;
  store.wrapQueue = store.wrapQueue.filter((x) => x.id !== c.id);
  patchHistory(c);
  if (!store.wrapQueue.length && !store.calls.length) store.ui = { ...store.ui, open: false };
  emit();
  const where = linked ? `${c.name}'s timeline` : 'the activity log';
  if (linked && c.recordKind && c.recordId) { const k = c.recordKind, rid = c.recordId; snack(`Call saved to ${where}${taskId ? ' · follow-up task added' : ''}`, 'Open', () => openRecordFor(k, rid)); }
  else snack(`Call saved to ${where}${taskId ? ' · follow-up task added' : ''}`);
  return { ok: true, taskId, movedTo };
}

/** Discard without logging — undoable for a few seconds instead of a confirm dialog. */
export function discardWrapUp(id: string) {
  const c = store.wrapQueue.find((x) => x.id === id); if (!c) return;
  store.wrapQueue = store.wrapQueue.filter((x) => x.id !== id);
  c.discarded = true; patchHistory(c);
  if (!store.wrapQueue.length && !store.calls.length) store.ui = { ...store.ui, open: false };
  emit();
  snack('Call discarded — not logged', 'Undo', () => {
    c.discarded = false; store.wrapQueue.unshift(c); patchHistory(c);
    store.ui = { ...store.ui, open: true, collapsed: false }; emit();
  });
}

/** Link an unmatched or ambiguous call to a specific record. */
export function linkCall(id: string, kind: RecordKind, recordId: string) {
  const c = findCall(id); const r = rawRecord(kind, recordId);
  if (!c || !r) return;
  c.recordKind = kind; c.recordId = recordId; c.name = r.name;
  if (store.history.some((h) => h.id === id)) patchHistory(c);
  emit();
}

/** Unknown caller → new recruiting lead with this number (recruit store's own addLead). */
export function createLeadForCall(id: string, name: string): any {
  const c = findCall(id) || store.history.find((h) => h.id === id);
  if (!c) return null;
  const n = normalizePhone(c.number);
  const phone = n.national ? `+1 ${n.national.slice(0, 3)}-${n.national.slice(3, 6)}-${n.national.slice(6)}` : (n.e164 || c.number);
  const res: any = recruitSvc.addLead({ name: (name || '').trim() || c.remoteName || 'Unknown caller', phone, source: 'other', interest: c.direction === 'inbound' ? 'medium' : 'unknown' });
  const lead = res?.lead || res?.dupe?.lead;
  if (!lead) { toast('Could not create the lead', 'danger'); return null; }
  invalidateMatches();
  c.recordKind = 'lead'; c.recordId = lead.id; c.name = lead.name; c.matches = 1;
  if (store.history.some((h) => h.id === c.id)) patchHistory(c);
  emit();
  toast(res.lead ? `Lead created — ${lead.name}` : `Linked to existing lead ${lead.name}`, 'success');
  return lead;
}

/* ───────────────────────── UI state ───────────────────────── */
/** Our panel and the RingCentral widget share the bottom-right corner — one at a time. */
function hideRcWidget() { if (store.rc.visible) { store.rc = { ...store.rc, visible: false }; rc.rcShow(false); } }
export function openPanel(tab?: 'dialer' | 'recent' | 'rc') {
  hideRcWidget();
  const fromBadge = !tab && store.missedUnseen > 0;
  const t = tab || (fromBadge ? 'recent' : store.ui.tab);
  // arriving from the missed-call badge lands on the Missed filter
  store.ui = { ...store.ui, open: true, collapsed: false, tab: t === 'rc' && !isRcMode() ? 'dialer' : t, missedFocus: fromBadge };
  if (store.ui.tab === 'recent') store.missedUnseen = 0;
  emit();
}
export function closePanel() { store.ui = { ...store.ui, open: false, dnc: null }; emit(); }
export function togglePanel() {
  hideRcWidget();
  const active = store.calls.length || store.wrapQueue.length;
  if (active) { store.ui = { ...store.ui, open: true, collapsed: !store.ui.collapsed }; emit(); return; }
  if (store.ui.open) closePanel(); else openPanel();
}
export function setCollapsed(v: boolean) { store.ui = { ...store.ui, collapsed: v }; emit(); }
export function setTab(tab: 'dialer' | 'recent' | 'rc') { store.ui = { ...store.ui, tab }; if (tab === 'recent') store.missedUnseen = 0; emit(); }
export function setDial(v: string) { store.ui = { ...store.ui, dial: v }; emit(); }

/** Open the driver/lead profile; the call or wrap-up stays on screen beside it. */
export function openRecordFor(kind: RecordKind, id: string) {
  if (!openRecord(kind, id)) return;
  if (!store.calls.length && !store.wrapQueue.length) store.ui = { ...store.ui, open: false };
  emit();
}

/* ───────────────────────── RingCentral engine ───────────────────────── */
export function showRcWidget(visible: boolean) {
  store.rc = { ...store.rc, visible };
  if (visible && isRcMode()) store.ui = { ...store.ui, open: false };
  rc.rcShow(visible);
  emit();
}

let appliedKey = '';
function applyConfig() {
  const key = isRcMode() ? `${store.config.clientId}|${store.config.mode}` : '';
  if (key === appliedKey) return;
  appliedKey = key;
  if (!key) { rc.unloadWidget(); store.rc = { ...store.rc, status: 'off', error: '', loggedIn: false, loginNumber: '', webphone: '', visible: false }; emit(); return; }
  store.rc = { ...store.rc, status: 'loading', error: '' };
  emit();
  rc.loadWidget(store.config.clientId, store.config.mode).then(() => {
    if (appliedKey !== key) return;
    store.rc = { ...store.rc, status: 'ready' };
    // the adapter builds its frame asynchronously; keep it hidden until asked
    setTimeout(() => rc.rcShow(store.rc.visible), 400);
    emit();
  }).catch((e: Error) => {
    if (appliedKey !== key) return;
    store.rc = { ...store.rc, status: 'error', error: e.message };
    emit();
  });
}

function rcFind(n: rc.RcCall): Call | undefined {
  if (n.ids.length) { const hit = store.calls.find((c) => c.rcIds.some((id) => n.ids.includes(id))); if (hit) return hit; }
  const rcCalls = store.calls.filter((c) => c.source === 'rc');
  // a dial we started that RingCentral hasn't identified yet
  const pending = rcCalls.find((c) => !c.rcIds.length && c.direction === 'outbound' && (!n.remote || samePhone(c.number, n.remote)) && (!n.direction || n.direction === 'outbound'));
  if (pending) return pending;
  // same call reported by a second event family (webphone vs. active-call)
  if (n.remote) return rcCalls.find((c) => samePhone(c.number, n.remote) && (!n.direction || c.direction === n.direction));
  return undefined;
}

function rcUpsert(raw: any, hint: { state?: 'ringing' | 'live' | 'held'; direction?: 'inbound' | 'outbound' }) {
  const n = rc.normalizeRcCall(raw);
  let c = rcFind(n);
  if (!c) {
    if (hint.state !== 'ringing' && hint.state !== 'live') return;
    const direction = n.direction || hint.direction || 'inbound';
    const num = normalizePhone(n.remote);
    const number = num.e164 || num.digits || n.remote;
    c = newCall({ direction, number, source: 'rc', ...resolve(number), remoteName: n.remoteName || undefined });
    store.calls.push(c);
    if (direction === 'inbound' && hint.state === 'ringing') flashTitle(true);
    openSurface();
  }
  c.rcIds = [...new Set([...c.rcIds, ...n.ids])];
  if (!c.rcControlId && n.controlId) c.rcControlId = n.controlId;
  if (!c.number && n.remote) { const num = normalizePhone(n.remote); c.number = num.e164 || num.digits; }
  if (hint.state === 'live' && c.state === 'ringing') { c.state = 'live'; c.answering = false; c.answeredAt = nowIso(); if (c.direction === 'inbound') flashTitle(false); }
  if (hint.state === 'held') c.held = true;
  else if (hint.state === 'live') c.held = n.onHold ?? false;
  if (n.onHold !== null) c.held = n.onHold;
  if (n.muted !== null) c.muted = n.muted;
  if (n.recording) c.recording = { ...(c.recording || { active: false }), ...n.recording, active: n.recording.active ?? c.recording?.active ?? false } as Call['recording'];
  emit();
}

function rcEnd(raw: any) {
  const n = rc.normalizeRcCall(raw);
  const c = rcFind(n);
  if (!c) return;
  if (n.recording) c.recording = { ...(c.recording || { active: false }), ...n.recording, active: false } as Call['recording'];
  const missed = c.direction === 'inbound' && !c.answeredAt;
  finishCall(c, { missed, duration: n.duration });
}

/** Map one widget event onto the call model. Exported for tests. */
export function handleRcEvent(type: string, data: any) {
  switch (type) {
    case 'rc-login-status-notify': {
      store.rc = { ...store.rc, loggedIn: !!data.loggedIn, loginNumber: String(data.loginNumber || '') };
      emit();
      if (data.loggedIn && pendingDial) { const p = pendingDial; pendingDial = null; showRcWidget(false); callNumber(p.phone, p.ctx); }
      return;
    }
    case 'rc-webphone-connection-status-notify': store.rc = { ...store.rc, webphone: String(data.connectionStatus || '') }; emit(); return;
    case 'rc-call-ring-notify': return rcUpsert(data.call, { state: 'ringing', direction: 'inbound' });
    case 'rc-call-init-notify': return rcUpsert(data.call, { state: 'ringing', direction: 'outbound' });
    case 'rc-call-start-notify': return rcUpsert(data.call, { state: 'live' });
    case 'rc-call-hold-notify': return rcUpsert(data.call, { state: 'held' });
    case 'rc-call-resume-notify': return rcUpsert(data.call, { state: 'live' });
    case 'rc-call-mute-notify': return rcUpsert(data.call, {});
    case 'rc-call-end-notify': return rcEnd(data.call);
    case 'rc-ringout-call-notify':
    case 'rc-active-call-notify': {
      const n = rc.normalizeRcCall(data.call);
      const st = rc.telephonyState(n.status);
      if (st === 'ended') return rcEnd(data.call);
      if (st) return rcUpsert(data.call, { state: st, direction: type === 'rc-ringout-call-notify' ? 'outbound' : undefined });
      return;
    }
    case 'rc-inbound-message-notify': {
      // Each open tab gets this; only the visible one notifies.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const m = data.message || {};
      const from = rc.rcNumberOf(m.from) || '';
      const who = findRecords(from)[0];
      shellSvc.notify('info', `New text from ${who?.name || formatPhone(from) || 'RingCentral'}`, String(m.subject || '').slice(0, 120));
      return;
    }
    default: return;
  }
}

/* ───────────────────────── config ───────────────────────── */
export async function setConfig(patch: Partial<Omit<Config, 'updatedAt'>>): Promise<'synced' | 'local' | 'error'> {
  const next: Config = { ...store.config, ...patch, clientId: (patch.clientId ?? store.config.clientId).trim(), updatedAt: nowIso() };
  store.config = next;
  applyConfig();
  emit();
  if (!backendLikely()) { store.sync = { state: 'local', at: null }; emit(); return 'local'; }
  store.sync = { state: 'syncing', at: null }; emit();
  try {
    const res = await phoneApi.putEmbedConfig({ clientId: next.clientId, mode: next.mode, callerId: next.callerId });
    store.sync = { state: 'synced', at: res?.updatedAt || nowIso() }; emit();
    return 'synced';
  } catch { store.sync = { state: 'error', at: null }; emit(); return 'error'; }
}

/** Adopt the workspace's saved embed config (admin-set Client ID) when the backend is there. */
export async function syncFromBackend(force = false): Promise<boolean> {
  if (!force && !backendLikely()) return false;
  try {
    const cfg = await phoneApi.getEmbedConfig();
    if (cfg && typeof cfg === 'object') {
      const remote = { clientId: String(cfg.clientId || ''), mode: cfg.mode === 'ringout' ? 'ringout' as const : 'browser' as const, callerId: String(cfg.callerId || '') };
      if (remote.clientId || cfg.updatedAt) store.config = { ...store.config, ...remote, updatedAt: cfg.updatedAt || store.config.updatedAt };
      store.sync = { state: 'synced', at: cfg.updatedAt || null };
      applyConfig(); emit();
    }
    return true;
  } catch { return false; }
}

/** Default outbound caller ID: configured one, else the default RingCentral line. */
export function callerIdOptions() {
  const nums: any[] = (commsStore().rcNumbers || []).filter((n: any) => n.active && n.callsEnabled !== false);
  return nums.map((n) => ({ value: n.phoneNumber, label: `${n.label} · ${n.phoneNumber}`, isDefault: !!n.defaultOutbound }));
}
export function effectiveCallerId(): string {
  if (store.config.callerId) return store.config.callerId;
  const opts = callerIdOptions();
  return (opts.find((o) => o.isDefault) || opts[0])?.value || '';
}

/* ───────────────────────── runtime install ───────────────────────── */
export function onQhCall(e: Event) {
  const d: any = (e as CustomEvent).detail;
  if (!d || (typeof d.phone !== 'string' && typeof d.phone !== 'number')) return;
  const kind: RecordKind | undefined = d.kind === 'lead' ? 'lead' : d.kind === 'driver' || d.kind === 'candidate' ? 'driver' : undefined;
  callNumber(String(d.phone), { name: typeof d.name === 'string' ? d.name : undefined, recordId: d.recordId != null ? String(d.recordId) : undefined, kind });
}

(function install() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__qhPhoneInstalled) return;
  w.__qhPhoneInstalled = true;
  window.addEventListener('qh:call', onQhCall);
  window.addEventListener('message', (e: MessageEvent) => {
    if (!rc.isTrustedRcMessage(e)) return;
    try { handleRcEvent(e.data.type, e.data); } catch { /* malformed widget payload — ignore */ }
  });
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== LS || !e.newValue) return;
    try { hydrate(JSON.parse(e.newValue)); applyConfig(); listeners.forEach((l) => l()); } catch { /* ignore */ }
  });
  window.addEventListener('pagehide', persistNow);
  // boot: load the widget if configured, then pick up the org config
  setTimeout(() => { applyConfig(); syncFromBackend(); }, 0);
})();
