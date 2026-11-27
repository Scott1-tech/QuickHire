/* RingCentral Embeddable (official softphone widget) wrapper.

   - Loads adapter.js only when an admin has configured our own Client ID.
   - Sends commands to the widget frame with postMessage.
   - Normalises widget events. Embeddable does not document the call payload's
     field names, so every read here is defensive and covered by unit tests.
   Reference: RingCentral Embeddable docs (integration/api.md, integration/events.md). */

export const RC_ORIGIN = 'https://apps.ringcentral.com';
export const RC_BASE = `${RC_ORIGIN}/integration/ringcentral-embeddable/latest`;
export const RC_FRAME_ID = 'rc-widget-adapter-frame';
const SCRIPT_ID = 'qh-rc-embeddable';

export type RcMode = 'browser' | 'ringout';

declare global {
  interface Window {
    RCAdapter?: {
      setMinimized?: (v: boolean) => void;
      setClosed?: (v: boolean) => void;
      clickToCall?: (phone: string, toCall?: boolean) => void;
      clickToSMS?: (phone: string, text?: string) => void;
      dispose?: () => void;
    };
  }
}

/** Client IDs are short opaque tokens; reject anything that could smuggle URL syntax. */
export function isValidClientId(id: string): boolean { return /^[A-Za-z0-9_-]{8,64}$/.test((id || '').trim()); }

export function adapterUrl(clientId: string, mode: RcMode): string {
  const p = new URLSearchParams({
    clientId: clientId.trim(),
    defaultCallWith: mode === 'ringout' ? 'ringout' : 'browser',
    // Only the focused tab receives call events, so a call is logged once even
    // when a recruiter has QuickHire open in several tabs.
    disableInactiveTabCallEvent: '1',
  });
  return `${RC_BASE}/adapter.js?${p.toString()}`;
}

let loadedKey = '';
let loading: Promise<void> | null = null;

/** Inject adapter.js once per (clientId, mode). Re-configuring reloads the widget. */
export function loadWidget(clientId: string, mode: RcMode): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const key = `${clientId}|${mode}`;
  if (loadedKey === key && loading) return loading;
  unloadWidget();
  loadedKey = key;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = adapterUrl(clientId, mode);
    s.onload = () => resolve();
    s.onerror = () => { loadedKey = ''; loading = null; reject(new Error('RingCentral could not be loaded (network blocked or offline).')); };
    document.head.appendChild(s);
  });
  return loading;
}

export function unloadWidget() {
  if (typeof document === 'undefined') return;
  try { window.RCAdapter?.dispose?.(); } catch { /* widget already gone */ }
  document.getElementById(SCRIPT_ID)?.remove();
  document.getElementById(RC_FRAME_ID)?.remove();
  try { delete (window as any).RCAdapter; } catch { (window as any).RCAdapter = undefined; }
  loadedKey = ''; loading = null;
}

export function rcFrame(): HTMLIFrameElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(RC_FRAME_ID) as HTMLIFrameElement | null;
}

/** Post a command to the widget. Returns false when the widget isn't there yet. */
export function rcPost(msg: Record<string, unknown>): boolean {
  const w = rcFrame()?.contentWindow;
  if (!w) return false;
  // Target RingCentral's origin so phone numbers never reach any other frame.
  w.postMessage(msg, RC_ORIGIN);
  return true;
}

export function rcShow(visible: boolean) {
  try { window.RCAdapter?.setClosed?.(!visible); window.RCAdapter?.setMinimized?.(!visible); } catch { /* not ready */ }
}

export function rcDial(phone: string, callerId?: string): boolean {
  const ok = rcPost({ type: 'rc-adapter-new-call', phoneNumber: phone, toCall: true, ...(callerId ? { callerId } : {}) });
  if (!ok) { try { window.RCAdapter?.clickToCall?.(phone, true); return !!window.RCAdapter?.clickToCall; } catch { return false; } }
  return ok;
}

export type RcCallAction = 'answer' | 'reject' | 'toVoicemail' | 'hangup' | 'hold' | 'unhold' | 'mute' | 'unmute' | 'startRecord' | 'stopRecord' | 'transfer';
export function rcControl(callAction: RcCallAction, callId?: string | null, options?: Record<string, unknown>): boolean {
  return rcPost({ type: 'rc-adapter-control-call', callAction, ...(callId ? { callId } : {}), ...(options ? { options } : {}) });
}
export function rcNavigate(path: '/dialer' | '/history' | '/messages' | '/settings') { return rcPost({ type: 'rc-adapter-navigate-to', path }); }

/** Only trust messages from RingCentral's origin or from the widget frame itself. */
export function isTrustedRcMessage(e: { origin?: string; source?: unknown; data?: any }): boolean {
  if (!e || !e.data || typeof e.data !== 'object' || typeof e.data.type !== 'string') return false;
  if (!e.data.type.startsWith('rc-')) return false;
  if (e.origin === RC_ORIGIN) return true;
  const f = rcFrame();
  return !!f && !!e.source && e.source === f.contentWindow;
}

/* ───────────────────────── payload normalisation ───────────────────────── */
export type RcCall = {
  ids: string[];            // every id the payload carries (telephony session, session, call id)
  controlId: string | null; // id to send back with rc-adapter-control-call
  direction: 'inbound' | 'outbound' | null;
  from: string;
  to: string;
  remote: string;           // the other party's number
  remoteName: string;
  startedAt: number | null; // ms epoch
  endedAt: number | null;
  duration: number | null;  // seconds
  status: string;           // telephonyStatus / callStatus as given
  result: string;           // e.g. "Missed", "Call connected", "Voicemail"
  onHold: boolean | null;
  muted: boolean | null;
  recording: { active: boolean | null; id?: string; url?: string } | null;
};

const str = (v: unknown) => (v == null ? '' : String(v));
export function rcNumberOf(v: any): string {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') return str(v.phoneNumber || v.extensionNumber || v.number || v.uri || '').replace(/^sip:/i, '').replace(/@.*/, '');
  return '';
}
export function toMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return v < 1e11 ? v * 1000 : v; // seconds vs ms
  if (typeof v === 'string') { if (/^\d+$/.test(v)) return toMs(+v); const t = Date.parse(v); return isNaN(t) ? null : t; }
  if (v instanceof Date) return v.getTime();
  return null;
}
const bool = (v: unknown): boolean | null => (v === true || v === false ? v : null);

export function normalizeRcCall(raw: any): RcCall {
  const c = raw && typeof raw === 'object' ? raw : {};
  const dirRaw = str(c.direction || c.callDirection).toLowerCase();
  const direction = dirRaw.startsWith('in') ? 'inbound' : dirRaw.startsWith('out') ? 'outbound' : null;
  const from = rcNumberOf(c.from) || str(c.fromNumber || c.fromPhoneNumber);
  const to = rcNumberOf(c.to) || str(c.toNumber || c.toPhoneNumber);
  const ids = [...new Set([c.telephonySessionId, c.sessionId, c.id, c.callId].filter((x) => x != null && x !== '').map(String))];
  const controlId = str(c.id ?? c.callId ?? c.sessionId ?? c.telephonySessionId) || null;
  const remoteName = str(direction === 'inbound' ? (c.fromUserName || c.from?.name || c.fromName) : (c.toUserName || c.to?.name || c.toName));
  const startedAt = toMs(c.startTime ?? c.creationTime ?? c.startedAt ?? c.callStartTime);
  const endedAt = toMs(c.endTime ?? c.callEndTime ?? c.endedAt);
  let duration: number | null = null;
  if (typeof c.duration === 'number' && isFinite(c.duration)) duration = c.duration > 36000 ? Math.round(c.duration / 1000) : Math.round(c.duration);
  else if (startedAt && endedAt && endedAt >= startedAt) duration = Math.round((endedAt - startedAt) / 1000);
  const recRaw = c.recording || (Array.isArray(c.recordings) ? c.recordings[0] : null);
  const recActive = bool(c.isOnRecord) ?? (c.recordStatus ? /^(recording|active|on)$/i.test(str(c.recordStatus)) : null);
  const recording = recRaw || recActive !== null
    ? { active: recActive ?? (recRaw && recRaw.active != null ? !!recRaw.active : null), ...(recRaw?.id ? { id: str(recRaw.id) } : {}), ...(recRaw?.contentUri || recRaw?.uri ? { url: str(recRaw.contentUri || recRaw.uri) } : {}) }
    : null;
  return {
    ids, controlId, direction, from, to, remote: direction === 'outbound' ? to : from, remoteName,
    startedAt, endedAt, duration, status: str(c.telephonyStatus || c.callStatus || c.status), result: str(c.result),
    onHold: bool(c.isOnHold), muted: bool(c.isOnMute), recording,
  };
}

/** Map a telephony status (RingOut / active-call events) to our call state. */
export function telephonyState(status: string): 'ringing' | 'live' | 'held' | 'ended' | null {
  const s = (status || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return null;
  // order matters: "disconnected" contains "connected"
  if (/(nocall|disconnected|gone|finished|ended|terminated)/.test(s)) return 'ended';
  if (/(ringing|proceeding|setup|connecting)/.test(s)) return 'ringing';
  if (/(onhold|hold)$/.test(s)) return 'held';
  if (/(callconnected|answered|connected)/.test(s)) return 'live';
  return null;
}

/** RC "result" strings that mean the inbound call was never picked up. */
export function isMissedResult(result: string): boolean { return /(missed|voicemail|rejected|declined|no answer|busy)/i.test(result || ''); }
