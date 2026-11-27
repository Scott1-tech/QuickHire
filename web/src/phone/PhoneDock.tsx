/* Global phone dock — mounted once in QuickHire.

   One surface, one primary action at a time:
     incoming call → screen pop (Answer)
     live call     → call panel (End), notes autosaved
     ended call    → wrap-up (Save)
     otherwise     → Dialer · Recent · RingCentral tabs (Call)
   A floating round button (bottom-right, safe-area aware) toggles it and shows a
   missed-call badge; while a call is minimised it becomes a timer pill. */
import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, SegTabs, Avatar, ToastHost } from '../tasks/lib';
import {
  usePhone, store as phoneStore, callNumber, simulateIncoming, answer, decline, hangup, toggleMute, toggleHold, toggleRecord,
  transfer, setNotes, saveWrapUp, discardWrapUp, linkCall, createLeadForCall, closePanel, togglePanel, setCollapsed,
  setTab, setDial, confirmDncCall, cancelDnc, openRecordFor, showRcWidget, runSnack, dismissSnack, recordInfo, findRecords,
  stageAdvanceFor, isRcMode, displayName, fmtDuration, elapsed, outcomeLabel, effectiveCallerId, callerIdOptions, setConfig,
  OUTCOMES, type Call, type Outcome, type WrapUp,
} from './store';
import { formatPhone, formatAsTyped, normalizePhone } from './number';
import { parseWhen, describeWhen, defaultFollowUp } from './when';
import { openPhoneSettings, setPhoneNavigator, type Navigator } from './nav';
import { store as hireStore } from '../hire/store';
import { store as recruitStore } from '../recruit/store';

const GREEN = '#34C759', GREEN_D = '#248A3D', RED = '#FF3B30', RED_D = '#C62820', BLUE = '#007AFF', ORANGE = '#FF9500';

/* extra glyphs (lucide) the shared icon set doesn't have */
const EXTRA: Record<string, string> = {
  phoneOff: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/>',
  micOff: '<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  transfer: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  backspace: '<path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><line x1="18" x2="12" y1="9" y2="15"/><line x1="12" x2="18" y1="9" y2="15"/>',
  phoneOutgoing: '<polyline points="22 8 22 2 16 2"/><line x1="16" x2="22" y1="8" y2="2"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  minimize: '<path d="m6 9 6 6 6-6"/>',
};
function PIcon({ name, size = 18, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  if (!EXTRA[name]) return <Icon name={name} size={size} style={style} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} dangerouslySetInnerHTML={{ __html: EXTRA[name] }} />;
}

const KEYFRAMES = `
@keyframes qhPhoneRing { 0% { box-shadow: 0 0 0 0 rgba(52,199,89,0.55); } 70% { box-shadow: 0 0 0 16px rgba(52,199,89,0); } 100% { box-shadow: 0 0 0 0 rgba(52,199,89,0); } }
@keyframes qhPhoneIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes qhRecBlink { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { [data-qh-anim] { animation: none !important; } }
`;

function useTick(active: boolean) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { if (!active) return; const t = setInterval(force, 1000); return () => clearInterval(t); }, [active]);
}
function useNarrow() {
  const q = '(max-width: 520px)';
  const [narrow, set] = React.useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q); const h = () => set(m.matches);
    m.addEventListener ? m.addEventListener('change', h) : m.addListener(h);
    return () => { m.removeEventListener ? m.removeEventListener('change', h) : m.removeListener(h); };
  }, []);
  return narrow;
}

type DockProps = Navigator & { bottomOffset?: number };

export default function PhoneDock({ bottomOffset = 0, openDriver, openLead, openSettings }: DockProps) {
  const s = usePhone();
  const narrow = useNarrow();
  const navRef = React.useRef<Navigator>({ openDriver, openLead, openSettings });
  navRef.current = { openDriver, openLead, openSettings };
  React.useEffect(() => {
    setPhoneNavigator({ openDriver: (id) => navRef.current.openDriver(id), openLead: (id) => navRef.current.openLead(id), openSettings: () => navRef.current.openSettings() });
    return () => setPhoneNavigator(null);
  }, []);

  const incoming = s.calls.find((c) => c.direction === 'inbound' && c.state === 'ringing');
  const current = s.calls.find((c) => c !== incoming);
  const wrap = s.wrapQueue[0];
  const surface: 'incoming' | 'live' | 'wrap' | 'tabs' | null = incoming ? 'incoming' : current ? 'live' : wrap ? 'wrap' : s.ui.open ? 'tabs' : null;
  const visible = !!surface && (surface === 'incoming' || !s.ui.collapsed);
  useTick(!!s.calls.length);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && surface === 'tabs' && s.ui.open) closePanel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [surface, s.ui.open]);

  const edge = narrow ? 12 : 20;
  const btnBottom = 20 + bottomOffset;
  const right = s.rc.visible && isRcMode() && !narrow ? 340 : edge;
  const z = visible || s.calls.length ? 150 : 79;
  const safeR = (px: number) => `calc(${px}px + env(safe-area-inset-right, 0px))`;
  const safeB = (px: number) => `calc(${px}px + env(safe-area-inset-bottom, 0px))`;

  return <>
    <style>{KEYFRAMES}</style>
    <ToastHost toasts={s.toasts} />

    {visible && <div role="dialog" aria-label="Phone" data-qh-phone-panel={surface} data-qh-anim
      style={{
        position: 'fixed', zIndex: 150, right: safeR(narrow ? 12 : edge), left: narrow ? 12 : 'auto', bottom: safeB(btnBottom + 68),
        width: narrow ? 'auto' : 372, maxHeight: `calc(100dvh - ${btnBottom + 68 + 24}px)`, display: 'flex', flexDirection: 'column',
        background: '#fff', border: `1px solid ${T.border}`, borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden', animation: 'qhPhoneIn .18s ease', fontFamily: 'inherit', color: T.text,
      }}>
      {surface === 'incoming' && incoming && <IncomingCard c={incoming} other={current} />}
      {surface === 'live' && current && <LiveCall c={current} />}
      {surface === 'wrap' && wrap && <WrapUpPanel key={wrap.id} c={wrap} queued={s.wrapQueue.length - 1} />}
      {surface === 'tabs' && <PhoneTabs />}
    </div>}

    {s.snack && <div role="status" style={{ position: 'fixed', zIndex: 151, right: safeR(right + 68), bottom: safeB(btnBottom + 6), maxWidth: narrow ? 'calc(100vw - 100px)' : 420, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 14px', background: 'rgba(29,29,31,0.94)', color: '#fff', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', fontSize: 13, animation: 'qhPhoneIn .18s ease' }}>
      <span style={{ flex: 1, minWidth: 0 }}>{s.snack.text}</span>
      {s.snack.actionLabel && <button onClick={runSnack} style={{ border: 'none', background: 'transparent', color: '#64B5FF', fontWeight: 650, fontSize: 13, cursor: 'pointer', padding: '4px 6px' }}>{s.snack.actionLabel}</button>}
      <button onClick={dismissSnack} aria-label="Dismiss" style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={14} /></button>
    </div>}

    <DockButton z={z} right={safeR(right)} bottom={safeB(btnBottom)} incoming={incoming} current={current} wrap={wrap} collapsed={s.ui.collapsed} missed={s.missedUnseen} open={visible} />
  </>;
}

/* ───────────────────────── dock button ───────────────────────── */
function DockButton({ z, right, bottom, incoming, current, wrap, collapsed, missed, open }: any) {
  const pill = !incoming && collapsed && (current || wrap);
  const live = current?.state === 'live';
  const bg = incoming ? GREEN : current ? (current.held ? ORANGE : GREEN) : pill && wrap ? '#1D1D1F' : BLUE;
  const label = incoming ? 'Incoming call' : current ? `Call with ${displayName(current)}` : wrap ? 'Wrap up call' : open ? 'Close phone' : 'Open phone';
  return <button onClick={togglePanel} aria-label={label} title={label} data-qh-phone-button=""
    data-qh-anim={incoming ? '' : undefined}
    style={{
      position: 'fixed', zIndex: z, right, bottom, height: 56, minWidth: 56, padding: pill ? '0 18px 0 14px' : 0, borderRadius: 999, border: 'none',
      background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer',
      boxShadow: '0 10px 28px rgba(0,0,0,0.22)', animation: incoming ? 'qhPhoneRing 1.4s infinite' : undefined, transition: 'background .2s',
    }}>
    <PIcon name={open && !current && !incoming && !wrap ? 'x' : 'phone'} size={22} />
    {pill && <span style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {current ? `${live ? fmtDuration(elapsed(current)) : current.direction === 'outbound' ? 'Calling…' : 'Ringing'} · ${displayName(current).split(' ')[0]}` : 'Wrap up call'}
    </span>}
    {missed > 0 && !current && !incoming && <span data-qh-missed-badge="" style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 999, background: RED, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{missed > 99 ? '99+' : missed}</span>}
  </button>;
}

/** Top-bar shortcut to the phone (mirrors the dock button's state). */
export function PhoneTopButton() {
  const s = usePhone();
  const live = s.calls.length > 0;
  return <Hover as="button" onClick={togglePanel} title={live ? 'Current call' : 'Phone'} aria-label="Phone" data-qh-phone-top=""
    style={{ position: 'relative', width: 36, height: 36, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: live ? 'rgba(52,199,89,0.12)' : '#fff', border: `1px solid ${live ? 'rgba(52,199,89,0.4)' : T.border}`, borderRadius: 10, color: live ? GREEN_D : '#3a3a3c', cursor: 'pointer' }}
    hover={{ background: live ? 'rgba(52,199,89,0.18)' : 'rgba(0,0,0,0.03)' }}>
    <Icon name="phone" size={17} />
    {s.missedUnseen > 0 && !live && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: RED, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{s.missedUnseen}</span>}
    {live && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 999, background: GREEN, border: '1.5px solid #fff' }} />}
  </Hover>;
}

/* ───────────────────────── shared bits ───────────────────────── */
function EngineBadge() {
  const s = phoneStore;
  let dot = ORANGE, text = 'Demo mode';
  if (isRcMode()) {
    if (s.rc.status === 'loading') { dot = '#C7C7CC'; text = 'Connecting…'; }
    else if (s.rc.status === 'error') { dot = RED; text = 'RingCentral unavailable'; }
    else if (s.rc.loggedIn) { dot = GREEN; text = s.config.mode === 'ringout' ? 'RingCentral · RingOut' : 'RingCentral'; }
    else { dot = ORANGE; text = 'Sign in to RingCentral'; }
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: T.muted, background: '#F2F2F7', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
    <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />{text}
  </span>;
}

function DemoNote() {
  if (isRcMode()) return null;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 16px 12px', padding: '8px 11px', borderRadius: 10, background: 'rgba(255,149,0,0.10)', color: '#8A4B00', fontSize: 12 }}>
    <Icon name="alert" size={13} style={{ flex: 'none' }} />
    <span style={{ flex: 1 }}>Demo mode — connect RingCentral in Settings</span>
    <button onClick={() => openPhoneSettings()} style={{ border: 'none', background: 'transparent', color: '#8A4B00', fontWeight: 650, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Settings</button>
  </div>;
}

function IconAction({ icon, label, onClick, active, danger, disabled, tone }: any) {
  const on = !!active;
  return <Hover as="button" onClick={disabled ? undefined : onClick} aria-pressed={on} aria-label={label} title={label} disabled={disabled}
    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 0 7px', borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      background: on ? (tone === 'red' ? 'rgba(255,59,48,0.12)' : 'rgba(0,122,255,0.12)') : '#F2F2F7', color: on ? (tone === 'red' ? RED_D : '#0066CC') : danger ? RED_D : T.text }}
    hover={disabled ? {} : { background: on ? (tone === 'red' ? 'rgba(255,59,48,0.18)' : 'rgba(0,122,255,0.18)') : '#E9E9EE' }}>
    <PIcon name={icon} size={18} />
    <span style={{ fontSize: 10.5, fontWeight: 600 }}>{label}</span>
  </Hover>;
}

const headerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 10px 16px' };
const roundIconBtn: React.CSSProperties = { width: 30, height: 30, flex: 'none', borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const bigBtn = (bg: string, fg = '#fff'): React.CSSProperties => ({ flex: 1, height: 46, borderRadius: 12, border: 'none', background: bg, color: fg, fontSize: 14.5, fontWeight: 650, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 });
const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 36, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 11px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: T.text, background: '#fff' };
const chipBtn = (on: boolean, color = BLUE): React.CSSProperties => ({ height: 30, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? color : 'rgba(0,0,0,0.10)'}`, background: on ? hexA(color, 0.1) : '#fff', color: on ? color : T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
function hexA(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint, marginBottom: 7 };

/** "Open profile" for a linked call, or inline "Create lead" for an unknown number. */
function RecordLink({ c }: { c: Call }) {
  const info = recordInfo(c.recordKind, c.recordId);
  const matches = c.number ? findRecords(c.number) : [];
  if (info) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <button onClick={() => openRecordFor(info.kind, info.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
      <Icon name={info.kind === 'lead' ? 'user' : 'truck'} size={13} style={{ color: T.muted }} />Open profile<Icon name="arrowRight" size={12} style={{ color: T.faint }} />
    </button>
    {matches.length > 1 && <select aria-label="Linked record" value={`${c.recordKind}:${c.recordId}`} onChange={(e) => { const [k, id] = e.target.value.split(':'); linkCall(c.id, k as any, id); }}
      style={{ height: 30, borderRadius: 999, border: `1px solid ${T.border}`, padding: '0 10px', fontSize: 12, color: T.muted, background: '#fff', maxWidth: 190, fontFamily: 'inherit' }}>
      {matches.map((m) => <option key={m.kind + m.id} value={`${m.kind}:${m.id}`}>{m.name} · {m.kind === 'lead' ? 'Lead' : 'Driver'}{m.archived ? ' (archived)' : ''}</option>)}
    </select>}
  </div>;
  return <CreateLeadInline c={c} />;
}

function CreateLeadInline({ c, startOpen, onDone }: { c: Call; startOpen?: boolean; onDone?: () => void }) {
  const [open, setOpenRaw] = React.useState(!!startOpen);
  const setOpen = (v: boolean) => { setOpenRaw(v); if (!v) onDone?.(); };
  const [name, setName] = React.useState(c.remoteName || '');
  if (!open) return <button onClick={() => setOpen(true)} data-qh-create-lead="" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 999, border: `1px solid rgba(0,122,255,0.35)`, background: 'rgba(0,122,255,0.06)', color: '#0066CC', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
    <Icon name="userPlus" size={13} />Create lead
  </button>;
  const submit = () => { createLeadForCall(c.id, name); setOpen(false); };
  return <div style={{ display: 'flex', gap: 6, width: '100%' }}>
    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
      placeholder="Driver's name" aria-label="New lead name" style={{ ...textInput, height: 32, flex: 1 }} />
    <button onClick={submit} style={{ height: 32, padding: '0 13px', borderRadius: 10, border: 'none', background: BLUE, color: '#fff', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>Create</button>
  </div>;
}

function Person({ c, sub, size = 46 }: { c: Call; sub?: React.ReactNode; size?: number }) {
  const name = displayName(c);
  const known = !!(c.name || c.remoteName);
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
    {known ? <Avatar name={name} size={size} /> : <span style={{ width: size, height: size, flex: 'none', borderRadius: 999, background: '#E5E5EA', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={size * 0.45} /></span>}
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub ?? formatPhone(c.number)}</div>
    </div>
  </div>;
}

/* ───────────────────────── incoming (screen pop) ───────────────────────── */
function IncomingCard({ c, other }: { c: Call; other?: Call }) {
  const info = recordInfo(c.recordKind, c.recordId);
  return <div data-qh-incoming="" style={{ padding: '14px 16px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span data-qh-anim style={{ width: 8, height: 8, borderRadius: 999, background: GREEN, animation: 'qhPhoneRing 1.4s infinite' }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: GREEN_D, letterSpacing: '0.02em' }}>INCOMING CALL</span>
      <span style={{ flex: 1 }} />
      <EngineBadge />
    </div>
    <Person c={c} size={52} sub={info ? <>{info.subtitle}{info.carrier ? ` · ${info.carrier}` : ''}</> : <>{formatPhone(c.number)} · Not in QuickHire</>} />
    {info && <div style={{ marginTop: 12, borderRadius: 12, background: '#F7F7F9', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Row icon="phone" k="Number" v={formatPhone(c.number)} />
      <Row icon="fileText" k="Last note" v={info.lastNote || 'No notes yet'} clamp />
      <Row icon="listChecks" k="Open tasks" v={String(info.openTasks)} />
      {info.dnc && <div style={{ fontSize: 12, fontWeight: 600, color: RED_D }}>Marked Do-Not-Contact</div>}
    </div>}
    {other && <div style={{ marginTop: 10, fontSize: 12, color: T.muted }}>On another call with {displayName(other)} · {fmtDuration(elapsed(other))}</div>}
    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
      <button onClick={() => decline(c.id)} data-qh-decline="" style={bigBtn('rgba(255,59,48,0.12)', RED_D)}><PIcon name="phoneOff" size={18} />Decline</button>
      <button onClick={() => answer(c.id)} data-qh-answer="" style={bigBtn(c.answering ? '#8FD9A0' : GREEN)}><Icon name="phone" size={18} />{c.answering ? 'Connecting…' : 'Answer'}</button>
    </div>
    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}><RecordLink c={c} /></div>
  </div>;
}
function Row({ icon, k, v, clamp }: any) {
  return <div style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'flex-start' }}>
    <Icon name={icon} size={13} style={{ color: T.faint, marginTop: 2, flex: 'none' }} />
    <span style={{ color: T.faint, width: 70, flex: 'none' }}>{k}</span>
    <span style={{ color: T.text, flex: 1, minWidth: 0, ...(clamp ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any : {}) }}>{v}</span>
  </div>;
}

/* ───────────────────────── live call ───────────────────────── */
function LiveCall({ c }: { c: Call }) {
  const [xfer, setXfer] = React.useState(false);
  const [xferTo, setXferTo] = React.useState('');
  const live = c.state === 'live';
  const status = !live ? (c.direction === 'outbound' ? 'Calling…' : 'Connecting…') : c.held ? `On hold · ${fmtDuration(elapsed(c))}` : fmtDuration(elapsed(c));
  const info = recordInfo(c.recordKind, c.recordId);
  return <div data-qh-live="" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={headerRow}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: live ? (c.held ? '#A05A00' : GREEN_D) : T.muted }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: live ? (c.held ? ORANGE : GREEN) : '#C7C7CC' }} />
        <span data-qh-timer="">{status}</span>
      </span>
      {c.recording?.active && <span data-qh-anim style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: RED_D, background: 'rgba(255,59,48,0.1)', borderRadius: 999, padding: '2px 8px', animation: 'qhRecBlink 1.6s infinite' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: RED }} />REC</span>}
      <span style={{ flex: 1 }} />
      <EngineBadge />
      <button onClick={() => setCollapsed(true)} aria-label="Minimize call" title="Minimize — the call continues" style={roundIconBtn}><PIcon name="minimize" size={16} /></button>
    </div>
    <div style={{ padding: '2px 16px 12px' }}>
      <Person c={c} sub={info ? `${info.subtitle} · ${formatPhone(c.number)}` : formatPhone(c.number)} />
      <div style={{ marginTop: 10 }}><RecordLink c={c} /></div>
    </div>
    <DemoNote />
    <div style={{ padding: '0 16px' }}>
      <div style={sectionLabel}>Call notes</div>
      <NotesBox c={c} rows={4} placeholder="Type while you talk — saved automatically" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px 0' }}>
      <IconAction icon={c.muted ? 'micOff' : 'mic'} label={c.muted ? 'Unmute' : 'Mute'} active={c.muted} onClick={() => toggleMute(c.id)} disabled={!live} />
      <IconAction icon={c.held ? 'phone' : 'pause'} label={c.held ? 'Resume' : 'Hold'} active={c.held} onClick={() => toggleHold(c.id)} disabled={!live} />
      <IconAction icon="record" label={c.recording?.active ? 'Stop rec' : 'Record'} active={c.recording?.active} tone="red" onClick={() => toggleRecord(c.id)} disabled={!live} />
      <IconAction icon="transfer" label="Transfer" active={xfer} onClick={() => setXfer((x) => !x)} disabled={!live} />
    </div>
    {xfer && <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
      <input autoFocus value={xferTo} onChange={(e) => setXferTo(formatAsTyped(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' && transfer(c.id, xferTo)) setXfer(false); }} placeholder="Transfer to number" aria-label="Transfer to number" inputMode="tel" style={{ ...textInput, flex: 1 }} />
      <button onClick={() => { if (transfer(c.id, xferTo)) setXfer(false); }} style={{ height: 36, padding: '0 13px', borderRadius: 10, border: 'none', background: BLUE, color: '#fff', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>Transfer</button>
    </div>}
    <div style={{ padding: 16 }}>
      <button onClick={() => hangup(c.id)} data-qh-end="" style={{ ...bigBtn(RED), width: '100%' }}><PIcon name="phoneOff" size={18} />{live ? 'End call' : 'Cancel'}</button>
    </div>
  </div>;
}

function NotesBox({ c, rows, placeholder }: { c: Call; rows: number; placeholder: string }) {
  const [saved, setSaved] = React.useState(false);
  const t = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return <div style={{ position: 'relative' }}>
    <textarea value={c.notes} rows={rows} placeholder={placeholder} aria-label="Call notes"
      onChange={(e) => { setNotes(c.id, e.target.value); setSaved(true); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setSaved(false), 1500); }}
      style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: rows * 20 + 18, maxHeight: 220, borderRadius: 12, border: `1px solid ${T.border}`, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.45, outline: 'none', fontFamily: 'inherit', color: T.text, background: '#FCFCFD' }} />
    <span aria-live="polite" style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 10.5, color: T.faint, opacity: saved ? 1 : 0, transition: 'opacity .2s' }}>Draft saved</span>
  </div>;
}

/* ───────────────────────── wrap-up ───────────────────────── */
const QUICK_WHEN = ['Tomorrow 10am', 'In 2 hours', 'Monday 9am'];

function WrapUpPanel({ c, queued }: { c: Call; queued: number }) {
  const [outcome, setOutcome] = React.useState<Outcome>((c.outcome as Outcome) || (c.answeredAt ? 'connected' : 'no_answer'));
  const [followUp, setFollowUp] = React.useState(true);
  const [touchedFollow, setTouchedFollow] = React.useState(false);
  const [when, setWhen] = React.useState('');
  const [advance, setAdvance] = React.useState(true);
  const info = recordInfo(c.recordKind, c.recordId);
  const parsed = when.trim() ? parseWhen(when) : defaultFollowUp();
  const adv = outcome === 'connected' ? stageAdvanceFor(c.recordKind, c.recordId) : null;
  const canSave = !followUp || !!parsed;

  const pick = (o: Outcome) => { setOutcome(o); if (!touchedFollow) setFollowUp(o !== 'wrong_number' && o !== 'not_interested'); };
  const save = () => { if (!canSave) return; const w: WrapUp = { outcome, notes: c.notes, followUp, followUpAt: followUp ? parsed : null, advanceStage: advance }; saveWrapUp(c.id, w); };

  return <div data-qh-wrap="" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); }} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={headerRow}>
      <span style={{ fontSize: 14.5, fontWeight: 700 }}>Wrap up</span>
      {queued > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, background: '#F2F2F7', borderRadius: 999, padding: '2px 8px' }}>+{queued} more</span>}
      <span style={{ flex: 1 }} />
      <button onClick={() => setCollapsed(true)} aria-label="Minimize wrap-up" title="Minimize — finish later" style={roundIconBtn}><PIcon name="minimize" size={16} /></button>
    </div>
    <div style={{ overflowY: 'auto', padding: '0 16px 4px' }}>
      <Person c={c} size={40} sub={<>{c.direction === 'inbound' ? 'Inbound' : 'Outbound'} · {c.duration ? fmtDuration(c.duration) : 'not connected'}{info ? ` · ${info.subtitle}` : ''}</>} />
      <div style={{ marginTop: 10 }}><RecordLink c={c} /></div>

      <div style={{ ...sectionLabel, marginTop: 16 }}>Outcome</div>
      <div role="radiogroup" aria-label="Call outcome" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {OUTCOMES.map((o) => <button key={o.key} role="radio" aria-checked={outcome === o.key} onClick={() => pick(o.key)} style={chipBtn(outcome === o.key, o.key === 'connected' ? GREEN_D : o.key === 'wrong_number' ? RED_D : BLUE)}>{o.label}</button>)}
      </div>

      <div style={{ ...sectionLabel, marginTop: 16 }}>Note</div>
      <NotesBox c={c} rows={3} placeholder="What happened on the call?" />

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
        <input type="checkbox" checked={followUp} onChange={(e) => { setFollowUp(e.target.checked); setTouchedFollow(true); }} style={{ width: 16, height: 16, accentColor: BLUE }} />
        Create follow-up task
      </label>
      {followUp && <div style={{ marginTop: 8, paddingLeft: 25 }}>
        <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="tomorrow 10am" aria-label="Follow-up time" onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          style={{ ...textInput, borderColor: when.trim() && !parsed ? 'rgba(255,59,48,0.5)' : T.border }} />
        <div style={{ fontSize: 12, marginTop: 5, color: when.trim() && !parsed ? RED_D : T.muted }} data-qh-when-preview="">
          {parsed ? <>Due {describeWhen(parsed)}</> : 'Try "friday 2pm", "in 3 days" or "11/30 9am"'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
          {QUICK_WHEN.map((q) => <button key={q} onClick={() => setWhen(q)} style={{ ...chipBtn(when.toLowerCase() === q.toLowerCase()), height: 26, fontSize: 11.5, padding: '0 10px' }}>{q}</button>)}
        </div>
      </div>}

      {adv && <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, fontSize: 13, cursor: 'pointer', color: T.text }}>
        <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} style={{ width: 16, height: 16, accentColor: BLUE }} />
        <span>Move to <b style={{ fontWeight: 650 }}>{adv.to}</b></span>
      </label>}
    </div>
    <div style={{ display: 'flex', gap: 8, padding: '14px 16px 16px', borderTop: `1px solid ${T.hair}`, marginTop: 12 }}>
      <button onClick={() => discardWrapUp(c.id)} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', color: T.muted, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Discard</button>
      <button onClick={save} disabled={!canSave} data-qh-save="" style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: canSave ? BLUE : '#A8CBF5', color: '#fff', fontSize: 13.5, fontWeight: 650, cursor: canSave ? 'pointer' : 'default' }}>
        Save{info ? ` to ${info.name.split(' ')[0]}` : ''}
      </button>
    </div>
  </div>;
}

/* ───────────────────────── tabs: dialer · recent · ringcentral ───────────────────────── */
function PhoneTabs() {
  const s = usePhone();
  const [menu, setMenu] = React.useState(false);
  const tabs = [{ key: 'dialer', label: 'Dialer' }, { key: 'recent', label: s.missedUnseen ? `Recent (${s.missedUnseen})` : 'Recent' }, ...(isRcMode() ? [{ key: 'rc', label: 'RingCentral' }] : [])];
  return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={headerRow}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>Phone</span>
      <EngineBadge />
      <span style={{ flex: 1 }} />
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenu((m) => !m)} aria-label="Phone menu" aria-expanded={menu} style={roundIconBtn}><Icon name="more" size={17} /></button>
        {menu && <><div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
          <div role="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 2, width: 230, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.16)', padding: 6 }}>
            <MenuRow icon="phoneIncoming" label="Simulate incoming call" onClick={() => { setMenu(false); simulateIncoming(); }} />
            <MenuRow icon="user" label="Simulate unknown caller" onClick={() => { setMenu(false); simulateIncoming({ unknown: true }); }} />
            <div style={{ height: 1, background: T.hair, margin: '5px 4px' }} />
            <MenuRow icon="settings" label="Phone settings" onClick={() => { setMenu(false); closePanel(); openPhoneSettings(); }} />
          </div></>}
      </div>
      <button onClick={closePanel} aria-label="Close phone" style={roundIconBtn}><Icon name="x" size={16} /></button>
    </div>
    <div style={{ padding: '0 16px 12px' }}><SegTabs value={s.ui.tab} onChange={(t: any) => setTab(t)} tabs={tabs} /></div>
    <DemoNote />
    <div style={{ overflowY: 'auto', minHeight: 0 }}>
      {s.ui.tab === 'dialer' && <Dialer />}
      {s.ui.tab === 'recent' && <Recent />}
      {s.ui.tab === 'rc' && <RcTab />}
    </div>
  </div>;
}
function MenuRow({ icon, label, onClick }: any) {
  return <Hover as="button" role="menuitem" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: T.text }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name={icon} size={15} style={{ color: T.muted }} />{label}</Hover>;
}

const KEYS: [string, string][] = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];

function Dialer() {
  const s = usePhone();
  const ref = React.useRef<HTMLInputElement>(null);
  const val = s.ui.dial;
  const n = normalizePhone(val);
  const hits = n.digits.length >= 7 ? findRecords(val) : [];
  const info = hits[0] ? recordInfo(hits[0].kind, hits[0].id) : null;
  const callerOpts = callerIdOptions();
  const cid = effectiveCallerId();
  React.useEffect(() => { ref.current?.focus(); }, []);
  const press = (k: string) => { setDial(formatAsTyped(val + k)); ref.current?.focus(); };
  const go = () => { if (!n.dialable) return; const h = hits[0]; callNumber(val, h ? { recordId: h.id, kind: h.kind, name: h.name } : {}); };

  if (s.ui.dnc) return <div style={{ padding: '4px 16px 16px' }}>
    <div style={{ borderRadius: 12, background: 'rgba(255,59,48,0.08)', padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: RED_D }}>{s.ui.dnc.name} is Do-Not-Contact</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>This lead opted out. Only call if they asked you to, and note why in the wrap-up.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={cancelDnc} style={{ ...bigBtn('#fff', T.text), height: 38, border: `1px solid ${T.border}`, fontSize: 13.5 }}>Don't call</button>
        <button onClick={confirmDncCall} style={{ ...bigBtn(RED), height: 38, fontSize: 13.5 }}>Call anyway</button>
      </div>
    </div>
  </div>;

  return <div style={{ padding: '0 16px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${T.hair}`, paddingBottom: 8 }}>
      <input ref={ref} value={val} onChange={(e) => { const v = e.target.value; setDial(/[a-z]/i.test(v) ? v : formatAsTyped(v)); }} onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
        onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); const p = normalizePhone(t); setDial(p.national ? formatAsTyped(p.national) : (p.e164 || t.trim())); } }}
        placeholder="Name or number" aria-label="Phone number" inputMode="tel" autoComplete="off" data-qh-dial-input=""
        style={{ flex: 1, minWidth: 0, height: 44, border: 'none', outline: 'none', fontSize: 22, fontWeight: 600, letterSpacing: '0.01em', fontFamily: 'inherit', color: T.text, background: 'transparent' }} />
      {val && <button onClick={() => setDial(/[a-z]/i.test(val) ? val.slice(0, -1) : formatAsTyped(val.replace(/[^\d+*#]/g, '').slice(0, -1)))} aria-label="Delete digit" style={roundIconBtn}><PIcon name="backspace" size={18} /></button>}
    </div>
    <div style={{ minHeight: 34, display: 'flex', alignItems: 'center', fontSize: 12.5, color: T.muted, paddingTop: 6 }}>
      {info ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}><Avatar name={info.name} size={20} /><b style={{ fontWeight: 650, color: T.text }}>{info.name}</b><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.subtitle}</span></span>
        : n.digits.length >= 7 ? <span>Not in QuickHire yet — you can create a lead after the call</span>
        : <NameSearch q={val} />}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
      {KEYS.map(([k, sub]) => <Hover key={k} as="button" onClick={() => press(k)} aria-label={`Dial ${k}`}
        style={{ height: 50, borderRadius: 12, border: 'none', background: '#F2F2F7', color: T.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}
        hover={{ background: '#E6E6EB' }}>
        <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>{k}</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: T.faint, minHeight: 10 }}>{sub}</span>
      </Hover>)}
    </div>
    {callerOpts.length > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: T.faint }}>
      From
      <select value={cid} onChange={(e) => setConfig({ callerId: e.target.value })} aria-label="Caller ID"
        style={{ flex: 1, minWidth: 0, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, padding: '0 8px', fontSize: 12.5, color: T.text, background: '#fff', fontFamily: 'inherit' }}>
        {callerOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>}
    <button onClick={go} disabled={!n.dialable} data-qh-call="" style={{ ...bigBtn(n.dialable ? GREEN : '#B8E6C3'), width: '100%', marginTop: 12, cursor: n.dialable ? 'pointer' : 'default' }}>
      <Icon name="phone" size={18} />{info ? `Call ${info.name.split(' ')[0]}` : 'Call'}
    </button>
  </div>;
}

/** Typing a name in the dialer finds the person's number. */
function NameSearch({ q }: { q: string }) {
  const term = q.trim().toLowerCase();
  if (term.length < 2 || /\d/.test(term)) return <span>Type a number, or a driver's name</span>;
  const leads: any[] = (recruitStore.leads || []).filter((l: any) => !l.archived && l.name.toLowerCase().includes(term)).slice(0, 3).map((l: any) => ({ kind: 'lead', id: l.id, name: l.name, phone: l.phone }));
  const drivers: any[] = (hireStore.drivers || []).filter((d: any) => !d.archived && d.name.toLowerCase().includes(term)).slice(0, 3).map((d: any) => ({ kind: 'driver', id: d.id, name: d.name, phone: d.phone }));
  const all = [...drivers, ...leads].slice(0, 4);
  if (!all.length) return <span>No one named “{q}”</span>;
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {all.map((p) => <button key={p.kind + p.id} onClick={() => callNumber(p.phone, { recordId: p.id, kind: p.kind, name: p.name })} title={`Call ${p.name} · ${formatPhone(p.phone)}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, fontWeight: 600, color: T.text, cursor: 'pointer' }}>
      <Icon name="phone" size={11} style={{ color: GREEN_D }} />{p.name}
    </button>)}
  </div>;
}

function Recent() {
  const s = usePhone();
  const [filter, setFilter] = React.useState<'all' | 'missed'>(s.ui.missedFocus ? 'missed' : 'all');
  const [limit, setLimit] = React.useState(40);
  const rows = s.history.filter((h) => filter === 'all' || h.state === 'missed');
  return <div style={{ padding: '0 8px 12px' }}>
    <div style={{ display: 'flex', gap: 6, padding: '0 8px 8px' }}>
      <button onClick={() => setFilter('all')} style={{ ...chipBtn(filter === 'all'), height: 26, fontSize: 12 }}>All</button>
      <button onClick={() => setFilter('missed')} style={{ ...chipBtn(filter === 'missed', RED_D), height: 26, fontSize: 12 }}>Missed</button>
    </div>
    {rows.length === 0 && <div style={{ textAlign: 'center', padding: '28px 16px', color: T.faint, fontSize: 13 }}>
      <Icon name="phone" size={24} style={{ color: '#C7C7CC' }} />
      <div style={{ marginTop: 8, fontWeight: 600, color: T.muted }}>{filter === 'missed' ? 'No missed calls' : 'No calls yet'}</div>
      <div style={{ marginTop: 3 }}>Calls you make or receive show up here.</div>
    </div>}
    {rows.slice(0, limit).map((h) => <RecentRow key={h.id} h={h} />)}
    {rows.length > limit && <button onClick={() => setLimit((l) => l + 40)} style={{ display: 'block', margin: '6px auto 0', border: 'none', background: 'transparent', color: BLUE, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Show more</button>}
  </div>;
}
function RecentRow({ h }: { h: Call }) {
  const [creating, setCreating] = React.useState(false);
  const missed = h.state === 'missed';
  const info = recordInfo(h.recordKind, h.recordId);
  const icon = missed ? 'phoneMissed' : h.direction === 'inbound' ? 'phoneIncoming' : 'phoneOutgoing';
  const when = fmtWhen(h.startedAt);
  const meta = missed ? (h.declined ? 'Declined' : 'Missed') : h.discarded ? 'Not logged' : h.wrapped ? outcomeLabel(h.outcome) : 'Needs wrap-up';
  const open = () => { if (info) openRecordFor(info.kind, info.id); else { setDial(formatPhone(h.number)); setTab('dialer'); } };
  return <div data-qh-recent-row="" style={{ padding: '8px 8px', borderRadius: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 999, background: missed ? 'rgba(255,59,48,0.1)' : '#F2F2F7', color: missed ? RED_D : T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PIcon name={icon} size={15} /></span>
    <button onClick={open} title={info ? 'Open profile' : 'Dial this number'} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: T.text, fontFamily: 'inherit' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: missed ? RED_D : T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName(h)}</div>
      <div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}{h.duration ? ` · ${fmtDuration(h.duration)}` : ''} · {when}</div>
    </button>
    {!info && <button onClick={() => setCreating((v) => !v)} aria-label="Create lead" title="Create a lead with this number"
      style={{ width: 32, height: 32, flex: 'none', borderRadius: 999, border: 'none', background: 'rgba(0,122,255,0.1)', color: '#0066CC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="userPlus" size={14} /></button>}
    <Hover as="button" onClick={() => callNumber(h.number, info ? { recordId: info.id, kind: info.kind, name: info.name } : {})} aria-label={`Call ${displayName(h)}`} title="Call back"
      style={{ width: 32, height: 32, flex: 'none', borderRadius: 999, border: 'none', background: 'rgba(52,199,89,0.12)', color: GREEN_D, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      hover={{ background: 'rgba(52,199,89,0.2)' }}><Icon name="phone" size={14} /></Hover>
    </div>
    {creating && !info && <div style={{ padding: '8px 0 2px 42px' }}><CreateLeadInline c={h} startOpen onDone={() => setCreating(false)} /></div>}
  </div>;
}
function fmtWhen(iso: string) {
  const d = new Date(iso); const m = Math.floor((Date.now() - d.getTime()) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d >= today) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RcTab() {
  const s = usePhone();
  return <div style={{ padding: '4px 16px 16px' }}>
    <div style={{ borderRadius: 12, background: '#F7F7F9', padding: 14, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
      {s.rc.status === 'error' ? <span style={{ color: RED_D }}>{s.rc.error}</span>
        : s.rc.loggedIn ? <>Signed in{s.rc.loginNumber ? <> as <b style={{ color: T.text }}>{formatPhone(s.rc.loginNumber)}</b></> : null}. Calls, recordings and texts run through RingCentral; QuickHire logs every call on the right driver or lead.</>
        : <>Sign in once with your RingCentral account — QuickHire keeps you signed in on this browser.</>}
    </div>
    <button onClick={() => showRcWidget(!s.rc.visible)} style={{ ...bigBtn(BLUE), width: '100%', marginTop: 12 }}>
      {s.rc.visible ? 'Hide RingCentral phone' : s.rc.loggedIn ? 'Show RingCentral phone' : 'Sign in to RingCentral'}
    </button>
  </div>;
}
