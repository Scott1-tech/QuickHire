import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  store, callNumber, hangup, answer, decline, saveWrapUp, discardWrapUp, runSnack, simulateIncoming, createLeadForCall,
  handleRcEvent, confirmDncCall, stageAdvanceFor, recordInfo, findRecords, setNotes,
} from './store';
import { store as hireStore } from '../hire/store';
import { store as recruitStore, svc as recruitSvc } from '../recruit/store';
import { store as shellStore } from '../shell/store';
import { externalTasks } from '../tasks/bus';

const driver = () => hireStore.drivers.find((d: any) => d.name === 'Robert Johnson');
const lead = (name: string) => recruitStore.leads.find((l: any) => l.name === name);

beforeEach(() => {
  vi.useFakeTimers();
  store.calls = []; store.wrapQueue = []; store.history = []; store.missedUnseen = 0;
  store.config = { clientId: '', mode: 'browser', callerId: '', updatedAt: null };
  store.ui = { ...store.ui, open: false, collapsed: false, dnc: null, dial: '' };
});
afterEach(() => { vi.useRealTimers(); });

describe('outbound call → wrap-up → logged everywhere', () => {
  it('logs on the driver timeline, creates a follow-up task and keeps history', () => {
    const d = driver();
    const before = d.activities.length;
    const c = callNumber('555.010.0101')!; // any formatting finds the driver
    expect(c.recordKind).toBe('driver');
    expect(c.recordId).toBe(d.id);
    expect(c.state).toBe('ringing');
    vi.advanceTimersByTime(1700);
    expect(c.state).toBe('live');
    setNotes(c.id, 'Wants home weekly. Sending app.');
    vi.advanceTimersByTime(65000);
    hangup(c.id);
    expect(store.calls).toHaveLength(0);
    expect(store.wrapQueue).toHaveLength(1);
    const w = store.wrapQueue[0];
    expect(w.outcome).toBe('connected');
    expect(w.duration).toBeGreaterThanOrEqual(65);

    const when = new Date(Date.now() + 864e5);
    const res = saveWrapUp(w.id, { outcome: 'connected', notes: w.notes, followUp: true, followUpAt: when, advanceStage: true });
    expect(res.ok).toBe(true);
    expect(store.wrapQueue).toHaveLength(0);
    const titles = d.activities.slice(0, d.activities.length - before).map((a: any) => a.title);
    expect(titles.some((t: string) => /^Outbound call — Connected · 1:0\d$/.test(t))).toBe(true);
    expect(titles.some((t: string) => t.startsWith('Task created — Follow-up call — Robert Johnson'))).toBe(true);
    const task = externalTasks().find((t) => t.id === res.taskId);
    expect(task).toBeTruthy();
    expect(task.related).toBe('Robert Johnson');
    expect(task.relatedType).toBe('driver');
    expect(task.tags).toContain('Follow-up');
    expect(store.history[0]).toMatchObject({ id: w.id, wrapped: true, outcome: 'connected' });
    expect(shellStore.activities.some((a: any) => a.entity?.id === d.id && /Outbound call/.test(a.title))).toBe(true);
  });

  it('moves a first-stage lead to the next stage on a connected call', () => {
    const l = lead('Tracy Bowman');
    const first = recruitSvc.stages()[0].name;
    recruitSvc.moveStage(l.id, first);
    const adv = stageAdvanceFor('lead', l.id);
    expect(adv?.from).toBe(first);
    const c = callNumber(l.phone, { recordId: l.id, kind: 'lead', name: l.name })!;
    vi.advanceTimersByTime(1700);
    hangup(c.id);
    const res = saveWrapUp(c.id, { outcome: 'connected', notes: 'Interested', followUp: false, followUpAt: null, advanceStage: true });
    expect(res.movedTo).toBe(adv!.to);
    expect(lead('Tracy Bowman').stageName).toBe(adv!.to);
    expect(l.activities.some((a: any) => a.type === 'comm' && a.channel === 'call' && a.outcome === 'Connected')).toBe(true);
  });

  it('an unanswered outbound call defaults to "No answer"', () => {
    const c = callNumber('(555) 010-0103')!;
    hangup(c.id); // cancelled while ringing
    expect(store.wrapQueue[0].outcome).toBe('no_answer');
    expect(store.wrapQueue[0].duration).toBe(0);
  });

  it('discard is undoable instead of confirmed', () => {
    const c = callNumber('(555) 010-0104')!;
    vi.advanceTimersByTime(1700); hangup(c.id);
    discardWrapUp(c.id);
    expect(store.wrapQueue).toHaveLength(0);
    expect(store.snack?.actionLabel).toBe('Undo');
    runSnack();
    expect(store.wrapQueue.map((x) => x.id)).toEqual([c.id]);
  });

  it('refuses a second call while one is live and rejects bad numbers', () => {
    callNumber('(555) 010-0105');
    expect(callNumber('(555) 010-0106')).toBeNull();
    store.calls = [];
    expect(callNumber('555-01')).toBeNull();
    expect(store.ui.open).toBe(true);
  });
});

describe('incoming calls', () => {
  it('known caller: screen-pop info, answer, end, wrap-up', () => {
    const d = driver();
    const c = simulateIncoming({ number: '+1 555 010 0101' })!;
    expect(c.direction).toBe('inbound');
    expect(c.recordId).toBe(d.id);
    const info = recordInfo(c.recordKind, c.recordId)!;
    expect(info.subtitle).toMatch(/^Driver · /);
    expect(info.openTasks).toBeGreaterThanOrEqual(0);
    answer(c.id);
    expect(c.state).toBe('live');
    vi.advanceTimersByTime(30000);
    hangup(c.id);
    expect(store.wrapQueue[0].id).toBe(c.id);
  });

  it('a ring that times out is a missed call: logged, notified, callback task, badge', () => {
    const notifs = shellStore.notifications.length;
    const c = simulateIncoming({ number: '(555) 010-0102' })!;
    vi.advanceTimersByTime(31000);
    expect(store.calls).toHaveLength(0);
    expect(store.history[0]).toMatchObject({ id: c.id, state: 'missed' });
    expect(store.missedUnseen).toBe(1);
    expect(shellStore.notifications.length).toBe(notifs + 1);
    expect(shellStore.notifications[0].title).toMatch(/^Missed call from /);
    expect(externalTasks().some((t) => t.id === store.history[0].followUp?.taskId && /^Call back /.test(t.title))).toBe(true);
    const d = hireStore.drivers.find((x: any) => x.id === c.recordId);
    expect(d.activities[0].title).toBe('Missed call');
  });

  it('declining logs the call without bumping the missed badge', () => {
    const c = simulateIncoming({ number: '(555) 010-0103' })!;
    decline(c.id);
    expect(store.history[0]).toMatchObject({ id: c.id, state: 'missed', declined: true });
    expect(store.missedUnseen).toBe(0);
  });

  it('unknown caller → Create lead adds a recruiting lead with that number', () => {
    const c = simulateIncoming({ unknown: true })!;
    expect(c.recordId).toBeNull();
    const n = recruitStore.leads.length;
    const l = createLeadForCall(c.id, 'Jamal Carter');
    expect(recruitStore.leads.length).toBe(n + 1);
    expect(l.name).toBe('Jamal Carter');
    expect(c.recordKind).toBe('lead');
    expect(findRecords(c.number)[0]?.id).toBe(l.id);
  });
});

describe('integration points', () => {
  it('window "qh:call" events start a call', () => {
    window.dispatchEvent(new CustomEvent('qh:call', { detail: { phone: '(469) 555-0188' } }));
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].name).toBe('Marcus Bell');
    window.dispatchEvent(new CustomEvent('qh:call', { detail: { nope: true } })); // ignored safely
    expect(store.calls).toHaveLength(1);
  });

  it('Do-Not-Contact leads need one explicit confirmation', () => {
    const l = lead('Kevin Brooks');
    l.consent = { ...l.consent, doNotContact: true };
    expect(callNumber(l.phone)).toBeNull();
    expect(store.ui.dnc?.name).toBe('Kevin Brooks');
    const c = confirmDncCall();
    expect(c?.recordId).toBe(l.id);
    l.consent = { ...l.consent, doNotContact: false };
  });

  it('maps RingCentral widget events onto the call model', () => {
    store.config = { ...store.config, clientId: 'AbC123_def-456' };
    handleRcEvent('rc-login-status-notify', { loggedIn: true, loginNumber: '+12145551000' });
    expect(store.rc.loggedIn).toBe(true);
    handleRcEvent('rc-call-ring-notify', { call: { id: 'w1', telephonySessionId: 't1', direction: 'Inbound', from: '+14695550188', to: '+12145551000' } });
    expect(store.calls).toHaveLength(1);
    const c = store.calls[0];
    expect(c).toMatchObject({ source: 'rc', direction: 'inbound', state: 'ringing', name: 'Marcus Bell', rcControlId: 'w1' });
    // a second event family reporting the same call merges into it
    handleRcEvent('rc-active-call-notify', { call: { sessionId: 's1', direction: 'Inbound', from: { phoneNumber: '+14695550188' }, telephonyStatus: 'CallConnected' } });
    expect(store.calls).toHaveLength(1);
    expect(c.state).toBe('live');
    expect(c.rcIds).toEqual(expect.arrayContaining(['t1', 'w1', 's1']));
    handleRcEvent('rc-call-mute-notify', { call: { id: 'w1', isOnMute: true } });
    expect(c.muted).toBe(true);
    handleRcEvent('rc-call-end-notify', { call: { id: 'w1', duration: 42 } });
    expect(store.calls).toHaveLength(0);
    expect(store.wrapQueue[0]).toMatchObject({ id: c.id, duration: 42 });
    // inbound that ends without being answered is missed
    handleRcEvent('rc-call-ring-notify', { call: { id: 'w2', direction: 'Inbound', from: '+15550100109' } });
    handleRcEvent('rc-call-end-notify', { call: { id: 'w2' } });
    expect(store.history[0].state).toBe('missed');
    store.config = { ...store.config, clientId: '' };
    store.rc = { ...store.rc, loggedIn: false };
  });
});
